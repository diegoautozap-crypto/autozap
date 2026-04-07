// ─── NormalizedMessage ────────────────────────────────────────────────────────

export type ChannelType =
  | 'gupshup'
  | 'meta_cloud'
  | 'twilio'
  | 'evolution'
  | 'zapi'
  | 'instagram'
  | 'messenger'

export type ContentType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'template'
  | 'interactive'

export type MessageStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'blocked'
  | 'invalid_number'

export interface NormalizedMessage {
  channelType: ChannelType
  channelId: string
  externalId?: string
  from: string
  to: string
  contentType: ContentType
  body?: string
  mediaUrl?: string
  mediaMimeType?: string
  timestamp: Date
  raw: unknown
}

export interface InteractiveButton {
  id: string
  title: string
}

export interface InteractiveListRow {
  id: string
  title: string
  description?: string
}

export interface SendMessageInput {
  to: string
  contentType: ContentType
  body?: string
  mediaUrl?: string
  templateName?: string
  templateParams?: string[]
  messageUuid: string
  interactiveType?: 'button' | 'list'
  buttons?: InteractiveButton[]
  listRows?: InteractiveListRow[]
  listButtonText?: string
  header?: string
  footer?: string
}

export interface SendMessageResult {
  externalId: string
  status: MessageStatus
}

export interface MessageStatusUpdate {
  externalId: string
  status: MessageStatus
  timestamp: Date
  errorMessage?: string
}

export interface ChannelCredentials {
  apiKey?: string
  source?: string
  accessToken?: string
  phoneNumberId?: string
  [key: string]: string | undefined
}

// ─── IChannelAdapter ──────────────────────────────────────────────────────────

export interface IChannelAdapter {
  readonly channelType: ChannelType

  send(input: SendMessageInput, credentials: ChannelCredentials): Promise<SendMessageResult>

  parseInbound(rawPayload: unknown): NormalizedMessage | null

  parseStatusUpdate(rawPayload: unknown): MessageStatusUpdate | null

  validateWebhook(payload: unknown, headers: Record<string, string>, secret: string): boolean
}
