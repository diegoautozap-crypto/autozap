import { Router } from 'express'
import { z } from 'zod'
import { conversationService } from '../services/conversation.service'
import { requireAuth, validate } from '../middleware/conversation.middleware'
import { ok, paginationSchema, generateId } from '@autozap/utils'
import { db } from '../lib/db'
import { decryptCredentials } from '../lib/crypto'

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
    let tenantId: string | null = null
    const authHeader = req.headers.authorization
    const jwtToken = queryToken || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null)
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
    res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*')
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

const bulkIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
})

const pipelineColumnSchema = z.object({
  columns: z.array(z.object({
    id: z.string().optional(),
    key: z.string().min(1).max(100),
    label: z.string().min(1).max(100),
    color: z.string().optional().default('#6b7280'),
    sort_order: z.number().int().min(0),
    _isNew: z.boolean().optional(),
  })),
  pipelineId: z.string().uuid().nullable().optional(),
  removedIds: z.array(z.string().uuid()).optional(),
})

// ─── Pipeline CRUD ────────────────────────────────────────────────────────────

router.get('/pipelines', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('pipelines')
      .select('*')
      .eq('tenant_id', req.auth.tid)
      .order('created_at', { ascending: true })
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.post('/pipelines', async (req, res, next) => {
  try {
    const { name } = req.body
    if (!name) { res.status(400).json({ error: 'name is required' }); return }
    const { data, error } = await db
      .from('pipelines')
      .insert({ tenant_id: req.auth.tid, name })
      .select()
      .single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/pipelines/:id', async (req, res, next) => {
  try {
    const { name } = req.body
    const { data, error } = await db
      .from('pipelines')
      .update({ name })
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select()
      .single()
    if (error) throw error
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/pipelines/:id', async (req, res, next) => {
  try {
    await db.from('pipeline_columns').delete().eq('pipeline_id', req.params.id)
    const { error } = await db
      .from('pipelines')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
    if (error) throw error
    res.json(ok({ message: 'Pipeline deleted' }))
  } catch (err) { next(err) }
})

// ─── Pipeline Columns ─────────────────────────────────────────────────────────

router.get('/pipeline-columns', async (req, res, next) => {
  try {
    const { pipelineId } = req.query as any
    let query = db
      .from('pipeline_columns')
      .select('*')
      .eq('tenant_id', req.auth.tid)
      .order('sort_order', { ascending: true })
    if (pipelineId) {
      query = query.eq('pipeline_id', pipelineId)
    } else {
      query = query.is('pipeline_id', null)
    }
    const { data, error } = await query
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.put('/pipeline-columns', validate(pipelineColumnSchema), async (req, res, next) => {
  try {
    const { columns, pipelineId = null, removedIds = [] } = req.body
    const tenantId = req.auth.tid
    const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

    if (removedIds.length > 0) {
      const { error } = await db
        .from('pipeline_columns')
        .delete()
        .in('id', removedIds)
        .eq('tenant_id', tenantId)
      if (error) throw error
    }

    const toInsert = columns
      .filter((c: any) => c._isNew || !c.id || !isUUID(c.id))
      .map((c: any, i: number) => ({
        tenant_id: tenantId,
        pipeline_id: pipelineId,
        key: c.key,
        label: c.label,
        color: c.color || '#6b7280',
        sort_order: c.sort_order ?? i,
      }))

    if (toInsert.length > 0) {
      const { error } = await db.from('pipeline_columns').insert(toInsert)
      if (error) throw error
    }

    const toUpdate = columns.filter((c: any) => !c._isNew && c.id && isUUID(c.id))
    for (const col of toUpdate) {
      const { error } = await db
        .from('pipeline_columns')
        .update({ label: col.label, color: col.color, sort_order: col.sort_order })
        .eq('id', col.id)
        .eq('tenant_id', tenantId)
      if (error) throw error
    }

    let q = db
      .from('pipeline_columns')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true })
    q = pipelineId ? q.eq('pipeline_id', pipelineId) : q.is('pipeline_id', null)

    const { data, error } = await q
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
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

router.patch('/tasks/:id', async (req, res, next) => {
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

// ─── Criar conversa manualmente (pra adicionar contato à pipeline) ────────────

// ─── Pipeline Cards (negócios independentes) ─────────────────────────────────

router.get('/pipeline-cards', async (req, res, next) => {
  try {
    const { pipelineId } = req.query as any
    let query = db.from('pipeline_cards')
      .select('*, contacts(id, name, phone, email, metadata, contact_tags(tags(id, name, color)))')
      .eq('tenant_id', req.auth.tid)
      .order('sort_order', { ascending: true })
    if (pipelineId) query = query.eq('pipeline_id', pipelineId)
    const { data, error } = await query
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.post('/pipeline-cards', async (req, res, next) => {
  try {
    const { contactId, pipelineId, columnKey, title, dealValue } = req.body
    if (!contactId) { res.status(400).json({ error: 'contactId required' }); return }

    const { data: contact } = await db.from('contacts').select('id').eq('id', contactId).eq('tenant_id', req.auth.tid).single()
    if (!contact) { res.status(404).json({ error: 'Contato não encontrado' }); return }

    const { data, error } = await db.from('pipeline_cards').insert({
      tenant_id: req.auth.tid,
      contact_id: contactId,
      pipeline_id: pipelineId || null,
      column_key: columnKey || 'lead',
      title: title || null,
      deal_value: dealValue || null,
    }).select('*, contacts(id, name, phone)').single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/pipeline-cards/:id', async (req, res, next) => {
  try {
    const update: any = { updated_at: new Date() }
    if (req.body.columnKey !== undefined) update.column_key = req.body.columnKey
    if (req.body.pipelineId !== undefined) update.pipeline_id = req.body.pipelineId
    if (req.body.dealValue !== undefined) update.deal_value = req.body.dealValue
    if (req.body.title !== undefined) update.title = req.body.title
    if (req.body.sortOrder !== undefined) update.sort_order = req.body.sortOrder
    if (req.body.assignedTo !== undefined) update.assigned_to = req.body.assignedTo

    const { data, error } = await db.from('pipeline_cards').update(update)
      .eq('id', req.params.id).eq('tenant_id', req.auth.tid).select().single()
    if (error || !data) { res.status(404).json({ error: 'Card não encontrado' }); return }
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/pipeline-cards/:id', async (req, res, next) => {
  try {
    await db.from('pipeline_cards').delete().eq('id', req.params.id).eq('tenant_id', req.auth.tid)
    res.json(ok({ message: 'Card removido' }))
  } catch (err) { next(err) }
})

// ─── Ações em massa ───────────────────────────────────────────────────────────

router.post('/conversations/bulk/read', validate(bulkIdsSchema), async (req, res, next) => {
  try {
    const { ids } = req.body
    await db.from('conversations').update({ unread_count: 0 }).eq('tenant_id', req.auth.tid).in('id', ids)
    res.json(ok({ updated: ids.length }))
  } catch (err) { next(err) }
})

router.post('/conversations/bulk/close', validate(bulkIdsSchema), async (req, res, next) => {
  try {
    const { ids } = req.body
    await db.from('conversations').update({ status: 'closed' }).eq('tenant_id', req.auth.tid).in('id', ids)
    res.json(ok({ updated: ids.length }))
  } catch (err) { next(err) }
})

router.post('/conversations/bulk/assign', async (req, res, next) => {
  try {
    const { ids, userId } = req.body
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: 'ids required' }); return }
    if (ids.length > 100) { res.status(400).json({ error: 'Maximum 100 IDs per request' }); return }
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
router.patch('/conversations/:id/deal-value', async (req, res, next) => {
  try {
    const { dealValue } = req.body
    const parsed = dealValue === null || dealValue === undefined ? null : Number(dealValue)
    if (parsed !== null && isNaN(parsed)) {
      res.status(400).json({ error: 'dealValue must be a number or null' }); return
    }
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

// ─── Agendamentos — Scheduling Config ────────────────────────────────────────

/*
-- SQL para criar tabelas no Supabase:

CREATE TABLE scheduling_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Horário de atendimento',
  slot_duration_minutes INT NOT NULL DEFAULT 30,
  days_available JSONB NOT NULL DEFAULT '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}',
  start_time TEXT NOT NULL DEFAULT '09:00',
  end_time TEXT NOT NULL DEFAULT '18:00',
  break_start TEXT,
  break_end TEXT,
  advance_days INT NOT NULL DEFAULT 7,
  reminder_minutes INT NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  config_id UUID NOT NULL REFERENCES scheduling_config(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  notes TEXT,
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_tenant_date ON appointments(tenant_id, date);
CREATE INDEX idx_appointments_contact ON appointments(contact_id);
CREATE INDEX idx_appointments_config ON appointments(config_id);
CREATE INDEX idx_scheduling_config_tenant ON scheduling_config(tenant_id);
*/

const schedulingConfigSchema = z.object({
  name: z.string().min(1).max(200).optional().default('Horário de atendimento'),
  slotDurationMinutes: z.number().int().min(5).max(480).optional().default(30),
  daysAvailable: z.record(z.string(), z.boolean()).optional().default({ mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().default('09:00'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().default('18:00'),
  breakStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional().default(null),
  breakEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional().default(null),
  advanceDays: z.number().int().min(1).max(90).optional().default(7),
  reminderMinutes: z.number().int().min(0).max(1440).optional().default(60),
  isActive: z.boolean().optional().default(true),
})

const appointmentCreateSchema = z.object({
  contactId: z.string().uuid(),
  conversationId: z.string().uuid().nullable().optional(),
  channelId: z.string().uuid().nullable().optional(),
  configId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).optional().default('scheduled'),
  notes: z.string().max(2000).nullable().optional(),
})

const appointmentUpdateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  notes: z.string().max(2000).nullable().optional(),
  reminderSent: z.boolean().optional(),
})

router.get('/scheduling', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('scheduling_config')
      .select('*')
      .eq('tenant_id', req.auth.tid)
      .order('created_at', { ascending: true })
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.post('/scheduling', validate(schedulingConfigSchema), async (req, res, next) => {
  try {
    const { name, slotDurationMinutes, daysAvailable, startTime, endTime, breakStart, breakEnd, advanceDays, reminderMinutes, isActive } = req.body
    const { data, error } = await db
      .from('scheduling_config')
      .insert({
        tenant_id: req.auth.tid,
        name,
        slot_duration_minutes: slotDurationMinutes,
        days_available: daysAvailable,
        start_time: startTime,
        end_time: endTime,
        break_start: breakStart || null,
        break_end: breakEnd || null,
        advance_days: advanceDays,
        reminder_minutes: reminderMinutes,
        is_active: isActive,
      })
      .select()
      .single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/scheduling/:id', async (req, res, next) => {
  try {
    const update: any = {}
    if (req.body.name !== undefined) update.name = req.body.name
    if (req.body.slotDurationMinutes !== undefined) update.slot_duration_minutes = req.body.slotDurationMinutes
    if (req.body.daysAvailable !== undefined) update.days_available = req.body.daysAvailable
    if (req.body.startTime !== undefined) update.start_time = req.body.startTime
    if (req.body.endTime !== undefined) update.end_time = req.body.endTime
    if (req.body.breakStart !== undefined) update.break_start = req.body.breakStart
    if (req.body.breakEnd !== undefined) update.break_end = req.body.breakEnd
    if (req.body.advanceDays !== undefined) update.advance_days = req.body.advanceDays
    if (req.body.reminderMinutes !== undefined) update.reminder_minutes = req.body.reminderMinutes
    if (req.body.isActive !== undefined) update.is_active = req.body.isActive
    const { data, error } = await db
      .from('scheduling_config')
      .update(update)
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select()
      .single()
    if (error || !data) { res.status(404).json({ error: 'Config não encontrada' }); return }
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/scheduling/:id', async (req, res, next) => {
  try {
    const { error } = await db
      .from('scheduling_config')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
    if (error) throw error
    res.json(ok({ message: 'Config de agendamento excluída' }))
  } catch (err) { next(err) }
})

// ─── Agendamentos — Appointments ─────────────────────────────────────────────

router.get('/appointments', async (req, res, next) => {
  try {
    const { date, status, contactId } = req.query as any
    let query = db
      .from('appointments')
      .select('*, contacts(id, name, phone), scheduling_config(id, name, slot_duration_minutes)')
      .eq('tenant_id', req.auth.tid)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(200)
    if (date) query = query.eq('date', date)
    if (status && status !== 'all') query = query.eq('status', status)
    if (contactId) query = query.eq('contact_id', contactId)
    const { data, error } = await query
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.get('/appointments/available-slots', async (req, res, next) => {
  try {
    const { configId, date } = req.query as any
    if (!configId || !date) { res.status(400).json({ error: 'configId and date are required' }); return }

    // 1. Busca config
    const { data: config, error: configError } = await db
      .from('scheduling_config')
      .select('*')
      .eq('id', configId)
      .eq('tenant_id', req.auth.tid)
      .single()
    if (configError || !config) { res.status(404).json({ error: 'Config não encontrada' }); return }
    if (!config.is_active) { res.json(ok([])); return }

    // Verifica se o dia da semana está disponível
    const dayMap: Record<number, string> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' }
    const dateObj = new Date(date + 'T00:00:00')
    const dayKey = dayMap[dateObj.getUTCDay()]
    if (!config.days_available[dayKey]) { res.json(ok([])); return }

    // Verifica advance_days
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const maxDate = new Date(today)
    maxDate.setDate(maxDate.getDate() + config.advance_days)
    if (dateObj < today || dateObj > maxDate) { res.json(ok([])); return }

    // 2. Gera todos os slots possíveis
    const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const formatTime = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

    const startMins = parseTime(config.start_time)
    const endMins = parseTime(config.end_time)
    const breakStartMins = config.break_start ? parseTime(config.break_start) : null
    const breakEndMins = config.break_end ? parseTime(config.break_end) : null
    const duration = config.slot_duration_minutes

    const allSlots: { start: string; end: string }[] = []
    for (let t = startMins; t + duration <= endMins; t += duration) {
      const slotEnd = t + duration
      // Pula slots que colidem com o intervalo
      if (breakStartMins !== null && breakEndMins !== null) {
        if (t < breakEndMins && slotEnd > breakStartMins) continue
      }
      allSlots.push({ start: formatTime(t), end: formatTime(slotEnd) })
    }

    // 3. Filtra slots já ocupados
    const { data: booked } = await db
      .from('appointments')
      .select('start_time, end_time')
      .eq('tenant_id', req.auth.tid)
      .eq('config_id', configId)
      .eq('date', date)
      .neq('status', 'cancelled')

    const bookedSet = new Set((booked || []).map((b: any) => `${b.start_time}-${b.end_time}`))
    const available = allSlots.filter(s => !bookedSet.has(`${s.start}-${s.end}`))

    res.json(ok(available))
  } catch (err) { next(err) }
})

router.post('/appointments', validate(appointmentCreateSchema), async (req, res, next) => {
  try {
    const { contactId, conversationId, channelId, configId, date, startTime, endTime, status, notes } = req.body

    // Valida que config pertence ao tenant
    const { data: config } = await db.from('scheduling_config').select('id').eq('id', configId).eq('tenant_id', req.auth.tid).single()
    if (!config) { res.status(404).json({ error: 'Config não encontrada' }); return }

    // Valida que contato pertence ao tenant
    const { data: contact } = await db.from('contacts').select('id').eq('id', contactId).eq('tenant_id', req.auth.tid).single()
    if (!contact) { res.status(404).json({ error: 'Contato não encontrado' }); return }

    // Verifica conflito de horário
    const { data: conflict } = await db
      .from('appointments')
      .select('id')
      .eq('tenant_id', req.auth.tid)
      .eq('config_id', configId)
      .eq('date', date)
      .eq('start_time', startTime)
      .neq('status', 'cancelled')
      .limit(1)
    if (conflict && conflict.length > 0) { res.status(409).json({ error: 'Horário já ocupado' }); return }

    const { data, error } = await db
      .from('appointments')
      .insert({
        tenant_id: req.auth.tid,
        contact_id: contactId,
        conversation_id: conversationId || null,
        channel_id: channelId || null,
        config_id: configId,
        date,
        start_time: startTime,
        end_time: endTime,
        status: status || 'scheduled',
        notes: notes || null,
      })
      .select('*, contacts(id, name, phone)')
      .single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/appointments/:id', validate(appointmentUpdateSchema), async (req, res, next) => {
  try {
    const update: any = { updated_at: new Date().toISOString() }
    if (req.body.date !== undefined) update.date = req.body.date
    if (req.body.startTime !== undefined) update.start_time = req.body.startTime
    if (req.body.endTime !== undefined) update.end_time = req.body.endTime
    if (req.body.status !== undefined) update.status = req.body.status
    if (req.body.notes !== undefined) update.notes = req.body.notes
    if (req.body.reminderSent !== undefined) update.reminder_sent = req.body.reminderSent

    // Se estiver reagendando, verifica conflito
    if (update.date && update.start_time) {
      const { data: existing } = await db.from('appointments').select('config_id').eq('id', req.params.id).eq('tenant_id', req.auth.tid).single()
      if (existing) {
        const { data: conflict } = await db
          .from('appointments')
          .select('id')
          .eq('tenant_id', req.auth.tid)
          .eq('config_id', existing.config_id)
          .eq('date', update.date)
          .eq('start_time', update.start_time)
          .neq('status', 'cancelled')
          .neq('id', req.params.id)
          .limit(1)
        if (conflict && conflict.length > 0) { res.status(409).json({ error: 'Horário já ocupado' }); return }
      }
    }

    const { data, error } = await db
      .from('appointments')
      .update(update)
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select('*, contacts(id, name, phone)')
      .single()
    if (error || !data) { res.status(404).json({ error: 'Agendamento não encontrado' }); return }
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/appointments/:id', async (req, res, next) => {
  try {
    // Cancela ao invés de deletar hard, para manter histórico
    const { data, error } = await db
      .from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select()
      .single()
    if (error || !data) { res.status(404).json({ error: 'Agendamento não encontrado' }); return }
    res.json(ok({ message: 'Agendamento cancelado' }))
  } catch (err) { next(err) }
})

export default router// deploy 1775502038
