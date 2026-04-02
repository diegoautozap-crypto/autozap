// ─── Plans ───────────────────────────────────────────────────────────────────

export type PlanSlug = 'pending' | 'starter' | 'pro' | 'enterprise' | 'unlimited'

export interface Plan {
  id: string
  slug: PlanSlug
  name: string
  messageLimit: number | null // null = unlimited
  priceMonthly: number
  features: string[]
}

export interface PlanLimits {
  messages: number | null
  channels: number
  members: number
  flows: number | null
  contacts: number | null
  campaigns: number | null
  aiResponses: number | null
  products: number | null
  transcription: boolean
  reports: boolean
}

export const PLAN_LIMITS: Record<PlanSlug, PlanLimits> = {
  pending:    { messages: 0, channels: 0, members: 0, flows: 0, contacts: 0, campaigns: 0, aiResponses: 0, products: 0, transcription: false, reports: false },
  starter:    { messages: 10_000, channels: 5, members: 5, flows: 3, contacts: 10_000, campaigns: 5, aiResponses: 10_000, products: 15, transcription: false, reports: false },
  pro:        { messages: 50_000, channels: 10, members: 10, flows: 15, contacts: 50_000, campaigns: 30, aiResponses: 50_000, products: 100, transcription: true, reports: true },
  enterprise: { messages: 150_000, channels: 30, members: 30, flows: null, contacts: 150_000, campaigns: null, aiResponses: 150_000, products: 500, transcription: true, reports: true },
  unlimited:  { messages: null, channels: 999, members: 999, flows: null, contacts: null, campaigns: null, aiResponses: null, products: null, transcription: true, reports: true },
}

/** @deprecated Use PLAN_LIMITS[slug].channels instead */
export const PLAN_CHANNEL_LIMITS: Record<PlanSlug, number> = {
  pending:    0,
  starter:    5,
  pro:        10,
  enterprise: 30,
  unlimited:  999,
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

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'pending'

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