import type {
  IChannelAdapter,
  SendMessageInput,
  SendMessageResult,
  NormalizedMessage,
  MessageStatusUpdate,
  ChannelCredentials,
  MessageStatus,
  ContentType,
} from './IChannelAdapter'
import { logger } from '../lib/logger'

// ─── Evolution API v2 Adapter ────────────────────────────────────────────────

const STATUS_MAP_NUM: Record<number, MessageStatus> = {
  1: 'queued',
  2: 'sent',
  3: 'delivered',
  4: 'read',
  5: 'read', // "played" maps to read
}

const STATUS_MAP_STR: Record<string, MessageStatus> = {
  'PENDING': 'queued',
  'SERVER_ACK': 'sent',
  'DELIVERY_ACK': 'delivered',
  'READ': 'read',
  'PLAYED': 'read',
}

export class EvolutionAdapter implements IChannelAdapter {
  readonly channelType = 'evolution' as const

  // ─── Send ─────────────────────────────────────────────────────────────────

  async send(input: SendMessageInput, creds: ChannelCredentials): Promise<SendMessageResult> {
    const { to, contentType, body, mediaUrl } = input
    const baseUrl = creds.baseUrl!.replace(/\/+$/, '')
    const instanceName = creds.instanceName!
    const apiKey = creds.apiKey!

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: apiKey,
    }

    let url: string
    let payload: Record<string, unknown>

    if (contentType === 'text' || contentType === 'template') {
      url = `${baseUrl}/message/sendText/${instanceName}`
      payload = {
        number: this.normalizePhone(to),
        text: body || '',
      }
    } else if (contentType === 'interactive' && input.interactiveType === 'button' && input.buttons?.length) {
      url = `${baseUrl}/message/sendButtons/${instanceName}`
      payload = {
        number: this.normalizePhone(to),
        title: input.header || '',
        description: body || '',
        footer: input.footer || '',
        buttons: input.buttons.slice(0, 3).map(b => ({ title: 'reply', displayText: b.title.slice(0, 20), id: b.id })),
      }
    } else if (contentType === 'interactive' && input.interactiveType === 'list' && input.listRows?.length) {
      url = `${baseUrl}/message/sendList/${instanceName}`
      payload = {
        number: this.normalizePhone(to),
        title: input.header || '',
        description: body || '',
        buttonText: input.listButtonText || 'Ver opções',
        footerText: input.footer || '',
        values: [{
          title: 'Opções',
          rows: input.listRows.slice(0, 10).map(r => ({ title: r.title.slice(0, 24), description: r.description?.slice(0, 72) || '', rowId: r.id })),
        }],
      }
    } else if (['image', 'video', 'audio', 'document'].includes(contentType)) {
      url = `${baseUrl}/message/sendMedia/${instanceName}`
      payload = {
        number: this.normalizePhone(to),
        mediatype: contentType,
        media: mediaUrl || '',
        caption: body || '',
      }
    } else {
      // fallback to text
      url = `${baseUrl}/message/sendText/${instanceName}`
      payload = {
        number: this.normalizePhone(to),
        text: body || '',
      }
    }

    logger.debug('[EvolutionAdapter] sending', { url, contentType })

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    const data = await response.json() as any
    logger.debug('[EvolutionAdapter] send response:', JSON.stringify(data).slice(0, 500))

    if (!response.ok) {
      const errMsg = data?.message || data?.error || `HTTP ${response.status}`
      throw new Error(`Evolution send failed: ${errMsg}`)
    }

