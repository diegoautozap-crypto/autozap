import { Router } from 'express'
import { z } from 'zod'
import { requireSuperAdmin } from '../middleware/tenant.middleware'
import { requireAuth, ok, db, logger, validate, generateId } from '@autozap/utils'

const router = Router()
router.use(requireAuth)
router.use(requireSuperAdmin)

// Audit log for admin actions
async function auditLog(adminId: string, action: string, targetId: string, details?: Record<string, unknown>) {
  const entry = { admin_id: adminId, action, target_id: targetId, details: details || {}, ip: '', timestamp: new Date().toISOString() }
  logger.warn('[AUDIT]', entry)
  try {
    await db.from('audit_logs').insert({ id: require('crypto').randomUUID(), ...entry, created_at: new Date() })
  } catch { /* table may not exist yet — log is the primary record */ }
}

// GET /admin/tenants
router.get('/tenants', async (req, res, next) => {
  try {
    const { data: tenants } = await db
      .from('tenants')
      .select('id, name, slug, plan_slug, is_active, is_blocked, blocked_reason, messages_sent_this_period, created_at')
      .order('created_at', { ascending: false })
      .limit(500)

    const tenantIds = (tenants || []).map((t: any) => t.id)

    const [ownersRes, channelsRes, contactsRes, campaignsRes, subsRes] = await Promise.all([
      db.from('users').select('tenant_id, email, name, last_login_at').in('tenant_id', tenantIds).eq('role', 'owner'),
      db.from('channels').select('tenant_id').in('tenant_id', tenantIds).eq('status', 'active'),
      db.from('contacts').select('tenant_id').in('tenant_id', tenantIds),
      db.from('campaigns').select('tenant_id, created_at, status').in('tenant_id', tenantIds).order('created_at', { ascending: false }),
      db.from('subscriptions').select('tenant_id, status').in('tenant_id', tenantIds).in('status', ['active', 'past_due', 'pending']),
    ])

    const ownerMap = Object.fromEntries((ownersRes.data || []).map((o: any) => [o.tenant_id, o]))
    const channelCount = (channelsRes.data || []).reduce((acc: any, c: any) => { acc[c.tenant_id] = (acc[c.tenant_id] || 0) + 1; return acc }, {})
    const contactCount = (contactsRes.data || []).reduce((acc: any, c: any) => { acc[c.tenant_id] = (acc[c.tenant_id] || 0) + 1; return acc }, {})
    const lastCampaign = (campaignsRes.data || []).reduce((acc: any, c: any) => { if (!acc[c.tenant_id]) acc[c.tenant_id] = c; return acc }, {})
    const subMap = Object.fromEntries((subsRes.data || []).map((s: any) => [s.tenant_id, s]))

    const PLAN_PRICES: Record<string, number> = { starter: 97, pro: 197, enterprise: 397, unlimited: 697 }

    const result = (tenants || []).map((t: any) => ({
      ...t,
      owner: ownerMap[t.id] || null,
      channelCount: channelCount[t.id] || 0,
      contactCount: contactCount[t.id] || 0,
      lastCampaign: lastCampaign[t.id] || null,
      subscription: subMap[t.id] || null,
      mrr: t.plan_slug !== 'pending' ? (PLAN_PRICES[t.plan_slug] || 0) : 0,
    }))

    res.json(ok(result))
  } catch (err) { next(err) }
})

// GET /admin/stats
router.get('/stats', async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [totalRes, newTodayRes, newWeekRes, trialRes, msgsRes, subsRes] = await Promise.all([
      db.from('tenants').select('id', { count: 'exact', head: true }).eq('is_active', true),
      db.from('tenants').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
      db.from('tenants').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
      db.from('tenants').select('id', { count: 'exact', head: true }).eq('plan_slug', 'pending'),
      db.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()).eq('direction', 'outbound'),
      db.from('subscriptions').select('tenant_id').eq('status', 'active'),
    ])

    const { data: tenantPlans } = await db
      .from('tenants')
      .select('plan_slug')
      .in('id', (subsRes.data || []).map((s: any) => s.tenant_id))

    const PLAN_PRICES: Record<string, number> = { starter: 97, pro: 197, enterprise: 397, unlimited: 697 }
    const mrr = (tenantPlans || []).reduce((acc: number, t: any) => acc + (PLAN_PRICES[t.plan_slug] || 0), 0)

    res.json(ok({
      totalTenants: totalRes.count || 0,
      newToday: newTodayRes.count || 0,
      newThisWeek: newWeekRes.count || 0,
      pendingCount: trialRes.count || 0,
      messagesTODAY: msgsRes.count || 0,
      activePaying: (subsRes.data || []).length,
      mrr,
    }))
  } catch (err) { next(err) }
})

