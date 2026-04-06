import crypto from 'node:crypto'
import type {
  IChannelAdapter,
  SendMessageInput,
  SendMessageResult,
  NormalizedMessage,
  MessageStatusUpdate,
  ChannelCredentials,
  ContentType,
} from './IChannelAdapter'
import { logger } from '../lib/logger'

const MESSENGER_API_URL = 'https://graph.facebook.com/v21.0'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseTimestamp(ts: any): Date {
  if (!ts) return new Date()
  const n = Number(ts)
  if (isNaN(n)) return new Date()
  return new Date(n > 1e12 ? n : n * 1000)
}

// ─── MessengerAdapter ────────────────────────────────────────────────────────

export class MessengerAdapter implements IChannelAdapter {
  readonly channelType = 'messenger' as const

  // ─── Send ─────────────────────────────────────────────────────────────────

  async send(input: SendMessageInput, creds: ChannelCredentials): Promise<SendMessageResult> {
    const { to, contentType, body, mediaUrl } = input

    let message: Record<string, unknown>

    if (contentType === 'text') {
      message = { text: body || '' }
    } else if (['image', 'video', 'audio', 'document'].includes(contentType)) {
      const attachmentType = contentType === 'document' ? 'file' : contentType
      message = {
        attachment: {
          type: attachmentType,
          payload: { url: mediaUrl },
        },
      }
    } else {
      message = { text: body || '' }
    }

    const payload = {
      recipient: { id: to },
      message,
    }

    logger.debug('[MessengerAdapter] sending:', JSON.stringify(payload).slice(0, 500))

    const response = await fetch(`${MESSENGER_API_URL}/${creds.pageId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = (await response.json()) as any
    logger.debug('[MessengerAdapter] send response:', JSON.stringify(data).slice(0, 500))

    if (!response.ok || data.error) {
      const errMsg = data.error?.message || `HTTP ${response.status}`
      throw new Error(`Messenger send failed: ${errMsg}`)
    }

    return {
      externalId: data.message_id || data.id || '',
      status: 'sent',
    }
  }

  // ─── Parse Inbound ────────────────────────────────────────────────────────

  parseInbound(rawPayload: unknown): NormalizedMessage | null {
    const payload = rawPayload as any

    if (payload?.object !== 'page') return null

    try {
      const entry = payload.entry?.[0]
      const messaging = entry?.messaging?.[0]
      if (!messaging?.message) return null

      const msg = messaging.message
      const contentType = this.resolveContentType(msg)

      const attachment = msg.attachments?.[0]
      const mediaUrl = attachment?.payload?.url || undefined
      const mediaMimeType = attachment?.type || undefined

      return {
        channelType: 'messenger',
        channelId: '',
        externalId: msg.mid,
        from: messaging.sender?.id || '',
        to: messaging.recipient?.id || '',
        contentType,
        body: msg.text || undefined,
        mediaUrl,
        mediaMimeType,
        timestamp: parseTimestamp(messaging.timestamp),
        raw: rawPayload,
      }
    } catch {
      return null
    }
  }

  // ─── Parse Status Update ──────────────────────────────────────────────────

  parseStatusUpdate(rawPayload: unknown): MessageStatusUpdate | null {
    const payload = rawPayload as any

    if (payload?.object !== 'page') return null

    try {
      const entry = payload.entry?.[0]
      const messaging = entry?.messaging?.[0]
      if (!messaging) return null

      if (messaging.delivery) {
        const mid = messaging.delivery.mids?.[0]
        if (!mid) return null
        return {
          externalId: mid,
          status: 'delivered',
          timestamp: parseTimestamp(messaging.delivery.watermark || messaging.timestamp),
        }
      }

      if (messaging.read) {
        return {
          externalId: '',
          status: 'read',
          timestamp: parseTimestamp(messaging.read.watermark || messaging.timestamp),
        }
      }

      return null
    } catch {
      return null
    }
  }

  // ─── Validate Webhook ─────────────────────────────────────────────────────

  validateWebhook(
    payload: unknown,
    headers: Record<string, string>,
    secret: string,
  ): boolean {
    const signature = headers['x-hub-signature-256']
    if (!signature) return false

    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private resolveContentType(msg: any): ContentType {
    if (msg.attachments?.length > 0) {
      const type = msg.attachments[0].type
      const map: Record<string, ContentType> = {
        image: 'image',
        video: 'video',
        audio: 'audio',
        file: 'document',
      }
      return map[type] || 'text'
    }
    return 'text'
  }
}

export const messengerAdapter = new MessengerAdapter()
