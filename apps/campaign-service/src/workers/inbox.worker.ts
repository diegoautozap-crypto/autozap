import { Worker } from 'bullmq'
import { logger } from '../lib/logger'
import { generateId } from '@autozap/utils'
import { db } from '../lib/db'
import type { InboxJob } from './campaign.worker'

function getRedisConnection() {
  try {
    const url = new URL(process.env.REDIS_URL!)
    return { host: url.hostname, port: Number(url.port) || 6379, password: url.password || undefined, username: url.username || undefined, tls: url.protocol === 'rediss:' ? {} : undefined }
  } catch { return { host: 'localhost', port: 6379 } }
}

// ─── Inbox Worker ─────────────────────────────────────────────────────────────
// Cria contato e conversa de forma assíncrona após envio
// - Upsert em tudo → sem race condition com 50+ paralelos
// - BullMQ gerencia retry com backoff exponencial (2s, 4s, 8s, 16s, 32s)
// - Idempotente: pode rodar múltiplas vezes sem efeito colateral
export function startInboxWorker(): Worker<InboxJob> {
  const worker = new Worker<InboxJob>('inbox_queue', async (job) => {
    const { tenantId, channelId, phone, messageDbId, body } = job.data
    const cleanPhone = phone.replace(/^\+/, '')
    logger.info('InboxWorker: processing', { phone: cleanPhone, messageDbId, attempt: job.attemptsMade })

    // ✅ Upsert contato — índice (tenant_id, phone) garante performance em alta escala
    const { data: contactResult, error: contactError } = await db.from('contacts')
      .upsert({ id: generateId(), tenant_id: tenantId, phone: cleanPhone, name: cleanPhone, origin: 'campaign', status: 'active' }, { onConflict: 'tenant_id,phone', ignoreDuplicates: false })
      .select('id').single()

    let resolvedContactId: string
    if (contactError || !contactResult) {
      const { data: existing } = await db.from('contacts').select('id').eq('tenant_id', tenantId).eq('phone', cleanPhone).single()
      if (!existing) throw new Error(`Failed to upsert contact: ${contactError?.message}`)
      resolvedContactId = existing.id
    } else {
      resolvedContactId = contactResult.id
    }

    // ✅ Upsert conversa
    const { data: convResult, error: convError } = await db.from('conversations')
      .upsert({ id: generateId(), tenant_id: tenantId, contact_id: resolvedContactId, channel_id: channelId, channel_type: 'gupshup', status: 'open', pipeline_stage: 'lead', last_message: body, last_message_at: new Date() }, { onConflict: 'tenant_id,contact_id,channel_id', ignoreDuplicates: false })
      .select('id').single()

    let resolvedConversationId: string
    if (convError || !convResult) {
      const { data: existingConv } = await db.from('conversations').select('id').eq('tenant_id', tenantId).eq('contact_id', resolvedContactId).eq('channel_id', channelId).maybeSingle()
      if (!existingConv) throw new Error(`Failed to upsert conversation: ${convError?.message}`)
      resolvedConversationId = existingConv.id
    } else {
      resolvedConversationId = convResult.id
    }

    // ✅ Atualiza mensagem — idempotente (WHERE conversation_id IS NULL)
    await db.from('messages').update({ contact_id: resolvedContactId, conversation_id: resolvedConversationId })
      .eq('id', messageDbId).is('conversation_id', null)

    await db.from('conversations').update({ last_message: body, last_message_at: new Date() }).eq('id', resolvedConversationId)

    logger.info('InboxWorker: completed', { phone: cleanPhone, contactId: resolvedContactId, conversationId: resolvedConversationId })
  },
  { connection: getRedisConnection(), concurrency: 20 })

  worker.on('failed', (job, err) => logger.error('InboxWorker: job failed', { jobId: job?.id, phone: job?.data?.phone, attempt: job?.attemptsMade, error: err.message }))
  logger.info('Inbox worker started', { concurrency: 20 })
  return worker
}
