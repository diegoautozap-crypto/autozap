import { Router } from 'express'
import { z } from 'zod'
import { conversationService } from '../services/conversation.service'
import { requireAuth, validate } from '../middleware/conversation.middleware'
import { ok, paginationSchema } from '@autozap/utils'

const router = Router()
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

// GET /conversations
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

// GET /conversations/pipeline — kanban board
router.get('/conversations/pipeline', async (req, res, next) => {
  try {
    const board = await conversationService.getPipelineBoard(req.auth.tid)
    res.json(ok(board))
  } catch (err) { next(err) }
})

// GET /conversations/search
router.get('/conversations/search', async (req, res, next) => {
  try {
    const { q } = req.query as any
    if (!q) { res.json(ok([])); return }
    const results = await conversationService.searchConversations(req.auth.tid, q)
    res.json(ok(results))
  } catch (err) { next(err) }
})

// GET /conversations/:id
router.get('/conversations/:id', async (req, res, next) => {
  try {
    const conv = await conversationService.getConversation(req.params.id, req.auth.tid)
    res.json(ok(conv))
  } catch (err) { next(err) }
})

// PATCH /conversations/:id/status
router.patch('/conversations/:id/status', validate(updateStatusSchema), async (req, res, next) => {
  try {
    const conv = await conversationService.updateStatus(req.params.id, req.auth.tid, req.body.status)
    res.json(ok(conv))
  } catch (err) { next(err) }
})

// PATCH /conversations/:id/assign
router.patch('/conversations/:id/assign', validate(assignSchema), async (req, res, next) => {
  try {
    const conv = await conversationService.assignConversation(req.params.id, req.auth.tid, req.body.userId)
    res.json(ok(conv))
  } catch (err) { next(err) }
})

// PATCH /conversations/:id/pipeline
router.patch('/conversations/:id/pipeline', validate(pipelineSchema), async (req, res, next) => {
  try {
    const conv = await conversationService.updatePipelineStage(req.params.id, req.auth.tid, req.body.stage)
    res.json(ok(conv))
  } catch (err) { next(err) }
})

// POST /conversations/:id/read
router.post('/conversations/:id/read', async (req, res, next) => {
  try {
    await conversationService.markAsRead(req.params.id, req.auth.tid)
    res.json(ok({ message: 'Marked as read' }))
  } catch (err) { next(err) }
})

// GET /conversations/:id/messages — paginated messages
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
