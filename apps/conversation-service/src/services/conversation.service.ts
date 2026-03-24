import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { AppError, NotFoundError, generateId, paginationMeta } from '@autozap/utils'

export type ConversationStatus = 'open' | 'waiting' | 'closed'
export type PipelineStage = 'lead' | 'qualificacao' | 'proposta' | 'negociacao' | 'ganho' | 'perdido'

export interface ConversationFilter {
  status?: ConversationStatus
  assignedTo?: string
  channelId?: string
  search?: string
  page?: number
  limit?: number
}

export class ConversationService {

  async listConversations(tenantId: string, filter: ConversationFilter = {}) {
    const { status, assignedTo, channelId, page = 1, limit = 30 } = filter
    const offset = (page - 1) * limit

    let query = db
      .from('conversations')
      .select(`
        id, status, pipeline_stage, unread_count, last_message, last_message_at, created_at,
        contacts(id, name, phone, avatar_url),
        channels(id, name, type),
        users!conversations_assigned_to_fkey(id, name, avatar_url)
      `, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (status) query = query.eq('status', status)
    if (assignedTo) query = query.eq('assigned_to', assignedTo)
    if (channelId) query = query.eq('channel_id', channelId)

    const { data, count, error } = await query
    if (error) throw new AppError('DB_ERROR', error.message, 500)

    return {
      conversations: data || [],
      meta: paginationMeta(count || 0, page, limit),
    }
  }

  async getConversation(conversationId: string, tenantId: string) {
    const { data, error } = await db
      .from('conversations')
      .select(`
        *,
        contacts(*, contact_tags(tag_id, tags(id, name, color))),
        channels(id, name, type, phone_number),
        users!conversations_assigned_to_fkey(id, name, avatar_url)
      `)
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .single()

    if (error || !data) throw new NotFoundError('Conversation')
    return data
  }

  async updateStatus(conversationId: string, tenantId: string, status: ConversationStatus) {
    const { data, error } = await db
      .from('conversations')
      .update({ status })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (error || !data) throw new NotFoundError('Conversation')
    logger.info('Conversation status updated', { conversationId, status })
    return data
  }

  async assignConversation(conversationId: string, tenantId: string, userId: string | null) {
    const { data, error } = await db
      .from('conversations')
      .update({ assigned_to: userId })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (error || !data) throw new NotFoundError('Conversation')
    return data
  }

  async updatePipelineStage(conversationId: string, tenantId: string, stage: PipelineStage) {
    const { data, error } = await db
      .from('conversations')
      .update({ pipeline_stage: stage })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (error || !data) throw new NotFoundError('Conversation')
    return data
  }

  async markAsRead(conversationId: string, tenantId: string) {
    await db
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
  }

  async getMessages(conversationId: string, tenantId: string, cursor?: string, limit = 30) {
    let query = db
      .from('messages')
      .select('id, direction, content_type, body, media_url, status, sent_at, delivered_at, read_at, created_at, external_id')
      .eq('conversation_id', conversationId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) query = query.lt('created_at', cursor)

    const { data, error } = await query
    if (error) throw new AppError('DB_ERROR', error.message, 500)

    return (data || []).reverse()
  }

  // ─── Pipeline board com filtros e tags ────────────────────────────────────
  async getPipelineBoard(tenantId: string, channelId?: string, campaignId?: string) {
    const stages: PipelineStage[] = ['lead', 'qualificacao', 'proposta', 'negociacao', 'ganho', 'perdido']

    let query = db
      .from('conversations')
      .select(`
        id, pipeline_stage, last_message, last_message_at, unread_count, channel_id, campaign_id,
        contacts(id, name, phone, avatar_url, contact_tags(tag_id, tags(id, name, color))),
        channels(id, name)
      `)
      .eq('tenant_id', tenantId)
      .in('status', ['open', 'waiting'])
      .order('last_message_at', { ascending: false })

    if (channelId) query = query.eq('channel_id', channelId)
    if (campaignId) query = query.eq('campaign_id', campaignId)

    const { data, error } = await query
    if (error) throw new AppError('DB_ERROR', error.message, 500)

    const board: Record<string, any[]> = {}
    stages.forEach(s => board[s] = [])
    ;(data || []).forEach((conv: any) => {
      const stage = conv.pipeline_stage || 'lead'
      if (board[stage]) board[stage].push(conv)
    })

    return board
  }

  async searchConversations(tenantId: string, search: string) {
    const { data } = await db
      .from('conversations')
      .select(`
        id, status, last_message, last_message_at,
        contacts(id, name, phone)
      `)
      .eq('tenant_id', tenantId)
      .or(`last_message.ilike.%${search}%`)
      .limit(20)

    return data || []
  }
}

export const conversationService = new ConversationService()
