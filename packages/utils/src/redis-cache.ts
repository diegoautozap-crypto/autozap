import { Redis } from 'ioredis'
import { logger } from './logger'

let redis: Redis | null = null
// Circuit breaker simples: depois de 5 falhas seguidas, desliga Redis por 30s
let failCount = 0
let circuitOpenUntil = 0
const FAIL_THRESHOLD = 5
const RECOVER_MS = 30_000

function getRedis(): Redis | null {
  if (Date.now() < circuitOpenUntil) return null
  if (redis) return redis
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true })
    redis.connect().catch(err => { logger.warn('Redis connect failed', { err: err.message }); redis = null })
    return redis
  } catch (err) {
    logger.warn('Redis init failed', { err: (err as Error).message })
    return null
  }
}

function recordFailure(op: string, err: unknown) {
  failCount++
  logger.warn(`Redis ${op} failed`, { err: (err as Error)?.message, failCount })
  if (failCount >= FAIL_THRESHOLD) {
    circuitOpenUntil = Date.now() + RECOVER_MS
    failCount = 0
    logger.error('Redis circuit opened — skipping cache for 30s')
  }
}

function recordSuccess() { if (failCount > 0) failCount = 0 }

export async function cachedGet<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const r = getRedis()
  if (r) {
    try {
      const cached = await r.get(key)
      if (cached) { recordSuccess(); return JSON.parse(cached) as T }
    } catch (err) { recordFailure('get', err) }
  }
  const data = await fetcher()
  if (r && Date.now() >= circuitOpenUntil) {
    try { await r.setex(key, ttlSeconds, JSON.stringify(data)); recordSuccess() }
    catch (err) { recordFailure('setex', err) }
  }
  return data
}

export async function cacheInvalidate(key: string): Promise<void> {
  const r = getRedis()
  if (r) {
    try { await r.del(key); recordSuccess() }
    catch (err) { recordFailure('del', err) }
  }
}
