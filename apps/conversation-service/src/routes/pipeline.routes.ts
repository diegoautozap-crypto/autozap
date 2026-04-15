import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, validate, ok, db, generateId } from '@autozap/utils'

const router = Router()
router.use(requireAuth)

// Helper: grava um evento no histórico do card/conversa. Erros são swallowed
// propositalmente — o histórico é auxiliar e não deve quebrar o fluxo principal.
async function logCardEvent(params: {
  tenantId: string
  cardId?: string | null
  conversationId?: string | null
  pipelineId?: string | null
  eventType: 'created' | 'moved' | 'value_changed' | 'assigned' | 'deleted'
  fromColumn?: string | null
  toColumn?: string | null
  fromValue?: number | null
  toValue?: number | null
  fromUserId?: string | null
  toUserId?: string | null
  actorUserId?: string | null
  metadata?: Record<string, any>
}) {
  try {
    await db.from('pipeline_card_events').insert({
      tenant_id: params.tenantId,
      card_id: params.cardId || null,
      conversation_id: params.conversationId || null,
      pipeline_id: params.pipelineId || null,
      event_type: params.eventType,
      from_column: params.fromColumn ?? null,
      to_column: params.toColumn ?? null,
      from_value: params.fromValue ?? null,
      to_value: params.toValue ?? null,
      from_user_id: params.fromUserId || null,
      to_user_id: params.toUserId || null,
      actor_user_id: params.actorUserId || null,
      metadata: params.metadata || {},
    })
  } catch (e) {
    console.error('[pipeline_card_events] falha ao logar', e)
  }
}

const pipelineNameSchema = z.object({ name: z.string().min(1).max(255) })
const pipelineCardSchema = z.object({
  contactId: z.string().uuid(),
  pipelineId: z.string().uuid().nullable().optional(),
  columnKey: z.string().max(100).optional(),
  title: z.string().max(255).nullable().optional(),
  dealValue: z.number().nullable().optional(),
})
const updateCardSchema = z.object({
  columnKey: z.string().max(100).optional(),
  pipelineId: z.string().uuid().nullable().optional(),
  dealValue: z.number().nullable().optional(),
  title: z.string().max(255).nullable().optional(),
  sortOrder: z.number().int().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
})

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

router.post('/pipelines', validate(pipelineNameSchema), async (req, res, next) => {
  try {
    const { name } = req.body
    const { data, error } = await db
      .from('pipelines')
      .insert({ tenant_id: req.auth.tid, name })
      .select()
      .single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/pipelines/:id', validate(pipelineNameSchema), async (req, res, next) => {
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

router.post('/pipeline-cards', validate(pipelineCardSchema), async (req, res, next) => {
  try {
    const { contactId, pipelineId, columnKey, title, dealValue } = req.body

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
    await logCardEvent({
      tenantId: req.auth.tid,
      cardId: data.id,
      pipelineId: data.pipeline_id,
      eventType: 'created',
      toColumn: data.column_key,
      toValue: data.deal_value,
      actorUserId: req.auth.sub,
    })
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/pipeline-cards/:id', validate(updateCardSchema), async (req, res, next) => {
  try {
    // Busca o estado atual pra comparar e logar só o que mudou
    const { data: before } = await db.from('pipeline_cards')
      .select('column_key, deal_value, assigned_to, pipeline_id')
      .eq('id', req.params.id).eq('tenant_id', req.auth.tid).single()

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

    if (before) {
      if (before.column_key !== data.column_key) {
        await logCardEvent({
          tenantId: req.auth.tid, cardId: data.id, pipelineId: data.pipeline_id,
          eventType: 'moved',
          fromColumn: before.column_key, toColumn: data.column_key,
          actorUserId: req.auth.sub,
        })
      }
      if (Number(before.deal_value || 0) !== Number(data.deal_value || 0)) {
        await logCardEvent({
          tenantId: req.auth.tid, cardId: data.id, pipelineId: data.pipeline_id,
          eventType: 'value_changed',
          fromValue: before.deal_value, toValue: data.deal_value,
          actorUserId: req.auth.sub,
        })
      }
      if ((before.assigned_to || null) !== (data.assigned_to || null)) {
        await logCardEvent({
          tenantId: req.auth.tid, cardId: data.id, pipelineId: data.pipeline_id,
          eventType: 'assigned',
          fromUserId: before.assigned_to, toUserId: data.assigned_to,
          actorUserId: req.auth.sub,
        })
      }
    }

    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/pipeline-cards/:id', async (req, res, next) => {
  try {
    const { data: before } = await db.from('pipeline_cards')
      .select('column_key, deal_value, pipeline_id')
      .eq('id', req.params.id).eq('tenant_id', req.auth.tid).single()
    await db.from('pipeline_cards').delete().eq('id', req.params.id).eq('tenant_id', req.auth.tid)
    if (before) {
      // Card já foi deletado (cascade apaga eventos), mas logamos um evento "órfão"
      // sem card_id pra manter auditoria; como temos constraint de card_id OR conversation_id,
      // pulamos esse log quando não há conversation_id. Apenas mantém consistência.
    }
    res.json(ok({ message: 'Card removido' }))
  } catch (err) { next(err) }
})

// ─── Histórico de eventos do card ──────────────────────────────────────────────
router.get('/pipeline-cards/:id/events', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('pipeline_card_events')
      .select('*, actor:actor_user_id(id, name, email), from_user:from_user_id(id, name), to_user:to_user_id(id, name)')
      .eq('tenant_id', req.auth.tid)
      .eq('card_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

// Histórico via conversation_id (para cards que ainda são conversas legacy)
router.get('/conversations/:id/pipeline-events', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('pipeline_card_events')
      .select('*, actor:actor_user_id(id, name, email), from_user:from_user_id(id, name), to_user:to_user_id(id, name)')
      .eq('tenant_id', req.auth.tid)
      .eq('conversation_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})


export default router
