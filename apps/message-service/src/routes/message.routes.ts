import { Router } from 'express'
import { z } from 'zod'
import { messageService } from '../services/message.service'
import { messageQueue } from '../workers/message.worker'
import { requireAuth, validate, requireInternal } from '../middleware/message.middleware'
import { ok } from '@autozap/utils'

const router = Router()

const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'autozap_internal'

function requireAuthOrInternal(req: any, res: any, next: any): void {
  const secret = req.headers['x-internal-secret']
  if (secret === INTERNAL_SECRET) {
    next()
    return
  }
  requireAuth(req, res, next)
}

function parseTimestamp(ts: any): Date {
  if (!ts) return new Date()
  if (ts instanceof Date) return ts
  if (typeof ts === 'number') {
    return new Date(ts > 1e12 ? ts : ts * 1000)
  }
  const d = new Date(ts)
  if (isNaN(d.getTime())) return new Date()
  return d
}

// Internal Routes
router.post('/internal/inbound', requireInternal, async (req, res, next) => {
  try {
    const { tenantId, channelId, message } = req.body
    await messageService.processInbound(tenantId, channelId, {
      ...message,
      timestamp: parseTimestamp(message.timestamp),
    })
    res.json(ok({ message: 'Inbound message processed' }))
  } catch (err) { next(err) }
})

router.post('/internal/status_update', requireInternal, async (req, res, next) => {
  try {
    const { tenantId, channelId, statusUpdate } = req.body
    await messageService.updateStatus(tenantId, channelId, {
      ...statusUpdate,
      timestamp: parseTimestamp(statusUpdate.timestamp),
    })
    res.json(ok({ message: 'Status updated' }))
  } catch (err) { next(err) }
})

const sendSchema = z.object({
  channelId: z.string().uuid(),
  contactId: z.string().uuid(),
  conversationId: z.string().uuid(),
  tenantId: z.string().uuid().optional(),
  to: z.string().min(1),
  contentType: z.enum(['text', 'image', 'audio', 'video', 'document', 'template']),
  body: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  campaignId: z.string().uuid().optional(),
})

// POST /messages/send — accepts JWT or internal secret
router.post('/messages/send', requireAuthOrInternal, validate(sendSchema), async (req, res, next) => {
  try {
    const { channelId, contactId, conversationId, to, contentType, body, mediaUrl, campaignId } = req.body
    const secret = req.headers['x-internal-secret']
    const tenantId = secret === INTERNAL_SECRET
      ? (req.body.tenantId || req.auth?.tid)
      : req.auth.tid

    const messageUuid = await messageService.queueMessage({
      tenantId,
      channelId,
      contactId,
      conversationId,
      to,
      contentType,
      body,
      mediaUrl,
      campaignId,
    })

    await messageQueue.add('send', {
      messageUuid,
      tenantId,
      channelId,
      to,
      contentType,
      body,
      mediaUrl,
      retryCount: 0,
    })

    res.json(ok({ messageUuid, status: 'queued' }))
  } catch (err) { next(err) }
})

// GET /messages/:conversationId
router.get('/messages/:conversationId', requireAuth, async (req, res, next) => {
  try {
    const { cursor, limit } = req.query
    const messages = await messageService.listMessages(
      req.params.conversationId,
      req.auth.tid,
      cursor as string | undefined,
      Number(limit) || 30,
    )
    res.json(ok(messages))
  } catch (err) { next(err) }
})

// POST /messages/conversations/:conversationId/take-over — pausa o bot
router.post('/messages/conversations/:conversationId/take-over', requireAuth, async (req, res, next) => {
  try {
    await messageService.takeOver(req.params.conversationId, req.auth.tid)
    res.json(ok({ message: 'Bot pausado' }))
  } catch (err) { next(err) }
})

// POST /messages/conversations/:conversationId/release-bot — reativa o bot
router.post('/messages/conversations/:conversationId/release-bot', requireAuth, async (req, res, next) => {
  try {
    await messageService.releaseBot(req.params.conversationId, req.auth.tid)
    res.json(ok({ message: 'Bot reativado' }))
  } catch (err) { next(err) }
})

export default router