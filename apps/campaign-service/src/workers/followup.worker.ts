import { Worker, Queue, QueueScheduler } from 'bullmq'
import { logger } from '../lib/logger'
import { db } from '../lib/db'

const MESSAGE_SERVICE_URL = process.env.MESSAGE_SERVICE_URL || 'http://localhost:3004'
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'autozap_internal'

function getRedisConnection() {
  try {
    const url = new URL(process.env.REDIS_URL!)
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

export interface FollowUpJob {
  tenantId: string
  conversationId: string
  contactId: string
  channelId: string
  phone: string
  message: string
  followUpConfigId: string
  scheduledAt: string // ISO string de quando foi agendado
}

// Queue pública para agendamento de follow-ups
export const followUpQueue = new Queue<FollowUpJob>('followup_queue', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
})

// ─── Agenda follow-up para uma conversa ─────────────────────────────────────
export async function scheduleFollowUp(params: {
  tenantId: string
  conversationId: string
  contactId: string
  channelId: string
  phone: string
  message: string
  followUpConfigId: string
  delayMs: number // delay em milissegundos
}): Promise<void> {
  const jobId = `followup:${params.conversationId}:${params.followUpConfigId}`

  // Remove job anterior se existir (evita duplicatas)
  await cancelFollowUp(params.conversationId, params.followUpConfigId)

  await followUpQueue.add(
    'send_followup',
    {
      tenantId: params.tenantId,
      conversationId: params.conversationId,
      contactId: params.contactId,
      channelId: params.channelId,
      phone: params.phone,
      message: params.message,
      followUpConfigId: params.followUpConfigId,
      scheduledAt: new Date().toISOString(),
    },
    {
      jobId,
      delay: params.delayMs,
    },
  )

  logger.info('Follow-up agendado', {
    conversationId: params.conversationId,
    delayHours: (params.delayMs / 1000 / 60 / 60).toFixed(1),
    jobId,
  })
}

// ─── Cancela follow-up de uma conversa (quando cliente responde) ─────────────
export async function cancelFollowUp(conversationId: string, followUpConfigId?: string): Promise<void> {
  try {
    if (followUpConfigId) {
      const jobId = `followup:${conversationId}:${followUpConfigId}`
      const job = await followUpQueue.getJob(jobId)
      if (job) {
        await job.remove()
        logger.info('Follow-up cancelado', { conversationId, jobId })
      }
    } else {
      // Cancela todos os follow-ups desta conversa
      const delayed = await followUpQueue.getDelayed()
      for (const job of delayed) {
        if (job.data.conversationId === conversationId) {
          await job.remove()
          logger.info('Follow-up cancelado', { conversationId, jobId: job.id })
        }
      }
    }
  } catch (err) {
    logger.warn('Erro ao cancelar follow-up', { conversationId, err })
  }
}

// ─── Worker que processa os follow-ups ──────────────────────────────────────
export function startFollowUpWorker(): Worker<FollowUpJob> {
  // QueueScheduler necessário para delayed jobs no BullMQ v1/v2
  new QueueScheduler('followup_queue', { connection: getRedisConnection() })

  const worker = new Worker<FollowUpJob>(
    'followup_queue',
    async (job) => {
      const { tenantId, conversationId, contactId, channelId, phone, message, scheduledAt } = job.data

      logger.info('FollowUpWorker: processando', { conversationId, phone })

      // Busca a conversa para checar estado atual
      const { data: conv } = await db
        .from('conversations')
        .select('id, status, last_message_at, bot_active')
        .eq('id', conversationId)
        .eq('tenant_id', tenantId)
        .single()

      if (!conv) {
        logger.warn('FollowUpWorker: conversa não encontrada, pulando', { conversationId })
        return
      }

      // Não envia se conversa foi fechada
      if (conv.status === 'closed') {
        logger.info('FollowUpWorker: conversa fechada, pulando', { conversationId })
        return
      }

      // Não envia se humano assumiu o atendimento
      if (conv.bot_active === false) {
        logger.info('FollowUpWorker: humano ativo, pulando follow-up', { conversationId })
        return
      }

      // Verifica se houve mensagem nova depois do agendamento
      const scheduledDate = new Date(scheduledAt)
      if (conv.last_message_at && new Date(conv.last_message_at) > scheduledDate) {
        logger.info('FollowUpWorker: cliente respondeu após agendamento, pulando', { conversationId })
        return
      }

      // Interpola variáveis na mensagem
      const finalMessage = message.replace(/\{\{phone\}\}/gi, phone)

      // Envia a mensagem via message-service
      const response = await fetch(`${MESSAGE_SERVICE_URL}/messages/send`, {
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
          body: finalMessage,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(`Falha ao enviar follow-up: ${JSON.stringify(err)}`)
      }

      // Registra o follow-up enviado
      await db.from('follow_up_logs').insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        contact_id: contactId,
        message: finalMessage,
        sent_at: new Date(),
      }).catch(() => {}) // não falha se tabela não existir ainda

      logger.info('FollowUpWorker: follow-up enviado', { conversationId, phone })
    },
    {
      connection: getRedisConnection(),
      concurrency: 10,
    },
  )

  worker.on('failed', (job, err) =>
    logger.error('FollowUpWorker: job falhou', {
      jobId: job?.id,
      conversationId: job?.data?.conversationId,
      attempt: job?.attemptsMade,
      error: err.message,
    }),
  )

  logger.info('Follow-up worker iniciado', { concurrency: 10 })
  return worker
}
