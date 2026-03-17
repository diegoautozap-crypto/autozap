import { Router } from 'express'
import { z } from 'zod'
import { messageService } from '../services/message.service'
import { messageQueue } from '../workers/message.worker'
import { requireAuth, validate, requireInternal } from '../middleware/message.middleware'
import { ok } from '@autozap/utils'
import { v4 as uuidv4 } from 'uuid'

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

// Internal Routes
router.post('/internal/inbound', requireInternal, async (req, res, next) => {
  try {
    const { tenantId, channelId, message } = req.body
    logger.info('Inbound received', { message: JSON.stringify(message) })
    await messageService.processInbound(tenantId, channelId, {
      ...message,
      timestamp: new Date(message.timestamp),
    })
    res.json(ok({ message: 'Inbound message processed' }))
  } catch (err) { next(err) }
})

router.post('/internal/status_update', requireInternal, async (req, res, next) => {
  try {
    const { tenantId, statusUpdate } = req.body
    await messageService.updateStatus(tenantId, {
      ...statusUpdate,
      timestamp: new Date(statusUpdate.timestamp),
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

export default router
