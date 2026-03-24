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
  cooldown_minutes: z.number().nullable().optional(),
})

const reorderSchema = z.object({
  order: z.array(z.object({
    id: z.string().uuid(),
    sort_order: z.number().int().min(0),
  })).min(1),
})

// GET /automations
router.get('/automations', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('automations')
      .select('*')
      .eq('tenant_id', req.auth.tid)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

// POST /automations
router.post('/automations', validate(automationSchema), async (req, res, next) => {
  try {
    const { name, channelId, trigger_type, trigger_value, action_type, action_value, is_active, cooldown_minutes } = req.body

    // sort_order = maior existente + 1
    const { data: last } = await db
      .from('automations')
      .select('sort_order')
      .eq('tenant_id', req.auth.tid)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()

    const nextOrder = last?.sort_order != null ? last.sort_order + 1 : 0

    const { data, error } = await db
      .from('automations')
      .insert({
        tenant_id: req.auth.tid,
        channel_id: channelId || null,
        name, trigger_type, trigger_value, action_type, action_value, is_active,
        cooldown_minutes: cooldown_minutes ?? null,
        sort_order: nextOrder,
      })
      .select()
      .single()
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

// PATCH /automations/reorder  ← NOVO: salva nova ordem em batch
router.patch('/automations/reorder', validate(reorderSchema), async (req, res, next) => {
  try {
    const { order } = req.body as { order: { id: string; sort_order: number }[] }

    // Verifica que todos os IDs pertencem ao tenant antes de atualizar
    const ids = order.map(o => o.id)
    const { data: owned, error: checkError } = await db
      .from('automations')
      .select('id')
      .eq('tenant_id', req.auth.tid)
      .in('id', ids)

    if (checkError) throw new AppError('DB_ERROR', checkError.message, 500)
    if (!owned || owned.length !== ids.length) {
      throw new AppError('FORBIDDEN', 'Uma ou mais automações não pertencem a este tenant', 403)
    }

    // Atualiza sort_order de cada item individualmente
    // (Supabase não suporta bulk update nativo com valores diferentes por linha)
    await Promise.all(
      order.map(({ id, sort_order }) =>
        db
          .from('automations')
          .update({ sort_order, updated_at: new Date() })
          .eq('id', id)
          .eq('tenant_id', req.auth.tid)
      )
    )

    res.json(ok({ message: 'Ordem salva com sucesso' }))
  } catch (err) { next(err) }
})

// PATCH /automations/:id
router.patch('/automations/:id', async (req, res, next) => {
  try {
    const update: any = {}
    const allowed = ['name', 'channel_id', 'trigger_type', 'trigger_value', 'action_type', 'action_value', 'is_active', 'cooldown_minutes']
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key]
    }
    if (req.body.channelId !== undefined) update.channel_id = req.body.channelId || null
    if (req.body.cooldown_minutes !== undefined) update.cooldown_minutes = req.body.cooldown_minutes ?? null
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