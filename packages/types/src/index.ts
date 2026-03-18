// ─── Plans ───────────────────────────────────────────────────────────────────

export type PlanSlug = 'trial' | 'starter' | 'pro' | 'enterprise' | 'unlimited'

export interface Plan {
  id: string
  slug: PlanSlug
  name: string
  messageLimit: number | null // null = unlimited
  priceMonthly: number
  features: string[]
}

export const PLAN_LIMITS: Record<PlanSlug, number | null> = {
  trial: 100,
  starter: 10_000,
  pro: 50_000,
  enterprise: 100_000,
  unlimited: null,
}

// ─── Tenant ──────────────────────────────────────────────────────────────────

export interface Tenant {
  id: string
  name: string
  slug: string
  planSlug: PlanSlug
  messagesSentThisPeriod: number
  isActive: boolean
  settings: TenantSettings
  createdAt: Date
  updatedAt: Date
}

export interface TenantSettings {
  timezone: string
  defaultLanguage: string
  webhookUrl?: string
  webhookSecret?: string
}

// ─── User ─────────────────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'admin' | 'agent' | 'viewer'

export interface User {
  id: string
  tenantId: string
  email: string
  name: string
  role: UserRole
  avatarUrl?: string
  twoFactorEnabled: boolean
  emailVerified: boolean
  lastLoginAt?: Date
  createdAt: Date
  updatedAt: Date
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string        // user id
  tid: string        // tenant id
  role: UserRole
  email: string
  iat: number
  exp: number
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface LoginRequest {
  email: string
  password: string
  totpCode?: string  // 2FA
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
  tenantName: string
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing'

export interface Subscription {
  id: string
  tenantId: string
  planId: string
  status: SubscriptionStatus
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
  stripeSubscriptionId?: string
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
  meta?: {
    page?: number
    limit?: number
    total?: number
    hasMore?: boolean
  }
}

export interface PaginationQuery {
  page?: number
  limit?: number
  cursor?: string
  orderBy?: string
  order?: 'asc' | 'desc'
}
