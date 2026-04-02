import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AppError, fail } from '@autozap/utils'
import type { JwtPayload, UserRole } from '@autozap/types'

declare global { namespace Express { interface Request { auth: JwtPayload } } }

const ACCESS_SECRET = process.env.JWT_SECRET!

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) { res.status(401).json(fail('UNAUTHORIZED', 'Missing token')); return }
  try { req.auth = jwt.verify(header.slice(7), ACCESS_SECRET) as JwtPayload; next() }
  catch { res.status(401).json(fail('INVALID_TOKEN', 'Invalid token')) }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) { res.status(err.statusCode).json(fail(err.code, err.message, err.details)); return }
  if ((err as any)?.name === 'ZodError') { res.status(422).json(fail('VALIDATION_ERROR', 'Validation failed', (err as any).issues)); return }
  console.error('Unhandled error:', err instanceof Error ? err.message : err, err instanceof Error ? err.stack : '')
  res.status(500).json(fail('INTERNAL_ERROR', 'Internal server error'))
}

export function validate<T extends import('zod').ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) { next(result.error); return }
    req.body = result.data; next()
  }
}
