import { Router } from 'express'
import { z } from 'zod'
import { tenantService } from '../services/tenant.service'
import { requireAuth, requireRole, validate } from '../middleware/tenant.middleware'
import { ok, paginationSchema } from '@autozap/utils'

const router = Router()

// ─── Limites por plano ────────────────────────────────────────────────────────
const PLAN_LIMITS: Record<string, number | null> = {
  trial:      100,
  starter:    10_000,
  pro:        50_000,
  enterprise: 100_000,
  unlimited:  null,
}

// ─── Schemas ──────────────────────────────────────────────────────────────────
const updateNameSchema = z.object({
  name: z.string().min(2).max(255),
})

const updateSettingsSchema = z.object({
  timezone: z.string().optional(),
  defaultLanguage: z.string().optional(),
  webhookUrl: z.string().url().optional().nullable(),
  webhookSecret: z.string().min(8).optional().nullable(),
})

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'agent', 'viewer']),
})

const subscribeSchema = z.object({
  planSlug: z.enum(['starter', 'pro', 'enterprise', 'unlimited']),
  cpfCnpj: z.string().optional(),
})

// Schema de permissões por role
const permissionsSchema = z.object({
  permissions: z.record(z.array(z.string())),
})

// ─── Webhook do Asaas (público — sem auth) ────────────────────────────────────
const asaasWebhookRouter = Router()

asaasWebhookRouter.post('/billing/webhook/asaas', async (req, res) => {
  try {
    const { event, payment, subscription } = req.body
    await tenantService.processAsaasWebhook(event, { payment, subscription })
    res.json({ success: true })
  } catch (err) {
    console.error('Asaas webhook error:', err)
    res.json({ success: true })
  }
})

// ─── Auth obrigatório para todas as rotas abaixo ──────────────────────────────
router.use(requireAuth)

// ─── Tenant ───────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const tenant = await tenantService.getTenant(req.auth.tid)
    res.json(ok(tenant))
  } catch (err) { next(err) }
})

router.patch('/name', requireRole('owner'), validate(updateNameSchema), async (req, res, next) => {
  try {
    const tenant = await tenantService.updateName(req.auth.tid, req.body.name)
    res.json(ok(tenant))
  } catch (err) { next(err) }
})

router.patch('/settings', requireRole('admin', 'owner'), validate(updateSettingsSchema), async (req, res, next) => {
  try {
    const tenant = await tenantService.updateSettings(req.auth.tid, req.body)
    res.json(ok(tenant))
  } catch (err) { next(err) }
})

router.get('/subscription', async (req, res, next) => {
  try {
    const subscription = await tenantService.getSubscription(req.auth.tid)
    res.json(ok(subscription))
  } catch (err) { next(err) }
})

// GET /tenant/usage
router.get('/usage', async (req, res, next) => {
  try {
    const tenant = await tenantService.getTenant(req.auth.tid)
    const limit = PLAN_LIMITS[tenant.planSlug] ?? null
    res.json(ok({
      sent: tenant.messagesSentThisPeriod,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - tenant.messagesSentThisPeriod),
      percentUsed: limit === null ? 0 : Math.round((tenant.messagesSentThisPeriod / limit) * 100),
    }))
  } catch (err) { next(err) }
})

// ─── Permissões por role ───────────────────────────────────────────────────────

// GET /tenant/permissions — busca permissões configuradas
router.get('/permissions', async (req, res, next) => {
  try {
    const { db } = await import('../lib/db')
    const { data } = await db
      .from('tenants')
      .select('role_permissions')
      .eq('id', req.auth.tid)
      .single()

    // Permissões padrão se não estiver configurado
    const defaults = {
      supervisor: ['/dashboard', '/dashboard/campaigns', '/dashboard/templates', '/dashboard/contacts', '/dashboard/inbox', '/dashboard/pipeline'],
      agent: ['/dashboard/inbox'],
    }

    res.json(ok(data?.role_permissions && Object.keys(data.role_permissions).length > 0
      ? data.role_permissions
      : defaults
    ))
  } catch (err) { next(err) }
})

