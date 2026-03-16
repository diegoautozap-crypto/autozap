import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AppError, fail } from '@autozap/utils'
import type { JwtPayload, UserRole } from '@autozap/types'

declare global {
  namespace Express {
    interface Request { auth: JwtPayload }
  }
}

const ACCESS_SECRET = process.env.JWT_SECRET!

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json(fail('UNAUTHORIZED', 'Missing authorization header'))
    return
  }
  try {
    req.auth = jwt.verify(header.slice(7), ACCESS_SECRET) as JwtPayload
    next()
  } catch {
    res.status(401).json(fail('INVALID_TOKEN', 'Invalid or expired token'))
  }
}

const ROLE_HIERARCHY: Record<UserRole, number> = { viewer: 0, agent: 1, admin: 2, owner: 3 }

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const level = ROLE_HIERARCHY[req.auth?.role]
    const min = Math.min(...roles.map(r => ROLE_HIERARCHY[r]))
    if (level === undefined || level < min) {
      res.status(403).json(fail('FORBIDDEN', 'Insufficient permissions'))
      return
    }
    next()
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
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
