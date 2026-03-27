import { Worker, Queue } from 'bullmq'
import { logger } from '../lib/logger'
import { db } from '../lib/db'
import { flowEngine } from '../services/flow.engine'

const REDIS_URL = process.env.REDIS_URL!

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

export interface FlowResumeJob {
  stateId: string
  flowId: string
  tenantId: string
  contactId: string
  conversationId: string
  channelId: string
  phone: string
  resumeNodeId: string // nó a executar após o wait
}

export const flowResumeQueue = new Queue<FlowResumeJob>('flow_resume_queue', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 2000 },
  },
})

export function startFlowResumeWorker(): Worker {
  const worker = new Worker<FlowResumeJob>(
    'flow_resume_queue',
    async (job) => {
      const { stateId, flowId, tenantId, contactId, conversationId, channelId, phone, resumeNodeId } = job.data

      logger.info('Resuming flow after wait', { stateId, flowId, resumeNodeId })

      // Verifica se o state ainda existe e está em delay
      const { data: state } = await db
        .from('flow_states')
        .select('*')
        .eq('id', stateId)
        .eq('status', 'delayed')
        .maybeSingle()

      if (!state) {
        logger.info('Flow state not found or not delayed, skipping', { stateId })
        return
      }

      // Busca o flow
      const { data: flow } = await db.from('flows').select('*').eq('id', flowId).single()
      if (!flow) return

      const { data: nodes } = await db.from('flow_nodes').select('*').eq('flow_id', flowId)
      const { data: edges } = await db.from('flow_edges').select('*').eq('flow_id', flowId)

      const nodeMap = new Map((nodes || []).map((n: any) => [n.id, n]))
      const edgeMap = new Map<string, any[]>()
      for (const edge of (edges || [])) {
        const key = `${edge.source_node}:${edge.source_handle || 'success'}`
        if (!edgeMap.has(key)) edgeMap.set(key, [])
        edgeMap.get(key)!.push(edge)
      }

      const variables = state.variables || {}
      const loopCounters = state.loop_counters || {}

      // Marca como running
      await db.from('flow_states').update({ status: 'running', updated_at: new Date() }).eq('id', stateId)

      // Retoma a partir do nó após o wait
      const ctx = {
        tenantId,
        channelId,
        contactId,
        conversationId,
        phone,
        messageBody: '',
        isFirstMessage: false,
      }

      await flowEngine.resumeFromNode(resumeNodeId, ctx, flow, variables, loopCounters, edgeMap, nodeMap, stateId)
    },
    { connection, concurrency: 10 }
  )

  worker.on('completed', (job) => logger.debug('Flow resume job completed', { jobId: job.id }))
  worker.on('failed', (job, err) => logger.error('Flow resume job failed', { jobId: job?.id, error: err.message }))

  logger.info('Flow resume worker started')
  return worker
}
