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
const META_GRAPH_URL = 'https://graph.facebook.com/v19.0'

export class GupshupAdapter implements IChannelAdapter {
  readonly channelType = 'gupshup' as const

  // ─── Upload áudio para o Meta e retorna media_id ──────────────────────────

  private async uploadAudioToMeta(audioUrl: string, metaToken: string, phoneNumberId: string): Promise<string | null> {
    try {
      // 1. Baixa o arquivo de áudio da URL do Supabase
      const audioResponse = await fetch(audioUrl)
      if (!audioResponse.ok) {
        console.error('[GupshupAdapter] Failed to fetch audio from storage:', audioResponse.status)
        return null
      }

      const audioBuffer = await audioResponse.arrayBuffer()
      const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' })

      // 2. Faz upload para a API do Meta
      const formData = new FormData()
      formData.append('file', audioBlob, 'audio.ogg')
      formData.append('type', 'audio/ogg')
      formData.append('messaging_product', 'whatsapp')

      const uploadResponse = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/media`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${metaToken}`,
        },
        body: formData,
      })

      const uploadData = await uploadResponse.json() as any
      console.log('[GupshupAdapter] Meta media upload response:', JSON.stringify(uploadData))

      if (uploadData?.id) {
        return uploadData.id
      }

      console.error('[GupshupAdapter] Meta upload failed:', JSON.stringify(uploadData))
      return null
    } catch (err: any) {
      console.error('[GupshupAdapter] Error uploading audio to Meta:', err.message)
      return null
    }
  }

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
      // ✅ FIX: Upload para o Meta primeiro para obter media_id
      // O WhatsApp não aceita URLs externas para áudio — exige media_id do próprio Meta
      const metaToken = creds.metaToken
      const phoneNumberId = creds.phoneNumberId || creds.source

      if (metaToken && phoneNumberId && mediaUrl) {
        const mediaId = await this.uploadAudioToMeta(mediaUrl, metaToken, phoneNumberId)
        if (mediaId) {
          console.log('[GupshupAdapter] Using Meta media_id for audio:', mediaId)
          message = { type: 'audio', id: mediaId }
        } else {
          // Fallback: tenta enviar com URL direta
          console.warn('[GupshupAdapter] Meta upload failed, falling back to URL')
          message = { type: 'voice', url: mediaUrl }
        }
      } else {
        // Sem metaToken: fallback com URL
        message = { type: 'voice', url: mediaUrl }
      }
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