import { v4 as uuidv4 } from 'uuid'
import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { AppError, NotFoundError, generateId, paginationMeta, randomBetween, sleep } from '@autozap/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateCampaignInput {
  tenantId: string
  channelId: string
  name: string
  messageTemplate: string
  contentType?: string
  mediaUrl?: string
  scheduledAt?: Date
  batchSize?: number
  messagesPerMin?: number
  curlTemplate?: string
  createdBy: string
}

export interface CampaignContact {
  phone: string
  name?: string
  variables?: Record<string, string>
}

// ─── CampaignService ──────────────────────────────────────────────────────────

export class CampaignService {

  // ── Create campaign ──────────────────────────────────────────────────────

  async createCampaign(input: CreateCampaignInput) {
    const { tenantId, channelId, name, messageTemplate, contentType, mediaUrl, scheduledAt, batchSize, messagesPerMin, curlTemplate, createdBy } = input

    const { data, error } = await db.from('campaigns').insert({
      id: generateId(),
      tenant_id: tenantId,
      channel_id: channelId,
      name,
      message_template: messageTemplate || ' ',
      curl_template: curlTemplate,
      content_type: contentType || 'text',
      media_url: mediaUrl,
      scheduled_at: scheduledAt,
      batch_size: batchSize || 500,
      messages_per_min: messagesPerMin || 20,
      status: scheduledAt ? 'scheduled' : 'draft',
      created_by: createdBy,
    }).select().single()

    if (error) throw new AppError('DB_ERROR', error.message, 500)
    logger.info('Campaign created', { tenantId, campaignId: data.id })
    return data
  }

  // ── Add contacts to campaign ─────────────────────────────────────────────

  async addContacts(campaignId: string, tenantId: string, contacts: CampaignContact[]) {
    const rows = contacts.map(c => ({
      id: generateId(),
      campaign_id: campaignId,
      tenant_id: tenantId,
      phone: c.phone,
      name: c.name,
      variables: c.variables || {},
      status: 'pending',
    }))

    // Insert in batches of 1000 to avoid DB limits
    const chunkSize = 1000
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize)
      const { error } = await db.from('campaign_contacts').insert(chunk)
      if (error) throw new AppError('DB_ERROR', error.message, 500)
    }

    // Update total count
    await db.from('campaigns')
      .update({ total_contacts: rows.length })
      .eq('id', campaignId)

    logger.info('Contacts added to campaign', { campaignId, count: rows.length })
    return rows.length
  }

  // ── Import contacts from CSV rows ────────────────────────────────────────

  async importContactsFromCSV(
    campaignId: string,
    tenantId: string,
    csvRows: { phone: string; message?: string; name?: string; [key: string]: string | undefined }[],
  ) {
    const contacts: CampaignContact[] = csvRows.map(row => ({
      phone: row.phone,
      name: row.name || row.phone,
      variables: {
        nome: row.name || row.phone,
        mensagem: row.message || row.name || '',
        copy: row.message || row.name || '',
        empresa: row.empresa || '',
        ...row,
      },
    }))

    return this.addContacts(campaignId, tenantId, contacts)
  }

  // ── Get campaign ─────────────────────────────────────────────────────────

  async getCampaign(campaignId: string, tenantId: string) {
    const { data, error } = await db
      .from('campaigns')
      .select('*, channels(id, name, type)')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .single()

    if (error || !data) throw new NotFoundError('Campaign')
    return data
  }

  // ── List campaigns ───────────────────────────────────────────────────────

  async listCampaigns(tenantId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit

    const { data, count, error } = await db
      .from('campaigns')
      .select('id, name, status, total_contacts, sent_count, delivered_count, read_count, failed_count, created_at, started_at, completed_at, channels(name)', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw new AppError('DB_ERROR', error.message, 500)
    return { campaigns: data || [], meta: paginationMeta(count || 0, page, limit) }
  }

  // ── Start campaign ───────────────────────────────────────────────────────

  async startCampaign(campaignId: string, tenantId: string) {
    const campaign = await this.getCampaign(campaignId, tenantId)

    if (!['draft', 'paused', 'scheduled'].includes(campaign.status)) {
      throw new AppError('INVALID_STATUS', `Campaign cannot be started from status: ${campaign.status}`, 400)
    }

    const { error } = await db.from('campaigns').update({
      status: 'running',
      started_at: new Date(),
    }).eq('id', campaignId)

    if (error) throw new AppError('DB_ERROR', error.message, 500)

    logger.info('Campaign started', { campaignId, tenantId })
    return campaign
  }

  // ── Pause campaign ───────────────────────────────────────────────────────

  async pauseCampaign(campaignId: string, tenantId: string) {
    await db.from('campaigns').update({ status: 'paused' })
      .eq('id', campaignId).eq('tenant_id', tenantId)
  }

  // ── Get pending contacts for processing ──────────────────────────────────

  async getPendingContacts(campaignId: string, batchSize: number) {
    const { data } = await db
      .from('campaign_contacts')
      .select('id, phone, name, variables')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .limit(batchSize)

    return data || []
  }

  // ── Mark contact as sent/failed ───────────────────────────────────────────

  async markContactSent(contactId: string, messageUuid: string) {
    await db.from('campaign_contacts').update({
      status: 'sent',
      message_uuid: messageUuid,
      sent_at: new Date(),
    }).eq('id', contactId)
  }

  async markContactFailed(contactId: string, errorMessage: string) {
    await db.from('campaign_contacts').update({
      status: 'failed',
      error_message: errorMessage,
    }).eq('id', contactId)
  }

  // ── Update campaign counters ──────────────────────────────────────────────

  async incrementCounter(campaignId: string, field: 'sent_count' | 'delivered_count' | 'read_count' | 'failed_count') {
    await db.rpc('increment_campaign_counter', {
      p_campaign_id: campaignId,
      p_field: field,
      p_count: 1,
    })
  }

  // ── Check if campaign is complete ─────────────────────────────────────────

  async checkCompletion(campaignId: string) {
    const { data } = await db
      .from('campaigns')
      .select('total_contacts, sent_count, failed_count')
      .eq('id', campaignId)
      .single()

    if (!data) return

    const processed = (data.sent_count || 0) + (data.failed_count || 0)
    if (processed >= data.total_contacts) {
      await db.from('campaigns').update({
        status: 'completed',
        completed_at: new Date(),
      }).eq('id', campaignId)

      logger.info('Campaign completed', { campaignId })
    }
  }

  // ── Interpolate variables in message template ─────────────────────────────

  interpolateMessage(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '')
  }

  // ── Get campaign progress ─────────────────────────────────────────────────

  async getProgress(campaignId: string, tenantId: string) {
    const campaign = await this.getCampaign(campaignId, tenantId)
    const total = campaign.total_contacts || 0
    const sent = campaign.sent_count || 0
    const delivered = campaign.delivered_count || 0
    const read = campaign.read_count || 0
    const failed = campaign.failed_count || 0
    const pending = total - sent - failed

    return {
      total,
      sent,
      delivered,
      read,
      failed,
      pending,
      percentComplete: total > 0 ? Math.round((sent / total) * 100) : 0,
      status: campaign.status,
    }
  }
}

export const campaignService = new CampaignService()
