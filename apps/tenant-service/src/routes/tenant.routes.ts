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

// ─── Webhook do Asaas (público — sem auth) ────────────────────────────────────
// IMPORTANTE: essa rota deve ficar ANTES do router.use(requireAuth)
const asaasWebhookRouter = Router()

asaasWebhookRouter.post('/billing/webhook/asaas', async (req, res) => {
  try {
    const { event, payment, subscription } = req.body
    await tenantService.processAsaasWebhook(event, { payment, subscription })
    res.json({ success: true })
  } catch (err) {
    console.error('Asaas webhook error:', err)
    res.json({ success: true }) // sempre retorna 200 para o Asaas não retentar
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

// ─── Billing ──────────────────────────────────────────────────────────────────

// POST /tenant/billing/subscribe — cria assinatura no Asaas e retorna link de pagamento
router.post('/billing/subscribe', validate(subscribeSchema), async (req, res, next) => {
  try {
    const { planSlug, cpfCnpj } = req.body

    // Busca dados do usuário logado
    const { db } = await import('../lib/db')
    const { data: user } = await db
      .from('users')
      .select('name, email')
      .eq('id', req.auth.sub)
      .single()

    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found' } })
      return
    }

    const result = await tenantService.createSubscription(
      req.auth.tid,
      planSlug,
      user.email,
      user.name,
      cpfCnpj,
    )

    res.json(ok(result))
  } catch (err) { next(err) }
})

// GET /tenant/billing/plans — lista planos com preços do banco
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

// DELETE /tenant/billing/cancel — cancela assinatura
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