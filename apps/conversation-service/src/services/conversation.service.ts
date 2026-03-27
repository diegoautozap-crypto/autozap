import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { AppError, NotFoundError, generateId, paginationMeta } from '@autozap/utils'

export type ConversationStatus = 'open' | 'waiting' | 'closed'
export type PipelineStage = string

export interface ConversationFilter {
  status?: ConversationStatus
  assignedTo?: string
  channelId?: string
  allowedChannels?: string[]
  search?: string
  page?: number
  limit?: number
}

const PUSHER_APP_ID  = process.env.PUSHER_APP_ID
const PUSHER_KEY     = process.env.PUSHER_KEY
const PUSHER_SECRET  = process.env.PUSHER_SECRET
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER || 'sa1'

async function emitPusher(tenantId: string, event: string, data: object): Promise<void> {
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET) return
  try {
    const body = JSON.stringify({ name: event, channel: `tenant-${tenantId}`, data: JSON.stringify(data) })
    const crypto = await import('crypto')
    const ts  = Math.floor(Date.now() / 1000)
    const md5 = crypto.createHash('md5').update(body).digest('hex')
    const sig = crypto.createHmac('sha256', PUSHER_SECRET).update(`POST\n/apps/${PUSHER_APP_ID}/events\nauth_key=${PUSHER_KEY}&auth_timestamp=${ts}&auth_version=1.0&body_md5=${md5}`).digest('hex')
    await fetch(`https://api-${PUSHER_CLUSTER}.pusher.com/apps/${PUSHER_APP_ID}/events?auth_key=${PUSHER_KEY}&auth_timestamp=${ts}&auth_version=1.0&body_md5=${md5}&auth_signature=${sig}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  } catch (err) { logger.error('Failed to emit Pusher event', { err }) }
}

const DEFAULT_STAGES = ['lead', 'qualificacao', 'proposta', 'negociacao', 'ganho', 'perdido']

export class ConversationService {

  async listConversations(tenantId: string, filter: ConversationFilter = {}) {
    const { status, assignedTo, channelId, allowedChannels, page = 1, limit = 30 } = filter
    const offset = (page - 1) * limit

    let query = db
      .from('conversations')
      .select(`
        id, status, pipeline_stage, pipeline_id, unread_count, last_message, last_message_at, created_at,
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
    if (allowedChannels && allowedChannels.length > 0) {
      query = query.in('channel_id', allowedChannels)
    }

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
    emitPusher(tenantId, 'conversation.updated', { conversationId, status })
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
    emitPusher(tenantId, 'conversation.updated', { conversationId, assignedTo: userId })
    return data
  }

  async updatePipelineStage(conversationId: string, tenantId: string, stage: string, pipelineId?: string) {
    const updateData: any = { pipeline_stage: stage }
    if (pipelineId) updateData.pipeline_id = pipelineId

    const { data, error } = await db
      .from('conversations')
      .update(updateData)
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (error || !data) throw new NotFoundError('Conversation')
    emitPusher(tenantId, 'conversation.updated', { conversationId, pipelineStage: stage, pipelineId })
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

  async getPipelineBoard(tenantId: string, channelId?: string, campaignId?: string, pipelineId?: string) {
    // Busca colunas — filtra por pipeline se fornecido
    let colQuery = db
      .from('pipeline_columns')
      .select('key, label')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true })

    if (pipelineId) {
      colQuery = colQuery.eq('pipeline_id', pipelineId)
    } else {
      // Sem pipeline selecionada — pega colunas sem pipeline_id (legado)
      colQuery = colQuery.is('pipeline_id', null)
    }

    const { data: dbColumns } = await colQuery

    const stages = dbColumns && dbColumns.length > 0
      ? dbColumns.map((c: any) => c.key)
      : DEFAULT_STAGES

    let query = db
      .from('conversations')
      .select(`
        id, pipeline_stage, pipeline_id, last_message, last_message_at, unread_count, channel_id, campaign_id,
        contacts(id, name, phone, avatar_url, contact_tags(tag_id, tags(id, name, color))),
        channels(id, name)
      `)
      .eq('tenant_id', tenantId)
      .in('status', ['open', 'waiting'])
      .order('last_message_at', { ascending: false })

    if (channelId) query = query.eq('channel_id', channelId)
    if (campaignId) query = query.eq('campaign_id', campaignId)
    if (pipelineId) {
      query = query.eq('pipeline_id', pipelineId)
    } else {
      query = query.is('pipeline_id', null)
    }

    const { data, error } = await query
    if (error) throw new AppError('DB_ERROR', error.message, 500)

    const board: Record<string, any[]> = {}
    stages.forEach((s: string) => board[s] = [])

    ;(data || []).forEach((conv: any) => {
      const stage = conv.pipeline_stage || stages[0] || 'lead'
      if (board[stage] !== undefined) {
        board[stage].push(conv)
      } else {
        const firstStage = stages[0] || 'lead'
        if (!board[firstStage]) board[firstStage] = []
        board[firstStage].push(conv)
      }
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