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

const INSTAGRAM_API_URL = 'https://graph.instagram.com/v21.0'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseTimestamp(ts: any): Date {
  if (!ts) return new Date()
  const n = Number(ts)
  if (isNaN(n)) return new Date()
  return new Date(n > 1e12 ? n : n * 1000)
}

// ─── InstagramAdapter ────────────────────────────────────────────────────────

export class InstagramAdapter implements IChannelAdapter {
  readonly channelType = 'instagram' as const

  // ─── Send ─────────────────────────────────────────────────────────────────

  async send(input: SendMessageInput, creds: ChannelCredentials): Promise<SendMessageResult> {
    const { to, contentType, body, mediaUrl } = input

    let message: Record<string, unknown>

    if (contentType === 'text') {
      message = { text: body || '' }
    } else if (['image', 'video', 'audio', 'document'].includes(contentType)) {
      // Instagram supports image, video, audio, file as attachment types
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

    logger.debug('[InstagramAdapter] sending:', JSON.stringify(payload).slice(0, 500))

    const response = await fetch(`${INSTAGRAM_API_URL}/${creds.pageId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = (await response.json()) as any
    logger.debug('[InstagramAdapter] send response:', JSON.stringify(data).slice(0, 500))

    if (!response.ok || data.error) {
      const errMsg = data.error?.message || `HTTP ${response.status}`
      throw new Error(`Instagram send failed: ${errMsg}`)
    }

    return {
      externalId: data.message_id || data.id || '',
      status: 'sent',
    }
  }

  // ─── Parse Inbound ────────────────────────────────────────────────────────

  parseInbound(rawPayload: unknown): NormalizedMessage | null {
    const payload = rawPayload as any

    if (payload?.object !== 'instagram') return null

    try {
      const entry = payload.entry?.[0]
      const messaging = entry?.messaging?.[0]
      if (!messaging?.message) return null

      const msg = messaging.message
      const contentType = this.resolveContentType(msg)

      // Extract media URL from first attachment if present
      const attachment = msg.attachments?.[0]
      const mediaUrl = attachment?.payload?.url || undefined
      const mediaMimeType = attachment?.type || undefined

      return {
        channelType: 'instagram',
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

    if (payload?.object !== 'instagram') return null

    try {
      const entry = payload.entry?.[0]
      const messaging = entry?.messaging?.[0]
      if (!messaging) return null

      // Delivery receipt
      if (messaging.delivery) {
        const mid = messaging.delivery.mids?.[0]
        if (!mid) return null
        return {
          externalId: mid,
          status: 'delivered',
          timestamp: parseTimestamp(messaging.delivery.watermark || messaging.timestamp),
        }
      }

      // Read receipt
      if (messaging.read) {
        return {
          externalId: '', // Instagram read receipts use watermark, not specific mid
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

export const instagramAdapter = new InstagramAdapter()
