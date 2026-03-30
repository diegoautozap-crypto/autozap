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

// ─── Media proxy ──────────────────────────────────────────────────────────────
router.get('/conversations/media/:mediaId', async (req, res, next) => {
  try {
    const { mediaId } = req.params
    const { channelId } = req.query as any
    if (!channelId) { res.status(400).json({ error: 'channelId required' }); return }
    const { data: channel } = await db.from('channels').select('credentials, type').eq('id', channelId).single()
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
    res.setHeader('Access-Control-Allow-Origin', '*')
    const buffer = await mediaResponse.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (err) { next(err) }
})

router.use(requireAuth)

// ─── Schemas ──────────────────────────────────────────────────────────────────
const updateStatusSchema = z.object({ status: z.enum(['open', 'waiting', 'closed']) })
const assignSchema = z.object({ userId: z.string().uuid().nullable() })
const pipelineSchema = z.object({
  stage: z.string().min(1).max(100),
  pipelineId: z.string().uuid().nullable().optional(),
})
const noteSchema = z.object({ body: z.string().min(1).max(5000) })
const quickReplySchema = z.object({ title: z.string().min(1).max(200), body: z.string().min(1).max(5000) })
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

export default router