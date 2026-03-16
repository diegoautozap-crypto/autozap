import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../lib/jwt'
import { logger } from '../lib/logger'
import { AppError, UnauthorizedError, fail } from '@autozap/utils'
import type { JwtPayload, UserRole } from '@autozap/types'

// Extend Express Request with auth context
declare global {
  namespace Express {
    interface Request {
      auth: JwtPayload
    }
  }
}

// ─── requireAuth ─────────────────────────────────────────────────────────────
// Validates Bearer token and attaches decoded payload to req.auth

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json(fail('UNAUTHORIZED', 'Missing or invalid authorization header'))
    return
  }

  const token = authHeader.slice(7)
  try {
    req.auth = verifyAccessToken(token)
    next()
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json(fail('TOKEN_EXPIRED', 'Access token expired'))
      return
    }
    res.status(401).json(fail('INVALID_TOKEN', 'Invalid access token'))
  }
}

// ─── requireRole ─────────────────────────────────────────────────────────────

const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 0,
  agent: 1,
  admin: 2,
  owner: 3,
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userLevel = ROLE_HIERARCHY[req.auth?.role]
    const minRequired = Math.min(...roles.map((r) => ROLE_HIERARCHY[r]))
    if (userLevel === undefined || userLevel < minRequired) {
      res.status(403).json(fail('FORBIDDEN', 'Insufficient permissions'))
      return
    }
    next()
  }
}

// ─── Global Error Handler ─────────────────────────────────────────────────────

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    logger.warn('App error', { code: err.code, message: err.message, path: req.path })
    res.status(err.statusCode).json(fail(err.code, err.message, err.details))
    return
  }

  // Zod validation errors
  if ((err as any)?.name === 'ZodError') {
    const issues = (err as any).issues?.map((i: any) => ({ field: i.path.join('.'), message: i.message }))
    res.status(422).json(fail('VALIDATION_ERROR', 'Validation failed', issues))
    return
  }

  logger.error('Unhandled error', { err, path: req.path, method: req.method })
  res.status(500).json(fail('INTERNAL_ERROR', 'Internal server error'))
}

// ─── Validate Body (Zod) ──────────────────────────────────────────────────────

import { z } from 'zod'

export function validate<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      next(result.error)
      return
    }
    req.body = result.data
    next()
  }
}
