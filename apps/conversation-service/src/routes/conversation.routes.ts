import { Router } from 'express'
import { z } from 'zod'
import { conversationService } from '../services/conversation.service'
import { requireAuth, validate, ok, paginationSchema, generateId, db, decryptCredentials, logger } from '@autozap/utils'

const router = Router()

async function getUserPermissions(userId: string, tenantId: string) {
  const { data } = await db
    .from('user_permissions')
    .select('allowed_channels, conversation_access')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data
}

// ─── Media proxy (auth via query token ou header) ────────────────────────────
router.get('/conversations/media/:mediaId', async (req, res, next) => {
  try {
    const { mediaId } = req.params
    const { channelId, token: queryToken } = req.query as any
    if (!channelId) { res.status(400).json({ error: 'channelId required' }); return }

    // Auth: aceita JWT no header OU na query string (pra <img>, <audio>, <video>)
    // TODO: deprecar query string token após migrar frontend pra usar header
    let tenantId: string | null = null
    const authHeader = req.headers.authorization
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const jwtToken = headerToken || queryToken
    if (queryToken && !headerToken) {
      logger.warn('JWT via query string (deprecated)', { mediaId, ip: req.ip })
    }
    if (jwtToken) {
      try {
        const jwt = require('jsonwebtoken')
        const payload = jwt.verify(jwtToken, process.env.JWT_SECRET!)
        tenantId = payload.tid
      } catch (err: any) {
        // Invalid token — reject instead of silently falling through
        res.status(401).json({ error: 'Invalid token' })
        return
      }
    }
    if (!tenantId) { res.status(401).json({ error: 'Unauthorized' }); return }
    let channelQuery = db.from('channels').select('credentials, type').eq('id', channelId).eq('tenant_id', tenantId)
    const { data: channel } = await channelQuery.single()
    if (!channel) { res.status(404).json({ error: 'Channel not found' }); return }
    const credentials = decryptCredentials(channel.credentials)
    const apiKey = credentials?.apiKey
    const metaToken = credentials?.metaToken
    const isMetaId = /^\d+$/.test(mediaId)
    let mediaResponse: Response
    if (isMetaId && metaToken) {
      const metaUrlResponse = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, { headers: { 'Authorization': `Bearer ${metaToken}` } })
      if (!metaUrlResponse.ok) { res.status(404).json({ error: 'Media not found on Meta' }); return }
      const metaData = await metaUrlResponse.json() as any
      if (!metaData.url) { res.status(404).json({ error: 'No URL returned from Meta' }); return }
      mediaResponse = await fetch(metaData.url, { headers: { 'Authorization': `Bearer ${metaToken}` } })
    } else if (apiKey) {
      mediaResponse = await fetch(`https://api.gupshup.io/wa/api/v1/media/${mediaId}`, { headers: { 'apikey': apiKey } })
    } else {
      res.status(400).json({ error: 'No credentials available' }); return
    }
    if (!mediaResponse.ok) { res.status(mediaResponse.status).json({ error: 'Failed to fetch media' }); return }
    const contentType = mediaResponse.headers.get('content-type')
    const contentLength = mediaResponse.headers.get('content-length')
    if (contentType) res.setHeader('Content-Type', contentType)
    if (contentLength) res.setHeader('Content-Length', contentLength)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    const allowedOrigin = process.env.CORS_ORIGIN?.split(',')[0] || ''
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    const buffer = await mediaResponse.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (err) { next(err) }
})

router.use(requireAuth)

// ─── Schemas ──────────────────────────────────────────────────────────────────
const updateStatusSchema = z.object({ status: z.enum(['open', 'waiting', 'closed']) })
const assignSchema = z.object({ userId: z.string().uuid().nullable() })
const pipelineSchema = z.object({
  stage: z.string().max(100).nullable(),
  pipelineId: z.string().uuid().nullable().optional(),
})
const noteSchema = z.object({ body: z.string().min(1).max(5000) })
const quickReplySchema = z.object({ title: z.string().min(1).max(200), body: z.string().min(1).max(5000) })
const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  dueDate: z.string().optional(),
  conversationId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
})

