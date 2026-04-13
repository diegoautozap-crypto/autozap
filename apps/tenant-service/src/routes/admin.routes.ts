import { Router } from 'express'
import { requireSuperAdmin } from '../middleware/tenant.middleware'
import { requireAuth, ok, db, logger } from '@autozap/utils'

const router = Router()
router.use(requireAuth)
router.use(requireSuperAdmin)

// GET /admin/tenants
router.get('/tenants', async (req, res, next) => {
  try {
    const { data: tenants } = await db
      .from('tenants')
      .select('id, name, slug, plan_slug, is_active, is_blocked, blocked_reason, messages_sent_this_period, created_at')
      .order('created_at', { ascending: false })

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
    logger.info('Tenant blocked', { tenantId: req.params.id })
    res.json(ok({ message: 'Tenant bloqueado' }))
  } catch (err) { next(err) }
})

// PATCH /admin/tenants/:id/unblock
router.patch('/tenants/:id/unblock', async (req, res, next) => {
  try {
    await db.from('tenants').update({ is_blocked: false, blocked_reason: null, is_active: true }).eq('id', req.params.id)
    logger.info('Tenant unblocked', { tenantId: req.params.id })
    res.json(ok({ message: 'Tenant desbloqueado' }))
  } catch (err) { next(err) }
})

// PATCH /admin/tenants/:id/plan
router.patch('/tenants/:id/plan', async (req, res, next) => {
  try {
    const { planSlug } = req.body
    await db.from('tenants').update({ plan_slug: planSlug }).eq('id', req.params.id)
    logger.info('Tenant plan changed', { tenantId: req.params.id, planSlug })
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

    logger.info('Admin impersonating tenant', { adminId: req.auth.sub, tenantId: req.params.id })

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

export default router