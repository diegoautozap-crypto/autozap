export type ChannelType = 'gupshup' | 'meta_cloud' | 'twilio' | 'evolution' | 'zapi' | 'instagram'
export type ContentType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'template'
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'blocked' | 'invalid_number'

export interface NormalizedMessage {
  channelType: ChannelType
  channelId: string
  externalId?: string
  from: string
  senderName?: string
  fromMe?: boolean
  to: string
  contentType: ContentType
  body?: string
  mediaUrl?: string
  mediaMimeType?: string
  timestamp: Date
  raw: unknown
}

export interface MessageStatusUpdate {
  externalId: string
  status: MessageStatus
  timestamp: Date
  errorMessage?: string
}

// BullMQ job payloads
export interface SendMessageJob {
  messageUuid: string
  tenantId: string
  channelId: string
  to: string
  contentType: ContentType
  body?: string
  mediaUrl?: string
  retryCount: number
  campaignId?: string
  interactiveType?: 'button' | 'list'
  buttons?: { id: string; title: string }[]
  listRows?: { id: string; title: string; description?: string }[]
  listButtonText?: string
  footer?: string
  filename?: string
  caption?: string
}
