import { Router } from 'express'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { authService } from '../services/auth.service'
import { requireAuth, validate, requireRole, ok, registerSchema, loginSchema, passwordSchema, AppError, generateId, db, logger } from '@autozap/utils'
import { PLAN_LIMITS, type PlanSlug } from '@autozap/types'
import { hashPassword } from '../lib/jwt'
import { sendTeamInviteEmail } from '../lib/email'

const router = Router()

// ─── Schemas ──────────────────────────────────────────────────────────────────

const refreshSchema     = z.object({ refreshToken: z.string().min(1) })
const forgotSchema      = z.object({ email: z.string().email() })
const resetSchema       = z.object({ token: z.string().min(1), password: passwordSchema })
const verifyEmailSchema = z.object({ token: z.string().min(1) })
const totpCodeSchema    = z.object({ code: z.string().length(6) })
const confirm2FASchema  = z.object({ code: z.string().length(6) })

const inviteSchema = z.object({
  name:  z.string().min(2).max(100),
  email: z.string().email(),
  role:  z.enum(['admin', 'supervisor', 'agent']),
  password: z.string().min(6).max(100),
})

const updateMemberSchema = z.object({
  name:      z.string().min(2).max(100).optional(),
  role:      z.enum(['admin', 'supervisor', 'agent']).optional(),
  is_active: z.boolean().optional(),
})

const userPermissionsSchema = z.object({
  allowed_pages:        z.array(z.string()).optional(),
  editable_pages:       z.array(z.string()).optional(),
  allowed_channels:     z.array(z.string().uuid()).optional(),
  campaign_access:      z.enum(['none', 'view', 'create', 'manage']).optional(),
  conversation_access:  z.enum(['all', 'assigned']).optional(),
})

// ─── Public Routes ────────────────────────────────────────────────────────────

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try { res.status(201).json(ok(await authService.register(req.body))) } catch (err) { next(err) }
})

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.login({ ...req.body, userAgent: req.headers['user-agent'], ipAddress: req.ip })
    if (result.requiresTwoFactor) { res.status(200).json(ok({ requiresTwoFactor: true })); return }
    res.json(ok(result.tokens))
  } catch (err) { next(err) }
})

router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try { res.json(ok(await authService.refresh(req.body.refreshToken, req.ip))) } catch (err) { next(err) }
})

router.post('/logout', validate(refreshSchema), async (req, res, next) => {
  try { await authService.logout(req.body.refreshToken); res.json(ok({ message: 'Logged out' })) } catch (err) { next(err) }
})

router.post('/forgot-password', validate(forgotSchema), async (req, res, next) => {
  try { await authService.forgotPassword(req.body.email); res.json(ok({ message: 'If the email exists, a reset link was sent' })) } catch (err) { next(err) }
})

router.post('/reset-password', validate(resetSchema), async (req, res, next) => {
  try { await authService.resetPassword(req.body.token, req.body.password); res.json(ok({ message: 'Password reset successfully' })) } catch (err) { next(err) }
})

router.post('/verify-email', validate(verifyEmailSchema), async (req, res, next) => {
  try { await authService.verifyEmail(req.body.token); res.json(ok({ message: 'Email verified successfully' })) } catch (err) { next(err) }
})

router.post('/resend-verification', validate(forgotSchema), async (req, res, next) => {
  try { await authService.resendVerificationEmail(req.body.email); res.json(ok({ message: 'If the email exists and is unverified, a new link was sent' })) } catch (err) { next(err) }
})

// ─── Protected Routes ─────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { data: perms } = await db
      .from('user_permissions')
      .select('allowed_pages, editable_pages, allowed_channels, campaign_access, conversation_access')
      .eq('user_id', req.auth.sub)
      .eq('tenant_id', req.auth.tid)
      .maybeSingle()

    res.json(ok({
      userId: req.auth.sub,
      tenantId: req.auth.tid,
      role: req.auth.role,
      email: req.auth.email,
      permissions: perms || null,
    }))
  } catch (err) { next(err) }
})

router.post('/logout-all', requireAuth, async (req, res, next) => {
  try { await authService.logoutAllSessions(req.auth.sub); res.json(ok({ message: 'All sessions revoked' })) } catch (err) { next(err) }
})

// ─── 2FA ──────────────────────────────────────────────────────────────────────

router.post('/2fa/setup', requireAuth, async (req, res, next) => {
  try { res.json(ok(await authService.setup2FA(req.auth.sub))) } catch (err) { next(err) }
})

router.post('/2fa/confirm', requireAuth, validate(confirm2FASchema), async (req, res, next) => {
  try { await authService.confirm2FA(req.auth.sub, req.body.code); res.json(ok({ message: '2FA enabled successfully' })) } catch (err) { next(err) }
})

router.post('/2fa/disable', requireAuth, validate(totpCodeSchema), async (req, res, next) => {
  try { await authService.disable2FA(req.auth.sub, req.body.code); res.json(ok({ message: '2FA disabled' })) } catch (err) { next(err) }
})