const labelsSchema = z.object({
  labels: z.array(z.object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(100),
    color: z.string().min(1).max(20),
  })).max(10),
})

const updateTaskSchema2 = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  dueDate: z.string().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['pending', 'in_progress', 'completed']).optional(),
})

const bulkAssignSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  userId: z.string().uuid().nullable().optional(),
})

const dealValueSchema = z.object({
  dealValue: z.number().nullable().optional(),
})

const bulkLabelsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  labels: z.array(z.object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(100),
    color: z.string().min(1).max(20),
  })).max(10),
})

const bulkIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
})

// ─── Notas internas ───────────────────────────────────────────────────────────

router.get('/conversations/:id/notes', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('conversation_notes')
      .select('*')
      .eq('conversation_id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .order('created_at', { ascending: true })
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.post('/conversations/:id/notes', validate(noteSchema), async (req, res, next) => {
  try {
    // Valida que a conversa pertence ao tenant
    const { data: conv } = await db.from('conversations').select('id').eq('id', req.params.id).eq('tenant_id', req.auth.tid).single()
    if (!conv) { res.status(404).json({ error: 'Conversa não encontrada' }); return }
    const { body: noteBody } = req.body
    const { data, error } = await db
      .from('conversation_notes')
      .insert({
        conversation_id: req.params.id,
        tenant_id: req.auth.tid,
        user_id: req.auth.sub,
        body: noteBody,
      })
      .select()
      .single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/conversations/:id/notes/:noteId', async (req, res, next) => {
  try {
    const { error } = await db
      .from('conversation_notes')
      .delete()
      .eq('id', req.params.noteId)
      .eq('tenant_id', req.auth.tid)
    if (error) throw error
    res.json(ok({ message: 'Note deleted' }))
  } catch (err) { next(err) }
})

// ─── Respostas rápidas ────────────────────────────────────────────────────────

router.get('/quick-replies', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('quick_replies')
      .select('*')
      .eq('tenant_id', req.auth.tid)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.post('/quick-replies', validate(quickReplySchema), async (req, res, next) => {
  try {
    const { title, body: replyBody } = req.body
    const { data, error } = await db
      .from('quick_replies')
      .insert({ tenant_id: req.auth.tid, title, body: replyBody })
      .select()
      .single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/quick-replies/:id', async (req, res, next) => {
  try {
    const { error } = await db
      .from('quick_replies')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
    if (error) throw error
    res.json(ok({ message: 'Quick reply deleted' }))
  } catch (err) { next(err) }
})

// ─── Campos personalizados ────────────────────────────────────────────────────

router.get('/custom-fields', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('custom_fields')
      .select('*')
      .eq('tenant_id', req.auth.tid)
      .order('sort_order', { ascending: true })
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

// ─── Conversations ────────────────────────────────────────────────────────────

router.get('/conversations', async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query)
    const { status, channelId } = req.query as any
    const role = req.auth.role
    if (role === 'admin' || role === 'owner') {
      const result = await conversationService.listConversations(req.auth.tid, { status, channelId, page, limit })
      return res.json(ok(result.conversations, result.meta))
    }
    const perms = await getUserPermissions(req.auth.sub, req.auth.tid)
    const allowedChannels = perms?.allowed_channels || []
    const effectiveChannelId = channelId || (allowedChannels.length === 1 ? allowedChannels[0] : undefined)
    const conversationAccess = perms?.conversation_access || 'assigned'
    const assignedTo = conversationAccess === 'assigned' ? req.auth.sub : undefined
    const result = await conversationService.listConversations(req.auth.tid, {
      status, channelId: effectiveChannelId, assignedTo, page, limit,
      allowedChannels: allowedChannels.length > 0 ? allowedChannels : undefined,
    })
    res.json(ok(result.conversations, result.meta))
  } catch (err) { next(err) }
})

router.get('/conversations/counts', async (req, res, next) => {
  try {
    const { channelId } = req.query as any
    const role = req.auth.role
    const tid = req.auth.tid

    const runCount = async (status?: string, assignedTo?: string, allowedChannels?: string[]) => {
      let q = db
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tid)
      if (status) q = q.eq('status', status)
      if (channelId) q = q.eq('channel_id', channelId)
      if (assignedTo) q = q.eq('assigned_to', assignedTo)
      if (allowedChannels?.length) q = q.in('channel_id', allowedChannels)
      const { count, error } = await q
      if (error) throw error
      return count || 0
    }

    let assignedTo: string | undefined
    let allowedChannels: string[] | undefined

    if (role !== 'admin' && role !== 'owner') {
      const perms = await getUserPermissions(req.auth.sub, tid)
      const conversationAccess = perms?.conversation_access || 'assigned'
      if (conversationAccess === 'assigned') assignedTo = req.auth.sub
      if (perms?.allowed_channels?.length) allowedChannels = perms.allowed_channels
    }

    const [all, open, waiting, closed] = await Promise.all([
      runCount(undefined, assignedTo, allowedChannels),
      runCount('open', assignedTo, allowedChannels),
      runCount('waiting', assignedTo, allowedChannels),
      runCount('closed', assignedTo, allowedChannels),
    ])

    res.json(ok({ all, open, waiting, closed }))
  } catch (err) { next(err) }
})

router.get('/conversations/pipeline', async (req, res, next) => {
  try {
    const { channelId, campaignId, pipelineId } = req.query as any
    const role = req.auth.role
    if (role === 'admin' || role === 'owner') {
      const board = await conversationService.getPipelineBoard(req.auth.tid, channelId, campaignId, pipelineId)
      return res.json(ok(board))
    }
    const perms = await getUserPermissions(req.auth.sub, req.auth.tid)
    const allowedChannels = perms?.allowed_channels || []
    const effectiveChannelId = channelId || (allowedChannels.length === 1 ? allowedChannels[0] : undefined)
    const board = await conversationService.getPipelineBoard(req.auth.tid, effectiveChannelId, campaignId, pipelineId)
    res.json(ok(board))
  } catch (err) { next(err) }
})

router.get('/conversations/search', async (req, res, next) => {
  try {
    const { q } = req.query as any
    if (!q) { res.json(ok([])); return }
    const results = await conversationService.searchConversations(req.auth.tid, q)
    res.json(ok(results))
  } catch (err) { next(err) }
})

router.get('/conversations/:id', async (req, res, next) => {
  try {
    const conv = await conversationService.getConversation(req.params.id, req.auth.tid)
    res.json(ok(conv))
  } catch (err) { next(err) }
})

router.patch('/conversations/:id/status', validate(updateStatusSchema), async (req, res, next) => {
  try {
    const conv = await conversationService.updateStatus(req.params.id, req.auth.tid, req.body.status)
    res.json(ok(conv))
  } catch (err) { next(err) }
})

router.patch('/conversations/:id/assign', validate(assignSchema), async (req, res, next) => {
  try {
    const conv = await conversationService.assignConversation(req.params.id, req.auth.tid, req.body.userId)
    res.json(ok(conv))
  } catch (err) { next(err) }
})

router.patch('/conversations/:id/pipeline', validate(pipelineSchema), async (req, res, next) => {
  try {
    const conv = await conversationService.updatePipelineStage(req.params.id, req.auth.tid, req.body.stage, req.body.pipelineId)
    res.json(ok(conv))
  } catch (err) { next(err) }
})

router.post('/conversations/:id/read', async (req, res, next) => {
  try {
    await conversationService.markAsRead(req.params.id, req.auth.tid)
    res.json(ok({ message: 'Marked as read' }))
  } catch (err) { next(err) }
})

router.post('/conversations/:id/unread', async (req, res, next) => {
  try {
    const { error } = await db
      .from('conversations')
      .update({ unread_count: 1 })
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
    if (error) throw error
    res.json(ok({ message: 'Marked as unread' }))
  } catch (err) { next(err) }
})

// ─── Tarefas / Follow-ups ─────────────────────────────────────────────────────

router.get('/tasks', async (req, res, next) => {
  try {
    const { status, conversationId } = req.query as any
    let query = db.from('tasks')
      .select('*, conversations(id, contacts(id, name, phone))')
      .eq('tenant_id', req.auth.tid)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100)
    if (status && status !== 'all') query = query.eq('status', status)
    if (conversationId) query = query.eq('conversation_id', conversationId)
    const { data, error } = await query
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.get('/tasks/summary', async (req, res, next) => {
  try {
    const { data: pending } = await db.from('tasks').select('id', { count: 'exact', head: true }).eq('tenant_id', req.auth.tid).eq('status', 'pending')
    const { data: overdue } = await db.from('tasks').select('id', { count: 'exact', head: true }).eq('tenant_id', req.auth.tid).eq('status', 'pending').lte('due_date', new Date().toISOString())
    const { data: today } = await db.from('tasks').select('id', { count: 'exact', head: true }).eq('tenant_id', req.auth.tid).eq('status', 'pending').gte('due_date', new Date(new Date().setHours(0,0,0,0)).toISOString()).lte('due_date', new Date(new Date().setHours(23,59,59,999)).toISOString())
    res.json(ok({ pending: (pending as any)?.length ?? 0, overdue: (overdue as any)?.length ?? 0, today: (today as any)?.length ?? 0 }))
  } catch (err) { next(err) }
})

router.post('/tasks', validate(createTaskSchema), async (req, res, next) => {
  try {
    const { title, description, dueDate, conversationId, contactId, assignedTo, priority } = req.body
    // Valida conversa pertence ao tenant
    if (conversationId) {
      const { data: conv } = await db.from('conversations').select('id').eq('id', conversationId).eq('tenant_id', req.auth.tid).single()
      if (!conv) { res.status(404).json({ error: 'Conversa não encontrada' }); return }
    }
    const { data, error } = await db.from('tasks').insert({
      tenant_id: req.auth.tid,
      conversation_id: conversationId || null,
      contact_id: contactId || null,
      assigned_to: assignedTo || req.auth.sub,
      created_by: req.auth.sub,
      title,
      description: description || null,
      due_date: dueDate || null,
      priority: priority || 'medium',
      status: 'pending',
    }).select().single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/tasks/:id', validate(updateTaskSchema2), async (req, res, next) => {
  try {
    const update: any = { updated_at: new Date() }
    if (req.body.title !== undefined) update.title = req.body.title
    if (req.body.description !== undefined) update.description = req.body.description
    if (req.body.dueDate !== undefined) update.due_date = req.body.dueDate
    if (req.body.assignedTo !== undefined) update.assigned_to = req.body.assignedTo
    if (req.body.priority !== undefined) update.priority = req.body.priority
    if (req.body.status !== undefined) {
      update.status = req.body.status
      if (req.body.status === 'completed') update.completed_at = new Date()
    }
    const { data, error } = await db.from('tasks').update(update).eq('id', req.params.id).eq('tenant_id', req.auth.tid).select().single()
    if (error || !data) { res.status(404).json({ error: 'Tarefa não encontrada' }); return }
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/tasks/:id', async (req, res, next) => {
  try {
    await db.from('tasks').delete().eq('id', req.params.id).eq('tenant_id', req.auth.tid)
    res.json(ok({ message: 'Tarefa excluída' }))
  } catch (err) { next(err) }
})

// ─── Ações em massa ───────────────────────────────────────────────────────────

router.post('/conversations/bulk/read', validate(bulkIdsSchema), async (req, res, next) => {
  try {
    const { ids } = req.body
    const results = await Promise.all(
      ids.map((id: string) =>
        db.from('conversations').update({ unread_count: 0 }).eq('tenant_id', req.auth.tid).eq('id', id).then(() => true).catch(() => false)
      )
    )
    const updated = results.filter(Boolean).length
    logger.info('Bulk read', { tenantId: req.auth.tid, requested: ids.length, updated })
    res.json(ok({ updated }))
  } catch (err) { next(err) }
})

router.post('/conversations/bulk/close', validate(bulkIdsSchema), async (req, res, next) => {
  try {
    const { ids } = req.body
    await db.from('conversations').update({ status: 'closed' }).eq('tenant_id', req.auth.tid).in('id', ids)
    res.json(ok({ updated: ids.length }))
  } catch (err) { next(err) }
})

router.post('/conversations/bulk/assign', validate(bulkAssignSchema), async (req, res, next) => {
  try {
    const { ids, userId } = req.body
    if (userId) {
      const { data: user } = await db.from('users').select('id').eq('id', userId).eq('tenant_id', req.auth.tid).single()
      if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return }
    }
    await db.from('conversations').update({ assigned_to: userId || null }).eq('tenant_id', req.auth.tid).in('id', ids)
    res.json(ok({ updated: ids.length }))
  } catch (err) { next(err) }
})

// ─── Busca global de mensagens ────────────────────────────────────────────────
router.get('/messages/search', async (req, res, next) => {
  try {
    const q = ((req.query.q as string) || '').replace(/[%_'"\\,()]/g, '').trim()
    if (!q || q.length < 2) { res.json(ok([])); return }

    const { data } = await db
      .from('messages')
      .select('id, body, direction, content_type, created_at, conversation_id, conversations(id, contacts(id, name, phone))')
      .eq('tenant_id', req.auth.tid)
      .ilike('body', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(30)

    // Agrupa por conversa para evitar duplicatas
    const seen = new Set<string>()
    const results = (data || []).filter((m: any) => {
      if (seen.has(m.conversation_id)) return false
      seen.add(m.conversation_id)
      return true
    }).map((m: any) => ({
      messageId: m.id,
      conversationId: m.conversation_id,
      body: m.body,
      direction: m.direction,
      createdAt: m.created_at,
      contactName: m.conversations?.contacts?.name || m.conversations?.contacts?.phone || '',
      contactPhone: m.conversations?.contacts?.phone || '',
    }))

    res.json(ok(results))
  } catch (err) { next(err) }
})

router.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const { cursor, limit } = req.query as any
    const messages = await conversationService.getMessages(req.params.id, req.auth.tid, cursor, Number(limit) || 30)
    res.json(ok(messages))
  } catch (err) { next(err) }
})

// ─── Valor monetário do negócio (pipeline) ────────────────────────────────────
router.patch('/conversations/:id/deal-value', validate(dealValueSchema), async (req, res, next) => {
  try {
    const parsed = req.body.dealValue === undefined ? null : req.body.dealValue
    const { data, error } = await db
      .from('conversations')
      .update({ deal_value: parsed })
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select('id, deal_value')
      .single()
    if (error) throw error
    res.json(ok(data))
  } catch (err) { next(err) }
})

// ─── Etiquetas de conversa ───────────────────────────────────────────────────

/*
-- SQL para adicionar coluna labels na tabela conversations:
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS labels JSONB DEFAULT '[]';
CREATE INDEX idx_conversations_labels ON conversations USING GIN (labels);
*/

router.patch('/conversations/:id/labels', validate(labelsSchema), async (req, res, next) => {
  try {
    const { labels } = req.body
    const { data, error } = await db
      .from('conversations')
      .update({ labels })
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select('id, labels')
      .single()
    if (error) throw error
    if (!data) { res.status(404).json({ error: 'Conversa não encontrada' }); return }
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.post('/conversations/bulk/labels', validate(bulkLabelsSchema), async (req, res, next) => {
  try {
    const { ids, labels } = req.body
    await db.from('conversations').update({ labels }).eq('tenant_id', req.auth.tid).in('id', ids)
    res.json(ok({ updated: ids.length }))
  } catch (err) { next(err) }
})

export default router
