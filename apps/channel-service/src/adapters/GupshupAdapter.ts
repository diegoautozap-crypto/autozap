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

const GUPSHUP_API_URL = 'https://api.gupshup.io/wa/api/v1'
// Interactive messages: buttons + list via Meta Graph API
const CHANNEL_SERVICE_PUBLIC_URL = 'https://autozapchannel-service-production.up.railway.app'

// ─── Converte timestamp do Gupshup/Meta corretamente ─────────────────────────
// Meta envia em segundos (Unix), mas alguns payloads vêm em ms
function parseGupshupTimestamp(ts: any): Date {
  if (!ts) return new Date()
  const n = Number(ts)
  if (isNaN(n)) return new Date()
  // Se for maior que 1e12 já está em ms, senão está em segundos
  return new Date(n > 1e12 ? n : n * 1000)
}

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
      message = { type: 'image', originalUrl: mediaUrl, previewUrl: mediaUrl, caption: body || '' }
    } else if (contentType === 'audio') {
      const proxyUrl = `${CHANNEL_SERVICE_PUBLIC_URL}/audio-proxy?url=${encodeURIComponent(mediaUrl || '')}`
      logger.debug('[GupshupAdapter] audio proxy URL:', proxyUrl)
      message = { type: 'audio', url: proxyUrl }
    } else if (contentType === 'video') {
      message = { type: 'video', url: mediaUrl, caption: body || '' }
    } else if (contentType === 'document') {
      message = { type: 'file', url: mediaUrl, filename: body || 'document' }
    } else if (contentType === 'interactive' && input.interactiveType === 'button' && input.buttons?.length) {
      // Envia botões via Meta Graph API (requer metaToken/phoneNumberId do Gupshup v3)
      const metaToken = creds.metaToken
      const phoneNumberId = creds.phoneNumberId || creds.source
      if (metaToken && phoneNumberId) {
        const metaBody = {
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: body || '' },
            ...(input.footer ? { footer: { text: input.footer } } : {}),
            action: {
              buttons: input.buttons.slice(0, 3).map(b => ({
                type: 'reply',
                reply: { id: b.id, title: b.title.slice(0, 20) },
              })),
            },
          },
        }
        logger.info('[GupshupAdapter] sending button via Meta Graph API', { phoneNumberId, hasMetaToken: !!metaToken })
        const metaRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${metaToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(metaBody),
        })
        const metaData = await metaRes.json() as any
        logger.info('[GupshupAdapter] Meta button response:', { status: metaRes.status, data: JSON.stringify(metaData).slice(0, 500) })
        if (metaData.messages?.[0]?.id) {
          return { externalId: metaData.messages[0].id, status: 'sent' as MessageStatus }
        }
        logger.warn('[GupshupAdapter] Meta button failed, falling back to text')
      }
      // Fallback: texto numerado
      const btnText = input.buttons.slice(0, 3).map((b, i) => `${i + 1}️⃣ ${b.title}`).join('\n')
      message = { type: 'text', text: `${body || ''}\n\n${btnText}` }
    } else if (contentType === 'interactive' && input.interactiveType === 'list' && input.listRows?.length) {
      const metaToken = creds.metaToken
      const phoneNumberId = creds.phoneNumberId || creds.source
      if (metaToken && phoneNumberId) {
        const metaBody = {
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'list',
            body: { text: body || '' },
            ...(input.footer ? { footer: { text: input.footer } } : {}),
            action: {
              button: input.listButtonText || 'Ver opções',
              sections: [{
                title: 'Opções',
                rows: input.listRows.slice(0, 10).map(r => ({
                  id: r.id,
                  title: r.title.slice(0, 24),
                  ...(r.description ? { description: r.description.slice(0, 72) } : {}),
                })),
              }],
            },
          },
        }
        logger.info('[GupshupAdapter] sending list via Meta Graph API', { phoneNumberId, hasMetaToken: !!metaToken, metaTokenStart: metaToken?.slice(0, 10) })
        const metaRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${metaToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(metaBody),
        })
        const metaData = await metaRes.json() as any
        logger.info('[GupshupAdapter] Meta list response:', { status: metaRes.status, data: JSON.stringify(metaData).slice(0, 500) })
        if (metaData.messages?.[0]?.id) {
          return { externalId: metaData.messages[0].id, status: 'sent' as MessageStatus }
        }
        logger.warn('[GupshupAdapter] Meta list failed, falling back to text', { response: JSON.stringify(metaData).slice(0, 300) })
      }
      // Fallback: texto numerado
      const listText = input.listRows.slice(0, 10).map((r, i) => `${i + 1}️⃣ ${r.title}${r.description ? ` — ${r.description}` : ''}`).join('\n')
      message = { type: 'text', text: `${body || ''}\n\n${listText}` }
    } else {
      message = { type: 'text', text: body || '' }
    }

    const params = new URLSearchParams({
      channel: 'whatsapp',
      source: creds.source!,
      destination: to,
      'src.name': creds.srcName || creds.source!,
      message: JSON.stringify(message),
    })

    logger.debug('[GupshupAdapter] final payload:', JSON.stringify(message))

    const response = await fetch(`${GUPSHUP_API_URL}/msg`, {
      method: 'POST',
      headers: {
        apikey: creds.apiKey!,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const data = await response.json() as any
    logger.debug('[GupshupAdapter] send response:', JSON.stringify(data).slice(0, 500))

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

        // Interactive reply (button or list click)
        const interactiveBody = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || null
        const textBody = msg.text?.body || msg.caption || interactiveBody || undefined

        return {
          channelType: 'gupshup',
          channelId: '',
          externalId: msg.id,
          from: msg.from,
          to: value?.metadata?.display_phone_number || '',
          contentType: interactiveBody ? 'text' as ContentType : contentType,
          body: textBody,
          mediaUrl: msg.image?.id || msg.audio?.id || msg.video?.id || msg.document?.id || undefined,
          mediaMimeType: msg.image?.mime_type || msg.audio?.mime_type || undefined,
          timestamp: parseGupshupTimestamp(msg.timestamp),
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
      timestamp: parseGupshupTimestamp(payload.timestamp),
      raw: rawPayload,
    }
  }

  // ─── Parse Status Update ──────────────────────────────────────────────────

  parseStatusUpdate(rawPayload: unknown): MessageStatusUpdate | null {
    const payload = rawPayload as any

    logger.debug('[GupshupAdapter] parseStatusUpdate payload:', JSON.stringify(payload).slice(0, 300))

    // Meta (v3) format
    if (payload?.object === 'whatsapp_business_account') {
      try {
        const entry = payload.entry?.[0]
        const change = entry?.changes?.[0]
        const value = change?.value
        const statusObj = value?.statuses?.[0]

        if (!statusObj) return null

        const statusMap: Record<string, MessageStatus> = {
          sent:      'sent',
          delivered: 'delivered',
          read:      'read',
          failed:    'failed',
        }

        const status = statusMap[statusObj.status]
        if (!status) return null

        const errorCode    = statusObj.errors?.[0]?.code
        const errorMessage = statusObj.errors?.[0]?.message || undefined

        logger.debug('[GupshupAdapter] status update v3:', statusObj.id, '->', status)

        return {
          externalId:   statusObj.gs_id || statusObj.id,
          status,
          timestamp:    parseGupshupTimestamp(statusObj.timestamp),
          errorMessage,
          errorCode,
          phone: statusObj.recipient_id,
        } as any
      } catch {
        return null
      }
    }

    // Gupshup (v2) format
    if (payload?.type !== 'message-event') return null

    const event = payload.payload
    if (!event) return null

    const statusMap: Record<string, MessageStatus> = {
      sent:      'sent',
      delivered: 'delivered',
      read:      'read',
      failed:    'failed',
    }

    const status = statusMap[event.type]
    if (!status) return null

    return {
      externalId:   event.id || payload.payload?.gsId || '',
      status,
      timestamp:    parseGupshupTimestamp(payload.timestamp),
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

export const gupshupAdapter = new GupshupAdapter()// 
