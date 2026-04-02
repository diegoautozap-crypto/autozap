import { Router } from 'express'
import { z } from 'zod'
import { tenantService } from '../services/tenant.service'
import { requireAuth, requireRole, validate } from '../middleware/tenant.middleware'
import { ok, paginationSchema, rateLimit } from '@autozap/utils'
import { PLAN_LIMITS } from '@autozap/types'

const router = Router()

// ─── SSRF protection ─────────────────────────────────────────────────────────
function validateWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', '::1', 'metadata.google', '10.', '172.16.', '192.168.']
    if (blocked.some(b => parsed.hostname.includes(b) || parsed.hostname.startsWith(b))) return false
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    return true
  } catch { return false }
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

const permissionsSchema = z.object({
  permissions: z.record(z.array(z.string())),
})

const webhookSchema = z.object({
  url: z.string().url().refine(u => u.startsWith('http://') || u.startsWith('https://'), 'URL must use http or https'),
  events: z.array(z.string()).min(1),
  secret: z.string().nullable().optional(),
})

const webhookUpdateSchema = z.object({
  active: z.boolean().optional(),
  url: z.string().url().refine(u => u.startsWith('http://') || u.startsWith('https://'), 'URL must use http or https').optional(),
  events: z.array(z.string()).optional(),
  secret: z.string().nullable().optional(),
})

// ─── Webhook do Asaas (público — sem auth) ────────────────────────────────────
const asaasWebhookRouter = Router()

asaasWebhookRouter.post('/billing/webhook/asaas', rateLimit({ max: 30 }), async (req, res) => {
  try {
    // Verifica token de autenticação do webhook Asaas
    const asaasToken = process.env.ASAAS_WEBHOOK_TOKEN
    if (asaasToken) {
      const provided = req.headers['asaas-access-token']
      if (provided !== asaasToken) { res.status(401).json({ error: 'Invalid webhook token' }); return }
    }
    const { event, payment, subscription } = req.body
    await tenantService.processAsaasWebhook(event, { payment, subscription })
    res.json({ success: true })
  } catch (err) {
    console.error('Asaas webhook error:', err)
    res.status(500).json({ success: false })
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

router.get('/usage', async (req, res, next) => {
  try {
    const tenant = await tenantService.getTenant(req.auth.tid)
    const planLimits = PLAN_LIMITS[tenant.planSlug as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.pending
    const limit = planLimits.messages
    res.json(ok({
      sent: tenant.messagesSentThisPeriod,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - tenant.messagesSentThisPeriod),
      percentUsed: limit === null ? 0 : Math.round((tenant.messagesSentThisPeriod / limit) * 100),
    }))
  } catch (err) { next(err) }
})

router.get('/limits', async (req, res, next) => {
  try {
    const { db } = await import('../lib/db')
    const tenant = await tenantService.getTenant(req.auth.tid)
    const planLimits = PLAN_LIMITS[tenant.planSlug as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.pending

    // Current month boundaries
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

    // Messages sent this period (already tracked on tenant)
    const messagesSent = tenant.messagesSentThisPeriod ?? 0

    // Channels count
    const { count: channelsCount } = await db
      .from('channels').select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.auth.tid)

    // Members count
    const { count: membersCount } = await db
      .from('users').select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.auth.tid)
      .eq('is_active', true)

    // Active flows count
    const { count: flowsCount } = await db
      .from('flows').select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.auth.tid)
      .eq('is_active', true)

    // Contacts count
    const { count: contactsCount } = await db
      .from('contacts').select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.auth.tid)

    // Campaigns sent this month
    const { count: campaignsCount } = await db
      .from('campaigns').select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.auth.tid)
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd)

    // AI responses this month (count flow_logs with ai node executions)
    const { count: aiCount } = await db
      .from('flow_logs').select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.auth.tid)
      .eq('status', 'ai_response')
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd)

    res.json(ok({
      plan: tenant.planSlug,
      limits: planLimits,
      usage: {
        messages: messagesSent,
        channels: channelsCount ?? 0,
        members: membersCount ?? 0,
        flows: flowsCount ?? 0,
        contacts: contactsCount ?? 0,
        campaigns: campaignsCount ?? 0,
        aiResponses: aiCount ?? 0,
      },
    }))
  } catch (err) { next(err) }
})

// ─── Permissões por role ───────────────────────────────────────────────────────

