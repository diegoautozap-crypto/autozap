import { Redis } from 'ioredis'

let redis: Redis | null = null

function getRedis(): Redis | null {
  if (redis) return redis
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true })
    redis.connect().catch(() => { redis = null })
    return redis
  } catch { return null }
}

export async function cachedGet<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const r = getRedis()
  if (r) {
    try {
      const cached = await r.get(key)
      if (cached) return JSON.parse(cached) as T
    } catch {}
  }
  const data = await fetcher()
  if (r) {
    try { await r.setex(key, ttlSeconds, JSON.stringify(data)) } catch {}
  }
  return data
}

export async function cacheInvalidate(key: string): Promise<void> {
  const r = getRedis()
  if (r) { try { await r.del(key) } catch {} }
}
