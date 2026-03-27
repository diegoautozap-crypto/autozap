import { Router } from 'express'
import { z } from 'zod'
import { conversationService } from '../services/conversation.service'
import { requireAuth, validate } from '../middleware/conversation.middleware'
import { ok, paginationSchema } from '@autozap/utils'
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
  pipelineId: z.string().uuid().optional(),
})

// ─── Pipeline CRUD ────────────────────────────────────────────────────────────

// GET /pipelines — lista todas as pipelines do tenant
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

// POST /pipelines — cria nova pipeline
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

// PATCH /pipelines/:id — renomeia pipeline
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

// DELETE /pipelines/:id — deleta pipeline e suas colunas
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

// ─── Conversation Routes ───────────────────────────────────────────────────────

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

export default router