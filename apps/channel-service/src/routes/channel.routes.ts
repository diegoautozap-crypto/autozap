import { Router } from 'express'
import { z } from 'zod'
import { channelService } from '../services/channel.service'
import { requireAuth, requireRole, validate } from '../middleware/channel.middleware'
import { ok } from '@autozap/utils'
import { logger } from '../lib/logger'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { PassThrough } from 'stream'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

const router = Router()

// ─── Schemas ──────────────────────────────────────────────────────────────────
const createChannelSchema = z.object({
  name: z.string().min(2).max(255),
  type: z.enum(['gupshup', 'meta_cloud', 'twilio', 'evolution', 'zapi', 'instagram']),
  phoneNumber: z.string().optional(),
  credentials: z.record(z.string()),
  settings: z.record(z.unknown()).optional(),
})

// ─── Helper: sanitiza credenciais para o frontend ─────────────────────────────
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

// ─── Audio Proxy com conversão para MP3 (public) ──────────────────────────────
// O WhatsApp não aceita URLs do Supabase para áudio ogg.
// Essa rota baixa o ogg do Supabase, converte para MP3 real com ffmpeg
// e serve via URL do Railway que o WhatsApp aceita.
router.get('/audio-proxy', async (req, res) => {
  try {
    const { url } = req.query
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'url is required' })
      return
    }

    if (!url.includes('supabase.co')) {
      res.status(403).json({ error: 'Only Supabase URLs are allowed' })
      return
    }

    const audioResponse = await fetch(url)
    if (!audioResponse.ok) {
      res.status(502).json({ error: 'Failed to fetch audio' })
      return
    }

    const buffer = await audioResponse.arrayBuffer()
    const inputBuffer = Buffer.from(buffer)

    // Converte ogg/webm → mp3 via ffmpeg
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('Accept-Ranges', 'bytes')

    const { Readable } = await import('stream')
    const inputStream = new Readable()
    inputStream.push(inputBuffer)
    inputStream.push(null)

    const passThrough = new PassThrough()

    ffmpeg(inputStream)
      .inputFormat('webm')
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .format('mp3')
      .on('error', (err) => {
        logger.error('ffmpeg conversion error', { err: err.message })
        if (!res.headersSent) {
          res.status(500).json({ error: 'Conversion failed' })
        }
      })
      .pipe(passThrough)

    passThrough.pipe(res)

  } catch (err) {
    logger.error('Audio proxy error', { err })
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal error' })
    }
  }
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

    if (isMetaV3) {
      const value = payload?.entry?.[0]?.changes?.[0]?.value

      if (value?.messages?.length > 0) {
        const normalized = await channelService.parseInbound('gupshup', payload)
        if (normalized) {
          normalized.channelId = channel.id
          await notifyMessageService('inbound', {
            tenantId: channel.tenantId,
            channelId: channel.id,
            message: normalized,
          })
        }
      }

      if (value?.statuses?.length > 0) {
        const statusUpdate = await channelService.parseStatusUpdate('gupshup', payload)
        if (statusUpdate) {
          await notifyMessageService('status_update', {
            tenantId: channel.tenantId,
            channelId: channel.id,
            statusUpdate,
          })
        }
      }

    } else if (payload?.type === 'message') {
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