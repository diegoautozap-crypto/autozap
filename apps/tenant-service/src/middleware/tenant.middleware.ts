import type { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { db, fail } from '@autozap/utils'

// Re-export shared middleware from @autozap/utils
export { requireAuth, requireRole, errorHandler, validate } from '@autozap/utils'

// Service-specific: requires superadmin DB check + admin secret header
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
