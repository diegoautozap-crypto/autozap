import { Router } from 'express'
import { z } from 'zod'
import { tenantService } from '../services/tenant.service'
import { requireAuth, requireRole, validate, ok, paginationSchema, rateLimit, logger } from '@autozap/utils'
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
  settings: z.record(z.any()).optional(),
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

// ─── Google OAuth helper ─────────────────────────────────────────────────────
function getGoogleOAuth2Client() {
  const { google } = require('googleapis')
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI, // e.g. https://tenant-service.../tenant/integrations/google/callback
  )
}

// ─── Webhook do Asaas (público — sem auth) ────────────────────────────────────
const asaasWebhookRouter = Router()

asaasWebhookRouter.post('/billing/webhook/asaas', rateLimit({ max: 30 }), async (req, res) => {
  try {
    // Verifica token de autenticação do webhook Asaas (obrigatório)
    const asaasToken = process.env.ASAAS_WEBHOOK_TOKEN
    if (!asaasToken) { logger.error('ASAAS_WEBHOOK_TOKEN not configured'); res.status(500).json({ error: 'Server misconfigured' }); return }
    const provided = req.headers['asaas-access-token']
    if (!provided || provided !== asaasToken) { res.status(401).json({ error: 'Invalid webhook token' }); return }
    const { event, payment, subscription } = req.body
    await tenantService.processAsaasWebhook(event, { payment, subscription })
    res.json({ success: true })
  } catch (err) {
    logger.error('Asaas webhook error', { err })
    res.status(500).json({ success: false })
  }
})

// ─── Google OAuth callback (público — redirect do Google) ────────────────────
asaasWebhookRouter.get('/integrations/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query
    if (!code || !state) { res.status(400).send('Parâmetros inválidos'); return }

    // state = tenantId (passado no auth URL)
    const tenantId = state as string
    const oauth2Client = getGoogleOAuth2Client()
    const { tokens } = await oauth2Client.getToken(code as string)
    oauth2Client.setCredentials(tokens)

    // Get user email
    const { google } = require('googleapis')
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: profile } = await oauth2.userinfo.get()

    const { db } = await import('../lib/db')
    const { data: tenant } = await db.from('tenants').select('metadata').eq('id', tenantId).single()
    const metadata = tenant?.metadata || {}

    await db.from('tenants').update({
      metadata: {
        ...metadata,
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: tokens.expiry_date,
        google_email: profile.email,
      },
      updated_at: new Date(),
    }).eq('id', tenantId)

    // Redirect back to frontend settings
    const frontendUrl = process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:3000'
    res.redirect(`${frontendUrl}/dashboard/settings?google=connected`)
  } catch (err) {
    logger.error('Google OAuth callback error', { err })
    const frontendUrl = process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:3000'
    res.redirect(`${frontendUrl}/dashboard/settings?google=error`)
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

router.post('/webhook-token', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const crypto = require('crypto')
    const { db } = await import('../lib/db')
    const token = crypto.randomBytes(24).toString('hex')
    const { data, error } = await db.from('tenants').update({
      webhook_token: token,
      updated_at: new Date(),
    }).eq('id', req.auth.tid).select('webhook_token').single()
    if (error) throw error
    res.json(ok({ token: data.webhook_token }))
  } catch (err) { next(err) }
})

router.post('/ai-test', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { message, prompt, model } = req.body
    if (!message || !prompt) { res.status(400).json({ success: false, error: { message: 'message and prompt required' } }); return }
    const { db } = await import('../lib/db')
    const { data: tenant } = await db.from('tenants').select('metadata').eq('id', req.auth.tid).single()
    const apiKey = tenant?.metadata?.openai_api_key || process.env.OPENAI_API_KEY
    if (!apiKey) { res.status(400).json({ success: false, error: { message: 'OpenAI API key not configured' } }); return }
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: message }],
      max_tokens: 500,
    })
    res.json(ok({ reply: completion.choices[0]?.message?.content || '' }))
  } catch (err) { next(err) }
})

// ─── Google Calendar Integration ─────────────────────────────────────────────

router.get('/integrations/google/auth-url', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) { res.status(500).json({ error: 'Google OAuth not configured' }); return }
    const oauth2Client = getGoogleOAuth2Client()
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      state: req.auth.tid, // pass tenantId in state
    })
    res.json(ok({ url }))
  } catch (err) { next(err) }
})

