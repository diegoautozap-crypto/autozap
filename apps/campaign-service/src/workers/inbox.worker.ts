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

// Busca ou cria uma tag com o nome da campanha e retorna o id
async function getOrCreateCampaignTag(tenantId: string, campaignId: string, campaignName: string): Promise<string | null> {
  try {
    // Verifica se já existe uma tag para essa campanha
    const { data: existing } = await db
      .from('tags')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', campaignName)
      .maybeSingle()

    if (existing) return existing.id

    // Cria a tag com uma cor azul padrão para campanhas
    const { data: created } = await db
      .from('tags')
      .insert({ id: generateId(), tenant_id: tenantId, name: campaignName, color: '#2563eb' })
      .select('id')
      .single()

    return created?.id || null
  } catch (err) {
    logger.warn('Failed to get/create campaign tag', { campaignId, err })
    return null
  }
}

// Adiciona tag ao contato (idempotente)
async function addTagToContact(contactId: string, tagId: string): Promise<void> {
  try {
    await db.from('contact_tags').upsert(
      { contact_id: contactId, tag_id: tagId },
      { onConflict: 'contact_id,tag_id', ignoreDuplicates: true }
    )
  } catch (err) {
    logger.warn('Failed to add tag to contact', { contactId, tagId, err })
  }
}

export function startInboxWorker(): Worker<InboxJob> {
  const worker = new Worker<InboxJob>('inbox_queue', async (job) => {
    const { tenantId, channelId, phone, messageDbId, body, campaignId } = job.data
    const cleanPhone = phone.replace(/^\+/, '')
    logger.info('InboxWorker: processing', { phone: cleanPhone, messageDbId, attempt: job.attemptsMade })

    // Upsert contato
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

    // Upsert conversa com campaign_id
    const { data: convResult, error: convError } = await db.from('conversations')
      .upsert({
        id: generateId(),
        tenant_id: tenantId,
        contact_id: resolvedContactId,
        channel_id: channelId,
        channel_type: 'gupshup',
        status: 'open',
        pipeline_stage: 'lead',
        last_message: body,
        last_message_at: new Date(),
        campaign_id: campaignId || null,
      }, { onConflict: 'tenant_id,contact_id,channel_id', ignoreDuplicates: false })
      .select('id').single()

    let resolvedConversationId: string
    if (convError || !convResult) {
      const { data: existingConv } = await db.from('conversations').select('id').eq('tenant_id', tenantId).eq('contact_id', resolvedContactId).eq('channel_id', channelId).maybeSingle()
      if (!existingConv) throw new Error(`Failed to upsert conversation: ${convError?.message}`)
      resolvedConversationId = existingConv.id

      // Atualiza campaign_id se a conversa já existia
      if (campaignId) {
        await db.from('conversations').update({ campaign_id: campaignId }).eq('id', resolvedConversationId)
      }
    } else {
      resolvedConversationId = convResult.id
    }

    // Atualiza mensagem
    await db.from('messages').update({ contact_id: resolvedContactId, conversation_id: resolvedConversationId })
      .eq('id', messageDbId).is('conversation_id', null)

    await db.from('conversations').update({ last_message: body, last_message_at: new Date() }).eq('id', resolvedConversationId)

    // Adiciona tag automática com o nome da campanha
    if (campaignId) {
      const { data: campaign } = await db
        .from('campaigns')
        .select('name')
        .eq('id', campaignId)
        .single()

      if (campaign?.name) {
        const tagId = await getOrCreateCampaignTag(tenantId, campaignId, campaign.name)
        if (tagId) {
          await addTagToContact(resolvedContactId, tagId)
          logger.info('InboxWorker: campaign tag added', { contactId: resolvedContactId, tagId, campaignName: campaign.name })
        }
      }
    }

    logger.info('InboxWorker: completed', { phone: cleanPhone, contactId: resolvedContactId, conversationId: resolvedConversationId, campaignId })
  },
  { connection: getRedisConnection(), concurrency: 20 })

  worker.on('failed', (job, err) => logger.error('InboxWorker: job failed', { jobId: job?.id, phone: job?.data?.phone, attempt: job?.attemptsMade, error: err.message }))
  logger.info('Inbox worker started', { concurrency: 20 })
  return worker
}