// ─── Team Management ──────────────────────────────────────────────────────────

router.get('/team', requireAuth, requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('users')
      .select(`
        id, name, email, role, is_active, created_at, last_login_at,
        user_permissions (allowed_pages, editable_pages, allowed_channels, campaign_access, conversation_access)
      `)
      .eq('tenant_id', req.auth.tid)
      .neq('id', req.auth.sub)
      .order('created_at', { ascending: true })

    if (error) {
      logger.error('DB operation failed', { error: error.message })
      throw new AppError('DB_ERROR', 'Database operation failed', 500)
    }

    const members = (data || []).map((m: any) => ({
      ...m,
      permissions: Array.isArray(m.user_permissions)
        ? m.user_permissions[0] || null
        : m.user_permissions || null,
      user_permissions: undefined,
    }))

    res.json(ok(members))
  } catch (err) { next(err) }
})

router.post('/team/invite', requireAuth, requireRole('admin', 'owner'), validate(inviteSchema), async (req, res, next) => {
  try {
    const { name, email, role, password } = req.body

    // Check member limit
    const { data: tenantData } = await db.from('tenants').select('plan_slug').eq('id', req.auth.tid).single()
    const planSlug = (tenantData?.plan_slug || 'pending') as PlanSlug
    const planLimits = PLAN_LIMITS[planSlug] ?? PLAN_LIMITS.pending
    const { count: currentMembers } = await db
      .from('users').select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.auth.tid)
      .eq('is_active', true)
    if (planLimits.members > 0 && (currentMembers ?? 0) >= planLimits.members) {
      throw new AppError('PLAN_LIMIT', `Limite de ${planLimits.members} membros atingido no plano ${planSlug}. Faça upgrade para adicionar mais.`, 403)
    }

    const { data: existing } = await db
      .from('users').select('id').eq('email', email.toLowerCase()).maybeSingle()
    if (existing) throw new AppError('CONFLICT', 'Este email já possui uma conta na plataforma. Peça para a pessoa acessar com suas credenciais existentes.', 409)

    const passwordHash = await hashPassword(password)
    const userId = generateId()

    const { error } = await db.from('users').insert({
      id: userId, tenant_id: req.auth.tid, name,
      email: email.toLowerCase(), password_hash: passwordHash,
      role, is_active: true, email_verified: true,
    })
    if (error) {
      logger.error('DB operation failed', { error: error.message })
      throw new AppError('DB_ERROR', 'Database operation failed', 500)
    }

    const defaultPages = role === 'agent'
      ? ['/dashboard/inbox']
      : ['/dashboard', '/dashboard/campaigns', '/dashboard/templates', '/dashboard/contacts', '/dashboard/inbox', '/dashboard/pipeline']

    await db.from('user_permissions').insert({
      user_id: userId,
      tenant_id: req.auth.tid,
      allowed_pages: defaultPages,
      allowed_channels: [],
      campaign_access: role === 'supervisor' ? 'view' : 'none',
      conversation_access: role === 'supervisor' ? 'all' : 'assigned',
    })

    const { data: tenant } = await db.from('tenants').select('name').eq('id', req.auth.tid).single()
    sendTeamInviteEmail({ to: email, name, tenantName: tenant?.name || 'sua empresa', tempPassword: '(definida pelo administrador)' })
      .catch(err => logger.error('Failed to send team invite email', { err }))

    res.status(201).json(ok({ id: userId, name, email, role }))
  } catch (err) { next(err) }
})