router.delete('/integrations/google', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { db } = await import('../lib/db')
    const { data: tenant } = await db.from('tenants').select('metadata').eq('id', req.auth.tid).single()
    const metadata = { ...(tenant?.metadata || {}) }
    delete metadata.google_access_token
    delete metadata.google_refresh_token
    delete metadata.google_token_expiry
    delete metadata.google_email
    await db.from('tenants').update({ metadata, updated_at: new Date() }).eq('id', req.auth.tid)
    res.json(ok({ message: 'Google desconectado' }))
  } catch (err) { next(err) }
})

router.get('/integrations/google/calendars', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { db } = await import('../lib/db')
    const { data: tenant } = await db.from('tenants').select('metadata').eq('id', req.auth.tid).single()
    const meta = tenant?.metadata || {}
    if (!meta.google_access_token) { res.status(400).json({ error: 'Google não conectado' }); return }

    const oauth2Client = getGoogleOAuth2Client()
    oauth2Client.setCredentials({
      access_token: meta.google_access_token,
      refresh_token: meta.google_refresh_token,
    })

    // Handle token refresh
    oauth2Client.on('tokens', async (tokens: any) => {
      if (tokens.access_token) {
        await db.from('tenants').update({
          metadata: { ...meta, google_access_token: tokens.access_token, google_token_expiry: tokens.expiry_date },
          updated_at: new Date(),
        }).eq('id', req.auth.tid)
      }
    })

    const { google } = require('googleapis')
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
    const { data } = await calendar.calendarList.list()
    const calendars = (data.items || []).map((c: any) => ({
      id: c.id,
      name: c.summary,
      primary: c.primary || false,
    }))
    res.json(ok(calendars))
  } catch (err) { next(err) }
})

