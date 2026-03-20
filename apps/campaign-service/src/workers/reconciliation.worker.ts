import { logger } from '../lib/logger'
import { db } from '../lib/db'

const INTERVAL_MS       = 30_000
const BATCH_SIZE        = 100
const MAX_ATTEMPTS      = 10
const GUPSHUP_API_KEY   = process.env.GUPSHUP_APIKEY!
const GUPSHUP_APP_NAME  = process.env.GUPSHUP_APP_NAME || 'GEmpreendimentos'

// ─── Consulta status do Gupshup para um messageId ────────────────────────────
async function fetchGupshupStatus(messageId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.gupshup.io/wa/app/${GUPSHUP_APP_NAME}/msg/${messageId}`,
      { headers: { apikey: GUPSHUP_API_KEY } }
    )
    if (!res.ok) return null
    const data = await res.json()
    // Gupshup retorna status em data.messageItem.status ou data.status
    const status = data?.messageItem?.status || data?.status
    if (!status) return null
    // Normaliza para o padrão do sistema
    const map: Record<string, string> = {
      'sent':      'sent',
      'delivered': 'delivered',
      'read':      'read',
      'failed':    'failed',
      'error':     'failed',
    }
    return map[status.toLowerCase()] ?? null
  } catch {
    return null
  }
}

// ─── Polling de mensagens sent sem webhook ────────────────────────────────────
async function pollSentMessages(): Promise<void> {
  try {
    // Busca mensagens sent há mais de 5 minutos sem atualização
    const { data: stale, error } = await db
      .from('messages')
      .select('id, external_id, tenant_id, campaign_id, conversation_id')
      .eq('status', 'sent')
      .not('external_id', 'is', null)
      .lt('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .limit(200)

    if (error || !stale || stale.length === 0) return

    logger.info('Polling: checking stale sent messages', { count: stale.length })

    for (const msg of stale) {
      const status = await fetchGupshupStatus(msg.external_id)
      if (!status || status === 'sent') continue

      const { data: rows } = await db.rpc('update_message_status', {
        p_external_id:  msg.external_id,
        p_tenant_id:    msg.tenant_id,
        p_status:       status,
        p_delivered_at: status === 'delivered' ? new Date() : null,
        p_read_at:      status === 'read'      ? new Date() : null,
        p_failed_at:    status === 'failed'    ? new Date() : null,
        p_error_msg:    null,
      })

      const row = Array.isArray(rows) ? rows[0] : rows
      if (!row?.updated) continue

      logger.info('Polling: status updated', { externalId: msg.external_id, status })

      if (row.campaign_id && (status === 'delivered' || status === 'read')) {
        const field = status === 'delivered' ? 'delivered_count' : 'read_count'
        await db.rpc('increment_campaign_counter_safe', {
          p_external_id: msg.external_id,
          p_campaign_id: row.campaign_id,
          p_field:       field,
          p_status:      status,
        }).catch(() => {})
      }
    }
  } catch (err: any) {
    logger.error('Polling: unexpected error', { error: err.message })
  }
}

// ─── Job de reconciliação (pending_status_updates) ────────────────────────────
export async function runStatusReconciliation(): Promise<void> {
  try {
    const { data: pending, error } = await db
      .from('pending_status_updates')
      .select('id, external_id, tenant_id, status, timestamp, error_message, attempts')
      .is('processed_at', null)
      .eq('expired', false)
      .lt('attempts', MAX_ATTEMPTS)
      .lt('created_at', new Date(Date.now() - 5000).toISOString())
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (error) { logger.error('Reconciliation fetch failed', { error: error.message }); return }

    if (pending && pending.length > 0) {
      logger.info('Reconciliation: batch started', { count: pending.length })
      let resolved = 0, notFound = 0, expired = 0

      for (const event of pending) {
        try {
          const { data: rows, error: rpcError } = await db.rpc('update_message_status', {
            p_external_id:  event.external_id,
            p_tenant_id:    event.tenant_id,
            p_status:       event.status,
            p_delivered_at: event.status === 'delivered' ? event.timestamp : null,
            p_read_at:      event.status === 'read'      ? event.timestamp : null,
            p_failed_at:    event.status === 'failed'    ? event.timestamp : null,
            p_error_msg:    event.error_message ?? null,
          })

          if (rpcError) {
            await incrementAttempts(event.id, event.attempts)
            notFound++
            continue
          }

          const row = Array.isArray(rows) ? rows[0] : rows

          if (row?.updated) {
            await db.from('pending_status_updates').update({ processed_at: new Date() }).eq('id', event.id)
            if (row.campaign_id && (event.status === 'delivered' || event.status === 'read')) {
              const field = event.status === 'delivered' ? 'delivered_count' : 'read_count'
              await db.rpc('increment_campaign_counter_safe', {
                p_external_id: event.external_id,
                p_campaign_id: row.campaign_id,
                p_field:       field,
                p_status:      event.status,
              }).catch(() => {})
            }
            resolved++
          } else {
            const { data: exists } = await db.from('messages').select('id').eq('external_id', event.external_id).eq('tenant_id', event.tenant_id).maybeSingle()
            if (exists) {
              await db.from('pending_status_updates').update({ processed_at: new Date() }).eq('id', event.id)
              resolved++
            } else {
              const newAttempts = (event.attempts || 0) + 1
              if (newAttempts >= MAX_ATTEMPTS) {
                await db.from('pending_status_updates').update({ processed_at: new Date(), attempts: newAttempts, expired: true }).eq('id', event.id)
                expired++
              } else {
                await incrementAttempts(event.id, event.attempts)
                notFound++
              }
            }
          }
        } catch (err: any) {
          await incrementAttempts(event.id, event.attempts)
        }
      }

      logger.info('Reconciliation: batch complete', { resolved, notFound, expired, total: pending.length })
    }

    // Polling de mensagens sent sem webhook
    await pollSentMessages()

    await runCleanup()

  } catch (err: any) {
    logger.error('Reconciliation: unexpected error', { error: err.message })
  }
}

async function incrementAttempts(id: string, current: number): Promise<void> {
  await db.from('pending_status_updates').update({ attempts: (current || 0) + 1 }).eq('id', id)
}

async function runCleanup(): Promise<void> {
  try {
    await db.rpc('cleanup_pending_status_updates')
  } catch {
    await db.from('pending_status_updates').delete().lt('created_at', new Date(Date.now() - 86400000).toISOString())
  }
}

export function startReconciliationJob(): void {
  logger.info('Starting reconciliation job', { interval: '30s', batchSize: BATCH_SIZE, maxAttempts: MAX_ATTEMPTS, temporalFilter: '5s' })
  runStatusReconciliation().catch(err => logger.error('Initial reconciliation failed', { err }))
  setInterval(runStatusReconciliation, INTERVAL_MS)
}