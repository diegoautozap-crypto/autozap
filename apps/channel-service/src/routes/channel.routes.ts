import { Router } from 'express'
import { z } from 'zod'
import { channelService } from '../services/channel.service'
import { requireAuth, requireRole, validate } from '../middleware/channel.middleware'
import { ok } from '@autozap/utils'
import { logger } from '../lib/logger'

const router = Router()

// ─── Schemas ──────────────────────────────────────────────────────────────────
const createChannelSchema = z.object({
  name: z.string().min(2).max(255),
  type: z.enum(['gupshup', 'meta_cloud', 'twilio', 'evolution', 'zapi', 'instagram']),
  phoneNumber: z.string().optional(),
  credentials: z.record(z.string()),
  settings: z.record(z.unknown()).optional(),
})

// ─── Helper: sanitiza credenciais para o frontend ────────────────────────────
// Retorna só o apiKey (para montar webhook URL) — nunca expõe segredos completos
function safeChannel(channel: any) {
  const { credentials, ...rest } = channel
  return {
    ...rest,
    webhookApiKey: credentials?.apiKey || null,
    hasMetaToken: !!(credentials?.metaToken),
  }
}

// ─── Channel CRUD (protected) ─────────────────────────────────────────────────

router.use('/channels', requireAuth)

// GET /channels
router.get('/channels', async (req, res, next) => {
  try {
    const channels = await channelService.listChannels(req.auth.tid)
    res.json(ok(channels.map(safeChannel)))
  } catch (err) { next(err) }
})

// POST /channels
router.post('/channels', requireRole('admin', 'owner'), validate(createChannelSchema), async (req, res, next) => {
  try {
    const channel = await channelService.createChannel({
      tenantId: req.auth.tid,
      ...req.body,
    })
    res.status(201).json(ok(safeChannel(channel)))
  } catch (err) { next(err) }
})

// GET /channels/:id
router.get('/channels/:id', async (req, res, next) => {
  try {
    const channel = await channelService.getChannel(req.params.id, req.auth.tid)
    res.json(ok(safeChannel(channel)))
  } catch (err) { next(err) }
})

// DELETE /channels/:id
router.delete('/channels/:id', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    await channelService.deleteChannel(req.params.id, req.auth.tid)
    res.json(ok({ message: 'Channel deleted' }))
  } catch (err) { next(err) }
})

// ─── Gupshup Webhook (public) ─────────────────────────────────────────────────
router.post('/webhook/gupshup/:apikey', async (req, res, next) => {
  try {
    const { apikey } = req.params
    const payload = req.body

    logger.debug('Gupshup webhook received', { apikey, type: payload?.type })

    const channel = await channelService.getChannelByApiKey(apikey)
    if (!channel) {
      logger.warn('Webhook received for unknown apikey', { apikey })
      res.status(200).json({ success: true })
      return
    }

    const isMetaV3 = payload?.object === 'whatsapp_business_account'
    if (payload?.type === 'message' || isMetaV3) {
      const normalized = await channelService.parseInbound('gupshup', payload)
      if (normalized) {
        normalized.channelId = channel.id
        await notifyMessageService('inbound', {
          tenantId: channel.tenantId,
          channelId: channel.id,
          message: normalized,
        })
      }
    } else if (payload?.type === 'message-event') {
      const statusUpdate = await channelService.parseStatusUpdate('gupshup', payload)
      if (statusUpdate) {
        await notifyMessageService('status_update', {
          tenantId: channel.tenantId,
          channelId: channel.id,
          statusUpdate,
        })
      }
    }

    res.status(200).json({ success: true })
  } catch (err) {
    logger.error('Webhook processing error', { err })
    res.status(200).json({ success: true })
  }
})

// ─── Helper: notify message-service ──────────────────────────────────────────
async function notifyMessageService(event: string, data: unknown): Promise<void> {
  const messageServiceUrl = process.env.MESSAGE_SERVICE_URL || 'http://localhost:3004'
  try {
    const response = await fetch(`${messageServiceUrl}/internal/${event}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET || 'autozap_internal',
      },
      body: JSON.stringify(data),
    })
    logger.info('Message-service notified', { event, status: response.status })
  } catch (err) {
    logger.error('Failed to notify message-service', { event, err })
  }
}

// ─── Internal: send message ───────────────────────────────────────────────────
router.post('/internal/send', async (req, res, next) => {
  try {
    const secret = req.headers['x-internal-secret']
    if (secret !== (process.env.INTERNAL_SECRET || 'autozap_internal')) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } })
      return
    }
    const { messageUuid, channelId, tenantId, to, contentType, body, mediaUrl } = req.body
    const result = await channelService.sendMessage(channelId, tenantId, {
      to, contentType, body, mediaUrl, messageUuid,
    })
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

export default router