// PATCH /admin/tenants/:id/block
router.patch('/tenants/:id/block', async (req, res, next) => {
  try {
    const { reason } = req.body
    await db.from('tenants').update({ is_blocked: true, blocked_reason: reason || 'Bloqueado pelo admin', is_active: false }).eq('id', req.params.id)
    await auditLog(req.auth.sub, 'tenant.block', req.params.id, { reason })
    res.json(ok({ message: 'Tenant bloqueado' }))
  } catch (err) { next(err) }
})

// PATCH /admin/tenants/:id/unblock
router.patch('/tenants/:id/unblock', async (req, res, next) => {
  try {
    await db.from('tenants').update({ is_blocked: false, blocked_reason: null, is_active: true }).eq('id', req.params.id)
    await auditLog(req.auth.sub, 'tenant.unblock', req.params.id)
    res.json(ok({ message: 'Tenant desbloqueado' }))
  } catch (err) { next(err) }
})

// PATCH /admin/tenants/:id/plan
router.patch('/tenants/:id/plan', async (req, res, next) => {
  try {
    const { planSlug } = req.body
    await db.from('tenants').update({ plan_slug: planSlug }).eq('id', req.params.id)
    await auditLog(req.auth.sub, 'tenant.plan_change', req.params.id, { planSlug })
    res.json(ok({ message: 'Plano atualizado' }))
  } catch (err) { next(err) }
})

// POST /admin/tenants/:id/impersonate
router.post('/tenants/:id/impersonate', async (req, res, next) => {
  try {
    const { data: owner } = await db
      .from('users')
      .select('id, email, role, tenant_id')
      .eq('tenant_id', req.params.id)
      .eq('role', 'owner')
      .single()

    if (!owner) {
      res.status(404).json({ success: false, error: { message: 'Owner não encontrado' } })
      return
    }

    const { signAccessToken } = await import('../lib/jwt')
    const token = signAccessToken({ sub: owner.id, tid: owner.tenant_id, role: owner.role as any, email: owner.email })

    await auditLog(req.auth.sub, 'tenant.impersonate', req.params.id, { targetUserId: owner.id })

    // Set httpOnly cookie for impersonation
    const isProduction = process.env.NODE_ENV === 'production'
    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000, // 1 hour
      path: '/',
    })

    res.json(ok({ accessToken: token, tenantId: req.params.id }))
  } catch (err) { next(err) }
})

// ─── PATCH /admin/tenants/:id/activate — Ativação manual de plano ─────────────
const activateSchema = z.object({
  planSlug: z.enum(['starter', 'pro', 'enterprise', 'unlimited']),
  sendEmail: z.boolean().optional().default(true),
  notes: z.string().max(500).optional(),
})

router.patch('/tenants/:id/activate', validate(activateSchema), async (req, res, next) => {
  try {
    const { planSlug, sendEmail, notes } = req.body
    const tenantId = req.params.id

    // 1. Atualiza tenant: plano + reseta contadores
    await db.from('tenants').update({
      plan_slug: planSlug,
      messages_sent_this_period: 0,
      current_period_start: new Date(),
      is_active: true,
      is_blocked: false,
      blocked_reason: null,
    }).eq('id', tenantId)

    // 2. Verifica email do owner
    await db.from('users').update({ email_verified: true }).eq('tenant_id', tenantId).eq('role', 'owner')

    // 3. Cria/atualiza subscription
    const { data: plan } = await db.from('plans').select('id').eq('slug', planSlug).single()
    if (plan) {
      const { data: existingSub } = await db.from('subscriptions').select('id').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1).single()
      const subData = {
        tenant_id: tenantId,
        plan_id: plan.id,
        status: 'active',
        payment_method: 'manual',
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        updated_at: new Date(),
      }
      if (existingSub) {
        await db.from('subscriptions').update(subData).eq('id', existingSub.id)
      } else {
        await db.from('subscriptions').insert({ id: generateId(), ...subData })
      }
    }

    // 4. Envia email de confirmação (opcional)
    if (sendEmail) {
      try {
        const { data: owner } = await db.from('users').select('email, name').eq('tenant_id', tenantId).eq('role', 'owner').single()
        if (owner?.email) {
          const { Resend } = require('resend')
          const resend = new Resend(process.env.RESEND_API_KEY)
          const PLAN_NAMES: Record<string, string> = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise', unlimited: 'Unlimited' }
          await resend.emails.send({
            from: process.env.RESEND_FROM || 'AutoZap <noreply@useautozap.app>',
            to: owner.email,
            subject: `✅ Plano ${PLAN_NAMES[planSlug]} ativado — AutoZap`,
            html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px"><h1 style="color:#16a34a;font-size:24px">Plano ativado!</h1><p>Olá, ${owner.name || 'cliente'}!</p><p>Seu plano <strong>${PLAN_NAMES[planSlug]}</strong> foi ativado com sucesso. Você já pode usar todas as funcionalidades.</p><a href="https://useautozap.app/dashboard" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Acessar AutoZap</a></div>`,
          })
        }
      } catch (emailErr) { logger.error('Failed to send activation email', { tenantId, emailErr }) }
    }

    await auditLog(req.auth.sub, 'tenant.activate', tenantId, { planSlug, sendEmail, notes })
    res.json(ok({ message: `Plano ${planSlug} ativado manualmente` }))
  } catch (err) { next(err) }
})

