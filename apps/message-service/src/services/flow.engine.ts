import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { decryptCredentials } from '../lib/crypto'
import { generateId, normalizeBRPhone } from '@autozap/utils'
import { ensureContact, ensureConversation } from './contact.helper'

// ─── In-memory cache to avoid hitting DB on every message ─────────────────────
const cache = new Map<string, { data: any; expires: number }>()
function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const entry = cache.get(key)
  if (entry && entry.expires > Date.now()) return Promise.resolve(entry.data as T)
  return fetcher().then(data => {
    cache.set(key, { data, expires: Date.now() + ttlMs })
    // Cleanup old entries every 100 sets
    if (cache.size > 500) {
      const now = Date.now()
      for (const [k, v] of cache) { if (v.expires < now) cache.delete(k) }
    }
    return data
  })
}

const MESSAGE_SERVICE_URL = process.env.MESSAGE_SERVICE_URL || 'http://localhost:3004'
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'autozap_internal'
const PUSHER_APP_ID  = process.env.PUSHER_APP_ID
const PUSHER_KEY     = process.env.PUSHER_KEY
const PUSHER_SECRET  = process.env.PUSHER_SECRET
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER || 'sa1'

interface FlowContext {
  tenantId: string
  channelId: string
  contactId: string
  conversationId: string
  phone: string
  messageBody: string
  isFirstMessage: boolean
  webhookData?: Record<string, string>
}

interface FlowRow {
  id: string
  tenant_id: string
  channel_id: string | null
  is_active: boolean
  cooldown_type?: 'always' | '24h' | 'once'
  sort_order: number
  created_at: string
}

interface FlowNodeData {
  subtype?: string
  channelId?: string
  keywords?: string[]
  matchType?: 'equals' | 'contains'
  message?: string
  delay?: number
  mediaUrl?: string
  caption?: string
  filename?: string
  question?: string
  saveAs?: string
  url?: string
  method?: string
  body?: string
  saveResponseAs?: string
  responseField?: string
  branches?: ConditionBranch[]
  conditionType?: string
  field?: string
  operator?: string
  value?: string
  tagId?: string
  tagIds?: string[]
  customField?: string
  stage?: string
  pipelineId?: string
  targetFlowId?: string
  times?: number
  maxRetries?: number
  maxIterations?: number
  conditionField?: string
  conditionOperator?: string
  conditionValue?: string
  conditionFieldName?: string
  apiKey?: string
  mode?: 'respond' | 'classify' | 'extract' | 'summarize'
  userMessage?: string
  historyMessages?: number
  systemPrompt?: string
  classifyOptions?: string
  extractField?: string
  model?: string
  maxTokens?: number
  temperature?: number
  timeoutHours?: number
  headers?: { key: string; value: string }[]
  timezone?: string
  agentId?: string
  transcribeSaveAs?: string
  transcribeLanguage?: string
  // set_variable
  variableName?: string
  variableValue?: string
  // math
  mathVariable?: string
  mathOperator?: '+' | '-' | '*' | '/'
  mathValue?: string
  // create_task
  taskTitle?: string
  taskDueHours?: number
  taskAssignTo?: string
  // send_notification
  notificationMessage?: string
  notifyAgentId?: string
  // split_ab
  splitPaths?: { label: string; weight: number }[]
  // random_path
  randomPaths?: string[]
  seconds?: number
  minutes?: number
  hours?: number
  days?: number | number[]
  start?: number
  end?: number
  fields?: { label: string; variable: string; contactField: string }[]
  mappings?: { from: string; to: string }[]
  updateFields?: { field: string; customField?: string; value: string }[]
}

interface FlowNodeRow {
  id: string
  flow_id: string
  type: string
  data: FlowNodeData
}

interface FlowEdgeRow {
  source_node: string
  source_handle: string | null
  target_node: string
}

interface NodeResult {
  success: boolean
  paused?: boolean
  ended?: boolean
  delayed?: boolean
  nextHandle?: string
}

interface ConditionRule {
  id: string
  field: string
  fieldName?: string
  operator: string
  value: string
}

interface ConditionBranch {
  id: string
  label: string
  logic: 'AND' | 'OR'
  rules: ConditionRule[]
}

let pusherFailCount = 0
let pusherCircuitOpen = 0

