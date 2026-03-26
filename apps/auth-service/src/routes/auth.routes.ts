import { Router } from 'express'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { authService } from '../services/auth.service'
import { requireAuth, validate, requireRole } from '../middleware/auth.middleware'
import { ok, registerSchema, loginSchema, passwordSchema, AppError, generateId } from '@autozap/utils'
import { db } from '../lib/db'
import { logger } from '../lib/logger'
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
})

const updateMemberSchema = z.object({
  name:      z.string().min(2).max(100).optional(),
  role:      z.enum(['admin', 'supervisor', 'agent']).optional(),
  is_active: z.boolean().optional(),
})

// ─── Public Routes ────────────────────────────────────────────────────────────

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const result = await authService.register(req.body)
    res.status(201).json(ok(result))
  } catch (err) { next(err) }
})

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const userAgent = req.headers['user-agent']
    const ipAddress = req.ip
    const result = await authService.login({ ...req.body, userAgent, ipAddress })
    if (result.requiresTwoFactor) { res.status(200).json(ok({ requiresTwoFactor: true })); return }
    res.json(ok(result.tokens))
  } catch (err) { next(err) }
})

router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const tokens = await authService.refresh(req.body.refreshToken, req.ip)
    res.json(ok(tokens))
  } catch (err) { next(err) }
})

router.post('/logout', validate(refreshSchema), async (req, res, next) => {
  try {
    await authService.logout(req.body.refreshToken)
    res.json(ok({ message: 'Logged out' }))
  } catch (err) { next(err) }
})

router.post('/forgot-password', validate(forgotSchema), async (req, res, next) => {
  try {
    await authService.forgotPassword(req.body.email)
    res.json(ok({ message: 'If the email exists, a reset link was sent' }))
  } catch (err) { next(err) }
})

router.post('/reset-password', validate(resetSchema), async (req, res, next) => {
  try {
    await authService.resetPassword(req.body.token, req.body.password)
    res.json(ok({ message: 'Password reset successfully' }))
  } catch (err) { next(err) }
})

router.post('/verify-email', validate(verifyEmailSchema), async (req, res, next) => {
  try {
    await authService.verifyEmail(req.body.token)
    res.json(ok({ message: 'Email verified successfully' }))
  } catch (err) { next(err) }
})

router.post('/resend-verification', validate(forgotSchema), async (req, res, next) => {
  try {
    await authService.resendVerificationEmail(req.body.email)
    res.json(ok({ message: 'If the email exists and is unverified, a new link was sent' }))
  } catch (err) { next(err) }
})

// ─── Protected Routes ─────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json(ok({ userId: req.auth.sub, tenantId: req.auth.tid, role: req.auth.role, email: req.auth.email }))
  } catch (err) { next(err) }
})

router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    await authService.logoutAllSessions(req.auth.sub)
    res.json(ok({ message: 'All sessions revoked' }))
  } catch (err) { next(err) }
})

// ─── 2FA Routes ───────────────────────────────────────────────────────────────

router.post('/2fa/setup', requireAuth, async (req, res, next) => {
  try {
    const result = await authService.setup2FA(req.auth.sub)
    res.json(ok(result))
  } catch (err) { next(err) }
})

router.post('/2fa/confirm', requireAuth, validate(confirm2FASchema), async (req, res, next) => {
  try {
    await authService.confirm2FA(req.auth.sub, req.body.code)
    res.json(ok({ message: '2FA enabled successfully' }))
  } catch (err) { next(err) }
})

router.post('/2fa/disable', requireAuth, validate(totpCodeSchema), async (req, res, next) => {
  try {
    await authService.disable2FA(req.auth.sub, req.body.code)
    res.json(ok({ message: '2FA disabled' }))
  } catch (err) { next(err) }
})

// ─── Team Management ──────────────────────────────────────────────────────────

// GET /auth/team — listar membros
router.get('/team', requireAuth, requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('users')
      .select('id, name, email, role, is_active, created_at, last_login_at')
      .eq('tenant_id', req.auth.tid)
      .neq('id', req.auth.sub)
      .order('created_at', { ascending: true })
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

// POST /auth/team/invite — adicionar membro
router.post('/team/invite', requireAuth, requireRole('admin', 'owner'), validate(inviteSchema), async (req, res, next) => {
  try {
    const { name, email, role } = req.body

    const { data: existing } = await db
      .from('users').select('id').eq('tenant_id', req.auth.tid).eq('email', email.toLowerCase()).maybeSingle()
    if (existing) throw new AppError('CONFLICT', 'Este email já está cadastrado na equipe', 409)

    const tempPassword = randomBytes(4).toString('hex').toUpperCase()
    const passwordHash = await hashPassword(tempPassword)
    const userId = generateId()

    const { error } = await db.from('users').insert({
      id: userId, tenant_id: req.auth.tid, name,
      email: email.toLowerCase(), password_hash: passwordHash,
      role, is_active: true, email_verified: true,
    })
    if (error) throw new AppError('DB_ERROR', error.message, 500)

    const { data: tenant } = await db.from('tenants').select('name').eq('id', req.auth.tid).single()
    sendTeamInviteEmail({ to: email, name, tenantName: tenant?.name || 'sua empresa', tempPassword })
      .catch(err => logger.error('Failed to send team invite email', { err }))

    res.status(201).json(ok({ id: userId, name, email, role }))
  } catch (err) { next(err) }
})

// PATCH /auth/team/:id — editar membro
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
    if (error) throw new AppError('DB_ERROR', error.message, 500)

    if (req.body.is_active === false) {
      await db.from('refresh_tokens').update({ revoked_at: new Date() }).eq('user_id', req.params.id).is('revoked_at', null)
    }

    res.json(ok(data))
  } catch (err) { next(err) }
})

// DELETE /auth/team/:id — remover membro
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

// POST /auth/team/:id/reset-password — redefinir senha
router.post('/team/:id/reset-password', requireAuth, requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { data: member } = await db
      .from('users').select('id, name, email, role').eq('id', req.params.id).eq('tenant_id', req.auth.tid).maybeSingle()
    if (!member) throw new AppError('NOT_FOUND', 'Membro não encontrado', 404)
    if (member.role === 'owner') throw new AppError('FORBIDDEN', 'Não é possível redefinir senha do dono', 403)

    const tempPassword = randomBytes(4).toString('hex').toUpperCase()
    const passwordHash = await hashPassword(tempPassword)

    await db.from('users').update({ password_hash: passwordHash }).eq('id', req.params.id)
    await db.from('refresh_tokens').update({ revoked_at: new Date() }).eq('user_id', req.params.id).is('revoked_at', null)

    const { data: tenant } = await db.from('tenants').select('name').eq('id', req.auth.tid).single()
    sendTeamInviteEmail({ to: member.email, name: member.name, tenantName: tenant?.name || 'sua empresa', tempPassword, isReset: true }).catch(() => {})

    res.json(ok({ message: 'Nova senha enviada por email' }))
  } catch (err) { next(err) }
})

export default router