import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, validate, ok, db, generateId } from '@autozap/utils'

const router = Router()
router.use(requireAuth)

const pipelineColumnSchema = z.object({
  columns: z.array(z.object({
    id: z.string().optional(),
    key: z.string().min(1).max(100),
    label: z.string().min(1).max(100),
    color: z.string().optional().default('#6b7280'),
    sort_order: z.number().int().min(0),
    _isNew: z.boolean().optional(),
  })),
  pipelineId: z.string().uuid().nullable().optional(),
  removedIds: z.array(z.string().uuid()).optional(),
})

// ─── Pipeline CRUD ────────────────────────────────────────────────────────────

router.get('/pipelines', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('pipelines')
      .select('*')
      .eq('tenant_id', req.auth.tid)
      .order('created_at', { ascending: true })
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.post('/pipelines', async (req, res, next) => {
  try {
    const { name } = req.body
    if (!name) { res.status(400).json({ error: 'name is required' }); return }
    const { data, error } = await db
      .from('pipelines')
      .insert({ tenant_id: req.auth.tid, name })
      .select()
      .single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/pipelines/:id', async (req, res, next) => {
  try {
    const { name } = req.body
    const { data, error } = await db
      .from('pipelines')
      .update({ name })
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select()
      .single()
    if (error) throw error
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/pipelines/:id', async (req, res, next) => {
  try {
    await db.from('pipeline_columns').delete().eq('pipeline_id', req.params.id).eq('tenant_id', req.auth.tid)
    const { error } = await db
      .from('pipelines')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
    if (error) throw error
    res.json(ok({ message: 'Pipeline deleted' }))
  } catch (err) { next(err) }
})

// ─── Pipeline Columns ─────────────────────────────────────────────────────────

router.get('/pipeline-columns', async (req, res, next) => {
  try {
    const { pipelineId } = req.query as any
    let query = db
      .from('pipeline_columns')
      .select('*')
      .eq('tenant_id', req.auth.tid)
      .order('sort_order', { ascending: true })
    if (pipelineId) {
      query = query.eq('pipeline_id', pipelineId)
    } else {
      query = query.is('pipeline_id', null)
    }
    const { data, error } = await query
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.put('/pipeline-columns', validate(pipelineColumnSchema), async (req, res, next) => {
  try {
    const { columns, pipelineId = null, removedIds = [] } = req.body
    const tenantId = req.auth.tid
    const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

    if (removedIds.length > 0) {
      const { error } = await db
        .from('pipeline_columns')
        .delete()
        .in('id', removedIds)
        .eq('tenant_id', tenantId)
      if (error) throw error
    }

    const toInsert = columns
      .filter((c: any) => c._isNew || !c.id || !isUUID(c.id))
      .map((c: any, i: number) => ({
        tenant_id: tenantId,
        pipeline_id: pipelineId,
        key: c.key,
        label: c.label,
        color: c.color || '#6b7280',
        sort_order: c.sort_order ?? i,
      }))

    if (toInsert.length > 0) {
      const { error } = await db.from('pipeline_columns').insert(toInsert)
      if (error) throw error
    }

    const toUpdate = columns.filter((c: any) => !c._isNew && c.id && isUUID(c.id))
    for (const col of toUpdate) {
      const { error } = await db
        .from('pipeline_columns')
        .update({ label: col.label, color: col.color, sort_order: col.sort_order })
        .eq('id', col.id)
        .eq('tenant_id', tenantId)
      if (error) throw error
    }

    let q = db
      .from('pipeline_columns')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true })
    q = pipelineId ? q.eq('pipeline_id', pipelineId) : q.is('pipeline_id', null)

    const { data, error } = await q
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})



router.get('/pipeline-cards', async (req, res, next) => {
  try {
    const { pipelineId } = req.query as any
    let query = db.from('pipeline_cards')
      .select('*, contacts(id, name, phone, email, metadata, contact_tags(tags(id, name, color)))')
      .eq('tenant_id', req.auth.tid)
      .order('sort_order', { ascending: true })
    if (pipelineId === 'null') {
      query = query.is('pipeline_id', null)
    } else if (pipelineId) {
      query = query.eq('pipeline_id', pipelineId)
    }
    const { data, error } = await query
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.post('/pipeline-cards', async (req, res, next) => {
  try {
    const { contactId, pipelineId, columnKey, title, dealValue } = req.body
    if (!contactId) { res.status(400).json({ error: 'contactId required' }); return }

    const { data: contact } = await db.from('contacts').select('id').eq('id', contactId).eq('tenant_id', req.auth.tid).single()
    if (!contact) { res.status(404).json({ error: 'Contato não encontrado' }); return }

    const { data, error } = await db.from('pipeline_cards').insert({
      tenant_id: req.auth.tid,
      contact_id: contactId,
      pipeline_id: pipelineId || null,
      column_key: columnKey || 'lead',
      title: title || null,
      deal_value: dealValue || null,
    }).select('*, contacts(id, name, phone)').single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/pipeline-cards/:id', async (req, res, next) => {
  try {
    const update: any = { updated_at: new Date() }
    if (req.body.columnKey !== undefined) update.column_key = req.body.columnKey
    if (req.body.pipelineId !== undefined) update.pipeline_id = req.body.pipelineId
    if (req.body.dealValue !== undefined) update.deal_value = req.body.dealValue
    if (req.body.title !== undefined) update.title = req.body.title
    if (req.body.sortOrder !== undefined) update.sort_order = req.body.sortOrder
    if (req.body.assignedTo !== undefined) update.assigned_to = req.body.assignedTo

    const { data, error } = await db.from('pipeline_cards').update(update)
      .eq('id', req.params.id).eq('tenant_id', req.auth.tid).select().single()
    if (error || !data) { res.status(404).json({ error: 'Card não encontrado' }); return }
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/pipeline-cards/:id', async (req, res, next) => {
  try {
    await db.from('pipeline_cards').delete().eq('id', req.params.id).eq('tenant_id', req.auth.tid)
    res.json(ok({ message: 'Card removido' }))
  } catch (err) { next(err) }
})


export default router
