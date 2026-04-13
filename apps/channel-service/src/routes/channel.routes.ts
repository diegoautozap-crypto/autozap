import { Router } from 'express'
import { z } from 'zod'
import { channelService } from '../services/channel.service'
import { requireAuth, requireRole, validate, ok, rateLimit, encryptCredentials, decryptCredentials, logger, db } from '@autozap/utils'
import { channelRouter } from '../adapters/ChannelRouter'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { PassThrough } from 'stream'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

const router = Router()

// ─── Schemas ──────────────────────────────────────────────────────────────────
const createChannelSchema = z.object({
  name: z.string().min(2).max(255),
  type: z.enum(['gupshup', 'meta_cloud', 'twilio', 'evolution', 'zapi', 'instagram', 'messenger']),
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
    srcName: credentials?.srcName || '',
    source: credentials?.source || '',
    // Evolution-specific
    baseUrl: credentials?.baseUrl || '',
    instanceName: credentials?.instanceName || '',
    // Meta (Instagram/Messenger)-specific
    pageId: credentials?.pageId || '',
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

// ✅ PATCH /channels/:id — editar canal
router.patch('/channels/:id', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { name, phoneNumber, credentials } = req.body

    // Busca credenciais atuais para fazer merge
    const { data: current } = await db
      .from('channels')
      .select('credentials')
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .single()

    if (!current) {
      res.status(404).json({ success: false, error: { message: 'Channel not found' } })
      return
    }

    // Descriptografa credenciais atuais antes de fazer merge
    const currentCreds = decryptCredentials(current.credentials || {})
    const mergedCredentials = {
      ...currentCreds,
      ...credentials,
    }
    // Mantém metaToken atual se não enviar novo
    if (!credentials?.metaToken) {
      mergedCredentials.metaToken = currentCreds.metaToken || ''
    }

    const updateData: any = { credentials: encryptCredentials(mergedCredentials) }
    if (name) updateData.name = name
    if (phoneNumber) updateData.phone_number = phoneNumber

    const { data, error } = await db
      .from('channels')
      .update(updateData)
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select()
      .single()

    if (error || !data) {
      res.status(500).json({ success: false, error: { message: 'Failed to update channel' } })
      return
    }

    logger.info('Channel updated', { channelId: req.params.id, tenantId: req.auth.tid })
    res.json(ok(safeChannel(data)))
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
router.get('/audio-proxy', async (req, res) => {
  try {
    const { url } = req.query
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'url is required' })
      return
    }

    // Validação rigorosa contra SSRF
    let parsed: URL
    try { parsed = new URL(url) } catch { res.status(400).json({ error: 'Invalid URL' }); return }
    if (parsed.protocol !== 'https:') { res.status(403).json({ error: 'Only HTTPS allowed' }); return }
    if (!parsed.hostname.endsWith('.supabase.co')) { res.status(403).json({ error: 'Only Supabase URLs are allowed' }); return }
    if (/^(127\.|10\.|172\.(1[6-9]|2|3[01])\.|192\.168\.|169\.254\.|localhost|::1)/.test(parsed.hostname)) {
      res.status(403).json({ error: 'Private IPs not allowed' }); return
    }

    const audioResponse = await fetch(parsed.toString())
    if (!audioResponse.ok) {
      res.status(502).json({ error: 'Failed to fetch audio' })
      return
    }

    const buffer = await audioResponse.arrayBuffer()
    const inputBuffer = Buffer.from(buffer)

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
router.post('/webhook/gupshup/:apikey', rateLimit({ max: 120 }), async (req, res, next) => {
  try {
    const { apikey } = req.params
    const payload = req.body
    if (!payload || typeof payload !== 'object') { res.status(400).json({ error: 'Invalid payload' }); return }

    logger.debug('Gupshup webhook received', { apikey, type: payload?.type })

    const channel = await channelService.getChannelByApiKey(apikey)
    if (!channel) {
      logger.warn('Webhook received for unknown apikey', { apikey })
      res.status(200).json({ success: true })
      return
    }

    // Validate webhook authenticity
    const adapter = channelRouter.resolve(channel.type)
    const credentials = decryptCredentials(channel.credentials)
    if (!adapter.validateWebhook(req.body, req.headers as Record<string, string>, credentials.apiKey || '')) {
      logger.warn('Invalid Gupshup webhook signature', { channelId: channel.id })
      res.status(401).json({ error: 'Invalid webhook' })
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
    res.status(500).json({ success: false, error: 'Internal processing error' })
  }
})

// ─── Evolution: QR Code / connection status (protected) ──────────────────────
router.get('/channels/:id/evolution/qrcode', requireAuth, async (req, res, next) => {
  try {
    const channel = await channelService.getChannel(req.params.id, req.auth.tid)
    if (channel.type !== 'evolution') {
      res.status(400).json({ success: false, error: { message: 'Not an Evolution channel' } })
      return
    }
    const creds = channel.credentials
    const baseUrl = (creds.baseUrl || '').replace(/\/+$/, '')
    const response = await fetch(`${baseUrl}/instance/connect/${creds.instanceName}`, {
      headers: { apikey: creds.apiKey! },
    })
    const data = await response.json()
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

router.get('/channels/:id/evolution/status', requireAuth, async (req, res, next) => {
  try {
    const channel = await channelService.getChannel(req.params.id, req.auth.tid)
    if (channel.type !== 'evolution') {
      res.status(400).json({ success: false, error: { message: 'Not an Evolution channel' } })
      return
    }
    const creds = channel.credentials
    const baseUrl = (creds.baseUrl || '').replace(/\/+$/, '')
    const response = await fetch(`${baseUrl}/instance/fetchInstances`, {
      headers: { apikey: creds.apiKey! },
    })
    const data = await response.json() as any[]
    const instance = Array.isArray(data) ? data.find((i: any) => i.instance?.instanceName === creds.instanceName) : null
    res.json({ success: true, data: instance || null })
  } catch (err) { next(err) }
})

// ─── Evolution Webhook (public) ───────────────────────────────────────────────
router.post('/webhook/evolution/:instanceName', rateLimit({ max: 120 }), async (req, res, next) => {
  try {
    const { instanceName } = req.params
    const payload = req.body
    if (!payload || typeof payload !== 'object') { res.status(400).json({ error: 'Invalid payload' }); return }

    logger.debug('Evolution webhook received', { instanceName, event: payload?.event })

    const channel = await channelService.getChannelByInstanceName(instanceName)
    if (!channel) {
      logger.warn('Evolution webhook for unknown instance', { instanceName })
      res.status(200).json({ success: true })
      return
    }

    // Validate webhook authenticity
    const evoAdapter = channelRouter.resolve(channel.type)
    const evoCreds = decryptCredentials(channel.credentials)
    if (!evoAdapter.validateWebhook(req.body, req.headers as Record<string, string>, evoCreds.apiKey || '')) {
      logger.warn('Invalid Evolution webhook signature', { channelId: channel.id })
      res.status(401).json({ error: 'Invalid webhook' })
      return
    }

    const event = payload?.event

    if (event === 'messages.upsert') {
      const normalized = await channelService.parseInbound('evolution', payload)
      if (normalized) {
        normalized.channelId = channel.id

        // Download media via Evolution API if mediaUrl is a WhatsApp internal URL
        if (normalized.mediaUrl && normalized.mediaUrl.includes('mmg.whatsapp.net')) {
          try {
            const baseUrl = (evoCreds.baseUrl || '').replace(/\/+$/, '')
            const instanceName = evoCreds.instanceName
            const apiKey = evoCreds.apiKey
            const messageId = normalized.externalId
            logger.info('Evolution media download attempt', { baseUrl: !!baseUrl, instanceName, hasApiKey: !!apiKey, messageId })
            if (baseUrl && instanceName && apiKey && messageId) {
              const res = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: apiKey },
                body: JSON.stringify({ message: { key: { id: messageId } } }),
              })
              if (res.ok) {
                const data = await res.json() as any
                const base64 = data?.base64 || data?.data?.base64 || data?.message?.base64
                const mimetype = data?.mimetype || data?.data?.mimetype || data?.message?.mimetype || normalized.mediaMimeType || 'image/jpeg'
                if (base64) {
                  // Upload to Supabase Storage
                  try {
                    const { createClient } = await import('@supabase/supabase-js')
                    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
                    const ext = mimetype.split('/')[1]?.split(';')[0] || 'bin'
                    const fileName = `evolution/${channel.tenantId}/${Date.now()}_${messageId}.${ext}`
                    const buffer = Buffer.from(base64, 'base64')
                    const { error: uploadError } = await supabase.storage.from('media').upload(fileName, buffer, { contentType: mimetype, upsert: true })
                    if (!uploadError) {
                      const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName)
                      normalized.mediaUrl = urlData.publicUrl
                      logger.info('Evolution media uploaded to storage', { fileName, size: buffer.length })
                    } else {
                      logger.warn('Failed to upload to storage', { error: uploadError.message })
                    }
                  } catch (storageErr) {
                    logger.warn('Storage upload failed, keeping original URL', { err: (storageErr as Error).message })
                  }
                }
              }
            }
          } catch (err) {
            logger.warn('Failed to download Evolution media', { err: (err as Error).message })
          }
        }

        await notifyMessageService('inbound', {
          tenantId: channel.tenantId,
          channelId: channel.id,
          message: normalized,
        })
      }
    } else if (event === 'messages.update') {
      const statusUpdate = await channelService.parseStatusUpdate('evolution', payload)
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
    logger.error('Evolution webhook processing error', { err })
    res.status(500).json({ success: false, error: 'Internal processing error' })
  }
})

// ─── Meta Webhook (Instagram + Messenger) ────────────────────────────────────

// GET /webhook/meta — verification handshake from Meta
router.get('/webhook/meta', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token) {
    const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN
    if (token === expectedToken) {
      res.status(200).send(challenge)
      return
    }
  }
  res.status(403).send('Forbidden')
})

// POST /webhook/meta — inbound from Instagram DM and Messenger
router.post('/webhook/meta', rateLimit({ max: 120 }), async (req, res, next) => {
  try {
    const payload = req.body
    const objectType = payload?.object // 'instagram' or 'page'

    if (!objectType) { res.json({ success: true }); return }

    // Determine channel type
    const isInstagram = objectType === 'instagram'
    const channelType = isInstagram ? 'instagram' : 'messenger'

    // Extract page ID from entry
    const pageId = payload?.entry?.[0]?.id
    if (!pageId) { res.json({ success: true }); return }

    // Find channel by page ID
    const channel = await channelService.getChannelByPageId(pageId, channelType as any)
    if (!channel) {
      logger.warn('Meta webhook for unknown page', { pageId, objectType })
      res.json({ success: true })
      return
    }

    // Validate webhook signature
    const adapter = channelRouter.resolve(channel.type)
    const credentials = decryptCredentials(channel.credentials)
    if (!adapter.validateWebhook(req.body, req.headers as Record<string, string>, credentials.appSecret || '')) {
      logger.warn('Invalid Meta webhook signature', { channelId: channel.id })
      res.status(401).json({ error: 'Invalid webhook' })
      return
    }

    // Process messaging events
    const messaging = payload?.entry?.[0]?.messaging || []
    for (const event of messaging) {
      if (event.message) {
        const normalized = adapter.parseInbound(payload)
        if (normalized) {
          normalized.channelId = channel.id
          await notifyMessageService('inbound', {
            tenantId: channel.tenantId,
            channelId: channel.id,
            message: normalized,
          })
        }
      } else if (event.delivery || event.read) {
        const statusUpdate = adapter.parseStatusUpdate(payload)
        if (statusUpdate) {
          await notifyMessageService('status_update', {
            tenantId: channel.tenantId,
            channelId: channel.id,
            ...statusUpdate,
          })
        }
      }
    }

    res.json({ success: true })
  } catch (err) { next(err) }
})

// ─── Helper: notify message-service ──────────────────────────────────────────
async function notifyMessageService(event: string, data: unknown): Promise<void> {
  const messageServiceUrl = process.env.MESSAGE_SERVICE_URL || 'http://localhost:3004'
  try {
    const response = await fetch(`${messageServiceUrl}/internal/${event}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET!,
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
    const secret = req.headers['x-internal-secret'] as string
    const internalSecret = process.env.INTERNAL_SECRET || ''
    const secretValid = secret && internalSecret && secret.length === internalSecret.length
      && require('crypto').timingSafeEqual(Buffer.from(secret), Buffer.from(internalSecret))
    if (!secretValid) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized' } })
      return
    }
    const { messageUuid, channelId, tenantId, to, contentType, body, mediaUrl, filename, interactiveType, buttons, listRows, listButtonText, footer } = req.body
    logger.debug('[internal/send]', { contentType, interactiveType, hasButtons: !!buttons?.length, hasListRows: !!listRows?.length })
    const result = await channelService.sendMessage(channelId, tenantId, {
      to, contentType, body, mediaUrl, filename, messageUuid, interactiveType, buttons, listRows, listButtonText, header: undefined, footer,
    })
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
})

export default router