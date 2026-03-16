import { randomBytes } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../lib/db'
import { logger } from '../lib/logger'
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  hashPassword,
  comparePassword,
  refreshExpiresAt,
} from '../lib/jwt'
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from '../lib/email'
import { generateTwoFactorSetup, verifyTotpCode } from '../lib/totp'
import {
  AppError,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  slugify,
  generateId,
} from '@autozap/utils'
import type { AuthTokens, UserRole } from '@autozap/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegisterInput {
  name: string
  email: string
  password: string
  tenantName: string
}

interface LoginInput {
  email: string
  password: string
  totpCode?: string
  userAgent?: string
  ipAddress?: string
}

interface TokenPair {
  tokens: AuthTokens
  requiresTwoFactor?: boolean
}

// ─── AuthService ──────────────────────────────────────────────────────────────

export class AuthService {
  // ── Register ────────────────────────────────────────────────────────────────

  async register(input: RegisterInput): Promise<{ userId: string; tenantId: string }> {
    const { name, email, password, tenantName } = input

    // 1. Check if email already exists globally
    const { data: existingUser } = await db
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (existingUser) throw new ConflictError('Email already registered')

    // 2. Create tenant
    const tenantId = generateId()
    const tenantSlug = await this.uniqueSlug(slugify(tenantName))

    const { error: tenantError } = await db.from('tenants').insert({
      id: tenantId,
      name: tenantName,
      slug: tenantSlug,
      plan_slug: 'starter',
    })
    if (tenantError) throw new AppError('DB_ERROR', tenantError.message, 500)

    // 3. Create starter subscription
    const { data: starterPlan } = await db
      .from('plans')
      .select('id')
      .eq('slug', 'starter')
      .single()

    await db.from('subscriptions').insert({
      tenant_id: tenantId,
      plan_id: starterPlan!.id,
      status: 'trialing',
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
    })

    // 4. Create user (owner)
    const userId = generateId()
    const passwordHash = await hashPassword(password)
    const emailVerifyToken = randomBytes(32).toString('hex')

    const { error: userError } = await db.from('users').insert({
      id: userId,
      tenant_id: tenantId,
      email: email.toLowerCase(),
      name,
      password_hash: passwordHash,
      role: 'owner' as UserRole,
      email_verify_token: emailVerifyToken,
    })
    if (userError) {
      // Rollback tenant if user creation fails
      await db.from('tenants').delete().eq('id', tenantId)
      throw new AppError('DB_ERROR', userError.message, 500)
    }

    // 5. Send verification email (non-blocking)
    sendVerificationEmail({ to: email, name, token: emailVerifyToken }).catch((err) =>
      logger.error('Failed to send verification email', { err }),
    )

    logger.info('User registered', { userId, tenantId, email })
    return { userId, tenantId }
  }

  // ── Login ────────────────────────────────────────────────────────────────────

  async login(input: LoginInput): Promise<TokenPair> {
    const { email, password, totpCode, userAgent, ipAddress } = input

    // 1. Find user
    const { data: user } = await db
      .from('users')
      .select('id, tenant_id, email, name, password_hash, role, two_factor_enabled, two_factor_secret, is_active, email_verified')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (!user) throw new UnauthorizedError('Invalid email or password')
    if (!user.is_active) throw new UnauthorizedError('Account suspended')

    // 2. Check password
    const valid = await comparePassword(password, user.password_hash)
    if (!valid) throw new UnauthorizedError('Invalid email or password')

    // 3. 2FA check
    if (user.two_factor_enabled) {
      if (!totpCode) {
        // Signal the frontend to show the 2FA input
        return { tokens: {} as AuthTokens, requiresTwoFactor: true }
      }
      const ok = verifyTotpCode(user.two_factor_secret!, totpCode)
      if (!ok) throw new UnauthorizedError('Invalid 2FA code')
    }

    // 4. Issue tokens
    const tokens = await this.issueTokens({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
      userAgent,
      ipAddress,
    })

    // 5. Update last login (non-blocking)
    db.from('users').update({ last_login_at: new Date() }).eq('id', user.id).then()

    // 6. Audit log
    this.audit(user.tenant_id, user.id, 'user.login', 'user', user.id, { ipAddress })

    logger.info('User logged in', { userId: user.id, tenantId: user.tenant_id })
    return { tokens }
  }

