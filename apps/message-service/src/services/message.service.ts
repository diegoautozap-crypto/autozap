import { v4 as uuidv4 } from 'uuid'
import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { AppError, NotFoundError, generateId } from '@autozap/utils'
import type { NormalizedMessage, MessageStatusUpdate } from './types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueueMessageInput {
  tenantId: string
  channelId: string
  contactId: string
  conversationId: string
  to: string
  contentType: string
  body?: string
  mediaUrl?: string
  campaignId?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Retorna true se o nome parece um número de telefone (ou seja, não é um nome real)
function looksLikePhone(name: string): boolean {
  return /^[\d\s\+\-\(\)]+$/.test(name.trim())
}

// ─── MessageService ───────────────────────────────────────────────────────────

export class MessageService {

  // ── Queue outbound message ─────────────────────────────────────────────────

  async queueMessage(input: QueueMessageInput): Promise<string> {
    const messageUuid = uuidv4()

    const { data, error } = await db.from('messages').insert({
      id: generateId(),
      message_uuid: messageUuid,
      tenant_id: input.tenantId,
      conversation_id: input.conversationId,
      channel_id: input.channelId,
      contact_id: input.contactId,
      direction: 'outbound',
      content_type: input.contentType,
      body: input.body,
      media_url: input.mediaUrl,
      status: 'queued',
      campaign_id: input.campaignId,
      retry_count: 0,
    }).select('id').single()

    if (error) throw new AppError('DB_ERROR', error.message, 500)

    logger.debug('Message queued', { messageUuid, tenantId: input.tenantId })
    return messageUuid
  }

  // ── Process inbound message ────────────────────────────────────────────────

  async processInbound(tenantId: string, channelId: string, msg: NormalizedMessage): Promise<void> {
    // 1. Find or create contact
    const contact = await this.findOrCreateContact(tenantId, msg.from)

    // ✅ BUG CORRIGIDO: atualiza o nome sempre que:
    //    - vier um senderName no payload
    //    - E o nome atual parecer um número (não é nome real)
    const senderName = (msg.raw as any)?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name
    if (senderName && (!contact.name || looksLikePhone(contact.name))) {
      await db.from('contacts')
        .update({ name: senderName })
        .eq('id', contact.id)
      logger.info('Contact name updated from inbound', {
        contactId: contact.id,
        oldName: contact.name,
        newName: senderName,
      })
    }

    // 2. Find or create conversation
    const conversation = await this.findOrCreateConversation(tenantId, channelId, contact.id, msg.channelType)

    // 3. Save message
    await db.from('messages').insert({
      id: generateId(),
      message_uuid: uuidv4(),
      tenant_id: tenantId,
      conversation_id: conversation.id,
      channel_id: channelId,
      contact_id: contact.id,
      direction: 'inbound',
      content_type: msg.contentType,
      body: msg.body,
      media_url: msg.mediaUrl,
      media_mime_type: msg.mediaMimeType,
      external_id: msg.externalId,
      status: 'delivered',
      sent_at: msg.timestamp,
      delivered_at: msg.timestamp,
    })

    // 4. Update conversation
    await db.from('conversations').update({
      last_message: msg.body || `[${msg.contentType}]`,
      last_message_at: msg.timestamp,
      unread_count: db.rpc('increment_unread', { p_conversation_id: conversation.id }) as any,
      status: 'open',
    }).eq('id', conversation.id)

    // 5. Update contact last interaction
    await db.from('contacts').update({
      last_interaction_at: msg.timestamp,
    }).eq('id', contact.id)

    logger.info('Inbound message processed', {
      tenantId,
      contactId: contact.id,
      conversationId: conversation.id,
    })
  }

  // ── Update message status from webhook ────────────────────────────────────

  async updateStatus(tenantId: string, update: MessageStatusUpdate): Promise<void> {
    const { externalId, status, timestamp, errorMessage } = update

    const updateData: Record<string, unknown> = { status }

    if (status === 'delivered') updateData.delivered_at = timestamp
    if (status === 'read') updateData.read_at = timestamp
    if (status === 'failed') {
      updateData.failed_at = timestamp
      updateData.error_message = errorMessage
    }

    const { error } = await db
      .from('messages')
      .update(updateData)
      .eq('external_id', externalId)
      .eq('tenant_id', tenantId)

    if (error) {
      logger.error('Failed to update message status', { externalId, status, error })
      return
    }

    logger.debug('Message status updated', { externalId, status })
  }

  // ── Mark message as sent ───────────────────────────────────────────────────

  async markSent(messageUuid: string, externalId: string): Promise<void> {
    await db.from('messages').update({
      status: 'sent',
      external_id: externalId,
      sent_at: new Date(),
    }).eq('message_uuid', messageUuid)
  }

  async markFailed(messageUuid: string, errorMessage: string, retryCount: number): Promise<void> {
    await db.from('messages').update({
      status: retryCount >= 3 ? 'failed' : 'queued',
      error_message: errorMessage,
      retry_count: retryCount,
      failed_at: retryCount >= 3 ? new Date() : null,
    }).eq('message_uuid', messageUuid)
  }

  // ── Get pending messages for reconciliation ────────────────────────────────

  async getPendingMessages(tenantId: string, olderThanMinutes = 5) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000)

    const { data } = await db
      .from('messages')
      .select('id, message_uuid, external_id, channel_id, tenant_id')
      .eq('tenant_id', tenantId)
      .in('status', ['queued', 'sent'])
      .lt('sent_at', cutoff.toISOString())
      .not('external_id', 'is', null)
      .limit(100)

    return data || []
  }

  // ── List messages in conversation (paginated) ──────────────────────────────

  async listMessages(conversationId: string, tenantId: string, cursor?: string, limit = 30) {
    let query = db
      .from('messages')
      .select('id, direction, content_type, body, media_url, status, sent_at, created_at, external_id')
      .eq('conversation_id', conversationId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) {
      query = query.lt('created_at', cursor)
    }

    const { data, error } = await query
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    return data || []
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async findOrCreateContact(tenantId: string, phone: string) {
    phone = phone.replace(/^\+/, '')
    // Normaliza número brasileiro: garante o 9 após o DDD
    if (phone.startsWith('55') && phone.length === 12) {
      phone = phone.slice(0, 4) + '9' + phone.slice(4)
    }

    const { data: existing } = await db
      .from('contacts')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('phone', phone)
      .maybeSingle()

    if (existing) return existing

    const { data: created, error } = await db
      .from('contacts')
      .insert({
        id: generateId(),
        tenant_id: tenantId,
        phone,
        name: phone, // Will be updated when we get the contact's name
        origin: 'inbound',
        status: 'active',
        last_interaction_at: new Date(),
      })
      .select('id, name')
      .single()

    if (error) throw new AppError('DB_ERROR', error.message, 500)
    return created
  }

  private async findOrCreateConversation(
    tenantId: string,
    channelId: string,
    contactId: string,
    channelType: string,
  ) {
    // Look for open conversation
    const { data: existing } = await db
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .eq('channel_id', channelId)
      .in('status', ['open', 'waiting'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) return existing

    // Create new conversation
    const { data: created, error } = await db
      .from('conversations')
      .insert({
        id: generateId(),
        tenant_id: tenantId,
        contact_id: contactId,
        channel_id: channelId,
        channel_type: channelType,
        status: 'open',
        pipeline_stage: 'lead',
        unread_count: 1,
        last_message_at: new Date(),
      })
      .select('id')
      .single()

    if (error) throw new AppError('DB_ERROR', error.message, 500)
    return created
  }
}

export const messageService = new MessageService()
