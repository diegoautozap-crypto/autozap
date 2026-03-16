import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import type { ApiResponse, PaginationQuery } from '@autozap/types'

// ─── Response Builders ────────────────────────────────────────────────────────

export function ok<T>(data: T, meta?: ApiResponse<T>['meta']): ApiResponse<T> {
  return { success: true, data, ...(meta ? { meta } : {}) }
}

export function fail(code: string, message: string, details?: unknown): ApiResponse<never> {
  return { success: false, error: { code, message, details } }
}

// ─── Custom Error Classes ─────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message, 403)
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404)
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409)
  }
}

export class PlanLimitError extends AppError {
  constructor(message = 'Plan message limit reached') {
    super('PLAN_LIMIT_REACHED', message, 429)
  }
}

// ─── UUID ─────────────────────────────────────────────────────────────────────

export const generateId = () => uuidv4()

// ─── Pagination ───────────────────────────────────────────────────────────────

export function parsePagination(query: PaginationQuery): Required<Pick<PaginationQuery, 'page' | 'limit'>> {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
  return { page, limit }
}

export function paginationMeta(total: number, page: number, limit: number) {
  return {
    page,
    limit,
    total,
    hasMore: page * limit < total,
  }
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const emailSchema = z.string().email('Invalid email')
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')

export const uuidSchema = z.string().uuid()

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  totpCode: z.string().length(6).optional(),
})

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: emailSchema,
  password: passwordSchema,
  tenantName: z.string().min(2, 'Company name must be at least 2 characters'),
})

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  orderBy: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
})

// ─── Misc Helpers ─────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  return `${user.slice(0, 2)}***@${domain}`
}

export function isValidPhoneNumber(phone: string): boolean {
  // E.164 format: +5511999999999
  return /^\+[1-9]\d{7,14}$/.test(phone)
}

export function normalizePhone(phone: string): string {
  // Remove everything except + and digits
  const cleaned = phone.replace(/[^\d+]/g, '')
  if (!cleaned.startsWith('+')) return `+${cleaned}`
  return cleaned
}
