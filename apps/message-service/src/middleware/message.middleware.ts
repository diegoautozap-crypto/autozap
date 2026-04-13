import type { Request, Response, NextFunction } from 'express'
import { requireAuth, errorHandler, validate, fail, logger } from '@autozap/utils'

export { requireAuth, errorHandler, validate }

declare global {
  namespace Express {
    interface Request { auth: import('@autozap/types').JwtPayload }
  }
}

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!
if (!INTERNAL_SECRET) logger.error('⚠ INTERNAL_SECRET não configurado — rotas internas desprotegidas')

// Internal routes between services use a shared secret header
export function requireInternal(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-internal-secret']
  if (secret !== INTERNAL_SECRET) {
    res.status(401).json(fail('UNAUTHORIZED', 'Invalid internal secret'))
    return
  }
  next()
}
