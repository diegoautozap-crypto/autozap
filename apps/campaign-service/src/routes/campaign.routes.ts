import { Router } from 'express'
import { z } from 'zod'
import { campaignService } from '../services/campaign.service'
import { campaignQueue } from '../workers/campaign.worker'
import { requireAuth, requireRole, validate } from '../middleware/campaign.middleware'
import { ok, paginationSchema, AppError } from '@autozap/utils'
import { db } from '../lib/db'
import { decryptCredentials } from '../lib/crypto'

const router = Router()
router.use(requireAuth)

const createCampaignSchema = z.object({
  channelId: z.string().uuid(),
  name: z.string().min(2).max(255),
  messageTemplate: z.string().optional().default(' '),
  curlTemplate: z.string().optional(),
  templateId: z.string().uuid().optional(),
  contentType: z.enum(['text', 'image', 'video', 'document', 'audio']).optional(),
  mediaUrl: z.string().url().optional(),
  scheduledAt: z.string().datetime().optional(),
  batchSize: z.number().int().min(1).max(1000).optional(),
  messagesPerMin: z.number().int().min(1).max(300).optional(),
})

const importContactsSchema = z.object({
  rows: z.array(z.object({
    phone: z.string().min(8),
    name: z.string().optional(),
    empresa: z.string().optional(),
  })).min(1),
})

const createTemplateSchema = z.object({
  channelId: z.string().uuid(),
  name: z.string().min(2).max(255),
  templateId: z.string().min(1),
  body: z.string().min(1),
  variables: z.array(z.string()).optional().default([]),
  category: z.enum(['marketing', 'utility', 'authentication']).optional().default('marketing'),
})

// ─── Templates CRUD ───────────────────────────────────────────────────────────

router.get('/templates', async (req, res, next) => {
  try {
    const channelId = req.query.channelId as string | undefined
    let query = db
      .from('templates')
      .select('*')
      .eq('tenant_id', req.auth.tid)
      .order('created_at', { ascending: false })
    if (channelId) query = query.eq('channel_id', channelId)
    const { data, error } = await query
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.post('/templates', requireRole('admin', 'owner'), validate(createTemplateSchema), async (req, res, next) => {
  try {
    const { channelId, name, templateId, body, variables, category } = req.body
    const { data: channel } = await db
      .from('channels')
      .select('id')
      .eq('id', channelId)
      .eq('tenant_id', req.auth.tid)
      .single()
    if (!channel) throw new AppError('NOT_FOUND', 'Canal não encontrado', 404)
    const { data, error } = await db
      .from('templates')
      .insert({ tenant_id: req.auth.tid, channel_id: channelId, name, template_id: templateId, body, variables, category })
      .select()
      .single()
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/templates/:id', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { name, templateId, body, variables, category } = req.body
    const update: any = {}
    if (name) update.name = name
    if (templateId) update.template_id = templateId
    if (body) update.body = body
    if (variables !== undefined) update.variables = variables
    if (category) update.category = category
    const { data, error } = await db
      .from('templates')
      .update(update)
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select()
      .single()
    if (error || !data) throw new AppError('NOT_FOUND', 'Template não encontrado', 404)
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/templates/:id', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { error } = await db
      .from('templates')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.json(ok({ message: 'Template deleted' }))
  } catch (err) { next(err) }
})

// ─── Campaigns ────────────────────────────────────────────────────────────────

router.get('/campaigns', async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query)
    const result = await campaignService.listCampaigns(req.auth.tid, page, limit)
    res.json(ok(result.campaigns, result.meta))
  } catch (err) { next(err) }
})

router.post('/campaigns', requireRole('admin', 'owner'), validate(createCampaignSchema), async (req, res, next) => {
  try {
    let { curlTemplate, channelId, templateId, ...rest } = req.body

    const { data: channel } = await db
      .from('channels')
      .select('credentials')
      .eq('id', channelId)
      .eq('tenant_id', req.auth.tid)
      .single()

    if (!channel) throw new AppError('NOT_FOUND', 'Canal não encontrado', 404)

    // Decripta credenciais antes de usar
    const { apiKey, source, srcName } = decryptCredentials(channel.credentials)

    // Se veio templateId, busca template e monta cURL automaticamente
    if (templateId && !curlTemplate) {
      const { data: tmpl } = await db
        .from('templates')
        .select('*')
        .eq('id', templateId)
        .eq('tenant_id', req.auth.tid)
        .single()

      if (!tmpl) throw new AppError('NOT_FOUND', 'Template não encontrado', 404)

      const params = (tmpl.variables || []).map((_: any, i: number) => `{{${i + 1}}}`)
      const templateParam = JSON.stringify({ id: tmpl.template_id, params })

      curlTemplate = `curl -X POST "https://api.gupshup.io/wa/api/v1/template/msg" -H "apikey: ${apiKey}" -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode "channel=whatsapp" --data-urlencode "source=${source}" --data-urlencode "destination={{phone}}" --data-urlencode "src.name=${srcName || source}" --data-urlencode "template=${templateParam}"`
    }

    // Substitui placeholders se veio cURL manual
    if (curlTemplate) {
      curlTemplate = curlTemplate
        .replace(/\{\{api_key\}\}/gi, apiKey)
        .replace(/\{\{apikey\}\}/gi, apiKey)
        .replace(/\{\{source\}\}/gi, source)
        .replace(/\{\{src_name\}\}/gi, srcName || '')
        .replace(/\{\{srcname\}\}/gi, srcName || '')
    }

    const campaign = await campaignService.createCampaign({
      tenantId: req.auth.tid,
      createdBy: req.auth.sub,
      channelId,
      curlTemplate,
      ...rest,
    })

    res.status(201).json(ok(campaign))
  } catch (err) { next(err) }
})

router.get('/campaigns/:id', async (req, res, next) => {
  try {
    const campaign = await campaignService.getCampaign(req.params.id, req.auth.tid)
    res.json(ok(campaign))
  } catch (err) { next(err) }
})

router.get('/campaigns/:id/progress', async (req, res, next) => {
  try {
    const progress = await campaignService.getProgress(req.params.id, req.auth.tid)
    res.json(ok(progress))
  } catch (err) { next(err) }
})

router.post('/campaigns/:id/contacts/import', validate(importContactsSchema), async (req, res, next) => {
  try {
    const count = await campaignService.importContactsFromCSV(
      req.params.id,
      req.auth.tid,
      req.body.rows,
    )
    res.json(ok({ imported: count }))
  } catch (err) { next(err) }
})

router.post('/campaigns/:id/start', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const campaign = await campaignService.startCampaign(req.params.id, req.auth.tid)
    await campaignQueue.add('run', {
      campaignId: campaign.id,
      tenantId: req.auth.tid,
      channelId: campaign.channel_id,
      batchSize: campaign.batch_size,
      messagesPerMin: campaign.messages_per_min,
    })
    res.json(ok({ message: 'Campaign started', campaignId: campaign.id }))
  } catch (err) { next(err) }
})

router.post('/campaigns/:id/pause', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    await campaignService.pauseCampaign(req.params.id, req.auth.tid)
    res.json(ok({ message: 'Campaign paused' }))
  } catch (err) { next(err) }
})

router.delete('/campaigns/:id', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    await campaignService.deleteCampaign(req.params.id, req.auth.tid)
    res.json(ok({ message: 'Campaign deleted' }))
  } catch (err) { next(err) }
})

export default router