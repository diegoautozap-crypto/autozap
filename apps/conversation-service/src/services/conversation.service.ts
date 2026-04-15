import { db, logger, AppError, NotFoundError, generateId, paginationMeta } from '@autozap/utils'

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

export class ConversationService {

  async listConversations(tenantId: string, filter: ConversationFilter = {}) {
    const { status, assignedTo, channelId, allowedChannels, page = 1, limit = 30 } = filter
    const offset = (page - 1) * limit

    let query = db
      .from('conversations')
      .select(`
        id, status, pipeline_stage, unread_count, last_message, last_message_at, created_at,
        bot_active, assigned_to, labels, waiting_since, first_response_at, first_response_minutes,
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
    if (allowedChannels?.length) query = query.in('channel_id', allowedChannels)

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
    // Valida que o usuário pertence ao tenant
    if (userId) {
      const { data: user } = await db.from('users').select('id').eq('id', userId).eq('tenant_id', tenantId).single()
      if (!user) throw new NotFoundError('User')
    }

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

  async updatePipelineStage(conversationId: string, tenantId: string, stage: PipelineStage, pipelineId?: string, actorUserId?: string) {
    // Valida que o pipeline pertence ao tenant
    if (pipelineId) {
      const { data: pipe } = await db.from('pipelines').select('id').eq('id', pipelineId).eq('tenant_id', tenantId).single()
      if (!pipe) throw new NotFoundError('Pipeline')
    }

    // Snapshot pré-update pra logar o evento
    const { data: before } = await db
      .from('conversations')
      .select('pipeline_stage, pipeline_id')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .single()

    const update: any = { pipeline_stage: stage }
    if (pipelineId !== undefined) update.pipeline_id = pipelineId || null

    const { data, error } = await db
      .from('conversations')
      .update(update)
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (error || !data) throw new NotFoundError('Conversation')

    // Loga mudança de stage no histórico (best-effort, não quebra o fluxo)
    if (before && (before.pipeline_stage || null) !== (data.pipeline_stage || null)) {
      try {
        await db.from('pipeline_card_events').insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          pipeline_id: data.pipeline_id || null,
          event_type: 'moved',
          from_column: before.pipeline_stage || null,
          to_column: data.pipeline_stage || null,
          actor_user_id: actorUserId || null,
        })
      } catch (e) {
        console.error('[pipeline_card_events] falha ao logar (conversation)', e)
      }
    }

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

  // ─── Pipeline board com filtros ───────────────────────────────────────────
  async getPipelineBoard(tenantId: string, channelId?: string, campaignId?: string, pipelineId?: string) {
    // Busca colunas dinâmicas configuradas pelo tenant
    let colQuery = db
      .from('pipeline_columns')
      .select('key')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true })

    if (pipelineId) {
      colQuery = colQuery.eq('pipeline_id', pipelineId)
    } else {
      colQuery = colQuery.is('pipeline_id', null)
    }

    const { data: colData } = await colQuery
    const stages: string[] = colData && colData.length > 0
      ? colData.map((c: any) => c.key)
      : ['novo', 'em_contato', 'em_andamento', 'aguardando', 'concluido', 'cancelado']

    let query = db
      .from('conversations')
      .select(`
        id, pipeline_stage, pipeline_id, last_message, last_message_at,
        unread_count, channel_id, campaign_id, bot_active, assigned_to,
        deal_value,
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

    // Inicializa board com todas as colunas
    const board: Record<string, any[]> = {}
    stages.forEach(s => { board[s] = [] })

    ;(data || []).forEach((conv: any) => {
      const stage = conv.pipeline_stage || stages[0] || 'lead'
      if (board[stage] !== undefined) {
        board[stage].push(conv)
      } else {
        // Coluna não existe mais — coloca na primeira
        const firstStage = stages[0] || 'lead'
        board[firstStage].push(conv)
      }
    })

    return board
  }

  async searchConversations(tenantId: string, search: string) {
    // Sanitiza a busca removendo caracteres que podem manipular a query
    const sanitized = search.replace(/[%_'"\\,()]/g, '').trim()
    if (!sanitized) return []

    const { data } = await db
      .from('conversations')
      .select(`
        id, status, last_message, last_message_at,
        contacts(id, name, phone)
      `)
      .eq('tenant_id', tenantId)
      .ilike('last_message', `%${sanitized}%`)
      .limit(20)

    return data || []
  }
}

export const conversationService = new ConversationService()