  // ── Refresh Token ─────────────────────────────────────────────────────────────

  async refresh(rawToken: string, ipAddress?: string): Promise<AuthTokens> {
    const tokenHash = hashToken(rawToken)

    // 1. Find token in DB
    const { data: stored } = await db
      .from('refresh_tokens')
      .select('id, user_id, tenant_id, family, revoked_at, expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (!stored) throw new UnauthorizedError('Invalid refresh token')

    // 2. Check if revoked — if so, revoke entire family (token theft detection)
    if (stored.revoked_at) {
      await db.from('refresh_tokens').update({ revoked_at: new Date() }).eq('family', stored.family)
      throw new UnauthorizedError('Refresh token reuse detected — all sessions revoked')
    }

    // 3. Check expiry
    if (new Date(stored.expires_at) < new Date()) {
      throw new UnauthorizedError('Refresh token expired')
    }

    // 4. Revoke current token (rotation)
    await db.from('refresh_tokens').update({ revoked_at: new Date() }).eq('id', stored.id)

    // 5. Get user info
    const { data: user } = await db
      .from('users')
      .select('id, tenant_id, email, role, is_active')
      .eq('id', stored.user_id)
      .single()

    if (!user || !user.is_active) throw new UnauthorizedError('Account not found or suspended')

    // 6. Issue new tokens (same family)
    return this.issueTokens({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
      family: stored.family,
      ipAddress,
    })
  }

  // ── Logout ────────────────────────────────────────────────────────────────────

  async logout(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken)
    await db.from('refresh_tokens').update({ revoked_at: new Date() }).eq('token_hash', tokenHash)
  }

  async logoutAllSessions(userId: string): Promise<void> {
    await db
      .from('refresh_tokens')
      .update({ revoked_at: new Date() })
      .eq('user_id', userId)
      .is('revoked_at', null)
  }

  // ── Verify Email ──────────────────────────────────────────────────────────────

  async verifyEmail(token: string): Promise<void> {
    const { data: user } = await db
      .from('users')
      .select('id, tenant_id, name, email, email_verified')
      .eq('email_verify_token', token)
      .maybeSingle()

    if (!user) throw new AppError('INVALID_TOKEN', 'Invalid or expired verification token', 400)
    if (user.email_verified) throw new AppError('ALREADY_VERIFIED', 'Email already verified', 400)

    await db.from('users').update({
      email_verified: true,
      email_verify_token: null,
    }).eq('id', user.id)

    // Send welcome email (non-blocking)
    const { data: tenant } = await db.from('tenants').select('name').eq('id', user.tenant_id).single()
    sendWelcomeEmail({ to: user.email, name: user.name, tenantName: tenant?.name || 'sua empresa' }).catch(() => {})

    logger.info('Email verified', { userId: user.id })
  }

  // ── Forgot Password ───────────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const { data: user } = await db
      .from('users')
      .select('id, name, email')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    // Always return success to avoid user enumeration
    if (!user) return

    const token = randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await db.from('users').update({
      password_reset_token: token,
      password_reset_expires: expires,
    }).eq('id', user.id)

