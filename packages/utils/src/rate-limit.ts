import type { Request, Response, NextFunction } from 'express'

const hits = new Map<string, { count: number; reset: number }>()

export function rateLimit(opts: { windowMs?: number; max?: number } = {}) {
  const windowMs = opts.windowMs || 60000 // 1 min
  const max = opts.max || 60 // 60 req/min

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.headers['x-forwarded-for'] as string || 'unknown'
    const now = Date.now()
    const record = hits.get(key)

    if (!record || now > record.reset) {
      hits.set(key, { count: 1, reset: now + windowMs })
      next()
      return
    }

    record.count++
    if (record.count > max) {
      res.status(429).json({ error: 'Too many requests' })
      return
    }
    next()
  }
}

// Cleanup every 5 min
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of hits) {
    if (now > val.reset) hits.delete(key)
  }
}, 300000)
