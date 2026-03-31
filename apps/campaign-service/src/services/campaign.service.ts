import { v4 as uuidv4 } from 'uuid'
import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { AppError, NotFoundError, generateId, paginationMeta } from '@autozap/utils'
import { sendCampaignCompletedEmail } from '../lib/email'
import { getTenantCampaignQueue, ensureTenantWorker } from '../workers/campaign.worker'

export interface CreateCampaignInput {
  tenantId: string
  channelId: string
  extraChannelIds?: string[]
  name: string
  messageTemplate: string
  contentType?: string
  mediaUrl?: string
  scheduledAt?: Date
  batchSize?: number
  messagesPerMin?: number
  curlTemplate?: string
  copies?: string[]
  createdBy: string
  recurrenceType?: 'none' | 'daily' | 'weekly' | 'monthly'
  recurrenceFilter?: SegmentFilter
  parentCampaignId?: string
}

export interface CampaignContact {
  phone: string
  name?: string
  contactId?: string
  variables?: Record<string, string>
}

export interface SegmentFilter {
  tagIds?: string[]
  status?: string
  origin?: string
  lastInteractionAfter?: string
  lastInteractionBefore?: string
  noInteractionDays?: number
  customField?: string
  customValue?: string
}

export class CampaignService {

  async createCampaign(input: CreateCampaignInput) {
    const {
      tenantId, channelId, extraChannelIds, name, messageTemplate,
      contentType, mediaUrl, scheduledAt, batchSize, messagesPerMin,
      curlTemplate, copies, createdBy, recurrenceType, recurrenceFilter, parentCampaignId,
    } = input

    const { data, error } = await db.from('campaigns').insert({
      id: generateId(),
      tenant_id: tenantId,
      channel_id: channelId,
      name,
      message_template: messageTemplate || ' ',
      curl_template: curlTemplate || (copies?.[0] ?? null),
      copies: copies && copies.length > 0 ? copies : null,
      extra_channel_ids: extraChannelIds && extraChannelIds.length > 0 ? extraChannelIds : null,
      content_type: contentType || 'text',
      media_url: mediaUrl,
      scheduled_at: scheduledAt,
      batch_size: batchSize || 500,
      messages_per_min: messagesPerMin || 1200,
      status: scheduledAt ? 'scheduled' : 'draft',
      created_by: createdBy,
      recurrence_type: recurrenceType || 'none',
      recurrence_filter: recurrenceFilter || null,
      parent_campaign_id: parentCampaignId || null,
    }).select().single()

    if (error) throw new AppError('DB_ERROR', error.message, 500)
    logger.info('Campaign created', { tenantId, campaignId: data.id })
    return data
  }

