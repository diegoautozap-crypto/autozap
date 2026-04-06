import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { encryptCredentials, decryptCredentials } from '../lib/crypto'
import { channelRouter } from '../adapters/ChannelRouter'
import { AppError, NotFoundError, generateId } from '@autozap/utils'
import { PLAN_LIMITS } from '@autozap/types'
import type { ChannelType, SendMessageInput, SendMessageResult, NormalizedMessage } from '../adapters/IChannelAdapter'
import type { PlanSlug } from '@autozap/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateChannelInput {
  tenantId: string
  name: string
  type: ChannelType
  phoneNumber?: string
  credentials: Record<string, string>
  settings?: Record<string, unknown>
}

export interface Channel {
  id: string
  tenantId: string
  name: string
  type: ChannelType
  status: string
  phoneNumber?: string
  credentials: Record<string, string>
  settings: Record<string, unknown>
  warmupEnabled: boolean
  warmupDay: number
  warmupLimit: number
  messagesToday: number
  createdAt: Date
}

// ─── ChannelService ───────────────────────────────────────────────────────────

export class ChannelService {

  // ── Create channel ───────────────────────────────────────────────────────

  async createChannel(input: CreateChannelInput): Promise<Channel> {
    const { tenantId, name, type, phoneNumber, credentials, settings } = input

    // Validate adapter exists
    channelRouter.resolve(type)

    // Check channel limit for plan
    const { data: tenant } = await db
      .from('tenants')
      .select('plan_slug')
      .eq('id', tenantId)
      .single()

    if (tenant) {
      const limit = PLAN_LIMITS[tenant.plan_slug as PlanSlug]?.channels ?? 0
      const { count } = await db
        .from('channels')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'active')

      if ((count || 0) >= limit) {
        throw new AppError(
          'PLAN_LIMIT',
          `Seu plano permite no máximo ${limit} canal${limit > 1 ? 'is' : ''}. Faça upgrade para adicionar mais.`,
          403,
        )
      }
    }

    const { data, error } = await db
      .from('channels')
      .insert({
        id: generateId(),
        tenant_id: tenantId,
        name,
        type,
        phone_number: phoneNumber,
        credentials: encryptCredentials(credentials),
        settings: settings || {},
        status: 'active',
      })
      .select()
      .single()

    if (error) throw new AppError('DB_ERROR', error.message, 500)

    logger.info('Channel created', { tenantId, channelId: data.id, type })
    return this.mapRow(data)
  }

  // ── List channels ────────────────────────────────────────────────────────

  async listChannels(tenantId: string): Promise<Channel[]> {
    const { data, error } = await db
      .from('channels')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (error) throw new AppError('DB_ERROR', error.message, 500)
    return (data || []).map(this.mapRow)
  }

  // ── Get channel ──────────────────────────────────────────────────────────

  async getChannel(channelId: string, tenantId: string): Promise<Channel> {
    const { data, error } = await db
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .eq('tenant_id', tenantId)
      .single()

    if (error || !data) throw new NotFoundError('Channel')
    return this.mapRow(data)
  }

  // ── Send message via channel ─────────────────────────────────────────────

  async sendMessage(
    channelId: string,
    tenantId: string,
    input: SendMessageInput,
  ): Promise<SendMessageResult> {
    const channel = await this.getChannel(channelId, tenantId)

    if (channel.status !== 'active') {
      throw new AppError('CHANNEL_INACTIVE', 'Channel is not active', 400)
    }

    // Check daily limit
    await this.checkDailyLimit(channel)

    const adapter = channelRouter.resolve(channel.type)
    const result = await adapter.send(input, channel.credentials)

    // Increment daily counter (non-blocking)
    this.incrementDailyCounter(channelId).catch(() => {})

    logger.info('Message sent via channel', {
      channelId,
      tenantId,
      to: input.to,
      status: result.status,
      externalId: result.externalId,
    })

    return result
  }

  // ── Parse inbound webhook ────────────────────────────────────────────────

  async parseInbound(channelType: ChannelType, rawPayload: unknown): Promise<NormalizedMessage | null> {
    const adapter = channelRouter.resolve(channelType)
    return adapter.parseInbound(rawPayload)
  }

  async parseStatusUpdate(channelType: ChannelType, rawPayload: unknown) {
    const adapter = channelRouter.resolve(channelType)
    return adapter.parseStatusUpdate(rawPayload)
  }

  // ── Get channel by apikey (for Gupshup webhook routing) ──────────────────

  async getChannelByApiKey(apiKey: string): Promise<Channel | null> {
    // Busca todos os canais ativos e compara após decriptar
    // Necessário porque credentials estão criptografadas no banco
    const { data } = await db
      .from('channels')
      .select('*')
      .eq('type', 'gupshup')
      .eq('status', 'active')

    if (!data) return null

    const channel = data.find(row => {
      const creds = this.mapRow(row).credentials
      return creds.apiKey === apiKey
    })

    return channel ? this.mapRow(channel) : null
  }

  // ── Get Evolution channel by instanceName ────────────────────────────────

  async getChannelByInstanceName(instanceName: string): Promise<Channel | null> {
    const { data } = await db
      .from('channels')
      .select('*')
      .eq('type', 'evolution')
      .eq('status', 'active')

    if (!data) return null

    const channel = data.find(row => {
      const creds = this.mapRow(row).credentials
      return creds.instanceName === instanceName
    })

    return channel ? this.mapRow(channel) : null
  }

  // ── Get channel by page ID (for Instagram/Messenger webhook routing) ────

  async getChannelByPageId(pageId: string, type?: ChannelType): Promise<Channel | null> {
    let query = db.from('channels').select('*').eq('status', 'active')
    if (type) query = query.eq('type', type)
    const { data: channels } = await query
    if (!channels) return null
    for (const row of channels) {
      const creds = decryptCredentials(row.credentials)
      if (creds.pageId === pageId) {
        return this.mapRow(row)
      }
    }
    return null
  }

  // ── Delete channel ───────────────────────────────────────────────────────

  async deleteChannel(channelId: string, tenantId: string): Promise<void> {
    const { error } = await db
      .from('channels')
      .update({ status: 'inactive' })
      .eq('id', channelId)
      .eq('tenant_id', tenantId)

    if (error) throw new AppError('DB_ERROR', error.message, 500)
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async checkDailyLimit(channel: Channel): Promise<void> {
    const limit = (channel.settings as any).messagesPerDay || 1000

    const lastReset = (channel as any).lastResetAt
    if (lastReset && new Date(lastReset).toDateString() !== new Date().toDateString()) {
      await db.from('channels').update({
        messages_today: 0,
        last_reset_at: new Date(),
      }).eq('id', channel.id)
      return
    }

    if (channel.messagesToday >= limit) {
      throw new AppError('DAILY_LIMIT_REACHED', `Channel daily limit of ${limit} messages reached`, 429)
    }
  }

  private async incrementDailyCounter(channelId: string): Promise<void> {
    await db.rpc('increment_channel_messages', { p_channel_id: channelId })
  }

  private mapRow(row: any): Channel {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      type: row.type,
      status: row.status,
      phoneNumber: row.phone_number,
      credentials: decryptCredentials(row.credentials),
      settings: row.settings,
      warmupEnabled: row.warmup_enabled,
      warmupDay: row.warmup_day,
      warmupLimit: row.warmup_limit,
      messagesToday: row.messages_today,
      createdAt: new Date(row.created_at),
    }
  }
}

export const channelService = new ChannelService()