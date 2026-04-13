import type { Request, Response, NextFunction } from 'express'
import { timingSafeEqual } from 'crypto'
import { requireAuth, errorHandler, validate, fail, logger } from '@autozap/utils'

export { requireAuth, errorHandler, validate }

declare global {
  namespace Express {
    interface Request { auth: import('@autozap/types').JwtPayload }
  }
}

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!
if (!INTERNAL_SECRET) logger.error('⚠ INTERNAL_SECRET não configurado — rotas internas desprotegidas')

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// Internal routes between services use a shared secret header
export function requireInternal(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-internal-secret'] as string | undefined
  if (!safeCompare(secret || '', INTERNAL_SECRET)) {
    res.status(401).json(fail('UNAUTHORIZED', 'Invalid internal secret'))
    return
  }
  next()
}
