import { Router } from 'express'
import { z } from 'zod'
import { campaignService } from '../services/campaign.service'
import { campaignQueue } from '../workers/campaign.worker'
import { requireAuth, requireRole, validate } from '../middleware/campaign.middleware'
import { ok, paginationSchema, AppError } from '@autozap/utils'
import { db } from '../lib/db'
import { decryptCredentials } from '../lib/crypto'
import { logger } from '../lib/logger'

const router = Router()
router.use(requireAuth)

// ─── Helper: busca permissões do usuário ──────────────────────────────────────
async function getUserPermissions(userId: string, tenantId: string) {
  const { data } = await db
    .from('user_permissions')
    .select('allowed_channels, campaign_access')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

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
    let query = db.from('templates').select('*').eq('tenant_id', req.auth.tid).order('created_at', { ascending: false })
    if (channelId) query = query.eq('channel_id', channelId)
    const { data, error } = await query
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.post('/templates', requireRole('admin', 'owner'), validate(createTemplateSchema), async (req, res, next) => {
  try {
    const { channelId, name, templateId, body, variables, category } = req.body
    const { data: channel } = await db.from('channels').select('id').eq('id', channelId).eq('tenant_id', req.auth.tid).single()
    if (!channel) throw new AppError('NOT_FOUND', 'Canal não encontrado', 404)
    const { data, error } = await db.from('templates').insert({ tenant_id: req.auth.tid, channel_id: channelId, name, template_id: templateId, body, variables, category }).select().single()
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
    const { data, error } = await db.from('templates').update(update).eq('id', req.params.id).eq('tenant_id', req.auth.tid).select().single()
    if (error || !data) throw new AppError('NOT_FOUND', 'Template não encontrado', 404)
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/templates/:id', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { error } = await db.from('templates').delete().eq('id', req.params.id).eq('tenant_id', req.auth.tid)
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.json(ok({ message: 'Template deleted' }))
  } catch (err) { next(err) }
})

// ─── Campaigns ────────────────────────────────────────────────────────────────

router.get('/campaigns', async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query)
    const role = req.auth.role

    // Admin e owner veem todas
    if (role === 'admin' || role === 'owner') {
      const result = await campaignService.listCampaigns(req.auth.tid, page, limit)
      return res.json(ok(result.campaigns, result.meta))
    }

    // Verifica acesso a campanhas
    const perms = await getUserPermissions(req.auth.sub, req.auth.tid)
    const campaignAccess = perms?.campaign_access || 'none'

    if (campaignAccess === 'none') {
      return res.json(ok([], { total: 0, page, limit, hasMore: false }))
    }

    // Filtra por canais permitidos
    const allowedChannels = perms?.allowed_channels || []
    const result = await campaignService.listCampaigns(
      req.auth.tid, page, limit,
      allowedChannels.length > 0 ? allowedChannels : undefined,
    )
    res.json(ok(result.campaigns, result.meta))
  } catch (err) { next(err) }
})

