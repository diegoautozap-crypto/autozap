import { Worker, Queue } from 'bullmq'
import { logger } from '../lib/logger'
import { messageService } from '../services/message.service'
import { db } from '../lib/db'
import { sleep, randomBetween } from '@autozap/utils'
import type { SendMessageJob } from '../services/types'

const REDIS_URL = process.env.REDIS_URL!
const CHANNEL_SERVICE_URL = process.env.CHANNEL_SERVICE_URL || 'http://localhost:3003'
const MESSAGE_SERVICE_URL = process.env.MESSAGE_SERVICE_URL || 'http://localhost:3004'
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001'
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!

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

// ─── Auto-reply queue ────────────────────────────────────────────────────────
export const autoReplyQueue = new Queue('auto-reply', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
})

// ─── Agent email notification queue ─────────────────────────────────────────
export const agentNotifyQueue = new Queue('agent-notify', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
})

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
      const { messageUuid, tenantId, channelId, to, contentType, body, mediaUrl, filename, retryCount, campaignId, interactiveType, buttons, listRows, listButtonText, footer } = job.data

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
            filename,
            interactiveType,
            buttons,
            listRows,
            listButtonText,
            footer,
          }),
        })

        const result = await response.json() as any

        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || `HTTP ${response.status}`)
        }

        await messageService.markSent(messageUuid, result.data.externalId)

        if (campaignId) {
          try { await db.rpc('increment_message_count', { p_tenant_id: tenantId }) } catch {}
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
      concurrency: 50,
      limiter: {
        max: 500,
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

// ─── Auto-reply worker ───────────────────────────────────────────────────────
export function startAutoReplyWorker(): Worker {
  const worker = new Worker(
    'auto-reply',
    async (job) => {
      const { tenantId, conversationId, channelId, contactId, phone } = job.data

      // Check if someone already replied
      const { data: lastMsg } = await db
        .from('messages')
        .select('direction')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (lastMsg?.direction === 'outbound') return // Already replied, skip

      // Check if bot is still active and conversation not closed
      const { data: conv } = await db
        .from('conversations')
        .select('bot_active, status')
        .eq('id', conversationId)
        .single()

      if (!conv?.bot_active || conv.status === 'closed') return

      // Check tenant settings for auto-reply message
      const { data: tenant } = await db
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single()

      const autoReplyEnabled = tenant?.settings?.autoReplyEnabled !== false // default true
      if (!autoReplyEnabled) return

      const autoReplyMsg =
        tenant?.settings?.autoReplyMessage ||
        'Recebemos sua mensagem! Um atendente vai te responder em breve. \u{1F60A}'

      // Send auto-reply via internal endpoint
      try {
        const sendRes = await fetch(`${MESSAGE_SERVICE_URL}/messages/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': INTERNAL_SECRET,
          },
          body: JSON.stringify({
            tenantId,
            channelId,
            contactId,
            conversationId,
            to: phone,
            contentType: 'text',
            body: autoReplyMsg,
          }),
        })

        if (!sendRes.ok) {
          const err = await sendRes.json().catch(() => ({}))
          logger.error('Auto-reply failed to send', { err, conversationId })
          return
        }

        logger.info('Auto-reply sent', { conversationId, tenantId })
      } catch (err) {
        logger.error('Auto-reply send error', { err, conversationId })
      }
    },
    { connection, concurrency: 5 },
  )

  worker.on('failed', (job, err) => {
    logger.error('Auto-reply job failed', { jobId: job?.id, error: err.message })
  })

  logger.info('Auto-reply worker started')
  return worker
}

// ─── Agent email notification worker ─────────────────────────────────────────
export function startAgentNotifyWorker(): Worker {
  const worker = new Worker(
    'agent-notify',
    async (job) => {
      const { tenantId, conversationId } = job.data

      // Check if someone already replied in the last 10 minutes
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { data: recentOutbound } = await db
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('direction', 'outbound')
        .gte('created_at', tenMinAgo)
        .limit(1)

      if (recentOutbound && recentOutbound.length > 0) return // Agent already replied

      // Check conversation is still open/waiting and assigned to someone
      const { data: conv } = await db
        .from('conversations')
        .select('assigned_to, status, contacts(name, phone)')
        .eq('id', conversationId)
        .single()

      if (!conv?.assigned_to) return // Not assigned to anyone
      if (conv.status === 'closed') return

      // Get agent info
      const { data: agent } = await db
        .from('users')
        .select('email, name, settings')
        .eq('id', conv.assigned_to)
        .single()

      if (!agent?.email) return

      // Check if agent has email notifications disabled
      const agentSettings = agent.settings as Record<string, any> | null
      if (agentSettings?.emailNotifications === false) return

      const contact = conv.contacts as any
      const contactName = contact?.name || 'Cliente'
      const contactPhone = contact?.phone || ''

      // Send notification via auth-service internal endpoint
      try {
        const res = await fetch(`${AUTH_SERVICE_URL}/internal/notify-agent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': INTERNAL_SECRET,
          },
          body: JSON.stringify({
            agentEmail: agent.email,
            agentName: agent.name || 'Atendente',
            contactName,
            contactPhone,
            tenantId,
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          logger.error('Agent notify failed', { err, conversationId })
          return
        }

        logger.info('Agent notification email sent', { conversationId, agentEmail: agent.email })
      } catch (err) {
        logger.error('Agent notify error', { err, conversationId })
      }
    },
    { connection, concurrency: 3 },
  )

  worker.on('failed', (job, err) => {
    logger.error('Agent notify job failed', { jobId: job?.id, error: err.message })
  })

  logger.info('Agent notify worker started')
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