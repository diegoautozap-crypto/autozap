import { logger } from '../lib/logger'
import { db } from '../lib/db'

const INTERVAL_MS  = 30_000  // 30 segundos
const BATCH_SIZE   = 100
const MAX_ATTEMPTS = 10

// ─── Job de reconciliação ─────────────────────────────────────────────────────
export async function runStatusReconciliation(): Promise<void> {
  try {
    // ✅ Filtro temporal: ignora eventos muito recentes (podem ainda estar sendo persistidos)
    // Só processa eventos com mais de 5 segundos
    const { data: pending, error } = await db
      .from('pending_status_updates')
      .select('id, external_id, tenant_id, status, timestamp, error_message, attempts')
      .is('processed_at', null)
      .eq('expired', false)
      .lt('attempts', MAX_ATTEMPTS)
      .lt('created_at', new Date(Date.now() - 5000).toISOString()) // ✅ filtro temporal
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (error) { logger.error('Reconciliation fetch failed', { error: error.message }); return }
    if (!pending || pending.length === 0) return

    logger.info('Reconciliation: batch started', { count: pending.length })
    let resolved = 0, notFound = 0, expired = 0

    for (const event of pending) {
      try {
        // ✅ Usa a mesma função SQL atômica do webhook
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
          logger.warn('Reconciliation RPC error', { externalId: event.external_id, error: rpcError.message })
          await incrementAttempts(event.id, event.attempts)
          notFound++
          continue
        }

        const row = Array.isArray(rows) ? rows[0] : rows

        if (row?.updated) {
          await db.from('pending_status_updates').update({ processed_at: new Date() }).eq('id', event.id)

          // ✅ Incrementa contador de campanha de forma IDEMPOTENTE
          // campaign_status_events garante que webhook + reconciliation não duplicam
          if (row.campaign_id && (event.status === 'delivered' || event.status === 'read')) {
            const field = event.status === 'delivered' ? 'delivered_count' : 'read_count'
            try {
              const { data: incremented } = await db.rpc('increment_campaign_counter_safe', {
                p_external_id: event.external_id,
                p_campaign_id: row.campaign_id,
                p_field:       field,
                p_status:      event.status,
              })
              if (incremented) logger.info('Reconciliation: counter incremented', { campaignId: row.campaign_id, field })
              else logger.debug('Reconciliation: counter already counted', { externalId: event.external_id, field })
            } catch (err) { logger.warn('increment_campaign_counter_safe failed', { err }) }
          }

          resolved++
          logger.info('Reconciliation: resolved', { externalId: event.external_id, status: event.status })

        } else {
          const { data: exists } = await db.from('messages').select('id').eq('external_id', event.external_id).eq('tenant_id', event.tenant_id).maybeSingle()

          if (exists) {
            // Mensagem existe mas status já estava mais avançado — marca processado
            await db.from('pending_status_updates').update({ processed_at: new Date() }).eq('id', event.id)
            resolved++
          } else {
            const newAttempts = (event.attempts || 0) + 1
            if (newAttempts >= MAX_ATTEMPTS) {
              // ✅ Dead letter visível: marca expired = true em vez de só processed_at
              await db.from('pending_status_updates')
                .update({ processed_at: new Date(), attempts: newAttempts, expired: true })
                .eq('id', event.id)
              logger.warn('Reconciliation: event expired (dead letter)', {
                externalId: event.external_id,
                status:     event.status,
                attempts:   newAttempts,
              })
              expired++
            } else {
              await incrementAttempts(event.id, event.attempts)
              notFound++
            }
          }
        }

      } catch (err: any) {
        logger.error('Reconciliation: error processing event', { id: event.id, externalId: event.external_id, error: err.message })
        await incrementAttempts(event.id, event.attempts)
      }
    }

    logger.info('Reconciliation: batch complete', { resolved, notFound, expired, total: pending.length })

    // Limpeza automática >24h
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