router.post('/campaigns', async (req, res, next) => {
  try {
    const role = req.auth.role

    // Verifica permissão de criar campanhas
    if (role !== 'admin' && role !== 'owner') {
      const perms = await getUserPermissions(req.auth.sub, req.auth.tid)
      const campaignAccess = perms?.campaign_access || 'none'
      if (campaignAccess !== 'create' && campaignAccess !== 'manage') {
        throw new AppError('FORBIDDEN', 'Sem permissão para criar campanhas', 403)
      }
      // Verifica se o canal está permitido
      const allowedChannels = perms?.allowed_channels || []
      if (allowedChannels.length > 0 && !allowedChannels.includes(req.body.channelId)) {
        throw new AppError('FORBIDDEN', 'Sem acesso a este canal', 403)
      }
    }

    let { curlTemplate, channelId, templateId, ...rest } = req.body

    const { data: channel } = await db.from('channels').select('credentials').eq('id', channelId).eq('tenant_id', req.auth.tid).single()
    if (!channel) throw new AppError('NOT_FOUND', 'Canal não encontrado', 404)

    const { apiKey, source, srcName } = decryptCredentials(channel.credentials)

    if (templateId && !curlTemplate) {
      const { data: tmpl } = await db.from('templates').select('*').eq('id', templateId).eq('tenant_id', req.auth.tid).single()
      if (!tmpl) throw new AppError('NOT_FOUND', 'Template não encontrado', 404)
      const params = (tmpl.variables || []).map((_: any, i: number) => `{{${i + 1}}}`)
      const templateParam = JSON.stringify({ id: tmpl.template_id, params })
      curlTemplate = `curl -X POST "https://api.gupshup.io/wa/api/v1/template/msg" -H "apikey: ${apiKey}" -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode "channel=whatsapp" --data-urlencode "source=${source}" --data-urlencode "destination={{phone}}" --data-urlencode "src.name=${srcName || source}" --data-urlencode "template=${templateParam}"`
    }

    const replacePlaceholders = (tpl: string) => tpl
      .replace(/\\\s*\n/g, ' ').replace(/\n/g, ' ')
      .replace(/\{\{\s*api[_\s]?key\s*\}\}/gi, apiKey)
      .replace(/\{\{\s*source\s*\}\}/gi, source)
      .replace(/\{\{\s*src[_\s.]?name\s*\}\}/gi, srcName || source)

    if (curlTemplate) curlTemplate = replacePlaceholders(curlTemplate)
    if (rest.copies && Array.isArray(rest.copies)) {
      rest.copies = rest.copies.map((c: string) => replacePlaceholders(c))
    }

    console.log('CURL AFTER REPLACE:', curlTemplate?.slice(0, 300))
    const campaign = await campaignService.createCampaign({ tenantId: req.auth.tid, createdBy: req.auth.sub, channelId, curlTemplate, ...rest })
    res.status(201).json(ok(campaign))
  } catch (err: any) { console.error('CREATE CAMPAIGN ERROR:', err?.message || err); next(err) }
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

// Listar contatos da campanha (para exportação)
router.get('/campaigns/:id/contacts', async (req, res, next) => {
  try {
    const { data, error } = await db.from('campaign_contacts')
      .select('phone, name, status, error_message, sent_at, variables')
      .eq('campaign_id', req.params.id).eq('tenant_id', req.auth.tid)
      .order('sent_at', { ascending: false })
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.post('/campaigns/:id/contacts/import', validate(importContactsSchema), async (req, res, next) => {
  try {
    const count = await campaignService.importContactsFromCSV(req.params.id, req.auth.tid, req.body.rows)
    res.json(ok({ imported: count }))
  } catch (err) { next(err) }
})

// Adicionar contatos por tag
router.post('/campaigns/:id/contacts/by-tag', async (req, res, next) => {
  try {
    const { tagIds } = req.body
    if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
      throw new AppError('VALIDATION', 'tagIds é obrigatório', 400)
    }
    const count = await campaignService.addContactsByTag(req.params.id, req.auth.tid, tagIds)
    res.json(ok({ imported: count }))
  } catch (err) { next(err) }
})

// Preview de contatos por filtro (retorna contagem sem criar campanha)
router.post('/contacts/preview', async (req, res, next) => {
  try {
    const { total } = await campaignService.queryContactsByFilter(req.auth.tid, req.body)
    res.json(ok({ total }))
  } catch (err) { next(err) }
})

// Adicionar contatos por filtro avançado (segmento)
router.post('/campaigns/:id/contacts/by-filter', async (req, res, next) => {
  try {
    const count = await campaignService.addContactsByFilter(req.params.id, req.auth.tid, req.body)
    res.json(ok({ imported: count }))
  } catch (err) { next(err) }
})

router.post('/campaigns/:id/start', async (req, res, next) => {
  try {
    const role = req.auth.role
    if (role !== 'admin' && role !== 'owner') {
      const perms = await getUserPermissions(req.auth.sub, req.auth.tid)
      if (perms?.campaign_access !== 'manage') {
        throw new AppError('FORBIDDEN', 'Sem permissão para disparar campanhas', 403)
      }
    }
    await campaignService.startCampaign(req.params.id, req.auth.tid)
    res.json(ok({ message: 'Campaign started', campaignId: req.params.id }))
  } catch (err: any) { console.error('START CAMPAIGN ERROR:', err?.message || err, err?.stack); next(err) }
})

router.post('/campaigns/:id/pause', async (req, res, next) => {
  try {
    const role = req.auth.role
    if (role !== 'admin' && role !== 'owner') {
      const perms = await getUserPermissions(req.auth.sub, req.auth.tid)
      if (perms?.campaign_access !== 'manage') throw new AppError('FORBIDDEN', 'Sem permissão', 403)
    }
    await campaignService.pauseCampaign(req.params.id, req.auth.tid)
    res.json(ok({ message: 'Campaign paused' }))
  } catch (err) { next(err) }
})

router.delete('/campaigns/:id', async (req, res, next) => {
  try {
    const role = req.auth.role
    if (role !== 'admin' && role !== 'owner') {
      throw new AppError('FORBIDDEN', 'Sem permissão para excluir campanhas', 403)
    }
    await campaignService.deleteCampaign(req.params.id, req.auth.tid)
    res.json(ok({ message: 'Campaign deleted' }))
  } catch (err) { next(err) }
})

export default router