router.patch('/settings', requireRole('admin', 'owner'), validate(updateSettingsSchema), async (req, res, next) => {
  try {
    // Merge top-level fields + nested settings object
    const { settings: nested, ...topLevel } = req.body
    const merged = { ...topLevel, ...(nested || {}) }
    const tenant = await tenantService.updateSettings(req.auth.tid, merged)
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
    // Checa se precisa resetar (virou o mês)
    await tenantService.checkMessageLimit(req.auth.tid).catch(() => {})
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

    // Channels count (only active, not deleted/inactive)
    const { count: channelsCount } = await db
      .from('channels').select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.auth.tid)
      .neq('status', 'inactive')

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

    const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 7), 90)
    const since = new Date()
    since.setDate(since.getDate() - (days - 1))
    since.setHours(0, 0, 0, 0)

    const previousSince = new Date()
    previousSince.setDate(previousSince.getDate() - (days * 2 - 1))
    previousSince.setHours(0, 0, 0, 0)
    const previousEnd = new Date(since)

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
    for (let i = days - 1; i >= 0; i--) {
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

    // Previous period for comparison
    const { data: prevMessages } = await db
      .from('messages')
      .select('status')
      .eq('tenant_id', tenantId)
      .eq('direction', 'outbound')
      .not('campaign_id', 'is', null)
      .gte('created_at', previousSince.toISOString())
      .lt('created_at', previousEnd.toISOString())

    const prevMsgs = prevMessages || []
    const prevTotalSent = prevMsgs.length
    const prevTotalDelivered = prevMsgs.filter((m: any) => m.status === 'delivered' || m.status === 'read').length
    const prevTotalRead = prevMsgs.filter((m: any) => m.status === 'read').length

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

    // ─── Agent ranking (top agents by activity in last 7 days) ───────────────
    const { data: agentOutboundMsgs } = await db
      .from('messages')
      .select('conversation_id, created_at, direction')
      .eq('tenant_id', tenantId)
      .eq('direction', 'outbound')
      .is('campaign_id', null)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: true })

    const { data: agentInboundMsgs } = await db
      .from('messages')
      .select('conversation_id, created_at, direction')
      .eq('tenant_id', tenantId)
      .eq('direction', 'inbound')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: true })

    // Get all conversations with assigned agents
    const { data: allAssignedConvs } = await db
      .from('conversations')
      .select('id, assigned_to, status, users(name)')
      .eq('tenant_id', tenantId)
      .not('assigned_to', 'is', null)

    // Build per-agent ranking
    const rankingMap: Record<string, { name: string; messagesResponded: number; avgResponseMinutes: number | null; conversationsClosed: number; openConversations: number }> = {}

    // Map conversation_id -> assigned_to
    const convToAgent: Record<string, string> = {}
    const convToAgentName: Record<string, string> = {}
    for (const conv of (allAssignedConvs || [])) {
      convToAgent[conv.id] = conv.assigned_to
      convToAgentName[conv.id] = (conv as any).users?.name || 'Atendente'
      const agentId = conv.assigned_to
      if (!rankingMap[agentId]) {
        rankingMap[agentId] = { name: (conv as any).users?.name || 'Atendente', messagesResponded: 0, avgResponseMinutes: null, conversationsClosed: 0, openConversations: 0 }
      }
      if (conv.status === 'open') rankingMap[agentId].openConversations++
    }

    // Count closed conversations (last 7 days) per agent
    const { data: closedConvsAll } = await db
      .from('conversations')
      .select('assigned_to')
      .eq('tenant_id', tenantId)
      .eq('status', 'closed')
      .not('assigned_to', 'is', null)
      .gte('updated_at', sevenDaysAgo.toISOString())

    for (const conv of (closedConvsAll || [])) {
      if (rankingMap[conv.assigned_to]) {
        rankingMap[conv.assigned_to].conversationsClosed++
      }
    }

    // Count outbound messages per agent (non-campaign) and calculate avg response time
    const inboundByConv: Record<string, number[]> = {}
    for (const m of (agentInboundMsgs || [])) {
      if (!inboundByConv[m.conversation_id]) inboundByConv[m.conversation_id] = []
      inboundByConv[m.conversation_id].push(new Date(m.created_at).getTime())
    }

    const agentResponseTimes: Record<string, number[]> = {}
    for (const m of (agentOutboundMsgs || [])) {
      const agentId = convToAgent[m.conversation_id]
      if (!agentId) continue
      if (!rankingMap[agentId]) {
        rankingMap[agentId] = { name: convToAgentName[m.conversation_id] || 'Atendente', messagesResponded: 0, avgResponseMinutes: null, conversationsClosed: 0, openConversations: 0 }
      }
      rankingMap[agentId].messagesResponded++

      // Find closest inbound message before this outbound
      const inbounds = inboundByConv[m.conversation_id] || []
      const outTime = new Date(m.created_at).getTime()
      let closestInbound: number | null = null
      for (let i = inbounds.length - 1; i >= 0; i--) {
        if (inbounds[i] < outTime) { closestInbound = inbounds[i]; break }
      }
      if (closestInbound) {
        const diffMin = (outTime - closestInbound) / 1000 / 60
        if (diffMin > 0 && diffMin < 1440) {
          if (!agentResponseTimes[agentId]) agentResponseTimes[agentId] = []
          agentResponseTimes[agentId].push(diffMin)
        }
      }
    }

    for (const [agentId, times] of Object.entries(agentResponseTimes)) {
      if (rankingMap[agentId] && times.length > 0) {
        rankingMap[agentId].avgResponseMinutes = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      }
    }

    const agentRanking = Object.values(rankingMap)
      .sort((a, b) => b.messagesResponded - a.messagesResponded)
      .slice(0, 10)

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

    const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0
    const readRate = totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : 0
    const prevDeliveryRate = prevTotalSent > 0 ? Math.round((prevTotalDelivered / prevTotalSent) * 100) : 0
    const prevReadRate = prevTotalSent > 0 ? Math.round((prevTotalRead / prevTotalSent) * 100) : 0

    res.json(ok({
      totalSent, totalDelivered, totalRead,
      deliveryRate, readRate,
      byDay, byAgent, agentRanking,
      avgResponseMinutes: agentAvgResponseMinutes,
      activeFlowsToday, flowExecutionsToday,
      agentConversations: filterUserId ? agentConversations : null,
      agentClosedLast7d: filterUserId ? agentClosedLast7d : null,
      days,
      previous: { totalSent: prevTotalSent, deliveryRate: prevDeliveryRate, readRate: prevReadRate },
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