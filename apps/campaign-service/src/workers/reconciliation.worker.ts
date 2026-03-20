import { logger } from '../lib/logger'
import { db } from '../lib/db'

const INTERVAL_MS  = 30_000
const BATCH_SIZE   = 100
const MAX_ATTEMPTS = 10

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
    if (!pending || pending.length === 0) return

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