async function emitPusher(tenantId: string, event: string, data: object): Promise<void> {
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET) return
  // Circuit breaker: se falhou 3x, para por 30s
  if (pusherCircuitOpen > Date.now()) return
  try {
    const body = JSON.stringify({ name: event, channel: `tenant-${tenantId}`, data: JSON.stringify(data) })
    const crypto = await import('crypto')
    const ts  = Math.floor(Date.now() / 1000)
    const md5 = crypto.createHash('md5').update(body).digest('hex')
    const sig = crypto.createHmac('sha256', PUSHER_SECRET).update(`POST\n/apps/${PUSHER_APP_ID}/events\nauth_key=${PUSHER_KEY}&auth_timestamp=${ts}&auth_version=1.0&body_md5=${md5}`).digest('hex')
    await fetch(`https://api-${PUSHER_CLUSTER}.pusher.com/apps/${PUSHER_APP_ID}/events?auth_key=${PUSHER_KEY}&auth_timestamp=${ts}&auth_version=1.0&body_md5=${md5}&auth_signature=${sig}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    pusherFailCount = 0
  } catch (err) {
    pusherFailCount++
    if (pusherFailCount >= 3) { pusherCircuitOpen = Date.now() + 30000; logger.warn('Pusher circuit breaker open for 30s') }
  }
}

export class FlowEngine {

  async processFlows(ctx: FlowContext): Promise<void> {
    try {
      const resumed = await this.resumeWaitingFlow(ctx)
      if (resumed) return

      const { data: flows } = await cached(
        `flows:${ctx.channelId}:${ctx.tenantId}`,
        30_000,
        () => db
          .from('flows')
          .select('*')
          .eq('tenant_id', ctx.tenantId)
          .eq('is_active', true)
          .or(`channel_id.eq.${ctx.channelId},channel_id.is.null`)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
      )

      if (!flows || flows.length === 0) return

      for (const flow of flows) {
        const triggered = await this.checkFlowTrigger(flow, ctx)
        if (!triggered) continue
        const onCooldown = await this.isOnCooldown(flow, ctx)
        if (onCooldown) { logger.info('Flow skipped — cooldown active', { flowId: flow.id }); continue }
        logger.info('Flow triggered', { flowId: flow.id, tenantId: ctx.tenantId })
        await this.executeFlow(flow, ctx, {})
        break
      }
    } catch (err) {
      logger.error('Flow engine error', { err, tenantId: ctx.tenantId })
    }
  }

  // ─── Dispara um flow específico via webhook externo ────────────────────────
  async processWebhookFlow(flowId: string, ctx: FlowContext): Promise<void> {
    try {
      const { data: flow } = await db.from('flows').select('*').eq('id', flowId).single()
      if (!flow || !flow.is_active) return

      // Injeta os dados do webhook como variáveis disponíveis no flow
      // Ex: {{webhook_full_name}}, {{webhook_phone_number}}, {{webhook_email}}
      const variables: Record<string, string> = {}
      if (ctx.webhookData) {
        for (const [key, val] of Object.entries(ctx.webhookData)) {
          variables[`webhook_${key}`] = String(val ?? '')
        }
      }

      logger.info('Flow triggered by webhook', { flowId, tenantId: ctx.tenantId })
      await this.executeFlow(flow, ctx, variables)
    } catch (err) {
      logger.error('processWebhookFlow error', { err, flowId })
    }
  }

  async resumeFromNode(nodeId: string, ctx: FlowContext, flow: FlowRow, variables: Record<string, string>, loopCounters: Record<string, number>, edgeMap: Map<string, FlowEdgeRow[]>, nodeMap: Map<string, FlowNodeRow>, stateId: string): Promise<void> {
    let currentNode = nodeMap.get(nodeId) || null
    let stepCount = 0
    while (currentNode && stepCount < 100) {
      stepCount++
      const result = await this.executeNode(currentNode, ctx, flow.id, variables, loopCounters, edgeMap, nodeMap, stateId)
      if (result.paused || result.ended || result.delayed) break
      const nextHandle = result.nextHandle || (result.success ? 'success' : 'error')
      currentNode = this.getNextNode(currentNode.id, nextHandle, edgeMap, nodeMap)
    }
    const { data: updatedState } = await db.from('flow_states').select('status').eq('id', stateId).single()
    if (updatedState?.status !== 'waiting' && updatedState?.status !== 'delayed') {
      await db.from('flow_states').update({ status: 'completed', updated_at: new Date() }).eq('id', stateId)
    }
  }

  private async resumeWaitingFlow(ctx: FlowContext): Promise<boolean> {
    const { data: state } = await db.from('flow_states').select('*').eq('conversation_id', ctx.conversationId).eq('tenant_id', ctx.tenantId).eq('status', 'waiting').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!state) return false

    logger.info('Resuming waiting flow', { flowId: state.flow_id, nodeId: state.current_node_id })
    const variables = state.variables || {}
    const loopCounters = state.loop_counters || {}
    // Se a resposta é áudio, busca a última mensagem e tenta transcrever
    if (state.waiting_variable) {
      let responseText = ctx.messageBody
      if (!responseText || responseText.trim() === '') {
        // Pode ser áudio — busca última mensagem
        const { data: lastMsg } = await db.from('messages').select('content_type, media_url, body')
          .eq('conversation_id', ctx.conversationId).eq('direction', 'inbound')
          .order('created_at', { ascending: false }).limit(1).single()
        if (lastMsg?.content_type === 'audio' && lastMsg?.media_url) {
          // Tenta transcrever
          try {
            const { data: channel } = await cached(`channel:${ctx.channelId}`, 60_000, () => db.from('channels').select('credentials, type').eq('id', ctx.channelId).single().then(r => r))
            const creds = channel?.credentials || {}
            const metaToken = (typeof creds === 'object' && creds.metaToken?.startsWith('EAA')) ? creds.metaToken : (typeof creds === 'object' ? decryptCredentials(creds).metaToken : null)
            let openaiKey = process.env.OPENAI_API_KEY
            if (!openaiKey) {
              const { data: tenant } = await cached(`tenant:${ctx.tenantId}`, 60_000, () => db.from('tenants').select('metadata').eq('id', ctx.tenantId).single().then(r => r))
              openaiKey = tenant?.metadata?.openai_api_key
            }
            if (metaToken && openaiKey && /^\d+$/.test(lastMsg.media_url)) {
              const metaRes = await fetch(`https://graph.facebook.com/v18.0/${lastMsg.media_url}`, { headers: { Authorization: `Bearer ${metaToken}` } })
              if (metaRes.ok) {
                const metaData = await metaRes.json() as any
                if (metaData.url) {
                  const audioRes = await fetch(metaData.url, { headers: { Authorization: `Bearer ${metaToken}` } })
                  if (audioRes.ok) {
                    const audioBuffer = Buffer.from(await audioRes.arrayBuffer())
                    const { default: OpenAI, toFile } = await import('openai')
                    const openai = new OpenAI({ apiKey: openaiKey })
                    const file = await toFile(audioBuffer, 'audio.ogg', { type: 'audio/ogg' })
                    const transcription = await openai.audio.transcriptions.create({ file, model: 'whisper-1', language: 'pt' })
                    responseText = transcription.text || ''
                    logger.info('Input audio transcribed on resume', { text: responseText.slice(0, 50) })
                  }
                }
              }
            }
          } catch (err) {
            logger.error('Input audio transcription error', { err: err instanceof Error ? err.message : String(err) })
          }
        }
        // Se ainda vazio, usa o body da mensagem
        if (!responseText) responseText = lastMsg?.body || ''
      }
      variables[state.waiting_variable] = responseText
      ctx.messageBody = responseText || ctx.messageBody
    }
    await db.from('flow_states').update({ status: 'running', variables, updated_at: new Date() }).eq('id', state.id)

    const { data: flow } = await db.from('flows').select('*').eq('id', state.flow_id).single()
    if (!flow) return false

    const { data: nodes } = await db.from('flow_nodes').select('*').eq('flow_id', flow.id)
    const { data: edges } = await db.from('flow_edges').select('*').eq('flow_id', flow.id)
    const nodeMap = new Map((nodes || []).map((n: FlowNodeRow) => [n.id, n]))
    const edgeMap = new Map<string, FlowEdgeRow[]>()
    for (const edge of (edges || []) as FlowEdgeRow[]) {
      const key = `${edge.source_node}:${edge.source_handle || 'success'}`
      if (!edgeMap.has(key)) edgeMap.set(key, [])
      edgeMap.get(key)!.push(edge)
    }

    let currentNode: FlowNodeRow | null = state.pending_condition_node_id
      ? nodeMap.get(state.pending_condition_node_id) || null
      : this.getNextNode(state.current_node_id, 'success', edgeMap, nodeMap)

    let stepCount = 0
    const visitedNodes = new Map<string, number>()
    while (currentNode && stepCount < 100) {
      const visits = visitedNodes.get(currentNode.id) || 0
      if (visits >= 3) { logger.warn('Flow loop detected, stopping', { nodeId: currentNode.id }); break }
      visitedNodes.set(currentNode.id, visits + 1)
      stepCount++
      const result = await this.executeNode(currentNode, ctx, flow.id, variables, loopCounters, edgeMap, nodeMap, state.id)
      if (result.paused || result.ended || result.delayed) break
      const nextHandle = result.nextHandle || (result.success ? 'success' : 'error')
      currentNode = this.getNextNode(currentNode.id, nextHandle, edgeMap, nodeMap)
    }

    const { data: updatedState } = await db.from('flow_states').select('status').eq('id', state.id).single()
    if (updatedState?.status !== 'waiting' && updatedState?.status !== 'delayed') {
      await db.from('flow_states').update({ status: 'completed', pending_condition_node_id: null, updated_at: new Date() }).eq('id', state.id)
    }
    await this.logNode(flow.id, generateId(), ctx, 'flow_executed', `Flow retomado e executado`)
    return true
  }

  private async isOnCooldown(flow: FlowRow, ctx: FlowContext): Promise<boolean> {
    const cooldownType = flow.cooldown_type || '24h'
    if (cooldownType === 'always') return false
    const { data } = await db.from('flow_logs').select('created_at').eq('flow_id', flow.id).eq('conversation_id', ctx.conversationId).eq('status', 'flow_executed').order('created_at', { ascending: false }).limit(1)
    if (!data || data.length === 0) return false
    const lastExecution = new Date(data[0].created_at)
    if (cooldownType === 'once') return true
    if (cooldownType === '24h') return Date.now() - lastExecution.getTime() < 24 * 60 * 60 * 1000
    return false
  }

  private async checkFlowTrigger(flow: FlowRow, ctx: FlowContext): Promise<boolean> {
    const { data: nodes } = await db.from('flow_nodes').select('*').eq('flow_id', flow.id)
    if (!nodes || nodes.length === 0) return false
    const triggerNode = (nodes as FlowNodeRow[]).find(n => n.type.startsWith('trigger_'))
    if (!triggerNode) return false
    return this.evaluateTrigger(triggerNode, ctx)
  }

  private evaluateTrigger(node: FlowNodeRow, ctx: FlowContext): boolean {
    const { type, data } = node
    switch (type) {
      case 'trigger_keyword': {
        const keywords: string[] = data?.keywords || []
        if (keywords.length === 0) return false
        const body = (ctx.messageBody || '').toLowerCase().trim()
        const matchType = data?.matchType || 'contains'
        return keywords.some(kw => {
          const k = kw.toLowerCase().trim()
          return matchType === 'equals' ? body === k : body.includes(k)
        })
      }
      case 'trigger_first_message': {
        if (!ctx.isFirstMessage) return false
        const keywords: string[] = data?.keywords || []
        if (keywords.length === 0) return true
        const body = (ctx.messageBody || '').toLowerCase().trim()
        const matchType = data?.matchType || 'contains'
        return keywords.some(kw => {
          const k = kw.toLowerCase().trim()
          return matchType === 'equals' ? body === k : body.includes(k)
        })
      }
      case 'trigger_any_reply': return true
      case 'trigger_webhook':
      case 'trigger_manual':
        // Sempre verdadeiro — disparado diretamente via processWebhookFlow ou execução manual
        return true
      case 'trigger_outside_hours': {
        const start = data?.start ?? 9
        const end = data?.end ?? 18
        const days = (Array.isArray(data?.days) ? data.days : [1, 2, 3, 4, 5]) as number[]
        const tz = data?.timezone || 'America/Sao_Paulo'
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
        const hour = now.getHours()
        const day = now.getDay()
        return !days.includes(day) || hour < start || hour >= end
      }
      default: return false
    }
  }

  private async executeFlow(flow: FlowRow, ctx: FlowContext, variables: Record<string, string>): Promise<void> {
    const { data: nodes } = await db.from('flow_nodes').select('*').eq('flow_id', flow.id)
    const { data: edges } = await db.from('flow_edges').select('*').eq('flow_id', flow.id)
    if (!nodes || nodes.length === 0) return

    const nodeMap = new Map((nodes as FlowNodeRow[]).map(n => [n.id, n]))
    const edgeMap = new Map<string, FlowEdgeRow[]>()
    for (const edge of (edges || []) as FlowEdgeRow[]) {
      const key = `${edge.source_node}:${edge.source_handle || 'success'}`
      if (!edgeMap.has(key)) edgeMap.set(key, [])
      edgeMap.get(key)!.push(edge)
    }

    const triggerNode = (nodes as FlowNodeRow[]).find(n => n.type.startsWith('trigger_'))
    if (!triggerNode) return

    let currentNode = this.getNextNode(triggerNode.id, 'success', edgeMap, nodeMap)
    let stepCount = 0
    const loopCounters: Record<string, number> = {}

    while (currentNode && stepCount < 200) {
      stepCount++
      const result = await this.executeNode(currentNode, ctx, flow.id, variables, loopCounters, edgeMap, nodeMap, null)
      if (result.paused || result.ended || result.delayed) break
      const nextHandle = result.nextHandle || (result.success ? 'success' : 'error')
      currentNode = this.getNextNode(currentNode.id, nextHandle, edgeMap, nodeMap)
    }

    await this.logNode(flow.id, generateId(), ctx, 'flow_executed', `Flow executado com ${stepCount} passos`)
    logger.info('Flow executed', { flowId: flow.id, steps: stepCount })
  }

  private getNextNode(nodeId: string, handle: string, edgeMap: Map<string, FlowEdgeRow[]>, nodeMap: Map<string, FlowNodeRow>): FlowNodeRow | null {
    const key = `${nodeId}:${handle}`
    const edges = edgeMap.get(key)
    if (!edges || edges.length === 0) return null
    return nodeMap.get(edges[0].target_node) || null
  }

  private async executeNode(
    node: FlowNodeRow, ctx: FlowContext, flowId: string,
    variables: Record<string, string>, loopCounters: Record<string, number>,
    edgeMap: Map<string, FlowEdgeRow[]>, nodeMap: Map<string, FlowNodeRow>, stateId: string | null
  ): Promise<NodeResult> {
    const { type, data } = node

    try {
      logger.info('Executing flow node', { nodeId: node.id, type, flowId })
      emitPusher(ctx.tenantId, 'flow.node.start', { flowId, nodeId: node.id, type })

      switch (type) {

        case 'send_message': {
          const message = this.interpolate(data?.message || '', ctx, variables)
          if (!message) break
          const ch = data?.channelId || ctx.channelId
          if (data?.delay && data.delay > 0) {
            const delayMs = data.delay * 1000
            // Cap sync delay at 30s; ignore longer delays (users should use wait node)
            if (delayMs <= 30000) {
              await new Promise(r => setTimeout(r, delayMs))
            } else {
              logger.warn('send_message delay exceeds 30s, skipping delay — use wait node instead', { delay: data.delay, nodeId: node.id })
            }
          }
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: ch, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: message })
          break
        }

        case 'send_image': {
          if (!data?.mediaUrl) break
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: data?.channelId || ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'image', mediaUrl: data.mediaUrl, body: data.caption || '' })
          break
        }

        case 'send_video': {
          if (!data?.mediaUrl) break
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: data?.channelId || ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'video', mediaUrl: data.mediaUrl, body: data.caption || '' })
          break
        }

        case 'send_audio': {
          if (!data?.mediaUrl) break
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: data?.channelId || ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'audio', mediaUrl: data.mediaUrl })
          break
        }

        case 'send_document': {
          if (!data?.mediaUrl) break
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: data?.channelId || ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'document', mediaUrl: data.mediaUrl, body: data.filename || 'documento' })
          break
        }

        case 'input': {
          if (data?.question) {
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: this.interpolate(data.question, ctx, variables) })
          }
          const saveVar = data?.saveAs || 'resposta'
          const nextNode = this.getNextNode(node.id, 'success', edgeMap, nodeMap)
          const pendingConditionNodeId = (nextNode?.type === 'condition') ? nextNode.id : null
          const inputStateId = stateId || generateId()
          await db.from('flow_states').upsert({
            id: inputStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
            conversation_id: ctx.conversationId, current_node_id: node.id, pending_condition_node_id: pendingConditionNodeId,
            variables, loop_counters: loopCounters, waiting_variable: saveVar, status: 'waiting', updated_at: new Date(),
          }, { onConflict: 'flow_id,conversation_id' })
          // Schedule timeout if configured
          if (data?.timeoutHours && data.timeoutHours > 0) {
            const timeoutMs = data.timeoutHours * 3600000
            const { flowResumeQueue } = await import('../workers/flow.worker')
            const timeoutNodeId = this.getNextNode(node.id, 'timeout', edgeMap, nodeMap)?.id
            if (timeoutNodeId) {
              await flowResumeQueue.add('input-timeout', {
                stateId: inputStateId, flowId, tenantId: ctx.tenantId,
                contactId: ctx.contactId, conversationId: ctx.conversationId,
                channelId: ctx.channelId, phone: ctx.phone, resumeNodeId: timeoutNodeId,
              }, { delay: timeoutMs, jobId: `input-timeout-${ctx.conversationId}-${flowId}` })
            }
          }
          return { success: true, paused: true }
        }

        case 'wait': {
          const totalMs = ((data?.seconds || 0) + (data?.minutes || 0) * 60 + (data?.hours || 0) * 3600 + (Number(data?.days) || 0) * 86400) * 1000
          if (totalMs <= 0) break
          if (totalMs <= 300_000) { await new Promise(r => setTimeout(r, totalMs)); break }
          const nextNode = this.getNextNode(node.id, 'success', edgeMap, nodeMap)
          if (!nextNode) break
          const newStateId = stateId || generateId()
          await db.from('flow_states').upsert({
            id: newStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
            conversation_id: ctx.conversationId, current_node_id: node.id, variables, loop_counters: loopCounters,
            status: 'delayed', delay_until: new Date(Date.now() + totalMs).toISOString(), updated_at: new Date(),
          }, { onConflict: 'flow_id,conversation_id' })
          const { flowResumeQueue } = await import('../workers/flow.worker')
          await flowResumeQueue.add('resume', { stateId: newStateId, flowId, tenantId: ctx.tenantId, contactId: ctx.contactId, conversationId: ctx.conversationId, channelId: ctx.channelId, phone: ctx.phone, resumeNodeId: nextNode.id }, { delay: totalMs })
          logger.info('Flow delayed via BullMQ', { flowId, delayMs: totalMs })
          return { success: true, delayed: true }
        }

        case 'loop_repeat': {
          const maxTimes = data?.times || 1
          const countKey = `loop_repeat_${node.id}`
          const current = loopCounters[countKey] || 0
          if (current < maxTimes) {
            loopCounters[countKey] = current + 1
            variables['loop_index'] = String(current + 1)
            let loopNode = this.getNextNode(node.id, 'loop', edgeMap, nodeMap)
            let steps = 0
            while (loopNode && steps < 100) {
              steps++
              if (loopNode.id === node.id) break
              const result = await this.executeNode(loopNode, ctx, flowId, variables, loopCounters, edgeMap, nodeMap, stateId)
              if (result.paused || result.ended || result.delayed) return result
              const next = this.getNextNode(loopNode.id, result.nextHandle || (result.success ? 'success' : 'error'), edgeMap, nodeMap)
              if (!next || next.id === node.id) break
              loopNode = next
            }
            if (loopCounters[countKey] < maxTimes) return { success: true, nextHandle: 'loop' }
          }
          loopCounters[countKey] = 0
          return { success: true, nextHandle: 'done' }
        }

        case 'loop_retry': {
          const maxRetries = data?.maxRetries || 3
          const countKey = `loop_retry_${node.id}`
          const current = loopCounters[countKey] || 0
          if (current >= maxRetries) { loopCounters[countKey] = 0; return { success: true, nextHandle: 'exhausted' } }
          loopCounters[countKey] = current + 1
          return { success: true, nextHandle: 'loop' }
        }

        case 'loop_while': {
          const maxIterations = data?.maxIterations || 10
          const countKey = `loop_while_${node.id}`
          const current = loopCounters[countKey] || 0
          if (current >= maxIterations) { loopCounters[countKey] = 0; return { success: true, nextHandle: 'done' } }
          if (this.evaluateLoopCondition(data, ctx, variables)) {
            loopCounters[countKey] = current + 1
            return { success: true, nextHandle: 'loop' }
          }
          loopCounters[countKey] = 0
          return { success: true, nextHandle: 'done' }
        }

        case 'transcribe_audio': {
          const saveVar = data?.transcribeSaveAs || 'transcricao'

          // Busca última mensagem pra saber o tipo
          const { data: lastMsg } = await db.from('messages').select('content_type, media_url, body')
            .eq('conversation_id', ctx.conversationId).eq('direction', 'inbound')
            .order('created_at', { ascending: false }).limit(1).single()

          logger.info('Transcribe node: last message', { contentType: lastMsg?.content_type, hasMedia: !!lastMsg?.media_url, body: lastMsg?.body?.slice(0, 50) })

          if (lastMsg?.content_type === 'audio' && lastMsg?.media_url) {
            // Busca chave OpenAI
            let whisperKey = data?.apiKey
            if (!whisperKey) {
              const { data: tenant } = await cached(`tenant:${ctx.tenantId}`, 60_000, () => db.from('tenants').select('metadata').eq('id', ctx.tenantId).single().then(r => r))
              whisperKey = tenant?.metadata?.openai_api_key || process.env.OPENAI_API_KEY
            }
            if (!whisperKey) { logger.warn('Transcribe node: no OpenAI API key'); variables[saveVar] = lastMsg.body || ''; break }

            try {
              let audioBuffer: Buffer | null = null
              const mediaId = lastMsg.media_url

              // Busca credenciais do canal (podem estar em texto puro ou criptografadas)
              const { data: channel } = await cached(`channel:${ctx.channelId}`, 60_000, () => db.from('channels').select('credentials, type').eq('id', ctx.channelId).single().then(r => r))
              const rawCreds = channel?.credentials || {}
              const creds = typeof rawCreds === 'string' ? JSON.parse(rawCreds) : rawCreds
              // Tenta descriptografar — se já estiver em texto puro, retorna como está
              const metaToken = creds.metaToken?.startsWith('EAA') ? creds.metaToken : decryptCredentials(creds).metaToken
              const apiKey = creds.apiKey?.length < 100 ? creds.apiKey : decryptCredentials(creds).apiKey

              logger.info('Transcribe creds', { hasMetaToken: !!metaToken, metaTokenStart: metaToken?.slice(0, 10), hasApiKey: !!apiKey, mediaId })

              // 1. Meta Graph API (pra Gupshup Cloud API / WhatsApp Cloud)
              if (metaToken && /^\d+$/.test(mediaId)) {
                const metaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, { headers: { Authorization: `Bearer ${metaToken}` } })
                if (metaRes.ok) {
                  const metaData = await metaRes.json() as any
                  if (metaData.url) {
                    const audioRes = await fetch(metaData.url, { headers: { Authorization: `Bearer ${metaToken}` } })
                    if (audioRes.ok) {
                      audioBuffer = Buffer.from(await audioRes.arrayBuffer())
                      logger.info('Audio downloaded via Meta', { mediaId, size: audioBuffer.length })
                    }
                  }
                } else {
                  const err = await metaRes.text()
                  logger.error('Meta Graph failed', { status: metaRes.status, body: err.slice(0, 150), mediaId })
                }
              }

              // 2. Fallback: Gupshup API
              if (!audioBuffer && apiKey) {
                const gupshupRes = await fetch(`https://api.gupshup.io/wa/api/v1/media/${mediaId}`, { headers: { apikey: apiKey } })
                if (gupshupRes.ok) {
                  const ct = gupshupRes.headers.get('content-type') || ''
                  if (ct.includes('audio') || ct.includes('ogg') || ct.includes('octet')) {
                    audioBuffer = Buffer.from(await gupshupRes.arrayBuffer())
                    logger.info('Audio downloaded via Gupshup', { mediaId, size: audioBuffer.length })
                  }
                }
              }

              if (audioBuffer && audioBuffer.length > 0) {
                const { default: OpenAI, toFile } = await import('openai')
                const openai = new OpenAI({ apiKey: whisperKey })
                const file = await toFile(audioBuffer, 'audio.ogg', { type: 'audio/ogg' })
                const transcription = await openai.audio.transcriptions.create({ file, model: 'whisper-1', language: data?.transcribeLanguage || 'pt' })
                variables[saveVar] = transcription.text || ''
                ctx.messageBody = transcription.text || ctx.messageBody
                logger.info('Audio transcribed', { flowId, nodeId: node.id, length: transcription.text?.length })
              } else {
                logger.warn('Could not download audio', { flowId, mediaId })
                variables[saveVar] = lastMsg.body || ctx.messageBody || ''
              }
            } catch (err) {
              logger.error('Transcribe audio error', { err: err instanceof Error ? err.message : String(err) })
              variables[saveVar] = lastMsg.body || ctx.messageBody || ''
            }
          } else {
            // Texto normal — usa direto
            variables[saveVar] = lastMsg?.body || ctx.messageBody || ''
          }
          // Atualiza contexto pra que nós seguintes (IA, condição) usem o texto
          ctx.messageBody = variables[saveVar] || ctx.messageBody
          break
        }

        case 'ai': {
          let openaiKey = data?.apiKey
          if (!openaiKey) {
            const { data: tenant } = await cached(`tenant:${ctx.tenantId}`, 60_000, () => db.from('tenants').select('metadata').eq('id', ctx.tenantId).single().then(r => r))
            openaiKey = tenant?.metadata?.openai_api_key || process.env.OPENAI_API_KEY
          }
          if (!openaiKey) { logger.warn('AI node: no OpenAI API key'); break }
          const { default: OpenAI } = await import('openai')
          const openai = new OpenAI({ apiKey: openaiKey, timeout: 30000, maxRetries: 1 })
          const aiMode = data?.mode || 'respond'
          const userMessage = this.interpolate(data?.userMessage || ctx.messageBody, ctx, variables)
          const maxHistory = data?.historyMessages ?? 20
          let historyMessages: { role: 'user' | 'assistant'; content: string }[] = []
          if (maxHistory > 0) {
            const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
            const { data: history } = await db.from('messages').select('direction, body, content_type, created_at').eq('conversation_id', ctx.conversationId).eq('tenant_id', ctx.tenantId).in('content_type', ['text']).not('body', 'is', null).gte('created_at', startOfDay.toISOString()).order('created_at', { ascending: false }).limit(maxHistory)
            historyMessages = (history || []).reverse().filter((m: { body?: string }) => m.body?.trim()).map((m: { direction: string; body: string }) => ({ role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.body }))
          }
          let messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = []
          if (aiMode === 'respond') {
            messages = [{ role: 'system', content: data?.systemPrompt || 'Você é um assistente prestativo.' }, ...historyMessages]
            const last = historyMessages[historyMessages.length - 1]
            if (!last || last.content !== userMessage) messages.push({ role: 'user', content: userMessage })
          } else if (aiMode === 'classify') {
            const options = (data?.classifyOptions || '').split(',').map((s: string) => s.trim()).filter(Boolean)
            messages = [{ role: 'system', content: `Classifique em UMA das categorias: ${options.join(', ')}. Responda APENAS com a categoria.` }, { role: 'user', content: userMessage }]
          } else if (aiMode === 'extract') {
            messages = [{ role: 'system', content: `Extraia apenas ${data?.extractField || 'informação'}. Responda apenas com o valor.` }, { role: 'user', content: userMessage }]
          } else if (aiMode === 'summarize') {
            messages = [{ role: 'system', content: 'Resuma em uma frase curta.' }, { role: 'user', content: userMessage }]
          }
          const completion = await openai.chat.completions.create({ model: data?.model || 'gpt-4o-mini', messages, max_tokens: data?.maxTokens || 1000, temperature: data?.temperature ?? 0.7 })
          const aiResponse = completion.choices[0]?.message?.content?.trim() || ''
          if (data?.saveAs) variables[data.saveAs] = aiResponse
          if (aiMode === 'respond' && aiResponse) await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: aiResponse })
          break
        }

        case 'webhook': {
          const url = this.interpolate(data?.url || '', ctx, variables)
          if (!url) break
          const method = (data?.method || 'POST').toUpperCase()
          let body: string | undefined
          if (method !== 'GET') {
            const interpolatedBody = this.interpolate(data?.body || '{}', ctx, variables)
            try { JSON.parse(interpolatedBody); body = interpolatedBody } catch { body = JSON.stringify({ phone: ctx.phone, message: ctx.messageBody, contactId: ctx.contactId, conversationId: ctx.conversationId, ...variables }) }
          }
          const customHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
          if (data?.headers && Array.isArray(data.headers)) {
            for (const h of data.headers) {
              if (h.key && h.value) customHeaders[this.interpolate(h.key, ctx, variables)] = this.interpolate(h.value, ctx, variables)
            }
          }
          const response = await fetch(url, { method, headers: customHeaders, body: method !== 'GET' ? body : undefined, signal: AbortSignal.timeout(10000) })
          const responseText = await response.text()
          if (data?.saveResponseAs) {
            try {
              const json = JSON.parse(responseText)
              if (data?.responseField) { const fieldValue = data.responseField.split('.').reduce((obj: Record<string, unknown>, key: string) => (obj?.[key] as Record<string, unknown>), json); variables[data.saveResponseAs] = String(fieldValue ?? responseText) }
              else { variables[data.saveResponseAs] = responseText }
            } catch { variables[data.saveResponseAs] = responseText }
          }
          variables['webhook_status'] = String(response.status)
          variables['webhook_ok'] = response.ok ? 'true' : 'false'
          break
        }

        case 'condition': {
          const branches: ConditionBranch[] = data?.branches || []
          if (branches.length > 0) {
            let matchedHandle: string | null = null
            for (const branch of branches) { if (this.evaluateBranch(branch, ctx, variables)) { matchedHandle = `branch_${branch.id}`; break } }
            const handle = matchedHandle || 'fallback'
            let nextNode = this.getNextNode(node.id, handle, edgeMap, nodeMap)
            let steps = 0
            while (nextNode && steps < 50) {
              steps++
              const result = await this.executeNode(nextNode, ctx, flowId, variables, loopCounters, edgeMap, nodeMap, stateId)
              if (result.paused || result.ended || result.delayed) return result
              nextNode = this.getNextNode(nextNode.id, result.nextHandle || (result.success ? 'success' : 'error'), edgeMap, nodeMap)
            }
            return { success: true }
          }
          const conditionMet = this.evaluateCondition(data, ctx, variables)
          let nextNode = this.getNextNode(node.id, conditionMet ? 'true' : 'false', edgeMap, nodeMap)
          let steps = 0
          while (nextNode && steps < 50) {
            steps++
            const result = await this.executeNode(nextNode, ctx, flowId, variables, loopCounters, edgeMap, nodeMap, stateId)
            if (result.paused || result.ended || result.delayed) return result
            nextNode = this.getNextNode(nextNode.id, result.success ? 'success' : 'error', edgeMap, nodeMap)
          }
          return { success: true }
        }



        case 'create_contact': {
          // Campos padrão configurados pelo usuário
          // fields: [{ label: 'Telefone', variable: '{{webhook_phone}}', contactField: 'phone' }, ...]
          const fields = data?.fields || []

          const get = (variable: string) => this.interpolate(variable || '', ctx, variables).trim()

          let phone = ''
          let name = ''
          let email = ''
          const extraFields: Record<string, string> = {}

          for (const f of fields) {
            const val = get(f.variable)
            if (!val) continue
            if (f.contactField === 'phone') phone = val.replace(/\D/g, '')
            else if (f.contactField === 'name') name = val
            else if (f.contactField === 'email') email = val
            else if (f.label) extraFields[f.label] = val
          }

          if (!phone && !name) break

          // Normaliza telefone
          const finalPhone = phone ? normalizeBRPhone(phone) : `webhook_${Date.now()}`

          const metadata = Object.keys(extraFields).length > 0 ? extraFields : null
          const notePreview = name ? `Lead: ${name}` : `Lead via webhook`

          // Usa helpers centralizados para criar/atualizar contato e conversa
          const { contactId } = await ensureContact({
            tenantId: ctx.tenantId, phone: finalPhone, name: name || undefined,
            email: email || undefined, origin: 'webhook', metadata, mergeMetadata: true,
          })

          const { data: channel } = await cached(`channel:${ctx.channelId}`, 60_000, () => db.from('channels').select('credentials, type').eq('id', ctx.channelId).single().then(r => r))
          const { conversationId } = await ensureConversation({
            tenantId: ctx.tenantId, contactId, channelId: ctx.channelId,
            channelType: channel?.type || 'whatsapp', lastMessage: notePreview,
          })

          // Salva nota interna com todos os dados organizados
          const noteLines = ['📋 Lead criado via webhook']
          if (name) noteLines.push(`👤 Nome: ${name}`)
          if (finalPhone && !finalPhone.startsWith('webhook_')) noteLines.push(`📱 Telefone: ${finalPhone}`)
          if (email) noteLines.push(`📧 Email: ${email}`)
          for (const [label, val] of Object.entries(extraFields)) {
            noteLines.push(`• ${label}: ${val}`)
          }
          await db.from('conversation_notes').insert({
            conversation_id: conversationId, tenant_id: ctx.tenantId, body: noteLines.join('\n')
          })

          // Atualiza contexto para os próximos nós usarem
          ctx.contactId = contactId
          ctx.conversationId = conversationId
          if (finalPhone && !finalPhone.startsWith('webhook_')) ctx.phone = finalPhone

          // Emite evento Pusher para abrir no inbox
          emitPusher(ctx.tenantId, 'conversation.updated', { conversationId, contactId })

          break
        }

        case 'map_fields': {
          // Mapeia campos do webhook para variáveis com nomes limpos
          // mappings: [{ from: '{{webhook_phone}}', to: 'telefone' }, ...]
          const mappings = data?.mappings || []
          for (const m of mappings) {
            if (!m.from || !m.to) continue
            const val = this.interpolate(m.from, ctx, variables)
            if (val) variables[m.to] = val
          }

          // Se mapeou telefone, atualiza o contato
          const phoneVar = mappings.find(m => m.to === 'telefone' || m.to === 'phone')
          if (phoneVar) {
            const newPhone = this.interpolate(phoneVar.from, ctx, variables).replace(/\D/g, '')
            if (newPhone && newPhone !== ctx.phone) {
              const normalized = normalizeBRPhone(newPhone)
              await db.from('contacts').update({ phone: normalized }).eq('id', ctx.contactId).eq('tenant_id', ctx.tenantId)
              ctx.phone = normalized
            }
          }

          // Atualiza nome se mapeado
          const nameVar = mappings.find(m => m.to === 'nome' || m.to === 'name')
          if (nameVar) {
            const newName = this.interpolate(nameVar.from, ctx, variables)
            if (newName) await db.from('contacts').update({ name: newName }).eq('id', ctx.contactId).eq('tenant_id', ctx.tenantId)
          }

          // Atualiza email se mapeado
          const emailVar = mappings.find(m => m.to === 'email')
          if (emailVar) {
            const newEmail = this.interpolate(emailVar.from, ctx, variables)
            if (newEmail) await db.from('contacts').update({ email: newEmail }).eq('id', ctx.contactId).eq('tenant_id', ctx.tenantId)
          }

          break
        }

        case 'tag_contact':
        case 'add_tag':
        case 'remove_tag': {
          const subtype = data?.subtype || (type === 'add_tag' ? 'add' : type === 'remove_tag' ? 'remove' : 'add')
          const ids = data?.tagIds || (data?.tagId ? [data.tagId] : [])
          for (const tagId of ids) {
            if (subtype === 'add') {
              await db.from('contact_tags').upsert({ contact_id: ctx.contactId, tag_id: tagId }, { onConflict: 'contact_id,tag_id' })
            } else {
              await db.from('contact_tags').delete().eq('contact_id', ctx.contactId).eq('tag_id', tagId)
            }
          }
          break
        }

        case 'update_contact': {
          // Suporta formato novo (updateFields array) e legado (field/value único)
          const fields: { field: string; customField?: string; value: string }[] = data?.updateFields ||
            (data?.field ? [{ field: data.field, customField: data.customField, value: data.value || '' }] : [])
          if (fields.length === 0) break

          const updateData: Record<string, unknown> = {}
          const { data: contact } = await db.from('contacts').select('metadata').eq('id', ctx.contactId).eq('tenant_id', ctx.tenantId).single()
          const metadata: Record<string, string> = contact?.metadata || {}
          let metadataChanged = false

          for (const f of fields) {
            const val = this.interpolate(f.value || '', ctx, variables)
            if (!val) continue
            if (f.field === 'name') updateData.name = val
            else if (f.field === 'phone') updateData.phone = val
            else if (f.field === 'email') updateData.email = val
            else if (f.field === 'custom' && f.customField) { metadata[f.customField] = val; metadataChanged = true }
          }
          if (metadataChanged) updateData.metadata = metadata
          if (Object.keys(updateData).length > 0) await db.from('contacts').update(updateData).eq('id', ctx.contactId).eq('tenant_id', ctx.tenantId)
          break
        }

        case 'move_pipeline': {
          const stage = data?.stage
          if (!stage) break
          const pipelineId = data?.pipelineId || null
          await db.from('conversations').update({ pipeline_stage: stage, pipeline_id: pipelineId }).eq('id', ctx.conversationId)
          emitPusher(ctx.tenantId, 'conversation.updated', { conversationId: ctx.conversationId, pipelineStage: stage, pipelineId })
          break
        }

        case 'assign_agent': {
          if (data?.message) await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: this.interpolate(data.message, ctx, variables) })
          const update: any = { bot_active: false }
          if (data?.agentId === 'round_robin') {
            // Find agent with least open conversations in this tenant
            const { data: agents } = await db.from('users').select('id').eq('tenant_id', ctx.tenantId).eq('status', 'active')
            if (agents?.length) {
              const counts = await Promise.all(agents.map(async (a: any) => {
                const { count } = await db.from('conversations').select('id', { count: 'exact', head: true }).eq('assigned_to', a.id).eq('status', 'open')
                return { id: a.id, count: count || 0 }
              }))
              counts.sort((a: any, b: any) => a.count - b.count)
              update.assigned_to = counts[0].id
            }
          } else if (data?.agentId) {
            update.assigned_to = data.agentId
          }
          await db.from('conversations').update(update).eq('id', ctx.conversationId)
          break
        }

        case 'go_to': {
          if (!data?.targetFlowId) break
          const visitedKey = '__visited_flows'
          const visited = new Set((variables[visitedKey] || '').split(',').filter(Boolean))
          if (visited.has(data.targetFlowId)) {
            logger.warn('Flow recursion detected', { flowId, targetFlowId: data.targetFlowId })
            break
          }
          visited.add(flowId)
          variables[visitedKey] = Array.from(visited).join(',')
          const { data: targetFlow } = await db.from('flows').select('*').eq('id', data.targetFlowId).eq('tenant_id', ctx.tenantId).single()
          if (!targetFlow || !targetFlow.is_active) break
          await this.executeFlow(targetFlow, ctx, variables)
          return { success: true, ended: true }
        }

        case 'create_task': {
          const title = this.interpolate(data?.taskTitle || 'Tarefa do flow', ctx, variables)
          const dueDate = data?.taskDueHours ? new Date(Date.now() + data.taskDueHours * 3600000).toISOString() : null
          await db.from('tasks').insert({
            id: generateId(),
            tenant_id: ctx.tenantId,
            conversation_id: ctx.conversationId,
            contact_id: ctx.contactId,
            assigned_to: data?.taskAssignTo || null,
            created_by: null,
            title,
            due_date: dueDate,
            status: 'pending',
            priority: 'medium',
          })
          logger.info('Task created by flow', { flowId, title })
          break
        }

        case 'send_notification': {
          const notifMsg = this.interpolate(data?.notificationMessage || 'Notificação do flow', ctx, variables)
          // Busca nome do contato pra enriquecer a notificação
          const { data: contactInfo } = await db.from('contacts').select('name, phone').eq('id', ctx.contactId).single()
          const fullMsg = `📢 ${notifMsg}\n\n👤 ${contactInfo?.name || 'Contato'} (${contactInfo?.phone || ctx.phone})`

          // Salva como nota interna na conversa pra aparecer no inbox
          await db.from('messages').insert({
            id: generateId(),
            tenant_id: ctx.tenantId,
            conversation_id: ctx.conversationId,
            contact_id: ctx.contactId,
            direction: 'internal',
            content_type: 'text',
            body: fullMsg,
            status: 'delivered',
          })

          // Emite via Pusher pro agente ver em tempo real
          emitPusher(ctx.tenantId, 'flow.notification', {
            conversationId: ctx.conversationId,
            contactName: contactInfo?.name || ctx.phone,
            message: notifMsg,
            agentId: data?.notifyAgentId || null,
          })
          break
        }

        case 'split_ab': {
          const paths = data?.splitPaths || [{ label: 'A', weight: 50 }, { label: 'B', weight: 50 }]
          const totalWeight = paths.reduce((sum: number, p: any) => sum + (p.weight || 1), 0)
          const rand = Math.random() * totalWeight
          let cumulative = 0
          let selectedIndex = 0
          for (let i = 0; i < paths.length; i++) {
            cumulative += paths[i].weight || 1
            if (rand <= cumulative) { selectedIndex = i; break }
          }
          const selectedPath = paths[selectedIndex]
          variables['ab_path'] = selectedPath.label || String.fromCharCode(65 + selectedIndex)
          return { success: true, nextHandle: `split_${selectedIndex}` }
        }

        case 'random_path': {
          const rpaths = data?.randomPaths || ['A', 'B']
          const idx = Math.floor(Math.random() * rpaths.length)
          variables['random_path'] = rpaths[idx]
          return { success: true, nextHandle: `random_${idx}` }
        }

        case 'end': {
          if (data?.message) await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: this.interpolate(data.message, ctx, variables) })
          return { success: true, ended: true }
        }

        default:
          logger.warn('Unknown node type', { type, nodeId: node.id })
      }

      await this.logNode(flowId, node.id, ctx, 'success', `Nó ${type} executado`)
      emitPusher(ctx.tenantId, 'flow.node.done', { flowId, nodeId: node.id, type, status: 'success' })
      return { success: true }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('Flow node error', { nodeId: node.id, type, err: message })
      await this.logNode(flowId, node.id, ctx, 'error', message)
      emitPusher(ctx.tenantId, 'flow.node.done', { flowId, nodeId: node.id, type, status: 'error' })
      return { success: false }
    }
  }

  private evaluateLoopCondition(data: FlowNodeData, ctx: FlowContext, variables: Record<string, string>): boolean {
    const field = data?.conditionField || 'variable'
    const operator = data?.conditionOperator || 'is_empty'
    const value = data?.conditionValue || ''
    let fv = ''
    if (field === 'message') fv = ctx.messageBody || ''
    else if (field === 'variable') fv = variables[data?.conditionFieldName || ''] || ''
    else if (field === 'phone') fv = ctx.phone || ''
    return this.matchOperator(fv, operator, value)
  }

  private evaluateBranch(branch: ConditionBranch, ctx: FlowContext, variables: Record<string, string>): boolean {
    const { logic, rules } = branch
    if (!rules || rules.length === 0) return false
    if (logic === 'OR') return rules.some(rule => this.evaluateRule(rule, ctx, variables))
    return rules.every(rule => this.evaluateRule(rule, ctx, variables))
  }

  private extractNumber(text: string): number {
    // Tenta converter direto
    const direct = Number(text.replace(/[.,\s]/g, ''))
    if (!isNaN(direct) && text.replace(/\s/g, '').length > 0) return direct

    // Converte texto por extenso pra número (pt-BR)
    const t = text.toLowerCase().trim()
    const map: Record<string, number> = {
      'zero': 0, 'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'tres': 3, 'três': 3,
      'quatro': 4, 'cinco': 5, 'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10,
      'onze': 11, 'doze': 12, 'treze': 13, 'quatorze': 14, 'catorze': 14, 'quinze': 15,
      'vinte': 20, 'trinta': 30, 'quarenta': 40, 'cinquenta': 50, 'sessenta': 60,
      'setenta': 70, 'oitenta': 80, 'noventa': 90, 'cem': 100, 'cento': 100,
      'duzentos': 200, 'trezentos': 300, 'quatrocentos': 400, 'quinhentos': 500,
      'mil': 1000, 'milhao': 1000000, 'milhão': 1000000, 'milhoes': 1000000, 'milhões': 1000000,
    }

    // Tenta "cinquenta mil", "cem mil", "5 mil", "10k", etc
    const kMatch = t.match(/(\d+)\s*k/)
    if (kMatch) return Number(kMatch[1]) * 1000

    const milMatch = t.match(/(\d+)\s*mil/)
    if (milMatch) return Number(milMatch[1]) * 1000

    // "cinquenta mil" → 50 * 1000
    const words = t.replace(/\s+e\s+/g, ' ').split(/\s+/)
    let result = 0
    let current = 0
    for (const w of words) {
      if (map[w] !== undefined) {
        if (w === 'mil') { result += (current || 1) * 1000; current = 0 }
        else if (w === 'milhao' || w === 'milhão' || w === 'milhoes' || w === 'milhões') { result += (current || 1) * 1000000; current = 0 }
        else { current += map[w] }
      } else {
        const n = Number(w.replace(/[.,]/g, ''))
        if (!isNaN(n)) current += n
      }
    }
    result += current

    // Se não extraiu nada, tenta pegar qualquer número da string
    if (result === 0) {
      const numMatch = t.match(/[\d.,]+/)
      if (numMatch) return Number(numMatch[0].replace(/[.,]/g, ''))
    }

    return result
  }

  private matchOperator(fv: string, operator: string, rawVal: string): boolean {
    fv = fv.toLowerCase()
    // Suporta múltiplos valores separados por vírgula (ex: "1, conhecer, crm")
    const values = rawVal.toLowerCase().split(',').map(v => v.trim()).filter(Boolean)
    const val = values[0] || ''
    switch (operator) {
      case 'contains':     return values.length > 1 ? values.some(v => fv.includes(v)) : fv.includes(val)
      case 'not_contains': return values.length > 1 ? values.every(v => !fv.includes(v)) : !fv.includes(val)
      case 'equals':       return values.length > 1 ? values.some(v => fv === v) : fv === val
      case 'not_equals':   return values.length > 1 ? values.every(v => fv !== v) : fv !== val
      case 'starts_with':  return values.length > 1 ? values.some(v => fv.startsWith(v)) : fv.startsWith(val)
      case 'ends_with':    return values.length > 1 ? values.some(v => fv.endsWith(v)) : fv.endsWith(val)
      case 'is_empty':     return fv === ''
      case 'is_not_empty': return fv !== ''
      case 'greater_than':  return this.extractNumber(fv) > this.extractNumber(val)
      case 'less_than':     return this.extractNumber(fv) < this.extractNumber(val)
      case 'greater_equal': return this.extractNumber(fv) >= this.extractNumber(val)
      case 'less_equal':    return this.extractNumber(fv) <= this.extractNumber(val)
      default:             return values.length > 1 ? values.some(v => fv.includes(v)) : fv.includes(val)
    }
  }

  private evaluateRule(rule: ConditionRule, ctx: FlowContext, variables: Record<string, string>): boolean {
    let fv = ''
    if (rule.field === 'message') fv = ctx.messageBody || ''
    else if (rule.field === 'variable') fv = variables[rule.fieldName || rule.field] || ''
    else if (rule.field === 'phone') fv = ctx.phone || ''
    else if (rule.field === 'webhook_status') fv = variables['webhook_status'] || ''
    else fv = ctx.messageBody || ''
    return this.matchOperator(fv, rule.operator, rule.value || '')
  }

  private evaluateCondition(data: FlowNodeData, ctx: FlowContext, variables: Record<string, string>): boolean {
    const { conditionType, field, operator, value } = data || {}
    let fv = ''
    if (conditionType === 'message') fv = ctx.messageBody || ''
    else if (conditionType === 'variable') fv = variables[field] || ''
    else if (conditionType === 'phone') fv = ctx.phone || ''
    else fv = ctx.messageBody || ''
    return this.matchOperator(fv, operator || 'contains', value || '')
  }

  private interpolate(template: string, ctx: FlowContext, variables: Record<string, string> = {}): string {
    let result = template
      .replace(/\{\{phone\}\}/gi, ctx.phone)
      .replace(/\{\{telefone\}\}/gi, ctx.phone)
      .replace(/\{\{message\}\}/gi, ctx.messageBody)
      .replace(/\{\{contactId\}\}/gi, ctx.contactId)
      .replace(/\{\{conversationId\}\}/gi, ctx.conversationId)
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), String(value))
    }
    return result
  }

  private async sendMessage(opts: { tenantId: string; channelId: string; contactId: string; conversationId: string; to: string; contentType: string; body?: string; mediaUrl?: string }): Promise<void> {
    const response = await fetch(`${MESSAGE_SERVICE_URL}/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ tenantId: opts.tenantId, channelId: opts.channelId, contactId: opts.contactId, conversationId: opts.conversationId, to: opts.to, contentType: opts.contentType, body: opts.body, mediaUrl: opts.mediaUrl }),
    })
    if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(`Failed to send message: ${JSON.stringify(err)}`) }
  }

  private async logNode(flowId: string, nodeId: string, ctx: FlowContext, status: string, detail: string): Promise<void> {
    try { await db.from('flow_logs').insert({ id: generateId(), flow_id: flowId, node_id: nodeId, tenant_id: ctx.tenantId, contact_id: ctx.contactId, conversation_id: ctx.conversationId, status, detail }) } catch (err) { logger.warn('Failed to log flow node', { flowId, nodeId, err }) }
  }
}

export const flowEngine = new FlowEngine()