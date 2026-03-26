import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, validate } from '../middleware/campaign.middleware'
import { ok, AppError } from '@autozap/utils'
import { db } from '../lib/db'

const router = Router()
router.use(requireAuth)

const followUpSchema = z.object({
  name: z.string().min(1).max(255).optional().default('Follow-up padrão'),
  is_active: z.boolean().optional().default(true),
  delay_hours: z.number().min(1).max(168), // 1h a 7 dias
  message: z.string().min(1),
  max_attempts: z.number().min(1).max(5).optional().default(1),
  channel_id: z.string().uuid().nullable().optional(),
})

// GET /follow-ups
router.get('/follow-ups', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('follow_up_configs')
      .select('*')
      .eq('tenant_id', req.auth.tid)
      .order('created_at', { ascending: true })
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

// POST /follow-ups
router.post('/follow-ups', validate(followUpSchema), async (req, res, next) => {
  try {
    const { name, is_active, delay_hours, message, max_attempts, channel_id } = req.body
    const { data, error } = await db
      .from('follow_up_configs')
      .insert({ tenant_id: req.auth.tid, name, is_active, delay_hours, message, max_attempts, channel_id: channel_id || null })
      .select()
      .single()
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

// PATCH /follow-ups/:id
router.patch('/follow-ups/:id', async (req, res, next) => {
  try {
    const allowed = ['name', 'is_active', 'delay_hours', 'message', 'max_attempts', 'channel_id']
    const update: any = { updated_at: new Date() }
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key]
    }
    const { data, error } = await db
      .from('follow_up_configs')
      .update(update)
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select()
      .single()
    if (error || !data) throw new AppError('NOT_FOUND', 'Configuração não encontrada', 404)
    res.json(ok(data))
  } catch (err) { next(err) }
})

// DELETE /follow-ups/:id
router.delete('/follow-ups/:id', async (req, res, next) => {
  try {
    const { error } = await db
      .from('follow_up_configs')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.json(ok({ message: 'Follow-up excluído' }))
  } catch (err) { next(err) }
})

export default router
