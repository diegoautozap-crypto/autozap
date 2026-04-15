import { Router } from 'express'
import { z } from 'zod'
import { db, requireAuth, validate, ok, AppError, cachedGet } from '@autozap/utils'
import { PLAN_LIMITS, type PlanSlug } from '@autozap/types'

const router = Router()
router.use(requireAuth)

const updateFlowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  is_active: z.boolean().optional(),
  channelId: z.string().uuid().nullable().optional(),
  campaignId: z.string().uuid().nullable().optional(),
  cooldown_type: z.enum(['24h', 'once', 'always']).optional(),
  channel_id: z.string().uuid().nullable().optional(),
})

const runFlowSchema = z.object({
  tagIds: z.array(z.string().uuid()).min(1),
})

const flowSchema = z.object({
  name: z.string().min(1).max(255),
  channelId: z.string().uuid().nullable().optional(),
  campaignId: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional().default(true),
  cooldown_type: z.enum(['24h', 'once', 'always']).optional().default('always'),
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
    // ── Plan limit check ──
    const planSlug = await cachedGet(`tenant-plan:${req.auth.tid}`, 120, async () => {
      const { data } = await db.from('tenants').select('plan_slug').eq('id', req.auth.tid).single()
      return (data?.plan_slug || 'pending') as PlanSlug
    })
    const planLimits = PLAN_LIMITS[planSlug] ?? PLAN_LIMITS.pending
    const { count: flowCount } = await db.from('flows').select('id', { count: 'exact', head: true }).eq('tenant_id', req.auth.tid)
    if (planLimits.flows !== null && (flowCount ?? 0) >= planLimits.flows) {
      throw new AppError('PLAN_LIMIT', `Seu plano permite ${planLimits.flows} flows`, 403)
    }

    const { name, channelId, campaignId, is_active, cooldown_type } = req.body

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
        campaign_id: campaignId || null,
        name,
        is_active: is_active ?? true,
        sort_order: nextOrder,
        cooldown_type: cooldown_type || '24h',
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
router.patch('/flows/:id', validate(updateFlowSchema), async (req, res, next) => {
  try {
    const update: any = {}
    const allowed = ['name', 'is_active', 'channel_id', 'cooldown_type']
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key]
    }
    if (req.body.channelId !== undefined) update.channel_id = req.body.channelId || null
    if (req.body.campaignId !== undefined) update.campaign_id = req.body.campaignId || null
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

    // ── Plan feature check for premium nodes ──
    const graphPlanSlug = await cachedGet(`tenant-plan:${req.auth.tid}`, 120, async () => {
      const { data } = await db.from('tenants').select('plan_slug').eq('id', req.auth.tid).single()
      return (data?.plan_slug || 'pending') as PlanSlug
    })
    const planLimits = PLAN_LIMITS[graphPlanSlug] ?? PLAN_LIMITS.pending
    const nodeTypes = nodes.map((n: any) => n.type)
    if (!planLimits.transcription && nodeTypes.includes('transcribe_audio')) {
      throw new AppError('PLAN_LIMIT', 'Transcrição de áudio não disponível no seu plano', 403)
    }
    if (planLimits.aiResponses === 0 && nodeTypes.includes('ai_response')) {
      throw new AppError('PLAN_LIMIT', 'Respostas de IA não disponíveis no seu plano', 403)
    }

    const { error: delEdgesError } = await db.from('flow_edges').delete().eq('flow_id', req.params.id)
    if (delEdgesError) throw new AppError('DB_ERROR', `Erro ao limpar edges: ${delEdgesError.message}`, 500)

    const { error: delNodesError } = await db.from('flow_nodes').delete().eq('flow_id', req.params.id)
    if (delNodesError) throw new AppError('DB_ERROR', `Erro ao limpar nodes: ${delNodesError.message}`, 500)

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

    // ─── Salva o mapeamento de campos do nó trigger_webhook no flow ───────────
    const webhookNode = nodes.find((n: any) => n.type === 'trigger_webhook')
    const flowUpdate: any = { updated_at: new Date() }
    if (webhookNode?.data?.fieldMap !== undefined) {
      flowUpdate.webhook_field_map = webhookNode.data.fieldMap
    }
    await db.from('flows').update(flowUpdate).eq('id', req.params.id)

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

// POST /flows/:id/run — executa flow manualmente para contatos de tags específicas
router.post('/flows/:id/run', validate(runFlowSchema), async (req, res, next) => {
  try {
    const { tagIds } = req.body

    const { data: flow } = await db.from('flows').select('*').eq('id', req.params.id).eq('tenant_id', req.auth.tid).single()
    if (!flow) throw new AppError('NOT_FOUND', 'Flow não encontrado', 404)
    if (!flow.is_active) throw new AppError('INVALID_STATUS', 'Flow está pausado', 400)

    // Valida que as tags pertencem ao tenant antes de buscar contatos
    const { data: validTags } = await db.from('tags').select('id').eq('tenant_id', req.auth.tid).in('id', tagIds)
    const validTagIds = (validTags || []).map((t: any) => t.id)
    if (validTagIds.length === 0) { res.json(ok({ queued: 0 })); return }
    const { data: contactTagRows } = await db.from('contact_tags').select('contact_id').in('tag_id', validTagIds)
    if (!contactTagRows || contactTagRows.length === 0) { res.json(ok({ queued: 0 })); return }

    const uniqueIds = [...new Set(contactTagRows.map(r => r.contact_id))]
    const { data: contacts } = await db.from('contacts').select('id, phone, name')
      .eq('tenant_id', req.auth.tid).eq('status', 'active').in('id', uniqueIds)
    if (!contacts || contacts.length === 0) { res.json(ok({ queued: 0 })); return }

    // Busca canal do tenant
    const channelId = flow.channel_id
    let channel: { id: string; type: string } | null = null
    if (channelId) {
      const { data: ch } = await db.from('channels').select('id, type').eq('id', channelId).eq('tenant_id', req.auth.tid).single()
      channel = ch
    }
    if (!channel) {
      const { data: ch } = await db.from('channels').select('id, type').eq('tenant_id', req.auth.tid).eq('status', 'active').limit(1).single()
      channel = ch
    }
    if (!channel) throw new AppError('NOT_FOUND', 'Nenhum canal ativo encontrado', 400)

    // Enfileira execução para cada contato via BullMQ
    const { manualFlowQueue } = await import('../workers/flow.worker')
    let queued = 0
    for (const contact of contacts) {
      if (!contact.phone || contact.phone.length < 8) continue
      await manualFlowQueue.add('manual-run', {
        flowId: flow.id,
        tenantId: req.auth.tid,
        channelId: channel.id,
        contactId: contact.id,
        phone: contact.phone,
        contactName: contact.name || contact.phone,
      }, { delay: queued * 200 }) // 200ms entre cada para não sobrecarregar
      queued++
    }

    res.json(ok({ queued, total: contacts.length }))
  } catch (err) { next(err) }
})

// GET /flows/:id/analytics
router.get('/flows/:id/analytics', async (req, res, next) => {
  try {
    const flowId = req.params.id
    const tenantId = req.auth.tid
    const days = Number(req.query.days) || 7
    const since = new Date(Date.now() - days * 86400000).toISOString()

    const { data: logs } = await db.from('flow_logs')
      .select('node_id, status, contact_id, conversation_id, detail, created_at')
      .eq('flow_id', flowId).eq('tenant_id', tenantId).gte('created_at', since)
      .order('created_at', { ascending: true })

    // Identifica nodes do tipo 'end' pra medir taxa de conclusão
    const { data: flowNodes } = await db.from('flow_nodes').select('id, type').eq('flow_id', flowId)
    const endNodeIds = new Set((flowNodes || []).filter((n: { type: string }) => n.type === 'end').map((n: { id: string }) => n.id))

    const nodeStats: Record<string, { success: number; error: number; total: number; lastError?: string | null; lastErrorAt?: string | null }> = {}
    let totalExecutions = 0, totalErrors = 0, totalFlowRuns = 0, totalCompletions = 0
    const contactSet = new Set<string>()

    // Agrupa por conversation_id + dia pra gerar lista de execuções
    // runs[key] = { conversationId, contactId, startedAt, endedAt, lastNodeId, nodeCount, hadError, completed }
    type Run = { conversationId: string; contactId: string | null; startedAt: string; endedAt: string; lastNodeId: string | null; nodeCount: number; hadError: boolean; completed: boolean }
    const runsByConv: Record<string, Run> = {}

    for (const log of (logs || [])) {
      if (!nodeStats[log.node_id]) nodeStats[log.node_id] = { success: 0, error: 0, total: 0, lastError: null, lastErrorAt: null }
      nodeStats[log.node_id].total++
      if (log.status === 'success') nodeStats[log.node_id].success++
      else if (log.status === 'error') {
        nodeStats[log.node_id].error++
        nodeStats[log.node_id].lastError = log.detail || 'Erro'
        nodeStats[log.node_id].lastErrorAt = log.created_at
        totalErrors++
      }
      if (log.status === 'flow_executed') { totalFlowRuns++; if (log.contact_id) contactSet.add(log.contact_id) }
      totalExecutions++

      // Tracking de runs por conversation
      if (log.conversation_id) {
        const run = runsByConv[log.conversation_id]
        if (!run) {
          runsByConv[log.conversation_id] = {
            conversationId: log.conversation_id,
            contactId: log.contact_id || null,
            startedAt: log.created_at,
            endedAt: log.created_at,
            lastNodeId: log.node_id || null,
            nodeCount: 1,
            hadError: log.status === 'error',
            completed: endNodeIds.has(log.node_id || ''),
          }
        } else {
          run.endedAt = log.created_at
          if (log.node_id) run.lastNodeId = log.node_id
          run.nodeCount++
          if (log.status === 'error') run.hadError = true
          if (endNodeIds.has(log.node_id || '')) run.completed = true
        }
      }
    }

    const runs = Object.values(runsByConv)
    totalCompletions = runs.filter(r => r.completed).length
    const completionRate = runs.length > 0 ? Math.round((totalCompletions / runs.length) * 100) : 0
    const avgDurationMs = runs.length > 0
      ? Math.round(runs.reduce((s, r) => s + (new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()), 0) / runs.length)
      : 0

    // Threshold pra considerar abandono — default 30min (configurável via query)
    const abandonThresholdMs = Number(req.query.abandonMinutes || 30) * 60_000
    const now = Date.now()

    // Mapa de nodes pra decidir se é wait (nunca abandono — só esperando timer)
    const nodeTypeById: Record<string, string> = {}
    for (const n of (flowNodes || [])) nodeTypeById[(n as { id: string }).id] = (n as { type: string }).type

    // Calcula drop-off e "em andamento":
    // - completed → concluído
    // - hadError → erro
    // - lastNode é wait → em andamento (esperando timer, nunca abandona)
    // - lastLog < threshold → em andamento (cliente pode responder ainda)
    // - lastLog > threshold → abandono real
    const dropOffByNode: Record<string, number> = {}
    let inProgress = 0, abandoned = 0
    for (const run of runs) {
      if (run.completed || run.hadError) continue
      const lastNodeType = run.lastNodeId ? nodeTypeById[run.lastNodeId] : ''
      const ageMs = now - new Date(run.endedAt).getTime()
      const isWaitNode = lastNodeType === 'wait'
      if (isWaitNode || ageMs < abandonThresholdMs) {
        inProgress++
        ;(run as any).inProgress = true
        continue
      }
      abandoned++
      ;(run as any).abandoned = true
      if (run.lastNodeId) dropOffByNode[run.lastNodeId] = (dropOffByNode[run.lastNodeId] || 0) + 1
    }
    // Adiciona drop-off aos nodeStats
    for (const nodeId in nodeStats) {
      const ns = nodeStats[nodeId] as any
      ns.dropOff = dropOffByNode[nodeId] || 0
      ns.dropOffPct = runs.length > 0 ? Math.round(((dropOffByNode[nodeId] || 0) / runs.length) * 100) : 0
    }

    // Top 3 gargalos — só de nodes que AINDA existem no flow (filtra deletados)
    const activeNodeIds = new Set((flowNodes || []).map((n: { id: string }) => n.id))
    const topBottlenecks = Object.entries(dropOffByNode)
      .filter(([nodeId]) => activeNodeIds.has(nodeId))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([nodeId, count]) => ({ nodeId, count, pct: runs.length > 0 ? Math.round((count / runs.length) * 100) : 0 }))

    // Busca nomes dos contatos pra mostrar na lista (últimas 50 execuções)
    const recentRuns = runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, 50)
    const contactIds = [...new Set(recentRuns.map(r => r.contactId).filter(Boolean))] as string[]
    const contactNameById: Record<string, { name: string; phone: string }> = {}
    if (contactIds.length > 0) {
      const { data: contacts } = await db.from('contacts').select('id, name, phone').in('id', contactIds)
      for (const c of (contacts || [])) contactNameById[c.id] = { name: c.name || '—', phone: c.phone || '' }
    }
    const executions = recentRuns.map(r => ({
      conversationId: r.conversationId,
      contactId: r.contactId,
      contactName: r.contactId ? contactNameById[r.contactId]?.name || 'Contato' : 'Contato',
      contactPhone: r.contactId ? contactNameById[r.contactId]?.phone || '' : '',
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationMs: new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime(),
      lastNodeId: r.lastNodeId,
      nodeCount: r.nodeCount,
      hadError: r.hadError,
      completed: r.completed,
      inProgress: (r as any).inProgress || false,
      abandoned: (r as any).abandoned || false,
    }))

    res.json(ok({
      totalFlowRuns,
      totalExecutions,
      totalErrors,
      totalCompletions,
      totalAbandoned: abandoned,
      totalInProgress: inProgress,
      completionRate,
      avgDurationMs,
      uniqueContacts: contactSet.size,
      nodeStats,
      executions,
      topBottlenecks,
      days,
      abandonThresholdMinutes: Math.round(abandonThresholdMs / 60000),
    }))
  } catch (err) { next(err) }
})

// GET /flows/:id/node-logs — logs de um node específico
router.get('/flows/:id/node-logs/:nodeId', async (req, res, next) => {
  try {
    const days = Number(req.query.days) || 7
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const { data } = await db.from('flow_logs')
      .select('status, detail, contact_id, conversation_id, created_at, contacts:contact_id(name, phone)')
      .eq('flow_id', req.params.id).eq('tenant_id', req.auth.tid)
      .eq('node_id', req.params.nodeId)
      .gte('created_at', since)
      .order('created_at', { ascending: false }).limit(100)
    res.json(ok(data || []))
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

// ─── Gera token único para webhook de entrada do flow ─────────────────────────
router.post('/flows/:id/webhook-token', async (req, res, next) => {
  try {
    const crypto = await import('crypto')
    const token = crypto.randomBytes(24).toString('hex')
    const { data, error } = await db
      .from('flows')
      .update({ webhook_token: token, updated_at: new Date() })
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select('id, webhook_token')
      .single()
    if (error || !data) throw new AppError('NOT_FOUND', 'Flow não encontrado', 404)
    res.json(ok({ token }))
  } catch (err) { next(err) }
})

export default router