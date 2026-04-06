import type { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { verifyAccessToken } from '../lib/jwt'
import { AppError, fail } from '@autozap/utils'
import type { JwtPayload, UserRole } from '@autozap/types'
import { db } from '../lib/db'

declare global {
  namespace Express {
    interface Request {
      auth: JwtPayload
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.accessToken || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null)
  if (!token) {
    res.status(401).json(fail('UNAUTHORIZED', 'Missing authorization'))
    return
  }
  try {
    req.auth = verifyAccessToken(token)
    next()
  } catch {
    res.status(401).json(fail('INVALID_TOKEN', 'Invalid or expired token'))
  }
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 0,
  agent: 1,
  admin: 2,
  owner: 3,
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const level = ROLE_HIERARCHY[req.auth?.role]
    const min = Math.min(...roles.map((r) => ROLE_HIERARCHY[r]))
    if (level === undefined || level < min) {
      res.status(403).json(fail('FORBIDDEN', 'Insufficient permissions'))
      return
    }
    next()
  }
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { data } = await db
      .from('users')
      .select('is_superadmin')
      .eq('id', req.auth?.sub)
      .single()

    if (!data?.is_superadmin) {
      res.status(403).json(fail('FORBIDDEN', 'Super admin access required'))
      return
    }

    const adminSecret = req.headers['x-admin-secret'] as string | undefined
    const expectedSecret = process.env.ADMIN_SECRET
    const match = adminSecret && expectedSecret &&
      adminSecret.length === expectedSecret.length &&
      crypto.timingSafeEqual(Buffer.from(adminSecret), Buffer.from(expectedSecret))
    if (!match) {
      res.status(403).json(fail('FORBIDDEN', 'Invalid admin secret'))
      return
    }

    next()
  } catch {
    res.status(403).json(fail('FORBIDDEN', 'Super admin check failed'))
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(fail(err.code, err.message, err.details))
    return
  }
  if ((err as any)?.name === 'ZodError') {
    const issues = (err as any).issues?.map((i: any) => ({ field: i.path.join('.'), message: i.message }))
    res.status(422).json(fail('VALIDATION_ERROR', 'Validation failed', issues))
    return
  }
  res.status(500).json(fail('INTERNAL_ERROR', 'Internal server error'))
}

export function validate<T extends import('zod').ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) { next(result.error); return }
    req.body = result.data
    next()
  }
}