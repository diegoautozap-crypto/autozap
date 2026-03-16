import { Router } from 'express'
import { z } from 'zod'
import { authService } from '../services/auth.service'
import { requireAuth, validate } from '../middleware/auth.middleware'
import { ok, registerSchema, loginSchema, passwordSchema } from '@autozap/utils'

const router = Router()

// ─── Schemas ──────────────────────────────────────────────────────────────────

const refreshSchema = z.object({ refreshToken: z.string().min(1) })
const forgotSchema = z.object({ email: z.string().email() })
const resetSchema = z.object({ token: z.string().min(1), password: passwordSchema })
const verifyEmailSchema = z.object({ token: z.string().min(1) })
const totpCodeSchema = z.object({ code: z.string().length(6) })
const confirm2FASchema = z.object({ code: z.string().length(6) })

// ─── Public Routes ────────────────────────────────────────────────────────────

// POST /auth/register
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const result = await authService.register(req.body)
    res.status(201).json(ok(result))
  } catch (err) {
    next(err)
  }
})

// POST /auth/login
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const userAgent = req.headers['user-agent']
    const ipAddress = req.ip
    const result = await authService.login({ ...req.body, userAgent, ipAddress })

    if (result.requiresTwoFactor) {
      res.status(200).json(ok({ requiresTwoFactor: true }))
      return
    }

    res.json(ok(result.tokens))
  } catch (err) {
    next(err)
  }
})

// POST /auth/refresh
router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const tokens = await authService.refresh(req.body.refreshToken, req.ip)
    res.json(ok(tokens))
  } catch (err) {
    next(err)
  }
})

// POST /auth/logout
router.post('/logout', validate(refreshSchema), async (req, res, next) => {
  try {
    await authService.logout(req.body.refreshToken)
    res.json(ok({ message: 'Logged out' }))
  } catch (err) {
    next(err)
  }
})

// POST /auth/forgot-password
router.post('/forgot-password', validate(forgotSchema), async (req, res, next) => {
  try {
    await authService.forgotPassword(req.body.email)
    // Always return 200 to avoid user enumeration
    res.json(ok({ message: 'If the email exists, a reset link was sent' }))
  } catch (err) {
    next(err)
  }
})

// POST /auth/reset-password
router.post('/reset-password', validate(resetSchema), async (req, res, next) => {
  try {
    await authService.resetPassword(req.body.token, req.body.password)
    res.json(ok({ message: 'Password reset successfully' }))
  } catch (err) {
    next(err)
  }
})

// POST /auth/verify-email
router.post('/verify-email', validate(verifyEmailSchema), async (req, res, next) => {
  try {
    await authService.verifyEmail(req.body.token)
    res.json(ok({ message: 'Email verified successfully' }))
  } catch (err) {
    next(err)
  }
})

// ─── Protected Routes (require valid access token) ────────────────────────────

// GET /auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    res.json(ok({ userId: req.auth.sub, tenantId: req.auth.tid, role: req.auth.role, email: req.auth.email }))
  } catch (err) {
    next(err)
  }
})

// POST /auth/logout-all
router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    await authService.logoutAllSessions(req.auth.sub)
    res.json(ok({ message: 'All sessions revoked' }))
  } catch (err) {
    next(err)
  }
})

// ─── 2FA Routes ───────────────────────────────────────────────────────────────

// POST /auth/2fa/setup — initiate 2FA setup, returns QR code
router.post('/2fa/setup', requireAuth, async (req, res, next) => {
  try {
    const result = await authService.setup2FA(req.auth.sub)
    res.json(ok(result))
  } catch (err) {
    next(err)
  }
})

// POST /auth/2fa/confirm — confirm 2FA setup with first valid code
router.post('/2fa/confirm', requireAuth, validate(confirm2FASchema), async (req, res, next) => {
  try {
    await authService.confirm2FA(req.auth.sub, req.body.code)
    res.json(ok({ message: '2FA enabled successfully' }))
  } catch (err) {
    next(err)
  }
})

// POST /auth/2fa/disable
router.post('/2fa/disable', requireAuth, validate(totpCodeSchema), async (req, res, next) => {
  try {
    await authService.disable2FA(req.auth.sub, req.body.code)
    res.json(ok({ message: '2FA disabled' }))
  } catch (err) {
    next(err)
  }
})

export default router