router.patch('/team/:id', requireAuth, requireRole('admin', 'owner'), validate(updateMemberSchema), async (req, res, next) => {
  try {
    const { data: member } = await db
      .from('users').select('id, role').eq('id', req.params.id).eq('tenant_id', req.auth.tid).maybeSingle()
    if (!member) throw new AppError('NOT_FOUND', 'Membro não encontrado', 404)
    if (member.role === 'owner') throw new AppError('FORBIDDEN', 'Não é possível alterar o dono da conta', 403)

    const update: any = { updated_at: new Date() }
    if (req.body.name !== undefined) update.name = req.body.name
    if (req.body.role !== undefined) update.role = req.body.role
    if (req.body.is_active !== undefined) update.is_active = req.body.is_active

    const { data, error } = await db
      .from('users').update(update).eq('id', req.params.id).eq('tenant_id', req.auth.tid)
      .select('id, name, email, role, is_active').single()
    if (error) {
      logger.error('DB operation failed', { error: error.message })
      throw new AppError('DB_ERROR', 'Database operation failed', 500)
    }

    if (req.body.role !== undefined && req.body.role !== member.role) {
      const newRole = req.body.role
      const defaultPages = newRole === 'agent'
        ? ['/dashboard/inbox']
        : newRole === 'supervisor'
        ? ['/dashboard', '/dashboard/campaigns', '/dashboard/templates', '/dashboard/contacts', '/dashboard/inbox', '/dashboard/pipeline']
        : []

      if (defaultPages.length > 0) {
        await db.from('user_permissions').upsert({
          user_id: req.params.id,
          tenant_id: req.auth.tid,
          allowed_pages: defaultPages,
          allowed_channels: [],
          campaign_access: newRole === 'supervisor' ? 'view' : 'none',
          conversation_access: newRole === 'supervisor' ? 'all' : 'assigned',
          updated_at: new Date(),
        }, { onConflict: 'user_id,tenant_id' })
      } else {
        await db.from('user_permissions').delete()
          .eq('user_id', req.params.id)
          .eq('tenant_id', req.auth.tid)
      }
    }

    // Revoga sessão apenas se desativar o membro
    if (req.body.is_active === false) {
      await db.from('refresh_tokens').update({ revoked_at: new Date() }).eq('user_id', req.params.id).is('revoked_at', null)
    }

    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/team/:id', requireAuth, requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { data: member } = await db
      .from('users').select('id, role').eq('id', req.params.id).eq('tenant_id', req.auth.tid).maybeSingle()
    if (!member) throw new AppError('NOT_FOUND', 'Membro não encontrado', 404)
    if (member.role === 'owner') throw new AppError('FORBIDDEN', 'Não é possível remover o dono da conta', 403)

    await db.from('refresh_tokens').update({ revoked_at: new Date() }).eq('user_id', req.params.id).is('revoked_at', null)
    await db.from('users').delete().eq('id', req.params.id).eq('tenant_id', req.auth.tid)

    res.json(ok({ message: 'Membro removido' }))
  } catch (err) { next(err) }
})

router.post('/team/:id/reset-password', requireAuth, requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { data: member } = await db
      .from('users').select('id, name, email, role').eq('id', req.params.id).eq('tenant_id', req.auth.tid).maybeSingle()
    if (!member) throw new AppError('NOT_FOUND', 'Membro não encontrado', 404)
    if (member.role === 'owner') throw new AppError('FORBIDDEN', 'Não é possível redefinir senha do dono', 403)

    const tempPassword = randomBytes(16).toString('hex').toUpperCase()
    await db.from('users').update({ password_hash: await hashPassword(tempPassword) }).eq('id', req.params.id)
    await db.from('refresh_tokens').update({ revoked_at: new Date() }).eq('user_id', req.params.id).is('revoked_at', null)

    const { data: tenant } = await db.from('tenants').select('name').eq('id', req.auth.tid).single()
    sendTeamInviteEmail({ to: member.email, name: member.name, tenantName: tenant?.name || 'sua empresa', tempPassword, isReset: true }).catch(() => {})

    res.json(ok({ message: 'Nova senha enviada por email' }))
  } catch (err) { next(err) }
})

// ─── Permissões individuais por usuário ───────────────────────────────────────

router.get('/team/:id/permissions', requireAuth, requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { data } = await db
      .from('user_permissions')
      .select('*')
      .eq('user_id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .maybeSingle()

    res.json(ok(data || {
      allowed_pages: ['/dashboard/inbox'],
      editable_pages: [],
      allowed_channels: [],
      campaign_access: 'none',
      conversation_access: 'assigned',
    }))
  } catch (err) { next(err) }
})

router.patch('/team/:id/permissions', requireAuth, requireRole('admin', 'owner'), validate(userPermissionsSchema), async (req, res, next) => {
  try {
    const { data: member } = await db
      .from('users').select('id, role').eq('id', req.params.id).eq('tenant_id', req.auth.tid).maybeSingle()
    if (!member) throw new AppError('NOT_FOUND', 'Membro não encontrado', 404)
    if (member.role === 'owner' || member.role === 'admin') {
      throw new AppError('FORBIDDEN', 'Admin e Owner sempre têm acesso total', 403)
    }

    const update: any = { updated_at: new Date() }
    if (req.body.allowed_pages !== undefined) update.allowed_pages = req.body.allowed_pages
    if (req.body.editable_pages !== undefined) update.editable_pages = req.body.editable_pages
    if (req.body.allowed_channels !== undefined) update.allowed_channels = req.body.allowed_channels
    if (req.body.campaign_access !== undefined) update.campaign_access = req.body.campaign_access
    if (req.body.conversation_access !== undefined) update.conversation_access = req.body.conversation_access

    const { error } = await db
      .from('user_permissions')
      .upsert({ user_id: req.params.id, tenant_id: req.auth.tid, ...update }, { onConflict: 'user_id,tenant_id' })

    if (error) {
      logger.error('DB operation failed', { error: error.message })
      throw new AppError('DB_ERROR', 'Database operation failed', 500)
    }

    // Não revoga sessão — permissões são buscadas dinamicamente pelo frontend a cada 5s
    res.json(ok({ message: 'Permissões salvas com sucesso.' }))
  } catch (err) { next(err) }
})

export default router