  async addContacts(campaignId: string, tenantId: string, contacts: CampaignContact[]) {
    const rows = contacts.map(c => ({
      id: generateId(),
      campaign_id: campaignId,
      tenant_id: tenantId,
      contact_id: c.contactId || null,
      phone: c.phone,
      name: c.name,
      variables: c.variables || {},
      status: 'pending',
    }))

    const chunkSize = 1000
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize)
      const { error } = await db.from('campaign_contacts').insert(chunk)
      if (error) throw new AppError('DB_ERROR', error.message, 500)
    }

    await db.from('campaigns').update({ total_contacts: rows.length }).eq('id', campaignId)
    logger.info('Contacts added to campaign', { campaignId, count: rows.length })
    return rows.length
  }

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

  async addContactsByTag(campaignId: string, tenantId: string, tagIds: string[]) {
    return this.addContactsByFilter(campaignId, tenantId, { tagIds })
  }

  async queryContactsByFilter(tenantId: string, filter: SegmentFilter): Promise<{ contacts: any[]; total: number }> {
    let query = db.from('contacts').select('id, phone, name, email').eq('tenant_id', tenantId)

    // Filtro por status
    if (filter.status) query = query.eq('status', filter.status)
    else query = query.eq('status', 'active')

    // Filtro por última interação
    if (filter.lastInteractionAfter) query = query.gte('last_interaction_at', filter.lastInteractionAfter)
    if (filter.lastInteractionBefore) query = query.lte('last_interaction_at', filter.lastInteractionBefore)
    if (filter.noInteractionDays) {
      const cutoff = new Date(Date.now() - filter.noInteractionDays * 86400000).toISOString()
      query = query.lte('last_interaction_at', cutoff)
    }

    // Filtro por origem
    if (filter.origin) query = query.eq('origin', filter.origin)

    // Filtro por tags
    if (filter.tagIds && filter.tagIds.length > 0) {
      const { data: tagContacts } = await db.from('contact_tags').select('contact_id').in('tag_id', filter.tagIds)
      if (!tagContacts || tagContacts.length === 0) return { contacts: [], total: 0 }
      const uniqueIds = [...new Set(tagContacts.map(r => r.contact_id))]
      query = query.in('id', uniqueIds)
    }

    // Filtro por campo personalizado (metadata)
    if (filter.customField && filter.customValue !== undefined) {
      query = query.contains('metadata', { [filter.customField]: filter.customValue })
    }

    const { data: contacts } = await query
    if (!contacts) return { contacts: [], total: 0 }

    const valid = contacts.filter(c => c.phone && c.phone.length >= 8 && !c.phone.startsWith('webhook_temp_'))
    return { contacts: valid, total: valid.length }
  }

  async addContactsByFilter(campaignId: string, tenantId: string, filter: SegmentFilter) {
    const { contacts } = await this.queryContactsByFilter(tenantId, filter)
    if (contacts.length === 0) return 0

    const rows: CampaignContact[] = contacts.map(c => ({
      phone: c.phone,
      name: c.name || c.phone,
      contactId: c.id,
      variables: { nome: c.name || c.phone, email: c.email || '', phone: c.phone },
    }))

    return this.addContacts(campaignId, tenantId, rows)
  }

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

    // ✅ Garante que o worker do tenant está ativo antes de enfileirar
    ensureTenantWorker(tenantId)
    const tenantQueue = getTenantCampaignQueue(tenantId)
    await tenantQueue.add(`campaign-${campaignId}`, {
      campaignId,
      tenantId,
      channelId: campaign.channel_id,
      batchSize: campaign.batch_size || 500,
      messagesPerMin: campaign.messages_per_min || 1200,
      // Passa copies e canais extras para o worker rotacionar
      copies: (campaign as any).copies || null,
      extraChannelIds: (campaign as any).extra_channel_ids || [],
    })

    logger.info('Campaign enqueued', {
      campaignId, tenantId,
      queueName: `campaign_queue_tenant_${tenantId}`,
      copies: ((campaign as any).copies || []).length,
      extraChannels: ((campaign as any).extra_channel_ids || []).length,
    })

    return campaign
  }

  async pauseCampaign(campaignId: string, tenantId: string) {
    await db.from('campaigns').update({ status: 'paused' }).eq('id', campaignId).eq('tenant_id', tenantId)
  }

  async deleteCampaign(campaignId: string, tenantId: string) {
    const campaign = await this.getCampaign(campaignId, tenantId)
    if (campaign.status === 'running') {
      throw new AppError('INVALID_STATUS', 'Pause a campanha antes de deletar.', 400)
    }
    await db.from('campaign_contacts').delete().eq('campaign_id', campaignId)
    await db.from('campaign_status_events').delete().eq('campaign_id', campaignId)
    await db.from('messages').update({ campaign_id: null }).eq('campaign_id', campaignId).eq('tenant_id', tenantId)
    const { error } = await db.from('campaigns').delete().eq('id', campaignId).eq('tenant_id', tenantId)
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    logger.info('Campaign deleted', { campaignId, tenantId })
  }

  async getPendingContacts(campaignId: string, batchSize: number) {
    const { data } = await db
      .from('campaign_contacts')
      .select('id, phone, name, variables')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .limit(batchSize)
    return data || []
  }

  async markContactSent(contactId: string, messageUuid: string) {
    await db.from('campaign_contacts').update({
      status: 'sent', message_uuid: messageUuid, sent_at: new Date(),
    }).eq('id', contactId)
  }

  async markContactFailed(contactId: string, errorMessage: string) {
    await db.from('campaign_contacts').update({
      status: 'failed', error_message: errorMessage,
    }).eq('id', contactId)
  }

  async incrementCounter(campaignId: string, field: 'sent_count' | 'delivered_count' | 'read_count' | 'failed_count') {
    await db.rpc('increment_campaign_counter', {
      p_campaign_id: campaignId, p_field: field, p_count: 1,
    })
  }

  async checkCompletion(campaignId: string) {
    const { data: campaign } = await db
      .from('campaigns')
      .select('id, tenant_id, name, total_contacts, sent_count, delivered_count, read_count, failed_count')
      .eq('id', campaignId)
      .single()

    if (!campaign) return

    const processed = (campaign.sent_count || 0) + (campaign.failed_count || 0)
    if (processed >= campaign.total_contacts) {
      await db.from('campaigns').update({ status: 'completed', completed_at: new Date() }).eq('id', campaignId)
      logger.info('Campaign completed', { campaignId })
      this.notifyCampaignCompleted(campaign).catch(err =>
        logger.error('Failed to send campaign completed email', { err })
      )
    }
  }

  private async notifyCampaignCompleted(campaign: any): Promise<void> {
    const { data: owner } = await db
      .from('users')
      .select('name, email')
      .eq('tenant_id', campaign.tenant_id)
      .eq('role', 'owner')
      .eq('is_active', true)
      .maybeSingle()

    if (!owner?.email) return

    await sendCampaignCompletedEmail({
      to: owner.email, name: owner.name, campaignName: campaign.name,
      total: campaign.total_contacts || 0, sent: campaign.sent_count || 0,
      delivered: campaign.delivered_count || 0, read: campaign.read_count || 0,
      failed: campaign.failed_count || 0, campaignId: campaign.id,
    })
  }

  interpolateMessage(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '')
  }

  async getProgress(campaignId: string, tenantId: string) {
    const campaign = await this.getCampaign(campaignId, tenantId)
    const total    = campaign.total_contacts || 0
    const sent     = campaign.sent_count || 0
    const delivered = campaign.delivered_count || 0
    const read     = campaign.read_count || 0
    const failed   = campaign.failed_count || 0
    const pending  = total - sent - failed

    return {
      total, sent, delivered, read, failed, pending,
      percentComplete: total > 0 ? Math.round((sent / total) * 100) : 0,
      status: campaign.status,
    }
  }
}

export const campaignService = new CampaignService()