import { Worker, Queue } from 'bullmq'
import { logger } from '../lib/logger'
import { messageService } from '../services/message.service'
import { db } from '../lib/db'
import { sleep, randomBetween } from '@autozap/utils'
import type { SendMessageJob } from '../services/types'

const REDIS_URL = process.env.REDIS_URL!
const CHANNEL_SERVICE_URL = process.env.CHANNEL_SERVICE_URL || 'http://localhost:3003'
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'autozap_internal'

function getRedisConnection() {
  try {
    const url = new URL(REDIS_URL)
    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
      username: url.username || undefined,
      tls: url.protocol === 'rediss:' ? {} : undefined,
    }
  } catch {
    return { host: 'localhost', port: 6379 }
  }
}

const connection = getRedisConnection()

export const messageQueue = new Queue<SendMessageJob>('message_queue', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'custom',
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
})

export const retryQueue = new Queue<SendMessageJob>('retry_queue', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
})

export function startMessageWorker(): Worker {
  const worker = new Worker<SendMessageJob>(
    'message_queue',
    async (job) => {
      const { messageUuid, tenantId, channelId, to, contentType, body, mediaUrl, retryCount, campaignId } = job.data

      logger.debug('Processing message job', { messageUuid, to, attempt: retryCount })

      const delay = randomBetween(1000, 3000)
      await sleep(delay)

      try {
        const response = await fetch(`${CHANNEL_SERVICE_URL}/internal/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': INTERNAL_SECRET,
          },
          body: JSON.stringify({
            messageUuid,
            channelId,
            tenantId,
            to,
            contentType,
            body,
            mediaUrl,
          }),
        })

        const result = await response.json() as any

        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || `HTTP ${response.status}`)
        }

        await messageService.markSent(messageUuid, result.data.externalId)

        if (campaignId) {
          await db.rpc('increment_message_count', { p_tenant_id: tenantId }).catch(() => {})
        }

        logger.info('Message sent successfully', {
          messageUuid,
          externalId: result.data.externalId,
          tenantId,
        })

      } catch (err: any) {
        const newRetryCount = retryCount + 1
        const errMsg = err.message || 'Unknown error'

        logger.warn('Message send failed', { messageUuid, retryCount: newRetryCount, error: errMsg })

        if (newRetryCount >= 3) {
          await messageService.markFailed(messageUuid, errMsg, newRetryCount)
          logger.error('Message permanently failed', { messageUuid, error: errMsg })
          return
        }

        const delays = [10_000, 30_000, 120_000]
        const retryDelay = delays[newRetryCount - 1] || 120_000

        await messageService.markFailed(messageUuid, errMsg, newRetryCount)

        await retryQueue.add(
          'retry',
          { ...job.data, retryCount: newRetryCount },
          { delay: retryDelay },
        )
      }
    },
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 20,
        duration: 60_000,
      },
    },
  )

  worker.on('completed', (job) => {
    logger.debug('Job completed', { jobId: job.id })
  })

  worker.on('failed', (job, err) => {
    logger.error('Job failed', { jobId: job?.id, error: err.message })
  })

  logger.info('Message worker started')
  return worker
}

export function startRetryWorker(): Worker {
  const worker = new Worker<SendMessageJob>(
    'retry_queue',
    async (job) => {
      await messageQueue.add('send', job.data, { priority: 1 })
    },
    { connection },
  )

  logger.info('Retry worker started')
  return worker
}

export async function startReconciliationJob(): Promise<void> {
  const run = async () => {
    try {
      logger.debug('Running reconciliation job')
      logger.debug('Reconciliation job completed')
    } catch (err) {
      logger.error('Reconciliation job error', { err })
    }
  }

  await run()
  setInterval(run, 5 * 60 * 1000)
}