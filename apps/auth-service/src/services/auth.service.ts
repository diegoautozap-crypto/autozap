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

export class AuthService {

  async register(input: RegisterInput): Promise<{ userId: string; tenantId: string }> {
    const { name, email, password, tenantName } = input

    // 1. Check if email already exists
    const { data: existingUser } = await db
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (existingUser) throw new ConflictError('Email already registered')

    // 2. Create tenant com plano pending (precisa assinar)
    const tenantId = generateId()
    const tenantSlug = await this.uniqueSlug(slugify(tenantName))

    const { error: tenantError } = await db.from('tenants').insert({
      id: tenantId,
      name: tenantName,
      slug: tenantSlug,
      plan_slug: 'pending',
    })
    if (tenantError) throw new AppError('DB_ERROR', tenantError.message, 500)

    // 4. Create user (owner) — email_verified=true pra permitir login imediato
    // O acesso ao CRM é bloqueado pelo plano 'pending' até pagar
    const userId = generateId()
    const passwordHash = await hashPassword(password)

    const { error: userError } = await db.from('users').insert({
      id: userId,
      tenant_id: tenantId,
      email: email.toLowerCase(),
      name,
      password_hash: passwordHash,
      role: 'owner' as UserRole,
      email_verified: true,
    })

    if (userError) {
      await db.from('tenants').delete().eq('id', tenantId)
      throw new AppError('DB_ERROR', userError.message, 500)
    }

    logger.info('User registered', { userId, tenantId, email })
    return { userId, tenantId }
  }

  async login(input: LoginInput): Promise<TokenPair> {
    const { email, password, totpCode, userAgent, ipAddress } = input

    const { data: user } = await db
      .from('users')
      .select('id, tenant_id, email, name, password_hash, role, two_factor_enabled, two_factor_secret, is_active, email_verified')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (!user) throw new UnauthorizedError('Invalid email or password')
    if (!user.is_active) throw new UnauthorizedError('Account suspended')
    if (!user.email_verified) throw new AppError('EMAIL_NOT_VERIFIED', 'Verifique seu email antes de entrar', 403)

    const valid = await comparePassword(password, user.password_hash)
    if (!valid) throw new UnauthorizedError('Invalid email or password')

    if (user.two_factor_enabled) {
      if (!totpCode) {
        return { tokens: {} as AuthTokens, requiresTwoFactor: true }
      }
      const ok = verifyTotpCode(user.two_factor_secret!, totpCode)
      if (!ok) throw new UnauthorizedError('Invalid 2FA code')
    }

    const tokens = await this.issueTokens({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
      userAgent,
      ipAddress,
    })

    db.from('users').update({ last_login_at: new Date() }).eq('id', user.id).then()
    this.audit(user.tenant_id, user.id, 'user.login', 'user', user.id, { ipAddress })

    logger.info('User logged in', { userId: user.id, tenantId: user.tenant_id })
    return { tokens }
  }

  async refresh(rawToken: string, ipAddress?: string): Promise<AuthTokens> {
    const tokenHash = hashToken(rawToken)

    const { data: stored } = await db
      .from('refresh_tokens')
      .select('id, user_id, tenant_id, family, revoked_at, expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (!stored) throw new UnauthorizedError('Invalid refresh token')

    if (stored.revoked_at) {
      await db.from('refresh_tokens').update({ revoked_at: new Date() }).eq('family', stored.family)
      throw new UnauthorizedError('Refresh token reuse detected — all sessions revoked')
    }

    if (new Date(stored.expires_at) < new Date()) {
      throw new UnauthorizedError('Refresh token expired')
    }

    await db.from('refresh_tokens').update({ revoked_at: new Date() }).eq('id', stored.id)

    const { data: user } = await db
      .from('users')
      .select('id, tenant_id, email, role, is_active')
      .eq('id', stored.user_id)
      .single()

    if (!user || !user.is_active) throw new UnauthorizedError('Account not found or suspended')

    return this.issueTokens({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
      family: stored.family,
      ipAddress,
    })
  }

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

    const { data: tenant } = await db.from('tenants').select('name').eq('id', user.tenant_id).single()
    sendWelcomeEmail({ to: user.email, name: user.name, tenantName: tenant?.name || 'sua empresa' }).catch(() => {})

    logger.info('Email verified', { userId: user.id })
  }

  async forgotPassword(email: string): Promise<void> {
    const { data: user } = await db
      .from('users')
      .select('id, name, email')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (!user) return

    const token = randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 60 * 60 * 1000)

    await db.from('users').update({
      password_reset_token: token,
      password_reset_expires: expires,
    }).eq('id', user.id)

    sendPasswordResetEmail({ to: user.email, name: user.name, token }).catch((err) =>
      logger.error('Failed to send password reset email', { err }),
    )
  }

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

    await this.logoutAllSessions(user.id)
    logger.info('Password reset', { userId: user.id })
  }

  async setup2FA(userId: string): Promise<{ qrCodeUrl: string; secret: string }> {
    const { data: user } = await db
      .from('users')
      .select('email, two_factor_enabled')
      .eq('id', userId)
      .single()

    if (!user) throw new NotFoundError('User')
    if (user.two_factor_enabled) throw new ConflictError('2FA already enabled')

    const { qrCodeUrl, secret, encryptedSecret } = await generateTwoFactorSetup(user.email)
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

  async resendVerificationEmail(email: string): Promise<void> {
    const { data: user } = await db
      .from('users')
      .select('id, name, email, email_verified')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (!user || user.email_verified) return

    const emailVerifyToken = randomBytes(32).toString('hex')
    await db.from('users').update({ email_verify_token: emailVerifyToken }).eq('id', user.id)

    sendVerificationEmail({ to: user.email, name: user.name, token: emailVerifyToken })
      .catch(err => logger.error('Failed to resend verification email', { err }))
  }

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
      expiresIn: 3600,
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

  private audit(tenantId: string, userId: string, action: string, resource: string, resourceId: string, metadata?: object): void {
    db.from('audit_logs').insert({ tenant_id: tenantId, user_id: userId, action, resource, resource_id: resourceId, metadata }).then()
  }
}

export const authService = new AuthService()