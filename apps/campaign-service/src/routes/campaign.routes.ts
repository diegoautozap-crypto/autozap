import { Router } from 'express'
import { z } from 'zod'
import { campaignService } from '../services/campaign.service'
import { campaignQueue } from '../workers/campaign.worker'
import { requireAuth, requireRole, validate } from '../middleware/campaign.middleware'
import { ok, paginationSchema } from '@autozap/utils'

const router = Router()
router.use(requireAuth)

const createCampaignSchema = z.object({
  channelId: z.string().uuid(),
  name: z.string().min(2).max(255),
  messageTemplate: z.string().optional().default(' '),
  curlTemplate: z.string().optional(),
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

router.get('/campaigns', async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query)
    const result = await campaignService.listCampaigns(req.auth.tid, page, limit)
    res.json(ok(result.campaigns, result.meta))
  } catch (err) { next(err) }
})

router.post('/campaigns', requireRole('admin', 'owner'), validate(createCampaignSchema), async (req, res, next) => {
  try {
    const campaign = await campaignService.createCampaign({
      tenantId: req.auth.tid,
      createdBy: req.auth.sub,
      ...req.body,
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
 