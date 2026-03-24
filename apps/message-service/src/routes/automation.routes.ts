import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, validate } from '../middleware/message.middleware'
import { ok, AppError } from '@autozap/utils'
import { db } from '../lib/db'

const router = Router()
router.use(requireAuth)

const automationSchema = z.object({
  name: z.string().min(1).max(255),
  channelId: z.string().uuid().nullable().optional(),
  trigger_type: z.enum(['keyword', 'first_message', 'outside_hours']),
  trigger_value: z.record(z.any()).optional().default({}),
  action_type: z.enum(['send_message', 'assign_agent', 'add_tag', 'move_pipeline']),
  action_value: z.record(z.any()).optional().default({}),
  is_active: z.boolean().optional().default(true),
})

// GET /automations
router.get('/automations', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('automations')
      .select('*')
      .eq('tenant_id', req.auth.tid)
      .order('created_at', { ascending: false })
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

// POST /automations
router.post('/automations', validate(automationSchema), async (req, res, next) => {
  try {
    const { name, channelId, trigger_type, trigger_value, action_type, action_value, is_active } = req.body
    const { data, error } = await db
      .from('automations')
      .insert({
        tenant_id: req.auth.tid,
        channel_id: channelId || null,
        name, trigger_type, trigger_value, action_type, action_value, is_active,
      })
      .select()
      .single()
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

// PATCH /automations/:id
router.patch('/automations/:id', async (req, res, next) => {
  try {
    const update: any = {}
    const allowed = ['name', 'channel_id', 'trigger_type', 'trigger_value', 'action_type', 'action_value', 'is_active']
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key]
    }
    // handle channelId -> channel_id
    if (req.body.channelId !== undefined) update.channel_id = req.body.channelId || null

    update.updated_at = new Date()
    const { data, error } = await db
      .from('automations')
      .update(update)
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select()
      .single()
    if (error || !data) throw new AppError('NOT_FOUND', 'Automação não encontrada', 404)
    res.json(ok(data))
  } catch (err) { next(err) }
})

// DELETE /automations/:id
router.delete('/automations/:id', async (req, res, next) => {
  try {
    const { error } = await db
      .from('automations')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.json(ok({ message: 'Automação excluída' }))
  } catch (err) { next(err) }
})

// GET /automations/:id/logs
router.get('/automations/:id/logs', async (req, res, next) => {
  try {
    const { data } = await db
      .from('automation_logs')
      .select('*')
      .eq('automation_id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .order('created_at', { ascending: false })
      .limit(50)
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

export default router