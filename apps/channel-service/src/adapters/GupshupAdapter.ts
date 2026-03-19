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

// URL pública do channel-service no Railway — o WhatsApp aceita essa URL para áudio
const CHANNEL_SERVICE_PUBLIC_URL = 'https://autozapchannel-service-production.up.railway.app'

export class GupshupAdapter implements IChannelAdapter {
  readonly channelType = 'gupshup' as const

  // ─── Send ─────────────────────────────────────────────────────────────────

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
      // ✅ FIX: O WhatsApp não aceita URLs do Supabase para áudio.
      // Passamos a URL pelo proxy do Railway que serve com Content-Type audio/mpeg
      // que o WhatsApp aceita normalmente.
      const proxyUrl = `${CHANNEL_SERVICE_PUBLIC_URL}/audio-proxy?url=${encodeURIComponent(mediaUrl || '')}`
      console.log('[GupshupAdapter] audio proxy URL:', proxyUrl)
      message = { type: 'audio', url: proxyUrl }
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

    console.log('[GupshupAdapter] final payload:', JSON.stringify(message))

    const response = await fetch(`${GUPSHUP_API_URL}/msg`, {
      method: 'POST',
      headers: {
        apikey: creds.apiKey!,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const data = await response.json() as any
    console.log('[GupshupAdapter] send response:', JSON.stringify(data).slice(0, 500))

    if (!response.ok || data.status === 'error') {
      const errMsg = data.message || `HTTP ${response.status}`

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

    // Meta (v3) format
    if (payload?.object === 'whatsapp_business_account') {
      try {
        const entry = payload.entry?.[0]
        const change = entry?.changes?.[0]
        const value = change?.value
        const msg = value?.messages?.[0]

        if (!msg) return null

        const contentType = this.mapContentType(msg.type)

        return {
          channelType: 'gupshup',
          channelId: '',
          externalId: msg.id,
          from: msg.from,
          to: value?.metadata?.display_phone_number || '',
          contentType,
          body: msg.text?.body || msg.caption || undefined,
          mediaUrl: msg.image?.id || msg.audio?.id || msg.video?.id || msg.document?.id || undefined,
          mediaMimeType: msg.image?.mime_type || msg.audio?.mime_type || undefined,
          timestamp: new Date(Number(msg.timestamp) * 1000),
          raw: rawPayload,
        }
      } catch {
        return null
      }
    }

    // Gupshup (v2) format
    if (payload?.type !== 'message') return null

    const msg = payload.payload
    if (!msg) return null

    const contentType = this.mapContentType(msg.type)

    return {
      channelType: 'gupshup',
      channelId: '',
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
    const apikey = headers['apikey'] || headers['x-gupshup-apikey']
    if (apikey) return apikey === secret
    return true
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