router.get('/permissions', async (req, res, next) => {
  try {
    const { db } = await import('../lib/db')
    const { data } = await db
      .from('tenants')
      .select('role_permissions')
      .eq('id', req.auth.tid)
      .single()

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

// ─── Webhooks ─────────────────────────────────────────────────────────────────

router.get('/webhooks', async (req, res, next) => {
  try {
    const { db } = await import('../lib/db')
    const { data, error } = await db
      .from('webhook_configs')
      .select('id, url, events, active, created_at')
      .eq('tenant_id', req.auth.tid)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.post('/webhooks', validate(webhookSchema), async (req, res, next) => {
  try {
    const { db } = await import('../lib/db')
    const { url, events, secret } = req.body
    if (!validateWebhookUrl(url)) { res.status(400).json({ error: 'Webhook URL is not allowed (blocked destination)' }); return }
    const { data, error } = await db
      .from('webhook_configs')
      .insert({ tenant_id: req.auth.tid, url, events, secret: secret || null, active: true })
      .select()
      .single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/webhooks/:id', validate(webhookUpdateSchema), async (req, res, next) => {
  try {
    const { db } = await import('../lib/db')
    if (req.body.url && !validateWebhookUrl(req.body.url)) { res.status(400).json({ error: 'Webhook URL is not allowed (blocked destination)' }); return }
    const { data, error } = await db
      .from('webhook_configs')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select()
      .single()
    if (error) throw error
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/webhooks/:id', async (req, res, next) => {
  try {
    const { db } = await import('../lib/db')
    const { error } = await db
      .from('webhook_configs')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
    if (error) throw error
    res.json(ok({ message: 'Webhook removed' }))
  } catch (err) { next(err) }
})

router.post('/webhooks/:id/test', async (req, res, next) => {
  try {
    const { db } = await import('../lib/db')
    const { data: wh, error } = await db
      .from('webhook_configs')
      .select('url, secret')
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .single()
    if (error || !wh) { res.status(404).json({ error: 'Webhook not found' }); return }
    if (!validateWebhookUrl(wh.url)) { res.status(400).json({ error: 'Webhook URL is not allowed (blocked destination)' }); return }

    const body = JSON.stringify({
      event: 'test',
      timestamp: new Date().toISOString(),
      tenant_id: req.auth.tid,
      data: { message: 'Este é um evento de teste do AutoZap!' },
    })

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (wh.secret) {
      const crypto = await import('crypto')
      const sig = crypto.createHmac('sha256', wh.secret).update(body).digest('hex')
      headers['X-AutoZap-Signature'] = `sha256=${sig}`
    }

    const response = await fetch(wh.url, { method: 'POST', headers, body })
    if (!response.ok) {
      res.status(400).json({ error: `Webhook retornou status ${response.status}` }); return
    }
    res.json(ok({ message: 'Evento de teste enviado com sucesso!' }))
  } catch (err) { next(err) }
})

// ─── Analytics ────────────────────────────────────────────────────────────────

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

    let agentConversations = 0
    let agentClosedLast7d = 0
    let agentAvgResponseMinutes: number | null = null

    if (filterUserId) {
      const { count: openCount } = await db
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('assigned_to', filterUserId)
        .eq('status', 'open')
      agentConversations = openCount || 0

      const { count: closedCount } = await db
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('assigned_to', filterUserId)
        .eq('status', 'closed')
        .gte('updated_at', sevenDaysAgo.toISOString())
      agentClosedLast7d = closedCount || 0

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

        const responsePairs: number[] = []
        const lastInbound: Record<string, number> = {}

        for (const m of (agentMsgs || [])) {
          const t = new Date(m.created_at).getTime()
          if (m.direction === 'inbound') {
            lastInbound[m.conversation_id] = t
          } else if (m.direction === 'outbound' && lastInbound[m.conversation_id]) {
            const diff = (t - lastInbound[m.conversation_id]) / 1000 / 60
            if (diff > 0 && diff < 1440) responsePairs.push(diff)
            delete lastInbound[m.conversation_id]
          }
        }
        agentAvgResponseMinutes = responsePairs.length > 0
          ? Math.round(responsePairs.reduce((a, b) => a + b, 0) / responsePairs.length)
          : null
      }
    } else {
      const { data: inboundMsgs } = await db
        .from('messages')
        .select('conversation_id, created_at, direction')
        .eq('tenant_id', tenantId)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: true })

      const allPairs: number[] = []
      const lastInboundGeneral: Record<string, number> = {}
      for (const m of (inboundMsgs || [])) {
        const t = new Date(m.created_at).getTime()
        if (m.direction === 'inbound') {
          lastInboundGeneral[m.conversation_id] = t
        } else if (m.direction === 'outbound' && lastInboundGeneral[m.conversation_id]) {
          const diff = (t - lastInboundGeneral[m.conversation_id]) / 1000 / 60
          if (diff > 0 && diff < 1440) allPairs.push(diff)
          delete lastInboundGeneral[m.conversation_id]
        }
      }
      agentAvgResponseMinutes = allPairs.length > 0
        ? Math.round(allPairs.reduce((a, b) => a + b, 0) / allPairs.length)
        : null
    }

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
      byDay, byAgent,
      avgResponseMinutes: agentAvgResponseMinutes,
      activeFlowsToday, flowExecutionsToday,
      agentConversations: filterUserId ? agentConversations : null,
      agentClosedLast7d: filterUserId ? agentClosedLast7d : null,
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
      .neq('slug', 'pending')
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