// PATCH /tenant/permissions — salva permissões
router.patch('/permissions', requireRole('admin', 'owner'), validate(permissionsSchema), async (req, res, next) => {
  try {
    const { db } = await import('../lib/db')
    const { error } = await db
      .from('tenants')
      .update({ role_permissions: req.body.permissions })
      .eq('id', req.auth.tid)

    if (error) throw new Error(error.message)
    res.json(ok({ message: 'Permissões salvas com sucesso' }))
  } catch (err) { next(err) }
})
// ─────────────────────────────────────────────────────────────────────────────

// ✅ GET /tenant/analytics
router.get('/analytics', async (req, res, next) => {
  try {
    const { db } = await import('../lib/db')
    const tenantId = req.auth.tid
    const filterUserId = req.query.userId as string | undefined

    const since = new Date()
    since.setDate(since.getDate() - 29)
    since.setHours(0, 0, 0, 0)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // ─── Mensagens de campanha (30 dias) ──────────────────────────────────────
    const { data: messages } = await db
      .from('messages')
      .select('created_at, status, direction')
      .eq('tenant_id', tenantId)
      .eq('direction', 'outbound')
      .not('campaign_id', 'is', null)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true })

    const msgs = messages || []
    const byDay: Record<string, { sent: number; delivered: number; read: number }> = {}
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      byDay[key] = { sent: 0, delivered: 0, read: 0 }
    }
    for (const m of msgs) {
      const day = m.created_at?.split('T')[0]
      if (!day || !byDay[day]) continue
      byDay[day].sent++
      if (m.status === 'delivered' || m.status === 'read') byDay[day].delivered++
      if (m.status === 'read') byDay[day].read++
    }
    const totalSent = msgs.length
    const totalDelivered = msgs.filter((m: any) => m.status === 'delivered' || m.status === 'read').length
    const totalRead = msgs.filter((m: any) => m.status === 'read').length

    // ─── Conversas por atendente ──────────────────────────────────────────────
    const convQuery = db
      .from('conversations')
      .select('assigned_to, users(name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .not('assigned_to', 'is', null)

    const { data: convsByAgent } = await convQuery
    const agentMap: Record<string, { name: string; count: number }> = {}
    for (const conv of (convsByAgent || [])) {
      const id = conv.assigned_to
      if (!id) continue
      if (!agentMap[id]) agentMap[id] = { name: (conv as any).users?.name || 'Atendente', count: 0 }
      agentMap[id].count++
    }
    const byAgent = Object.values(agentMap).sort((a, b) => b.count - a.count).slice(0, 5)

    // ─── Métricas do atendente filtrado ───────────────────────────────────────
    let agentConversations = 0
    let agentClosedLast7d = 0
    let agentAvgResponseMinutes: number | null = null

    if (filterUserId) {
      // Total de conversas abertas atribuídas
      const { count: openCount } = await db
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('assigned_to', filterUserId)
        .eq('status', 'open')
      agentConversations = openCount || 0

      // Conversas fechadas nos últimos 7 dias
      const { count: closedCount } = await db
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('assigned_to', filterUserId)
        .eq('status', 'closed')
        .gte('updated_at', sevenDaysAgo.toISOString())
      agentClosedLast7d = closedCount || 0

      // Tempo médio de resposta do atendente (7 dias)
      const { data: agentConvIds } = await db
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('assigned_to', filterUserId)
        .gte('updated_at', sevenDaysAgo.toISOString())

      const convIds = (agentConvIds || []).map((c: any) => c.id)

      if (convIds.length > 0) {
        const { data: agentMsgs } = await db
          .from('messages')
          .select('conversation_id, created_at, direction')
          .eq('tenant_id', tenantId)
          .in('conversation_id', convIds)
          .gte('created_at', sevenDaysAgo.toISOString())
          .order('created_at', { ascending: true })

        const timings: Record<string, { firstInbound?: number; firstOutbound?: number }> = {}
        for (const m of (agentMsgs || [])) {
          if (!timings[m.conversation_id]) timings[m.conversation_id] = {}
          const t = new Date(m.created_at).getTime()
          if (m.direction === 'inbound' && !timings[m.conversation_id].firstInbound) {
            timings[m.conversation_id].firstInbound = t
          }
          if (m.direction === 'outbound' && timings[m.conversation_id].firstInbound && !timings[m.conversation_id].firstOutbound) {
            timings[m.conversation_id].firstOutbound = t
          }
        }
        const times = Object.values(timings)
          .filter(t => t.firstInbound && t.firstOutbound && t.firstOutbound > t.firstInbound)
          .map(t => (t.firstOutbound! - t.firstInbound!) / 1000 / 60)
        agentAvgResponseMinutes = times.length > 0
          ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
          : null
      }
    } else {
      // Tempo médio geral (7 dias)
      const { data: inboundMsgs } = await db
        .from('messages')
        .select('conversation_id, created_at, direction')
        .eq('tenant_id', tenantId)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: true })

      const convTimings: Record<string, { firstInbound?: number; firstOutbound?: number }> = {}
      for (const m of (inboundMsgs || [])) {
        if (!convTimings[m.conversation_id]) convTimings[m.conversation_id] = {}
        const t = new Date(m.created_at).getTime()
        if (m.direction === 'inbound' && !convTimings[m.conversation_id].firstInbound) {
          convTimings[m.conversation_id].firstInbound = t
        }
        if (m.direction === 'outbound' && convTimings[m.conversation_id].firstInbound && !convTimings[m.conversation_id].firstOutbound) {
          convTimings[m.conversation_id].firstOutbound = t
        }
      }
      const responseTimes = Object.values(convTimings)
        .filter(t => t.firstInbound && t.firstOutbound && t.firstOutbound > t.firstInbound)
        .map(t => (t.firstOutbound! - t.firstInbound!) / 1000 / 60)
      agentAvgResponseMinutes = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null
    }

    // ─── Flows ativos hoje ────────────────────────────────────────────────────
    const { data: flowLogs } = await db
      .from('flow_logs')
      .select('flow_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'flow_executed')
      .gte('created_at', today.toISOString())

    const activeFlowsToday = new Set((flowLogs || []).map((f: any) => f.flow_id)).size
    const flowExecutionsToday = (flowLogs || []).length

    res.json(ok({
      totalSent, totalDelivered, totalRead,
      deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
      readRate: totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : 0,
      byDay,
      byAgent,
      avgResponseMinutes: agentAvgResponseMinutes,
      activeFlowsToday,
      flowExecutionsToday,
      // Métricas do atendente filtrado
      agentConversations: filterUserId ? agentConversations : null,
      agentClosedLast7d: filterUserId ? agentClosedLast7d : null,
    }))
  } catch (err) { next(err) }
})
  try {
    const { db } = await import('../lib/db')
    const tenantId = req.auth.tid

    const since = new Date()
    since.setDate(since.getDate() - 29)
    since.setHours(0, 0, 0, 0)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // ─── Mensagens de campanha (30 dias) ──────────────────────────────────────
    const { data: messages } = await db
      .from('messages')
      .select('created_at, status, direction')
      .eq('tenant_id', tenantId)
      .eq('direction', 'outbound')
      .not('campaign_id', 'is', null)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true })

    const msgs = messages || []
    const byDay: Record<string, { sent: number; delivered: number; read: number }> = {}
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      byDay[key] = { sent: 0, delivered: 0, read: 0 }
    }
    for (const m of msgs) {
      const day = m.created_at?.split('T')[0]
      if (!day || !byDay[day]) continue
      byDay[day].sent++
      if (m.status === 'delivered' || m.status === 'read') byDay[day].delivered++
      if (m.status === 'read') byDay[day].read++
    }
    const totalSent = msgs.length
    const totalDelivered = msgs.filter((m: any) => m.status === 'delivered' || m.status === 'read').length
    const totalRead = msgs.filter((m: any) => m.status === 'read').length

    // ─── Conversas por atendente ──────────────────────────────────────────────
    const { data: convsByAgent } = await db
      .from('conversations')
      .select('assigned_to, users(name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .not('assigned_to', 'is', null)

    const agentMap: Record<string, { name: string; count: number }> = {}
    for (const conv of (convsByAgent || [])) {
      const id = conv.assigned_to
      if (!id) continue
      if (!agentMap[id]) agentMap[id] = { name: (conv as any).users?.name || 'Atendente', count: 0 }
      agentMap[id].count++
    }
    const byAgent = Object.values(agentMap).sort((a, b) => b.count - a.count).slice(0, 5)

    // ─── Tempo médio de primeira resposta (últimos 7 dias) ────────────────────
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { data: inboundMsgs } = await db
      .from('messages')
      .select('conversation_id, created_at, direction')
      .eq('tenant_id', tenantId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: true })

    const convTimings: Record<string, { firstInbound?: number; firstOutbound?: number }> = {}
    for (const m of (inboundMsgs || [])) {
      if (!convTimings[m.conversation_id]) convTimings[m.conversation_id] = {}
      const t = new Date(m.created_at).getTime()
      if (m.direction === 'inbound' && !convTimings[m.conversation_id].firstInbound) {
        convTimings[m.conversation_id].firstInbound = t
      }
      if (m.direction === 'outbound' && convTimings[m.conversation_id].firstInbound && !convTimings[m.conversation_id].firstOutbound) {
        convTimings[m.conversation_id].firstOutbound = t
      }
    }
    const responseTimes = Object.values(convTimings)
      .filter(t => t.firstInbound && t.firstOutbound && t.firstOutbound > t.firstInbound)
      .map(t => (t.firstOutbound! - t.firstInbound!) / 1000 / 60) // em minutos
    const avgResponseMinutes = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null

    // ─── Flows ativos hoje ────────────────────────────────────────────────────
    const { data: flowLogs } = await db
      .from('flow_logs')
      .select('flow_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'flow_executed')
      .gte('created_at', today.toISOString())

    const activeFlowsToday = new Set((flowLogs || []).map((f: any) => f.flow_id)).size
    const flowExecutionsToday = (flowLogs || []).length

    res.json(ok({
      totalSent, totalDelivered, totalRead,
      deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
      readRate: totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : 0,
      byDay,
      byAgent,
      avgResponseMinutes,
      activeFlowsToday,
      flowExecutionsToday,
    }))
  } catch (err) { next(err) }
})

