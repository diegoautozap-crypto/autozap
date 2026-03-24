import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, validate } from '../middleware/message.middleware'
import { ok, AppError } from '@autozap/utils'
import { db } from '../lib/db'

const router = Router()
router.use(requireAuth)

const flowSchema = z.object({
  name: z.string().min(1).max(255),
  channelId: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional().default(true),
})

const graphSchema = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    type: z.string(),
    position_x: z.number(),
    position_y: z.number(),
    data: z.record(z.any()).optional().default({}),
  })),
  edges: z.array(z.object({
    id: z.string(),
    source_node: z.string(),
    target_node: z.string(),
    source_handle: z.string().nullable().optional(),
  })),
})

// GET /flows
router.get('/flows', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('flows')
      .select('*, flow_nodes(count)')
      .eq('tenant_id', req.auth.tid)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw new AppError('DB_ERROR', error.message, 500)

    const flows = (data || []).map((f: any) => ({
      ...f,
      node_count: f.flow_nodes?.[0]?.count || 0,
      flow_nodes: undefined,
    }))

    res.json(ok(flows))
  } catch (err) { next(err) }
})

// POST /flows
router.post('/flows', validate(flowSchema), async (req, res, next) => {
  try {
    const { name, channelId, is_active } = req.body

    const { data: last } = await db
      .from('flows')
      .select('sort_order')
      .eq('tenant_id', req.auth.tid)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()

    const nextOrder = last?.sort_order != null ? last.sort_order + 1 : 0

    const { data, error } = await db
      .from('flows')
      .insert({
        tenant_id: req.auth.tid,
        channel_id: channelId || null,
        name,
        is_active: is_active ?? true,
        sort_order: nextOrder,
      })
      .select()
      .single()
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

// GET /flows/:id
router.get('/flows/:id', async (req, res, next) => {
  try {
    const { data: flow, error } = await db
      .from('flows')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .single()
    if (error || !flow) throw new AppError('NOT_FOUND', 'Flow não encontrado', 404)

    const { data: nodes } = await db
      .from('flow_nodes')
      .select('*')
      .eq('flow_id', flow.id)

    const { data: edges } = await db
      .from('flow_edges')
      .select('*')
      .eq('flow_id', flow.id)

    res.json(ok({ ...flow, nodes: nodes || [], edges: edges || [] }))
  } catch (err) { next(err) }
})

// PATCH /flows/:id
router.patch('/flows/:id', async (req, res, next) => {
  try {
    const update: any = {}
    const allowed = ['name', 'is_active', 'channel_id']
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key]
    }
    if (req.body.channelId !== undefined) update.channel_id = req.body.channelId || null
    update.updated_at = new Date()

    const { data, error } = await db
      .from('flows')
      .update(update)
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select()
      .single()
    if (error || !data) throw new AppError('NOT_FOUND', 'Flow não encontrado', 404)
    res.json(ok(data))
  } catch (err) { next(err) }
})

// PUT /flows/:id/graph
router.put('/flows/:id/graph', validate(graphSchema), async (req, res, next) => {
  try {
    const { nodes, edges } = req.body

    const { data: flow, error: flowError } = await db
      .from('flows')
      .select('id')
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .single()

    if (flowError || !flow) {
      throw new AppError('NOT_FOUND', 'Flow não encontrado', 404)
    }

    const { error: delEdgesError } = await db.from('flow_edges').delete().eq('flow_id', req.params.id)
    if (delEdgesError) console.error('[FLOW GRAPH] delete edges error', delEdgesError)

    const { error: delNodesError } = await db.from('flow_nodes').delete().eq('flow_id', req.params.id)
    if (delNodesError) console.error('[FLOW GRAPH] delete nodes error', delNodesError)

    if (nodes.length > 0) {
      const nodeRows = nodes.map((n: any) => ({
        id: n.id,
        flow_id: req.params.id,
        tenant_id: req.auth.tid,
        type: n.type,
        position_x: n.position_x,
        position_y: n.position_y,
        data: n.data || {},
      }))
      const { error: nodesError } = await db.from('flow_nodes').insert(nodeRows)
      if (nodesError) throw new AppError('DB_ERROR', nodesError.message, 500)
    }

    if (edges.length > 0) {
      const edgeRows = edges.map((e: any) => ({
        id: e.id,
        flow_id: req.params.id,
        source_node: e.source_node,
        target_node: e.target_node,
        source_handle: e.source_handle || null,
      }))
      const { error: edgesError } = await db.from('flow_edges').insert(edgeRows)
      if (edgesError) throw new AppError('DB_ERROR', edgesError.message, 500)
    }

    await db.from('flows').update({ updated_at: new Date() }).eq('id', req.params.id)

    res.json(ok({ message: 'Grafo salvo com sucesso' }))
  } catch (err) {
    next(err)
  }
})

// DELETE /flows/:id
router.delete('/flows/:id', async (req, res, next) => {
  try {
    const { error } = await db
      .from('flows')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.json(ok({ message: 'Flow excluído' }))
  } catch (err) { next(err) }
})

// GET /flows/:id/logs
router.get('/flows/:id/logs', async (req, res, next) => {
  try {
    const { data } = await db
      .from('flow_logs')
      .select('*')
      .eq('flow_id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .order('created_at', { ascending: false })
      .limit(100)
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

export default router