// ─── PATCH /admin/tenants/:id/settings — Editar tenant ───────────────────────
router.patch('/tenants/:id/settings', async (req, res, next) => {
  try {
    const update: any = { updated_at: new Date() }
    if (req.body.name !== undefined) update.name = req.body.name
    if (req.body.settings !== undefined) {
      const { data: current } = await db.from('tenants').select('settings').eq('id', req.params.id).single()
      update.settings = { ...(current?.settings || {}), ...req.body.settings }
    }
    await db.from('tenants').update(update).eq('id', req.params.id)
    await auditLog(req.auth.sub, 'tenant.settings_update', req.params.id, { fields: Object.keys(update) })
    res.json(ok({ message: 'Tenant atualizado' }))
  } catch (err) { next(err) }
})

// ─── GET /admin/tenants/:id/users — Membros de um tenant ────────────────────
router.get('/tenants/:id/users', async (req, res, next) => {
  try {
    const { data, error } = await db.from('users')
      .select('id, name, email, role, is_active, email_verified, last_login_at, created_at')
      .eq('tenant_id', req.params.id)
      .order('created_at', { ascending: true })
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

// ─── GET /admin/tenants/:id/stats — Stats detalhados ─────────────────────────
router.get('/tenants/:id/stats', async (req, res, next) => {
  try {
    const tid = req.params.id
    const [msgsRes, flowsRes, convsRes, contactsRes, campaignsRes, aiRes] = await Promise.all([
      db.from('messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
      db.from('flows').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('is_active', true),
      db.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'open'),
      db.from('contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
      db.from('campaigns').select('id', { count: 'exact', head: true }).eq('tenant_id', tid),
      db.from('flow_logs').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('status', 'ai_response'),
    ])
    res.json(ok({
      messages: msgsRes.count || 0,
      activeFlows: flowsRes.count || 0,
      openConversations: convsRes.count || 0,
      contacts: contactsRes.count || 0,
      campaigns: campaignsRes.count || 0,
      aiResponses: aiRes.count || 0,
    }))
  } catch (err) { next(err) }
})

// ─── GET /admin/audit-logs — Logs de auditoria ──────────────────────────────
router.get('/audit-logs', async (req, res, next) => {
  try {
    const { action, targetId, limit: qLimit, offset: qOffset } = req.query as any
    let query = db.from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(qLimit) || 50)
      .range(Number(qOffset) || 0, (Number(qOffset) || 0) + (Number(qLimit) || 50) - 1)
    if (action) query = query.eq('action', action)
    if (targetId) query = query.eq('target_id', targetId)
    const { data, error } = await query
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

// ─── POST /admin/tenants/:id/reset-usage — Resetar contadores ───────────────
router.post('/tenants/:id/reset-usage', async (req, res, next) => {
  try {
    await db.from('tenants').update({ messages_sent_this_period: 0, current_period_start: new Date() }).eq('id', req.params.id)
    await auditLog(req.auth.sub, 'tenant.reset_usage', req.params.id)
    res.json(ok({ message: 'Contadores resetados' }))
  } catch (err) { next(err) }
})

// ─── DELETE /admin/tenants/:id — Soft delete ─────────────────────────────────
router.delete('/tenants/:id', async (req, res, next) => {
  try {
    await db.from('tenants').update({ is_active: false, is_blocked: true, blocked_reason: 'Deletado pelo admin' }).eq('id', req.params.id)
    await db.from('users').update({ is_active: false }).eq('tenant_id', req.params.id)
    await auditLog(req.auth.sub, 'tenant.delete', req.params.id)
    res.json(ok({ message: 'Tenant desativado' }))
  } catch (err) { next(err) }
})

export default router