    sendPasswordResetEmail({ to: user.email, name: user.name, token }).catch((err) =>
      logger.error('Failed to send password reset email', { err }),
    )
  }

  // ── Reset Password ────────────────────────────────────────────────────────────

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const { data: user } = await db
      .from('users')
      .select('id, password_reset_expires')
      .eq('password_reset_token', token)
      .maybeSingle()

    if (!user) throw new AppError('INVALID_TOKEN', 'Invalid or expired reset token', 400)
    if (new Date(user.password_reset_expires) < new Date()) {
      throw new AppError('TOKEN_EXPIRED', 'Reset token expired', 400)
    }

    const passwordHash = await hashPassword(newPassword)
    await db.from('users').update({
      password_hash: passwordHash,
      password_reset_token: null,
      password_reset_expires: null,
    }).eq('id', user.id)

    // Revoke all refresh tokens for security
    await this.logoutAllSessions(user.id)

    logger.info('Password reset', { userId: user.id })
  }

  // ── 2FA Setup ─────────────────────────────────────────────────────────────────

  async setup2FA(userId: string): Promise<{ qrCodeUrl: string; secret: string }> {
    const { data: user } = await db
      .from('users')
      .select('email, two_factor_enabled')
      .eq('id', userId)
      .single()

    if (!user) throw new NotFoundError('User')
    if (user.two_factor_enabled) throw new ConflictError('2FA already enabled')

    const { qrCodeUrl, secret, encryptedSecret } = await generateTwoFactorSetup(user.email)

    // Store encrypted secret temporarily (not enabled yet — user must confirm with code)
    await db.from('users').update({ two_factor_secret: encryptedSecret }).eq('id', userId)

    return { qrCodeUrl, secret }
  }

  async confirm2FA(userId: string, totpCode: string): Promise<void> {
    const { data: user } = await db
      .from('users')
      .select('two_factor_secret, two_factor_enabled')
      .eq('id', userId)
      .single()

    if (!user || !user.two_factor_secret) throw new AppError('SETUP_REQUIRED', '2FA setup not initiated', 400)
    if (user.two_factor_enabled) throw new ConflictError('2FA already enabled')

    const valid = verifyTotpCode(user.two_factor_secret, totpCode)
    if (!valid) throw new UnauthorizedError('Invalid 2FA code')

    await db.from('users').update({ two_factor_enabled: true }).eq('id', userId)
    logger.info('2FA enabled', { userId })
  }

  async disable2FA(userId: string, totpCode: string): Promise<void> {
    const { data: user } = await db
      .from('users')
      .select('two_factor_secret, two_factor_enabled')
      .eq('id', userId)
      .single()

    if (!user || !user.two_factor_enabled) throw new AppError('NOT_ENABLED', '2FA not enabled', 400)

    const valid = verifyTotpCode(user.two_factor_secret!, totpCode)
    if (!valid) throw new UnauthorizedError('Invalid 2FA code')

    await db.from('users').update({
      two_factor_enabled: false,
      two_factor_secret: null,
    }).eq('id', userId)
  }

  // ── Private Helpers ───────────────────────────────────────────────────────────

  private async issueTokens(opts: {
    userId: string
    tenantId: string
    role: UserRole
    email: string
    family?: string
    userAgent?: string
    ipAddress?: string
  }): Promise<AuthTokens> {
    const { userId, tenantId, role, email, userAgent, ipAddress } = opts
    const family = opts.family ?? uuidv4()

    const accessToken = signAccessToken({ sub: userId, tid: tenantId, role, email })
    const rawRefresh = generateRefreshToken()
    const tokenHash = hashToken(rawRefresh)

    await db.from('refresh_tokens').insert({
      user_id: userId,
      tenant_id: tenantId,
      token_hash: tokenHash,
      family,
      user_agent: userAgent,
      ip_address: ipAddress,
      expires_at: refreshExpiresAt(),
    })

    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: 15 * 60, // 15 minutes in seconds
    }
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base
    let attempt = 0
    while (true) {
      const { data } = await db.from('tenants').select('id').eq('slug', slug).maybeSingle()
      if (!data) return slug
      attempt++
      slug = `${base}-${attempt}`
    }
  }

  private audit(
    tenantId: string,
    userId: string,
    action: string,
    resource: string,
    resourceId: string,
    metadata?: object,
  ): void {
    db.from('audit_logs').insert({ tenant_id: tenantId, user_id: userId, action, resource, resource_id: resourceId, metadata }).then()
  }
}

export const authService = new AuthService()
