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

const GUPSHUP_API_URL = 'https://api.gupshup.io/wa/api/v1'

export class GupshupAdapter implements IChannelAdapter {
  readonly channelType = 'gupshup' as const

  // ─── Send ──────────────────────────────────────────────────────────────────

  async send(input: SendMessageInput, creds: ChannelCredentials): Promise<SendMessageResult> {
    const { to, contentType, body, mediaUrl, templateName, templateParams } = input

    let message: Record<string, unknown>

    if (contentType === 'template' && templateName) {
      message = {
        type: 'template',
        template: {
          id: templateName,
          params: templateParams || [],
        },
      }
    } else if (contentType === 'text') {
      message = { type: 'text', text: body }
    } else if (contentType === 'image') {
      message = { type: 'image', originalUrl: mediaUrl, caption: body || '' }
    } else if (contentType === 'audio') {
      message = { type: 'audio', url: mediaUrl }
    } else if (contentType === 'video') {
      message = { type: 'video', url: mediaUrl, caption: body || '' }
    } else if (contentType === 'document') {
      message = { type: 'file', url: mediaUrl, filename: body || 'document' }
    } else {
      message = { type: 'text', text: body || '' }
    }

    const params = new URLSearchParams({
      channel: 'whatsapp',
      source: creds.source!,
      destination: to,
      'src.name': creds.source!,
      message: JSON.stringify(message),
    })

    const response = await fetch(`${GUPSHUP_API_URL}/msg`, {
      method: 'POST',
      headers: {
        apikey: creds.apiKey!,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const data = await response.json() as any

    if (!response.ok || data.status === 'error') {
      const errMsg = data.message || `HTTP ${response.status}`

      // Map Gupshup error codes to our status
      if (errMsg.includes('invalid') || errMsg.includes('not a valid')) {
        return { externalId: '', status: 'invalid_number' }
      }
      if (errMsg.includes('blocked') || errMsg.includes('opted out')) {
        return { externalId: '', status: 'blocked' }
      }

      throw new Error(`Gupshup send failed: ${errMsg}`)
    }

    return {
      externalId: data.messageId || data.id || '',
      status: 'sent',
    }
  }

  // ─── Parse Inbound ────────────────────────────────────────────────────────

  parseInbound(rawPayload: unknown): NormalizedMessage | null {
    const payload = rawPayload as any

    // Gupshup wraps in { app, timestamp, version, type, payload }
    if (payload?.type !== 'message') return null

    const msg = payload.payload
    if (!msg) return null

    const contentType = this.mapContentType(msg.type)

    return {
      channelType: 'gupshup',
      channelId: '',   // filled by ChannelRouter
      externalId: msg.id,
      from: msg.sender?.phone || payload.sender?.phone || '',
      to: payload.app || '',
      contentType,
      body: msg.payload?.text || msg.payload?.caption || undefined,
      mediaUrl: msg.payload?.url || undefined,
      mediaMimeType: msg.payload?.contentType || undefined,
      timestamp: new Date(payload.timestamp || Date.now()),
      raw: rawPayload,
    }
  }

  // ─── Parse Status Update ──────────────────────────────────────────────────

  parseStatusUpdate(rawPayload: unknown): MessageStatusUpdate | null {
    const payload = rawPayload as any

    if (payload?.type !== 'message-event') return null

    const event = payload.payload
    if (!event) return null

    const statusMap: Record<string, MessageStatus> = {
      'sent':      'sent',
      'delivered': 'delivered',
      'read':      'read',
      'failed':    'failed',
    }

    const status = statusMap[event.type]
    if (!status) return null

    return {
      externalId: event.id || payload.payload?.gsId || '',
      status,
      timestamp: new Date(payload.timestamp || Date.now()),
      errorMessage: event.type === 'failed' ? event.payload?.reason : undefined,
    }
  }

  // ─── Validate Webhook ─────────────────────────────────────────────────────

  validateWebhook(
    _payload: unknown,
    headers: Record<string, string>,
    secret: string,
  ): boolean {
    // Gupshup uses apikey in URL path — we validate by checking
    // the apikey in the route matches the channel's credential
    const apikey = headers['apikey'] || headers['x-gupshup-apikey']
    if (apikey) return apikey === secret
    return true // If no header, trust URL-based validation done in router
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private mapContentType(type: string): ContentType {
    const map: Record<string, ContentType> = {
      text:     'text',
      image:    'image',
      audio:    'audio',
      voice:    'audio',
      video:    'video',
      document: 'document',
      file:     'document',
      sticker:  'sticker',
      location: 'location',
    }
    return map[type] || 'text'
  }
}

export const gupshupAdapter = new GupshupAdapter()
