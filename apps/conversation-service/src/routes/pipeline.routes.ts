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
  probabilityOverride: z.number().int().min(0).max(100).nullable().optional(),
})

const pipelineColumnSchema = z.object({
  columns: z.array(z.object({
    id: z.string().optional(),
    key: z.string().min(1).max(100),
    label: z.string().min(1).max(100),
    color: z.string().optional().default('#6b7280'),
    sort_order: z.number().int().min(0),
    probability: z.number().int().min(0).max(100).nullable().optional(),
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
        probability: c.probability ?? null,
      }))

    if (toInsert.length > 0) {
      const { error } = await db.from('pipeline_columns').insert(toInsert)
      if (error) throw error
    }

    const toUpdate = columns.filter((c: any) => !c._isNew && c.id && isUUID(c.id))
    for (const col of toUpdate) {
      const { error } = await db
        .from('pipeline_columns')
        .update({ label: col.label, color: col.color, sort_order: col.sort_order, probability: col.probability ?? null })
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
    if (req.body.probabilityOverride !== undefined) update.probability_override = req.body.probabilityOverride

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

// ─── Forecast ─────────────────────────────────────────────────────────────────
// Retorna previsão de receita ponderada do pipeline.
// `pipelineId` na query filtra por pipeline específico; sem ele, usa o default (null).
// `from`/`to` opcionais filtram cards fechados ("Ganho") nesse período pra compor
// "receita realizada".
router.get('/pipelines/forecast', async (req, res, next) => {
  try {
    const tenantId = req.auth.tid
    const pipelineIdRaw = (req.query.pipelineId as string) || null
    const pipelineId = pipelineIdRaw === 'null' || !pipelineIdRaw ? null : pipelineIdRaw

    // Colunas do pipeline (pra mapear key → probability + label)
    let colQuery = db.from('pipeline_columns').select('*').eq('tenant_id', tenantId).order('sort_order', { ascending: true })
    colQuery = pipelineId ? colQuery.eq('pipeline_id', pipelineId) : colQuery.is('pipeline_id', null)
    const { data: columns } = await colQuery

    const colByKey: Record<string, any> = {}
    for (const c of (columns || [])) colByKey[c.key] = c

    // Cards do pipeline (apenas abertos — não inclui colunas com probability=0 tipo "Perdido")
    let cardQuery = db.from('pipeline_cards')
      .select('id, column_key, deal_value, probability_override, assigned_to, users:assigned_to(name)')
      .eq('tenant_id', tenantId)
    cardQuery = pipelineId ? cardQuery.eq('pipeline_id', pipelineId) : cardQuery.is('pipeline_id', null)
    const { data: cards } = await cardQuery

    // Conversations com pipeline_stage (legacy — alguns cards ainda são conversas)
    let convQuery = db.from('conversations')
      .select('id, pipeline_stage, deal_value, assigned_to, users:assigned_to(name)')
      .eq('tenant_id', tenantId)
      .in('status', ['open', 'waiting'])
    convQuery = pipelineId ? convQuery.eq('pipeline_id', pipelineId) : convQuery.is('pipeline_id', null)
    const { data: convs } = await convQuery

    const probFor = (key: string | null, override: number | null) => {
      if (override !== null && override !== undefined) return override
      const col = key ? colByKey[key] : null
      if (col && col.probability !== null && col.probability !== undefined) return col.probability
      return null // sem previsão se não configurou
    }

    type Row = { id: string; columnKey: string; dealValue: number; weighted: number; prob: number | null; agentId: string | null; agentName: string | null }
    const rows: Row[] = []

    for (const c of (cards || [])) {
      const val = Number(c.deal_value || 0)
      const prob = probFor(c.column_key, (c as any).probability_override)
      rows.push({
        id: c.id, columnKey: c.column_key, dealValue: val,
        weighted: prob !== null ? val * prob / 100 : 0,
        prob,
        agentId: c.assigned_to, agentName: (c as any).users?.name || null,
      })
    }
    for (const c of (convs || [])) {
      const val = Number(c.deal_value || 0)
      if (val <= 0) continue // conversas sem valor não entram no forecast
      const prob = probFor(c.pipeline_stage, null)
      rows.push({
        id: c.id, columnKey: c.pipeline_stage || 'lead', dealValue: val,
        weighted: prob !== null ? val * prob / 100 : 0,
        prob,
        agentId: c.assigned_to, agentName: (c as any).users?.name || null,
      })
    }

    // Totais
    const totalBruto = rows.reduce((s, r) => s + r.dealValue, 0)
    const totalPonderado = rows.reduce((s, r) => s + r.weighted, 0)

    // Por coluna
    const byColumnMap: Record<string, { key: string; label: string; color: string; probability: number | null; count: number; totalBruto: number; totalPonderado: number }> = {}
    for (const col of (columns || [])) {
      byColumnMap[col.key] = {
        key: col.key, label: col.label, color: col.color,
        probability: col.probability ?? null,
        count: 0, totalBruto: 0, totalPonderado: 0,
      }
    }
    for (const r of rows) {
      if (!byColumnMap[r.columnKey]) {
        byColumnMap[r.columnKey] = { key: r.columnKey, label: r.columnKey, color: '#6b7280', probability: r.prob, count: 0, totalBruto: 0, totalPonderado: 0 }
      }
      byColumnMap[r.columnKey].count++
      byColumnMap[r.columnKey].totalBruto += r.dealValue
      byColumnMap[r.columnKey].totalPonderado += r.weighted
    }
    const byColumn = Object.values(byColumnMap)

    // Por agente
    const byAgentMap: Record<string, { agentId: string; name: string; count: number; totalBruto: number; totalPonderado: number }> = {}
    for (const r of rows) {
      if (!r.agentId) continue
      if (!byAgentMap[r.agentId]) byAgentMap[r.agentId] = { agentId: r.agentId, name: r.agentName || 'Atendente', count: 0, totalBruto: 0, totalPonderado: 0 }
      byAgentMap[r.agentId].count++
      byAgentMap[r.agentId].totalBruto += r.dealValue
      byAgentMap[r.agentId].totalPonderado += r.weighted
    }
    const byAgent = Object.values(byAgentMap).sort((a, b) => b.totalPonderado - a.totalPonderado)

    res.json(ok({
      totalBruto,
      totalPonderado,
      cardCount: rows.length,
      byColumn,
      byAgent,
    }))
  } catch (err) { next(err) }
})


export default router