    return {
      externalId: data?.key?.id || data?.messageId || data?.id || '',
      status: 'sent',
    }
  }

  // ─── Parse Inbound ────────────────────────────────────────────────────────

  parseInbound(rawPayload: unknown): NormalizedMessage | null {
    const payload = rawPayload as any

    if (payload?.event !== 'messages.upsert') return null

    const data = payload.data
    if (!data) return null

    // Ignore outgoing messages
    if (data.key?.fromMe) return null

    const remoteJid = data.key?.remoteJid || ''
    const from = this.jidToPhone(remoteJid)
    const messageType = data.messageType as string || ''

    const contentType = this.mapContentType(messageType)

    let body: string | undefined
    let mediaUrl: string | undefined
    let mediaMimeType: string | undefined

    const msg = data.message || {}

    if (messageType === 'conversation') {
      body = msg.conversation
    } else if (messageType === 'extendedTextMessage') {
      body = msg.extendedTextMessage?.text
    } else if (messageType === 'imageMessage') {
      mediaUrl = msg.imageMessage?.url
      body = msg.imageMessage?.caption
      mediaMimeType = msg.imageMessage?.mimetype
    } else if (messageType === 'videoMessage') {
      mediaUrl = msg.videoMessage?.url
      body = msg.videoMessage?.caption
      mediaMimeType = msg.videoMessage?.mimetype
    } else if (messageType === 'audioMessage') {
      mediaUrl = msg.audioMessage?.url
      mediaMimeType = msg.audioMessage?.mimetype
    } else if (messageType === 'documentMessage') {
      mediaUrl = msg.documentMessage?.url
      body = msg.documentMessage?.fileName
      mediaMimeType = msg.documentMessage?.mimetype
    } else if (messageType === 'stickerMessage') {
      mediaUrl = msg.stickerMessage?.url
      mediaMimeType = msg.stickerMessage?.mimetype
    }

    const timestamp = data.messageTimestamp
      ? new Date(
          Number(data.messageTimestamp) > 1e12
            ? Number(data.messageTimestamp)
            : Number(data.messageTimestamp) * 1000,
        )
      : new Date()

    return {
      channelType: 'evolution',
      channelId: '', // filled by the webhook handler
      externalId: data.key?.id || '',
      from,
      senderName: data.pushName || undefined,
      to: payload.instance || '',
      contentType,
      body,
      mediaUrl,
      mediaMimeType,
      timestamp,
      raw: rawPayload,
    }
  }

  // ─── Parse Status Update ──────────────────────────────────────────────────

  parseStatusUpdate(rawPayload: unknown): MessageStatusUpdate | null {
    const payload = rawPayload as any

    if (payload?.event !== 'messages.update') return null

    // Evolution sends an array of updates
    const updates = Array.isArray(payload.data) ? payload.data : [payload.data]
    const update = updates[0]
    if (!update) return null

    const statusCode = update.update?.status ?? update.status
    const status = typeof statusCode === 'number'
      ? STATUS_MAP_NUM[statusCode]
      : STATUS_MAP_STR[statusCode]
    if (!status) return null

    return {
      externalId: update.key?.id || update.keyId || update.messageId || '',
      status,
      timestamp: new Date(),
    }
  }

  // ─── Validate Webhook ─────────────────────────────────────────────────────

  validateWebhook(
    _payload: unknown,
    headers: Record<string, string>,
    secret: string,
  ): boolean {
    // Evolution sends the apikey header for webhook validation
    const apikey = headers['apikey']
    if (apikey) return apikey === secret
    return true
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private normalizePhone(phone: string): string {
    // Remove everything except digits
    return phone.replace(/\D/g, '')
  }

  private jidToPhone(jid: string): string {
    // "5547999990001@s.whatsapp.net" -> "5547999990001"
    return (jid || '').split('@')[0].replace(/\D/g, '')
  }

  private mapContentType(messageType: string): ContentType {
    const map: Record<string, ContentType> = {
      conversation:        'text',
      extendedTextMessage: 'text',
      imageMessage:        'image',
      videoMessage:        'video',
      audioMessage:        'audio',
      documentMessage:     'document',
      stickerMessage:      'sticker',
      locationMessage:     'location',
    }
    return map[messageType] || 'text'
  }
}

export const evolutionAdapter = new EvolutionAdapter()
