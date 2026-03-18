import { Router } from 'express'
import { z } from 'zod'
import { conversationService } from '../services/conversation.service'
import { requireAuth, validate } from '../middleware/conversation.middleware'
import { ok, paginationSchema } from '@autozap/utils'
import { db } from '../lib/db'

const router = Router()

// ─── Media proxy — NÃO requer auth JWT (usa channelId + mediaId) ──────────────
// GET /conversations/media/:mediaId?channelId=xxx
router.get('/conversations/media/:mediaId', async (req, res, next) => {
  try {
    const { mediaId } = req.params
    const { channelId } = req.query as any

    if (!channelId) {
      res.status(400).json({ error: 'channelId required' })
      return
    }

    // Busca as credenciais do canal
    const { data: channel } = await db
      .from('channels')
      .select('credentials, type')
      .eq('id', channelId)
      .single()

    if (!channel) {
      res.status(404).json({ error: 'Channel not found' })
      return
    }

    const apiKey = channel.credentials?.apiKey

    if (!apiKey) {
      res.status(400).json({ error: 'No apiKey found for channel' })
      return
    }

    // Proxy da mídia do Gupshup
    const mediaResponse = await fetch(
      `https://api.gupshup.io/wa/api/v1/media/${mediaId}`,
      {
        headers: {
          'apikey': apiKey,
        },
      }
    )

    if (!mediaResponse.ok) {
      res.status(mediaResponse.status).json({ error: 'Failed to fetch media' })
      return
    }

    // Passa os headers de content-type e content-length
    const contentType = mediaResponse.headers.get('content-type')
    const contentLength = mediaResponse.headers.get('content-length')

    if (contentType) res.setHeader('Content-Type', contentType)
    if (contentLength) res.setHeader('Content-Length', contentLength)
    res.setHeader('Cache-Control', 'public, max-age=86400') // Cache 24h

    // Stream da resposta para o frontend
    const buffer = await mediaResponse.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (err) {
    next(err)
  }
})

router.use(requireAuth)

// ─── Schemas ──────────────────────────────────────────────────────────────────
const updateStatusSchema = z.object({
  status: z.enum(['open', 'waiting', 'closed']),
})

const assignSchema = z.object({
  userId: z.string().uuid().nullable(),
})

const pipelineSchema = z.object({
  stage: z.enum(['lead', 'qualificacao', 'proposta', 'negociacao', 'ganho', 'perdido']),
})

// ─── Conversations ────────────────────────────────────────────────────────────

router.get('/conversations', async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query)
    const { status, assignedTo, channelId } = req.query as any
    const result = await conversationService.listConversations(req.auth.tid, {
      status, assignedTo, channelId, page, limit,
    })
    res.json(ok(result.conversations, result.meta))
  } catch (err) { next(err) }
})

router.get('/conversations/pipeline', async (req, res, next) => {
  try {
    const board = await conversationService.getPipelineBoard(req.auth.tid)
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
    const conv = await conversationService.updatePipelineStage(req.params.id, req.auth.tid, req.body.stage)
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
    const messages = await conversationService.getMessages(
      req.params.id,
      req.auth.tid,
      cursor,
      Number(limit) || 30,
    )
    res.json(ok(messages))
  } catch (err) { next(err) }
})

export default router