// ─── Billing ──────────────────────────────────────────────────────────────────

router.post('/billing/subscribe', validate(subscribeSchema), async (req, res, next) => {
  try {
    const { planSlug, cpfCnpj } = req.body
    const { db } = await import('../lib/db')
    const { data: user } = await db.from('users').select('name, email').eq('id', req.auth.sub).single()
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return }
    const result = await tenantService.createSubscription(req.auth.tid, planSlug, user.email, user.name, cpfCnpj)
    res.json(ok(result))
  } catch (err) { next(err) }
})

router.get('/billing/plans', async (_req, res, next) => {
  try {
    const { db } = await import('../lib/db')
    const { data: plans } = await db
      .from('plans')
      .select('id, name, slug, price_monthly, message_limit, features')
      .neq('slug', 'trial')
      .order('price_monthly', { ascending: true })
    res.json(ok(plans || []))
  } catch (err) { next(err) }
})

router.delete('/billing/cancel', requireRole('owner'), async (req, res, next) => {
  try {
    await tenantService.cancelSubscription(req.auth.tid)
    res.json(ok({ message: 'Assinatura cancelada com sucesso' }))
  } catch (err) { next(err) }
})

// ─── Users ────────────────────────────────────────────────────────────────────

router.get('/users', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query)
    const result = await tenantService.listUsers(req.auth.tid, page, limit)
    res.json(ok(result.users, result.meta))
  } catch (err) { next(err) }
})

router.patch('/users/:userId/role', requireRole('owner'), validate(updateRoleSchema), async (req, res, next) => {
  try {
    await tenantService.updateUserRole(req.auth.tid, req.params.userId, req.body.role)
    res.json(ok({ message: 'Role updated' }))
  } catch (err) { next(err) }
})

router.delete('/users/:userId', requireRole('owner'), async (req, res, next) => {
  try {
    await tenantService.deactivateUser(req.auth.tid, req.params.userId)
    res.json(ok({ message: 'User deactivated' }))
  } catch (err) { next(err) }
})

export { asaasWebhookRouter }
export default router