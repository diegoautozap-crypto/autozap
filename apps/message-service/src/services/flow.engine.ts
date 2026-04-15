import { db, logger, decryptCredentials, generateId, normalizeBRPhone, logPipelineCardEvent, validateInput, type ValidationType } from '@autozap/utils'
import { PLAN_LIMITS, type PlanSlug } from '@autozap/types'
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
const CONVERSATION_SERVICE_URL = process.env.CONVERSATION_SERVICE_URL || 'http://localhost:3005'
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!
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
  mode?: 'respond' | 'classify' | 'extract' | 'summarize' | 'duration' | 'until'
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
  // schedule_appointment
  schedulingConfigId?: string
  askDateMessage?: string
  askTimeMessage?: string
  noSlotsMessage?: string
  confirmMessage?: string
  calendarMode?: 'google' | 'internal'
  calendarAction?: 'schedule' | 'cancel'
  googleCalendarId?: string
  eventDuration?: number
  workStart?: string
  workEnd?: string
  workDays?: Record<string, boolean>
  advanceDays?: number
  eventTitle?: string
  showBackButton?: boolean
  priceTable?: Record<string, number>
  msgAskDate?: string
  msgAskTime?: string
  msgConfirm?: string
  msgNoSlots?: string
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
  // wait absoluto
  untilTime?: string
  spreadMinutes?: number
  // lookup_contact
  includeTags?: boolean
  includePurchases?: boolean
  // csat
  invalidMessage?: string
  thankYouMessage?: string
  // validation no input
  validationType?: 'text' | 'email' | 'cpf' | 'cnpj' | 'phone' | 'date' | 'number'
  validationErrorMessage?: string
  validationMaxAttempts?: number
  // webhook trigger
  autoMapFields?: boolean
  ignoredPhones?: string
  // send_message extras
  footer?: string
  buttons?: any[]
  listRows?: any[]
  listButtonText?: string
  // send_message interactive type
  interactiveType?: string
  // input timeout
  timeoutMinutes?: number
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
  // Config opcional para operador is_business_hours / is_not_business_hours
  businessHoursStart?: number
  businessHoursEnd?: number
  businessDays?: number[]
  timezone?: string
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

const NUM_EMOJIS = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']
function numEmoji(n: number): string {
  if (n >= 0 && n <= 10) return NUM_EMOJIS[n]
  return String(n).split('').map(d => NUM_EMOJIS[parseInt(d)] || d).join('')
}

export class FlowEngine {

  /** Check tenant plan limits for a specific resource */
  private async getTenantPlanLimits(tenantId: string): Promise<{ planSlug: PlanSlug; limits: typeof PLAN_LIMITS[PlanSlug] }> {
    const { data: tenant } = await cached(`tenant-plan:${tenantId}`, 60_000, async () => {
      const r = await db.from('tenants').select('plan_slug').eq('id', tenantId).single()
      return r
    })
    const planSlug = (tenant?.plan_slug || 'pending') as PlanSlug
    const limits = PLAN_LIMITS[planSlug] ?? PLAN_LIMITS.pending
    return { planSlug, limits }
  }

  private async getMonthlyAiCount(tenantId: string): Promise<number> {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const { count } = await db
      .from('flow_logs').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'ai_response')
      .gte('created_at', monthStart)
    return count ?? 0
  }

  // Lock para evitar execução simultânea do mesmo flow na mesma conversa
  private flowLocks = new Map<string, number>()
  private readonly DEFAULT_LOCK_TTL = 20_000 // 20 segundos padrão

  private acquireFlowLock(key: string, ttl: number): boolean {
    const now = Date.now()
    const existing = this.flowLocks.get(key)
    if (existing && now - existing < ttl) return false
    this.flowLocks.set(key, now)
    if (this.flowLocks.size > 1000) {
      for (const [k, time] of this.flowLocks) {
        if (now - time > this.DEFAULT_LOCK_TTL) this.flowLocks.delete(k)
      }
    }
    return true
  }

  private async getFlowLockSeconds(flowId: string): Promise<number> {
    const { data: nodes } = await cached(`flow-trigger-lock:${flowId}`, 60_000, async () => {
      return db.from('flow_nodes').select('data').eq('flow_id', flowId).like('type', 'trigger_%').limit(1)
    })
    const triggerData = nodes?.[0]?.data
    const seconds = triggerData?.lockSeconds
    if (typeof seconds === 'number' && seconds >= 1 && seconds <= 120) return seconds
    return 20
  }

  async processFlows(ctx: FlowContext): Promise<boolean> {
    try {
      const resumed = await this.resumeWaitingFlow(ctx)
      if (resumed) return true

      const { data: flows } = await cached(
        `flows:${ctx.channelId}:${ctx.tenantId}`,
        30_000,
        async () => {
          const r = await db
            .from('flows')
            .select('*')
            .eq('tenant_id', ctx.tenantId)
            .eq('is_active', true)
            .or(`channel_id.eq.${ctx.channelId},channel_id.is.null`)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true })
          return r
        },
      )

      if (!flows || flows.length === 0) return false

      // Busca dados da conversa pra filtrar
      const { data: convData } = await db.from('conversations').select('campaign_id, assigned_to').eq('id', ctx.conversationId).single()
      const conversationCampaignId = convData?.campaign_id || null

      // Se conversa está atribuída a um atendente, não dispara flow (atendimento humano em andamento)
      if (convData?.assigned_to) {
        logger.info('Flow skipped — conversation assigned to agent', { assignedTo: convData.assigned_to })
        return false
      }

      for (const flow of flows) {
        // Se flow tem campanha vinculada, só dispara pra contatos daquela campanha
        if (flow.campaign_id && flow.campaign_id !== conversationCampaignId) continue

        const triggered = await this.checkFlowTrigger(flow, ctx)
        if (!triggered) continue

        const onCooldown = await this.isOnCooldown(flow, ctx)
        if (onCooldown) { logger.info('Flow skipped — cooldown active', { flowId: flow.id }); continue }

        // Lock anti-duplicação: lê lockSeconds do nó trigger do flow
        const lockSeconds = await this.getFlowLockSeconds(flow.id)
        const lockKey = `${flow.id}:${ctx.conversationId}`
        if (!this.acquireFlowLock(lockKey, lockSeconds * 1000)) {
          logger.info('Flow skipped — lock active (mensagem simultânea)', { flowId: flow.id, conversationId: ctx.conversationId, lockSeconds })
          return false
        }

        logger.info('Flow triggered', { flowId: flow.id, tenantId: ctx.tenantId })
        await this.executeFlow(flow, ctx, {})
        return true
      }
      return false
    } catch (err) {
      logger.error('Flow engine error', { err, tenantId: ctx.tenantId })
      return false
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

    // Ignora se o state acabou de ser criado (< 2 segundos) — evita que a mesma mensagem
    // que criou o waiting state seja usada como resposta
    const stateAge = Date.now() - new Date(state.updated_at).getTime()
    if (stateAge < 5000) {
      logger.info('Waiting state too fresh, ignoring this message', { flowId: state.flow_id, stateAge })
      return true // retorna true pra não disparar novo flow
    }

    // Lock pra evitar resume duplicado na mesma conversa
    const resumeKey = `resume:${state.flow_id}:${ctx.conversationId}`
    if (!this.acquireFlowLock(resumeKey, 5000)) {
      logger.info('Resume skipped — already processing', { flowId: state.flow_id, conversationId: ctx.conversationId })
      return true
    }

    logger.info('Resuming waiting flow', { flowId: state.flow_id, nodeId: state.current_node_id })
    const variables = state.variables || {}
    const loopCounters = state.loop_counters || {}
    let csatHandle: 'detractor' | 'passive' | 'promoter' | null = null
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
            const { data: channel } = await cached(`channel:${ctx.channelId}`, 60_000, async () => { const r = await db.from('channels').select('credentials, type').eq('id', ctx.channelId).single(); return r })
            const creds = channel?.credentials || {}
            const metaToken = (typeof creds === 'object' && creds.metaToken?.startsWith('EAA')) ? creds.metaToken : (typeof creds === 'object' ? decryptCredentials(creds).metaToken : null)
            let openaiKey = process.env.OPENAI_API_KEY
            if (!openaiKey) {
              const { data: tenant } = await cached(`tenant:${ctx.tenantId}`, 60_000, async () => { const r = await db.from('tenants').select('metadata').eq('id', ctx.tenantId).single(); return r })
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
      // If response is a number, try to map to button/list title from previous send_message node
      if (responseText && /^\d+$/.test(responseText.trim())) {
        try {
          const num = parseInt(responseText.trim())
          const { data: edges } = await db.from('flow_edges').select('source_node').eq('target_node', state.current_node_id).eq('flow_id', state.flow_id)
          logger.info('Number-to-title mapping', { num, currentNode: state.current_node_id, edgeCount: edges?.length })
          if (edges && edges.length > 0) {
            // Try all source nodes to find one with buttons/listRows
            for (const edge of edges) {
              const { data: srcNode } = await db.from('flow_nodes').select('data').eq('id', edge.source_node).single()
              const btns = srcNode?.data?.buttons as any[] | undefined
              const rows = srcNode?.data?.listRows as any[] | undefined
              logger.info('Checking source node', { sourceNode: edge.source_node, hasBtns: !!btns?.length, hasRows: !!rows?.length, btnCount: btns?.length })
              // Check listRows first (priority over buttons for list-type nodes)
              if (rows && rows.length > 0 && num >= 1 && num <= rows.length) {
                const row = rows[num - 1]
                responseText = typeof row === 'string' ? row : (row?.title || row?.displayText || JSON.stringify(row) !== '{}' ? (row?.title || row?.displayText || responseText) : responseText)
                logger.info('Mapped number to list row title', { num, title: responseText })
                break
              } else if (btns && btns.length > 0 && num >= 1 && num <= btns.length) {
                const btn = btns[num - 1]
                responseText = typeof btn === 'string' ? btn : (btn?.title || btn?.displayText || responseText)
                logger.info('Mapped number to button title', { num, title: responseText })
                break
              }
            }
          }
        } catch (mapErr) { logger.warn('Number mapping failed', { err: (mapErr as Error).message }) }
      }

      // Busca config do node atual (usado por validação de input E por CSAT)
      const { data: currentNodeRow } = await db.from('flow_nodes').select('data, type').eq('id', state.current_node_id).single()
      const nodeData = (currentNodeRow as { data?: any; type?: string } | null)?.data || {}
      const currentNodeType = (currentNodeRow as { type?: string } | null)?.type || ''

      // Tratamento especial: CSAT
      if (state.waiting_variable === '_csat_rating_' && currentNodeType === 'csat') {
        const numMatch = String(responseText || '').match(/\d+/)
        const rating = numMatch ? Math.min(10, Math.max(0, parseInt(numMatch[0]))) : null
        if (rating === null) {
          // Não entendeu a nota — pede de novo (uma vez só, sem reenviar pergunta)
          const retryMsg = nodeData.invalidMessage || 'Por favor, me responda com uma nota de 0 a 10 🙂'
          await this.sendMessage({
            tenantId: ctx.tenantId, channelId: ctx.channelId,
            contactId: ctx.contactId, conversationId: ctx.conversationId,
            to: ctx.phone, contentType: 'text', body: retryMsg,
          })
          return true
        }
        variables.csat_rating = String(rating)
        csatHandle = rating <= 6 ? 'detractor' : rating <= 8 ? 'passive' : 'promoter'
        variables.csat_category = csatHandle
        // Salva na conversa pra agregação
        await db.from('conversations').update({
          metadata: { csat_rating: rating, csat_category: csatHandle, csat_at: new Date().toISOString() },
        }).eq('id', ctx.conversationId).eq('tenant_id', ctx.tenantId)
        // Thank-you message (opcional)
        const thankMsg = nodeData.thankYouMessage ||
          (csatHandle === 'promoter' ? 'Obrigado! 🙏 Fico feliz que gostou!' :
           csatHandle === 'passive'  ? 'Obrigado pelo feedback!' :
                                       'Obrigado pela sinceridade, vamos melhorar 🙏')
        if (thankMsg) {
          await this.sendMessage({
            tenantId: ctx.tenantId, channelId: ctx.channelId,
            contactId: ctx.contactId, conversationId: ctx.conversationId,
            to: ctx.phone, contentType: 'text', body: thankMsg,
          })
        }
      }

      const validationType = nodeData.validationType as ValidationType | undefined
      const maxAttempts = Number(nodeData.validationMaxAttempts ?? 3)
      if (validationType && validationType !== 'text' && responseText) {
        const result = validateInput(validationType, responseText)
        if (!result.valid) {
          const attempts = Number((variables as any)._input_attempts_ || 0) + 1
          if (attempts < maxAttempts) {
            const errorMsg = nodeData.validationErrorMessage
              ? String(nodeData.validationErrorMessage).replace('{{error}}', result.error || '')
              : (result.error || 'Valor inválido, tenta de novo.')
            await this.sendMessage({
              tenantId: ctx.tenantId, channelId: ctx.channelId,
              contactId: ctx.contactId, conversationId: ctx.conversationId,
              to: ctx.phone, contentType: 'text',
              body: errorMsg,
            })
            // Mantém estado waiting e incrementa tentativa
            ;(variables as any)._input_attempts_ = attempts
            await db.from('flow_states').update({
              variables, updated_at: new Date(),
            }).eq('id', state.id)
            return true // mantém o flow esperando nova resposta válida
          } else {
            // Esgotou tentativas — vai pro handle 'invalid' (ou segue success com valor cru se não houver)
            ;(variables as any)._input_attempts_ = 0
            variables[state.waiting_variable] = responseText
            variables[`${state.waiting_variable}_invalid`] = 'true'
          }
        } else {
          // Válido — salva normalizado e reseta tentativas
          ;(variables as any)._input_attempts_ = 0
          variables[state.waiting_variable] = result.normalized ?? responseText
          ctx.messageBody = result.normalized ?? responseText
        }
      } else {
        variables[state.waiting_variable] = responseText
        ctx.messageBody = responseText || ctx.messageBody
      }
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
      : this.getNextNode(state.current_node_id, csatHandle || 'success', edgeMap, nodeMap)

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

    // Check ignored phones list
    const ignoredPhones = triggerNode.data?.ignoredPhones
    if (ignoredPhones) {
      const list = ignoredPhones.split('\n').map((p: string) => p.trim().replace(/\D/g, '')).filter(Boolean)
      const phone = ctx.phone.replace(/\D/g, '')
      if (list.some((p: string) => phone.endsWith(p) || p.endsWith(phone.slice(-8)))) {
        logger.info('Flow skipped — phone in ignored list', { phone: ctx.phone })
        return false
      }
    }

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
          const isMediaSubtype = ['image', 'video', 'audio', 'document'].includes(data?.subtype)
          if (!message && !isMediaSubtype) break
          const ch = ctx.channelId
          if (data?.delay && data.delay > 0) {
            const delayMs = data.delay * 1000
            if (delayMs <= 30000) {
              await new Promise(r => setTimeout(r, delayMs))
            } else {
              logger.warn('send_message delay exceeds 30s, skipping delay — use wait node instead', { delay: data.delay, nodeId: node.id })
            }
          }

          // Interactive buttons or list (v2)
          logger.info('send_message debug', { subtype: data?.subtype, hasButtons: !!data?.buttons?.length, hasListRows: !!data?.listRows?.length, nodeId: node.id })
          if (data?.subtype === 'buttons' && data?.buttons?.length) {
            const buttons = data.buttons.map((b: any, i: number) => ({ id: `btn_${i}`, title: this.interpolate(b.title || b, ctx, variables) }))
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ch, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: message, interactiveType: 'button', buttons, footer: data.footer ? this.interpolate(data.footer, ctx, variables) : undefined })
          } else if (data?.subtype === 'list' && data?.listRows?.length) {
            const listRows = data.listRows.map((r: any, i: number) => ({ id: `row_${i}`, title: this.interpolate(r.title || r, ctx, variables), description: r.description ? this.interpolate(r.description, ctx, variables) : undefined }))
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ch, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: message, interactiveType: 'list', listRows, listButtonText: data.listButtonText || 'Ver opções', footer: data.footer ? this.interpolate(data.footer, ctx, variables) : undefined })
          } else if (data?.subtype === 'image' && data?.mediaUrl) {
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ch, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'image', mediaUrl: data.mediaUrl, body: data.caption ? this.interpolate(data.caption, ctx, variables) : '' })
          } else if (data?.subtype === 'video' && data?.mediaUrl) {
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ch, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'video', mediaUrl: data.mediaUrl, body: data.caption ? this.interpolate(data.caption, ctx, variables) : '' })
          } else if (data?.subtype === 'audio' && data?.mediaUrl) {
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ch, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'audio', mediaUrl: data.mediaUrl })
          } else if (data?.subtype === 'document' && data?.mediaUrl) {
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ch, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'document', mediaUrl: data.mediaUrl, body: data.caption ? this.interpolate(data.caption, ctx, variables) : '' })
          } else {
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ch, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: message })
          }
          break
        }

        case 'send_image': {
          if (!data?.mediaUrl) break
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'image', mediaUrl: data.mediaUrl, body: data.caption || '' })
          break
        }

        case 'send_video': {
          if (!data?.mediaUrl) break
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'video', mediaUrl: data.mediaUrl, body: data.caption || '' })
          break
        }

        case 'send_audio': {
          if (!data?.mediaUrl) break
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'audio', mediaUrl: data.mediaUrl })
          break
        }

        case 'send_document': {
          if (!data?.mediaUrl) break
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'document', mediaUrl: data.mediaUrl, body: data.filename || 'documento' })
          break
        }

        case 'input': {
          if (data?.question) {
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: this.interpolate(data.question, ctx, variables) })
          }
          // Loga o input antes de pausar — senão analytics não sabe que cliente parou aqui
          await this.logNode(flowId, node.id, ctx, 'waiting', `Aguardando resposta: ${(data?.question || '').slice(0, 60)}`)
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
          const timeoutMs = data?.timeoutMinutes ? data.timeoutMinutes * 60000 : data?.timeoutHours ? data.timeoutHours * 3600000 : 0
          if (timeoutMs > 0) {
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
          let totalMs: number
          if (data?.mode === 'until' && data?.untilTime) {
            // Espera até HH:MM (no timezone especificado ou América/SP)
            const tz = data?.timezone || 'America/Sao_Paulo'
            const untilTimeStr = String(data.untilTime)
            const [hh, mm] = untilTimeStr.split(':').map((n: string) => parseInt(n))
            if (isNaN(hh) || isNaN(mm)) { logger.warn('wait until: horário inválido', { untilTime: untilTimeStr }); break }
            // Calcula próxima ocorrência desse horário no tz
            const now = new Date()
            const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: tz }))
            const target = new Date(nowInTz)
            target.setHours(hh, mm, 0, 0)
            // Se o horário já passou hoje, vai pra amanhã (comportamento padrão)
            if (target.getTime() <= nowInTz.getTime()) target.setDate(target.getDate() + 1)
            // Jitter pra evitar disparar tudo no mesmo segundo (evita rate limit WhatsApp)
            const spreadMinutes = Number(data?.spreadMinutes ?? 0)
            let jitterMs = 0
            if (spreadMinutes > 0) {
              jitterMs = Math.floor(Math.random() * spreadMinutes * 60_000)
            }
            totalMs = target.getTime() - nowInTz.getTime() + jitterMs
            logger.info('Wait until specific time', { tz, untilTime: untilTimeStr, delayMinutes: Math.round(totalMs / 60000), jitterSec: Math.round(jitterMs / 1000) })
          } else {
            totalMs = ((data?.seconds || 0) + (data?.minutes || 0) * 60 + (data?.hours || 0) * 3600 + (Number(data?.days) || 0) * 86400) * 1000
          }
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

          // Check if plan allows transcription
          const { limits: transcribeLimits } = await this.getTenantPlanLimits(ctx.tenantId)
          if (!transcribeLimits.transcription) {
            logger.warn('Transcribe node blocked — plan does not allow transcription', { tenantId: ctx.tenantId })
            variables[saveVar] = ctx.messageBody || ''
            break
          }

          // Busca última mensagem pra saber o tipo
          const { data: lastMsg } = await db.from('messages').select('content_type, media_url, body')
            .eq('conversation_id', ctx.conversationId).eq('direction', 'inbound')
            .order('created_at', { ascending: false }).limit(1).single()

          logger.info('Transcribe node: last message', { contentType: lastMsg?.content_type, hasMedia: !!lastMsg?.media_url, body: lastMsg?.body?.slice(0, 50) })

          if (lastMsg?.content_type === 'audio' && lastMsg?.media_url) {
            // Busca chave OpenAI
            let whisperKey = data?.apiKey
            if (!whisperKey) {
              const { data: tenant } = await cached(`tenant:${ctx.tenantId}`, 60_000, async () => { const r = await db.from('tenants').select('metadata').eq('id', ctx.tenantId).single(); return r })
              whisperKey = tenant?.metadata?.openai_api_key || process.env.OPENAI_API_KEY
            }
            if (!whisperKey) { logger.warn('Transcribe node: no OpenAI API key'); variables[saveVar] = lastMsg.body || ''; break }

            try {
              let audioBuffer: Buffer | null = null
              const mediaId = lastMsg.media_url

              // Busca credenciais do canal (podem estar em texto puro ou criptografadas)
              const { data: channel } = await cached(`channel:${ctx.channelId}`, 60_000, async () => { const r = await db.from('channels').select('credentials, type').eq('id', ctx.channelId).single(); return r })
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
          // Check AI response limit
          const { limits: aiLimits } = await this.getTenantPlanLimits(ctx.tenantId)
          if (aiLimits.aiResponses !== null) {
            const currentAiCount = await this.getMonthlyAiCount(ctx.tenantId)
            if (currentAiCount >= aiLimits.aiResponses) {
              logger.warn('AI node blocked — monthly AI limit reached', { tenantId: ctx.tenantId, limit: aiLimits.aiResponses, used: currentAiCount })
              await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Nosso atendimento automático está temporariamente indisponível. Um atendente vai te responder em breve!' })
              await db.from('conversations').update({ bot_active: false }).eq('id', ctx.conversationId).eq('tenant_id', ctx.tenantId)
              // Notifica o gestor via Pusher + email
              emitPusher(ctx.tenantId, 'plan.limit_reached', { type: 'aiResponses', limit: aiLimits.aiResponses, used: currentAiCount, message: `Limite de ${aiLimits.aiResponses.toLocaleString()} respostas IA/mês atingido. Faça upgrade do plano.` })
              try {
                const { data: owner } = await db.from('users').select('email, name').eq('tenant_id', ctx.tenantId).eq('role', 'owner').single()
                if (owner?.email) {
                  const { Resend } = require('resend')
                  const resend = new Resend(process.env.RESEND_API_KEY || process.env.SMTP_PASS)
                  await resend.emails.send({
                    from: process.env.RESEND_FROM || 'AutoZap <noreply@useautozap.app>',
                    to: owner.email,
                    subject: '⚠️ Limite de respostas IA atingido — AutoZap',
                    html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px"><h1 style="color:#f59e0b;font-size:24px">Limite de IA atingido</h1><p>Olá, ${owner.name || 'gestor'}!</p><p>Seu plano atingiu o limite de <strong>${aiLimits.aiResponses.toLocaleString()} respostas IA</strong> neste mês. Os flows com nó de IA foram pausados automaticamente.</p><p>Para reativar, faça upgrade do seu plano:</p><a href="https://useautozap.app/dashboard/settings#planos" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Ver planos</a></div>`,
                  })
                }
              } catch {}
              break
            }
          }

          let openaiKey = data?.apiKey
          if (!openaiKey) {
            const { data: tenant } = await cached(`tenant:${ctx.tenantId}`, 60_000, async () => { const r = await db.from('tenants').select('metadata').eq('id', ctx.tenantId).single(); return r })
            openaiKey = tenant?.metadata?.openai_api_key || process.env.OPENAI_API_KEY
          }
          if (!openaiKey) { logger.warn('AI node: no OpenAI API key'); break }
          const { default: OpenAI } = await import('openai')
          const openai = new OpenAI({ apiKey: openaiKey, timeout: 30000, maxRetries: 1 })
          const aiMode = data?.mode || 'respond'
          const userMessage = this.interpolate(data?.userMessage || ctx.messageBody, ctx, variables)
          // maxHistory: 0 ou undefined = conversa inteira (cap de segurança 500); N>0 = últimas N msgs
          const rawHistoryLimit = data?.historyMessages
          const maxHistory = rawHistoryLimit === 0 || rawHistoryLimit === undefined || rawHistoryLimit === null
            ? 500
            : Math.min(Number(rawHistoryLimit), 500)
          let historyMessages: { role: 'user' | 'assistant'; content: string }[] = []
          if (maxHistory > 0) {
            const { data: history } = await db.from('messages')
              .select('direction, body, content_type, created_at')
              .eq('conversation_id', ctx.conversationId)
              .eq('tenant_id', ctx.tenantId)
              .in('content_type', ['text'])
              .not('body', 'is', null)
              .order('created_at', { ascending: false })
              .limit(maxHistory)
            historyMessages = (history || []).reverse()
              .filter((m: { body?: string }) => m.body?.trim())
              .map((m: { direction: string; body: string }) => ({
                role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
                content: m.body,
              }))
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
          // Log AI usage for plan limit tracking
          await this.logNode(flowId, node.id, ctx, 'ai_response', `AI ${aiMode}: ${aiResponse.slice(0, 100)}`)
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
              if (h.key && h.value) {
                // Sanitiza headers contra CRLF injection
                const key = this.interpolate(h.key, ctx, variables).replace(/[\r\n]/g, '')
                const value = this.interpolate(h.value, ctx, variables).replace(/[\r\n]/g, '')
                customHeaders[key] = value
              }
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
            else if (f.label) {
              // Normaliza o nome do campo (ex: "Cidade" → "cidade")
              const fieldName = f.label.replace(/\s+/g, '_').toLowerCase()
              extraFields[fieldName] = val
              // Auto-registra no CRM se ainda não existir (aparece em filtros e perfil do contato)
              const { data: existing } = await db.from('custom_fields')
                .select('id').eq('tenant_id', ctx.tenantId).eq('name', fieldName).maybeSingle()
              if (!existing) {
                await db.from('custom_fields').insert({
                  tenant_id: ctx.tenantId, name: fieldName, label: f.label,
                  type: 'text', sort_order: 99,
                }).then(() => {})
              }
            }
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

          const { data: channel } = await cached(`channel:${ctx.channelId}`, 60_000, async () => { const r = await db.from('channels').select('credentials, type').eq('id', ctx.channelId).single(); return r })
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
            else if (f.field === 'custom' && f.customField) {
              metadata[f.customField] = val; metadataChanged = true
              // Auto-criar custom_field no CRM se não existir
              const fieldName = f.customField.replace(/\s+/g, '_').toLowerCase()
              const { data: existing } = await db.from('custom_fields').select('id').eq('tenant_id', ctx.tenantId).eq('name', fieldName).maybeSingle()
              if (!existing) {
                await db.from('custom_fields').insert({ tenant_id: ctx.tenantId, name: fieldName, label: f.customField, type: 'text', sort_order: 99 }).then(() => {})
              }
              // Usa o nome normalizado no metadata
              if (fieldName !== f.customField) { metadata[fieldName] = val; delete metadata[f.customField] }
            }
          }
          if (metadataChanged) updateData.metadata = metadata
          if (Object.keys(updateData).length > 0) await db.from('contacts').update(updateData).eq('id', ctx.contactId).eq('tenant_id', ctx.tenantId)
          break
        }

        case 'move_pipeline': {
          const stage = data?.stage
          if (!stage) break
          const pipelineId = data?.pipelineId || null
          const { data: before } = await db.from('conversations')
            .select('pipeline_stage, pipeline_id').eq('id', ctx.conversationId).single()
          await db.from('conversations').update({ pipeline_stage: stage, pipeline_id: pipelineId }).eq('id', ctx.conversationId)
          emitPusher(ctx.tenantId, 'conversation.updated', { conversationId: ctx.conversationId, pipelineStage: stage, pipelineId })
          await logPipelineCardEvent({
            tenantId: ctx.tenantId,
            conversationId: ctx.conversationId,
            pipelineId: pipelineId || before?.pipeline_id || null,
            eventType: before?.pipeline_stage ? 'moved' : 'created',
            fromColumn: before?.pipeline_stage || null,
            toColumn: stage,
            metadata: { source: 'flow' },
          })
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

        case 'lookup_contact': {
          // Carrega dados do contato em variáveis do fluxo
          const { data: contact } = await db.from('contacts')
            .select('name, phone, email, metadata, created_at')
            .eq('id', ctx.contactId).eq('tenant_id', ctx.tenantId).single()
          if (contact) {
            variables.contact_name = contact.name || ''
            variables.contact_phone = contact.phone || ''
            variables.contact_email = contact.email || ''
            variables.contact_created_at = contact.created_at || ''
            // Campos customizados no metadata
            if (contact.metadata && typeof contact.metadata === 'object') {
              for (const [k, v] of Object.entries(contact.metadata)) {
                variables[`contact_${k}`] = String(v ?? '')
              }
            }
          }
          if (data?.includeTags !== false) {
            const { data: tags } = await db.from('contact_tags')
              .select('tags(name)').eq('contact_id', ctx.contactId)
            variables.contact_tags = (tags || []).map((r: any) => r.tags?.name).filter(Boolean).join(', ')
          }
          if (data?.includePurchases !== false) {
            const { data: purchases } = await db.from('purchases')
              .select('total_price, shipping, products(name)')
              .eq('contact_id', ctx.contactId).eq('tenant_id', ctx.tenantId)
              .order('created_at', { ascending: false }).limit(20)
            const total = (purchases || []).reduce((s: number, p: any) => s + Number(p.total_price || 0) + Number(p.shipping || 0), 0)
            variables.contact_purchase_total = total.toFixed(2)
            variables.contact_purchase_count = String((purchases || []).length)
            const lastProducts = (purchases || []).slice(0, 3).map((p: any) => p.products?.name).filter(Boolean)
            variables.contact_last_products = lastProducts.join(', ')
          }
          logger.info('Lookup contact done', { flowId, contactId: ctx.contactId })
          break
        }

        case 'csat': {
          // Manda pergunta inicial e pausa esperando nota (0-10)
          const question = this.interpolate(data?.question || 'De 0 a 10, como você avalia nosso atendimento?', ctx, variables)
          await this.sendMessage({
            tenantId: ctx.tenantId, channelId: ctx.channelId,
            contactId: ctx.contactId, conversationId: ctx.conversationId,
            to: ctx.phone, contentType: 'text', body: question,
          })
          await this.logNode(flowId, node.id, ctx, 'waiting', `Aguardando nota CSAT`)
          const csatStateId = stateId || generateId()
          await db.from('flow_states').upsert({
            id: csatStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
            conversation_id: ctx.conversationId, current_node_id: node.id,
            pending_condition_node_id: null,
            variables, loop_counters: loopCounters,
            waiting_variable: '_csat_rating_', status: 'waiting',
            updated_at: new Date(),
          }, { onConflict: 'flow_id,conversation_id' })
          return { success: true, paused: true }
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

        case 'schedule_appointment': {
          // Google Calendar mode
          if ((data?.calendarMode || 'google') === 'google') {
            const result = await this.executeGoogleCalendarNode(node, ctx, flowId, data, variables, loopCounters, stateId)
            if (result) return result
            break
          }

          // Internal mode (legacy)
          const configId = data?.schedulingConfigId
          if (!configId) { await this.logNode(flowId, node.id, ctx, 'error', 'schedulingConfigId não configurado'); break }

          const step = variables['_schedule_step'] || '1'

          if (step === '1') {
            // Step 1: Show available days
            const today = new Date()
            const days: string[] = []

            const { data: config } = await db.from('scheduling_config').select('*').eq('id', configId).single()
            if (!config) { await this.logNode(flowId, node.id, ctx, 'error', 'Config não encontrada'); break }

            const advanceDays = config.advance_days || 7
            const daysAvailable = config.days_available || {}
            const fullDayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

            for (let i = 1; i <= advanceDays; i++) {
              const d = new Date(today)
              d.setDate(d.getDate() + i)
              const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][d.getDay()]
              if (daysAvailable[dayKey]) {
                const dateStr = d.toISOString().split('T')[0]
                const dayName = fullDayNames[d.getDay()]
                const dd = String(d.getDate()).padStart(2, '0')
                const mm = String(d.getMonth() + 1).padStart(2, '0')
                days.push(`${days.length + 1}. ${dayName} ${dd}/${mm}`)
                variables[`_schedule_day_${days.length}`] = dateStr
              }
            }

            if (days.length === 0) {
              await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: data?.noSlotsMessage || 'Desculpe, não temos horários disponíveis no momento.' })
              break
            }

            const msg = (data?.askDateMessage || '📅 Escolha o dia para agendamento:') + '\n\n' + days.join('\n') + '\n\nDigite o número do dia.'
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: msg })

            variables['_schedule_step'] = '2'
            variables['_schedule_config_id'] = configId
            variables['_schedule_total_days'] = String(days.length)

            const inputStateId1 = stateId || generateId()
            await db.from('flow_states').upsert({
              id: inputStateId1, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
              conversation_id: ctx.conversationId, current_node_id: node.id,
              variables, loop_counters: loopCounters, waiting_variable: '_schedule_day_choice',
              status: 'waiting', updated_at: new Date(),
            }, { onConflict: 'flow_id,conversation_id' })
            return { success: true, paused: true }
          }

          if (step === '2') {
            // Step 2: User picked a day, show available slots
            const choice = parseInt(variables['_schedule_day_choice'] || '0')
            const totalDays = parseInt(variables['_schedule_total_days'] || '0')

            if (choice < 1 || choice > totalDays) {
              await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: `Por favor, digite um número de 1 a ${totalDays}.` })
              const reStateId = stateId || generateId()
              await db.from('flow_states').upsert({
                id: reStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
                conversation_id: ctx.conversationId, current_node_id: node.id,
                variables, loop_counters: loopCounters, waiting_variable: '_schedule_day_choice',
                status: 'waiting', updated_at: new Date(),
              }, { onConflict: 'flow_id,conversation_id' })
              return { success: true, paused: true }
            }

            const selectedDate = variables[`_schedule_day_${choice}`]
            variables['_schedule_selected_date'] = selectedDate
            const cfgId = variables['_schedule_config_id']

            const { data: config } = await db.from('scheduling_config').select('*').eq('id', cfgId).single()
            if (!config) break

            const slotDuration = config.slot_duration_minutes || 30
            const startParts = (config.start_time || '09:00').split(':').map(Number)
            const endParts = (config.end_time || '18:00').split(':').map(Number)
            const breakStart = config.break_start ? config.break_start.split(':').map(Number) : null
            const breakEnd = config.break_end ? config.break_end.split(':').map(Number) : null

            let startMin = startParts[0] * 60 + startParts[1]
            const endMin = endParts[0] * 60 + endParts[1]
            const breakStartMin = breakStart ? breakStart[0] * 60 + breakStart[1] : null
            const breakEndMin = breakEnd ? breakEnd[0] * 60 + breakEnd[1] : null

            const allSlots: string[] = []
            while (startMin + slotDuration <= endMin) {
              if (breakStartMin !== null && breakEndMin !== null && startMin >= breakStartMin && startMin < breakEndMin) {
                startMin = breakEndMin
                continue
              }
              const hh = String(Math.floor(startMin / 60)).padStart(2, '0')
              const mmSlot = String(startMin % 60).padStart(2, '0')
              allSlots.push(`${hh}:${mmSlot}`)
              startMin += slotDuration
            }

            // Filter out already booked slots
            const { data: booked } = await db.from('appointments')
              .select('start_time')
              .eq('tenant_id', ctx.tenantId)
              .eq('config_id', cfgId)
              .eq('date', selectedDate)
              .neq('status', 'cancelled')
            const bookedTimes = new Set((booked || []).map((b: any) => b.start_time))
            const available = allSlots.filter(s => !bookedTimes.has(s))

            if (available.length === 0) {
              await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: data?.noSlotsMessage || 'Desculpe, não temos horários disponíveis nesse dia. Tente outro dia.' })
              // Go back to step 1
              variables['_schedule_step'] = '1'
              return await this.executeNode(node, ctx, flowId, variables, loopCounters, edgeMap, nodeMap, stateId)
            }

            const slotList = available.map((s, i) => {
              variables[`_schedule_slot_${i + 1}`] = s
              return `${i + 1}. ${s}`
            })

            const dd2 = selectedDate.split('-')[2]
            const mm2 = selectedDate.split('-')[1]
            const timeMsg = (data?.askTimeMessage || `⏰ Horários disponíveis para ${dd2}/${mm2}:`) + '\n\n' + slotList.join('\n') + '\n\nDigite o número do horário.'
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: timeMsg })

            variables['_schedule_step'] = '3'
            variables['_schedule_total_slots'] = String(available.length)

            const inputStateId2 = stateId || generateId()
            await db.from('flow_states').upsert({
              id: inputStateId2, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
              conversation_id: ctx.conversationId, current_node_id: node.id,
              variables, loop_counters: loopCounters, waiting_variable: '_schedule_slot_choice',
              status: 'waiting', updated_at: new Date(),
            }, { onConflict: 'flow_id,conversation_id' })
            return { success: true, paused: true }
          }

          if (step === '3') {
            // Step 3: User picked a time, create appointment
            const choice = parseInt(variables['_schedule_slot_choice'] || '0')
            const totalSlots = parseInt(variables['_schedule_total_slots'] || '0')

            if (choice < 1 || choice > totalSlots) {
              await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: `Por favor, digite um número de 1 a ${totalSlots}.` })
              const reStateId = stateId || generateId()
              await db.from('flow_states').upsert({
                id: reStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
                conversation_id: ctx.conversationId, current_node_id: node.id,
                variables, loop_counters: loopCounters, waiting_variable: '_schedule_slot_choice',
                status: 'waiting', updated_at: new Date(),
              }, { onConflict: 'flow_id,conversation_id' })
              return { success: true, paused: true }
            }

            const selectedTime = variables[`_schedule_slot_${choice}`]
            const selectedDate = variables['_schedule_selected_date']
            const cfgId = variables['_schedule_config_id']

            // Calculate end time
            const { data: config } = await db.from('scheduling_config').select('slot_duration_minutes').eq('id', cfgId).single()
            const duration = config?.slot_duration_minutes || 30
            const [hh, mmPart] = selectedTime.split(':').map(Number)
            const endMinTotal = hh * 60 + mmPart + duration
            const endTime = `${String(Math.floor(endMinTotal / 60)).padStart(2, '0')}:${String(endMinTotal % 60).padStart(2, '0')}`

            // Create appointment
            const { data: appointment, error } = await db.from('appointments').insert({
              tenant_id: ctx.tenantId,
              contact_id: ctx.contactId,
              conversation_id: ctx.conversationId,
              channel_id: ctx.channelId,
              config_id: cfgId,
              date: selectedDate,
              start_time: selectedTime,
              end_time: endTime,
              status: 'scheduled',
              notes: 'Agendado via WhatsApp (flow)',
            }).select().single()

            if (error) {
              await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Desculpe, houve um erro ao agendar. Tente novamente.' })
              await this.logNode(flowId, node.id, ctx, 'error', error.message)
              break
            }

            const dd3 = selectedDate.split('-')[2]
            const mm3 = selectedDate.split('-')[1]
            const confirmMsg = data?.confirmMessage || `✅ Agendado com sucesso!\n\n📅 Data: ${dd3}/${mm3}\n⏰ Horário: ${selectedTime}\n\nTe enviaremos um lembrete antes do horário.`
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: confirmMsg })

            // Save to flow variables for subsequent nodes
            variables['agendamento_data'] = `${dd3}/${mm3}`
            variables['agendamento_horario'] = selectedTime
            variables['agendamento_id'] = appointment?.id || ''

            // Clean up internal schedule variables
            Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])

            await this.logNode(flowId, node.id, ctx, 'success', `Agendado: ${selectedDate} ${selectedTime}`)
          }

          break
        }

        case 'end': {
          if (data?.message) await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: this.interpolate(data.message, ctx, variables) })
          // Limpa TODOS os states waiting dessa conversa pra não retomar depois
          await db.from('flow_states').update({ status: 'completed', updated_at: new Date() }).eq('conversation_id', ctx.conversationId).eq('tenant_id', ctx.tenantId).eq('status', 'waiting')
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
    // Operadores de tempo — independem do field
    if (rule.operator === 'is_business_hours' || rule.operator === 'is_not_business_hours') {
      const tz = rule.timezone || 'America/Sao_Paulo'
      const start = Number(rule.businessHoursStart ?? 9)
      const end = Number(rule.businessHoursEnd ?? 18)
      const days = Array.isArray(rule.businessDays) && rule.businessDays.length > 0 ? rule.businessDays : [1, 2, 3, 4, 5]
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
      const inHours = days.includes(now.getDay()) && now.getHours() >= start && now.getHours() < end
      return rule.operator === 'is_business_hours' ? inHours : !inHours
    }
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

  // ── Google Calendar scheduling ──────────────────────────────────────────────
  private async executeGoogleCalendarNode(
    node: any, ctx: FlowContext, flowId: string, data: any,
    variables: Record<string, string>, loopCounters: Record<string, number>, stateId?: string
  ): Promise<{ success: boolean; paused?: boolean; ended?: boolean } | null> {
    const calendarId = data?.googleCalendarId
    if (!calendarId) { await this.logNode(flowId, node.id, ctx, 'error', 'Google Calendar não configurado'); return null }

    // Get tenant Google tokens
    const { data: tenant } = await db.from('tenants').select('metadata').eq('id', ctx.tenantId).single()
    const meta = tenant?.metadata || {}
    if (!meta.google_access_token) { await this.logNode(flowId, node.id, ctx, 'error', 'Google não conectado'); return null }

    const { google } = require('googleapis')
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    )
    oauth2Client.setCredentials({
      access_token: meta.google_access_token,
      refresh_token: meta.google_refresh_token,
    })

    // Auto-refresh tokens
    oauth2Client.on('tokens', async (tokens: any) => {
      if (tokens.access_token) {
        await db.from('tenants').update({
          metadata: { ...meta, google_access_token: tokens.access_token, google_token_expiry: tokens.expiry_date },
          updated_at: new Date(),
        }).eq('id', ctx.tenantId)
      }
    })

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    // Se é um nó diferente do que estava em waiting, resetar pro step 1
    // Isso evita que states de outro nó de agendamento interfiram
    const prevNodeId = variables['_schedule_node_id']
    if (prevNodeId && prevNodeId !== node.id) {
      // Limpa variáveis de agendamento anterior
      Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
    }
    variables['_schedule_node_id'] = node.id

    // ── Cancel mode ──────────────────────────────────────────────────────────
    if ((data?.calendarAction || 'schedule') === 'cancel') {
      return await this.executeCancelAppointment(node, ctx, flowId, data, variables, loopCounters, stateId, calendar, calendarId)
    }

    // Detect channel type for Evolution all-at-once mode
    const { data: channelInfo } = await cached(`channel-type:${ctx.channelId}`, 60_000, async () => {
      return await db.from('channels').select('type').eq('id', ctx.channelId).single()
    })
    const isEvolution = channelInfo?.type === 'evolution'

    const step = variables['_schedule_step'] || '1'

    const duration = data?.eventDuration || 60
    const isFullDay = duration >= 720 // 12h+ = dia inteiro
    const workStart = data?.workStart || '08:00'
    const workEnd = data?.workEnd || '18:00'
    const workDays = data?.workDays || { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }
    const advanceDays = data?.advanceDays || 7
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    const fullDayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

    if (step === '1') {
      // Step 1: Show only days that have at least 1 available slot
      const today = new Date()
      const days: string[] = []
      const priceTable = data?.priceTable || {}

      // Collect candidate days
      const candidateDays: { dateStr: string; dayName: string; dd: string; mm: string; dayKey: string }[] = []
      for (let i = 0; i <= advanceDays; i++) {
        const d = new Date(today)
        d.setDate(d.getDate() + i)
        const dayKey = dayKeys[d.getDay()]
        if (workDays[dayKey]) {
          candidateDays.push({
            dateStr: d.toISOString().split('T')[0],
            dayName: fullDayNames[d.getDay()],
            dd: String(d.getDate()).padStart(2, '0'),
            mm: String(d.getMonth() + 1).padStart(2, '0'),
            dayKey,
          })
        }
      }

      // Query Google Calendar for the entire date range to check availability
      let busyByDay: Record<string, { start: string; end: string }[]> = {}
      if (candidateDays.length > 0) {
        try {
          const rangeStart = candidateDays[0].dateStr
          const lastDate = candidateDays[candidateDays.length - 1].dateStr
          const nextDay = new Date(`${lastDate}T12:00:00`)
          nextDay.setDate(nextDay.getDate() + 1)
          const rangeEnd = nextDay.toISOString().split('T')[0]

          const { data: busyData } = await calendar.freebusy.query({
            requestBody: {
              timeMin: `${rangeStart}T00:00:00-03:00`,
              timeMax: `${rangeEnd}T00:00:00-03:00`,
              timeZone: 'America/Sao_Paulo',
              items: [{ id: calendarId }],
            },
          })

          const allBusy = busyData.calendars?.[calendarId]?.busy || []
          logger.info('Freebusy pre-check result', { calendarId: calendarId.slice(0, 20), rangeStart, rangeEnd, busyCount: allBusy.length, busyPeriods: allBusy.map((b: any) => `${b.start} - ${b.end}`) })
          for (const busy of allBusy) {
            // Mark ALL days covered by this busy period, not just the start
            const bStart = new Date(busy.start)
            const bEnd = new Date(busy.end)
            const cursor = new Date(bStart)
            while (cursor < bEnd) {
              const dayStr = cursor.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
              if (!busyByDay[dayStr]) busyByDay[dayStr] = []
              busyByDay[dayStr].push(busy)
              cursor.setDate(cursor.getDate() + 1)
            }
          }
          logger.info('BusyByDay', { days: Object.keys(busyByDay), candidateDates: candidateDays.map(d => d.dateStr) })
        } catch (err: any) {
          logger.warn('Freebusy pre-check failed, showing all days', { err: err.message })
        }
      }

      // Generate time slots
      const [sH, sM] = workStart.split(':').map(Number)
      const [eH, eM] = workEnd.split(':').map(Number)
      const slotEndMin = (eH === 0 && eM === 0) ? 24 * 60 : eH * 60 + eM

      // Filter: only show days that have at least 1 available slot
      const dayRows: { id: string; title: string }[] = []
      for (const cd of candidateDays) {
        let hasAvailable = false

        if (isFullDay) {
          // Full day: check if day has price=0 (unavailable) or any event
          const priceKey = `${cd.dayKey}_dia`
          if (priceTable[priceKey] === 0) continue
          const dayBusy = busyByDay[cd.dateStr] || []
          hasAvailable = dayBusy.length === 0
        } else {
          let slotMin = sH * 60 + sM
          while (slotMin + duration <= slotEndMin) {
            const slotTime = `${String(Math.floor(slotMin / 60)).padStart(2, '0')}:${String(slotMin % 60).padStart(2, '0')}`
            const priceKey = `${cd.dayKey}_${slotTime}`
            if (priceTable[priceKey] === 0) { slotMin += duration; continue }

            const slotStartMs = new Date(`${cd.dateStr}T${slotTime}:00-03:00`).getTime()
            const slotEndMs = slotStartMs + duration * 60 * 1000
            const dayBusy = busyByDay[cd.dateStr] || []
            const isBusy = dayBusy.some(b => {
              const bStart = new Date(b.start).getTime()
              const bEnd = new Date(b.end).getTime()
              return slotStartMs < bEnd && slotEndMs > bStart
            })

            if (!isBusy) { hasAvailable = true; break }
            slotMin += duration
          }
        }

        if (hasAvailable) {
          const idx = dayRows.length + 1
          dayRows.push({ id: `day_${idx}`, title: `${cd.dayName} ${cd.dd}/${cd.mm}` })
          days.push(`${idx}`)
          variables[`_schedule_day_${idx}`] = cd.dateStr
        }
      }

      if (dayRows.length === 0) {
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: data?.msgNoSlots || 'Desculpe, não temos horários disponíveis no momento.' })
        variables['agendamento_status'] = 'sem_horario'
        Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
        return { success: true }
      }

      // ── Evolution: all-at-once mode (show all days + times + prices in one message) ──
      if (isEvolution && !isFullDay) {
        const priceTable = data?.priceTable || {}
        const [sH, sM] = workStart.split(':').map(Number)
        const [eH, eM] = workEnd.split(':').map(Number)
        const slotEndMin = (eH === 0 && eM === 0) ? 24 * 60 : eH * 60 + eM

        let globalIdx = 1
        const lines: string[] = []
        const slotMap: Record<number, { date: string; time: string; price?: number }> = {}

        for (const cd of candidateDays.filter(c => dayRows.some(r => r.title.includes(c.dd + '/' + c.mm)))) {
          const dayBusy = busyByDay[cd.dateStr] || []
          let slotMin = sH * 60 + sM
          const daySlots: string[] = []

          while (slotMin + duration <= slotEndMin) {
            const slotTime = `${String(Math.floor(slotMin / 60)).padStart(2, '0')}:${String(slotMin % 60).padStart(2, '0')}`
            const priceKey = `${cd.dayKey}_${slotTime}`
            if (priceTable[priceKey] === 0) { slotMin += duration; continue }

            const slotStartMs = new Date(`${cd.dateStr}T${slotTime}:00-03:00`).getTime()
            const slotEndMs2 = slotStartMs + duration * 60 * 1000
            const isBusy = dayBusy.some((b: any) => {
              const bStart = new Date(b.start).getTime()
              const bEnd = new Date(b.end).getTime()
              return slotStartMs < bEnd && slotEndMs2 > bStart
            })

            if (!isBusy) {
              const price = priceTable[priceKey]
              const priceLabel = price ? ` — R$${price}` : ''
              daySlots.push(`*${globalIdx}.* ${slotTime}${priceLabel}`)
              slotMap[globalIdx] = { date: cd.dateStr, time: slotTime, price }
              globalIdx++
            }
            slotMin += duration
          }

          if (daySlots.length > 0) {
            lines.push(`\n${cd.dayName.toUpperCase()} (${cd.dd}/${cd.mm})`)
            lines.push(...daySlots)
          }
        }

        if (Object.keys(slotMap).length === 0) {
          variables['agendamento_status'] = 'sem_horario'
          Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
          return { success: true }
        }

        const showBackDays2 = data?.showBackDays !== false
        if (showBackDays2) lines.push(`\n*0.* Voltar`)

        const allMsg = `Horários disponíveis:\n${lines.join('\n')}\n\nDigite o *número em negrito* do horário desejado.`
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: allMsg })

        // Save slot map in variables for step resolution
        variables['_schedule_step'] = 'evo_pick'
        variables['_schedule_slot_map'] = JSON.stringify(slotMap)
        variables['_schedule_total_options'] = String(Object.keys(slotMap).length)

        const inputStateId = stateId || generateId()
        await db.from('flow_states').upsert({
          id: inputStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
          conversation_id: ctx.conversationId, current_node_id: node.id,
          variables, loop_counters: loopCounters, waiting_variable: '_schedule_evo_choice',
          status: 'waiting', updated_at: new Date(),
        }, { onConflict: 'flow_id,conversation_id' })
        return { success: true, paused: true }
      }

      // ── Standard mode (step by step) ──
      const msg = data?.msgAskDate || '📅 Escolha o dia para agendamento:'
      const showBackDays = data?.showBackDays !== false
      if (showBackDays) dayRows.push({ id: 'voltar_menu', title: '↩ Voltar' })
      if (dayRows.length <= 3) {
        const buttons = dayRows.map(r => ({ id: r.id, title: r.title }))
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: msg, interactiveType: 'button', buttons })
      } else {
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: msg, interactiveType: 'list', listRows: dayRows, listButtonText: data?.listButtonDays || 'Ver dias' })
      }

      variables['_schedule_step'] = '2'
      variables['_schedule_total_days'] = String(days.length)
      variables['_schedule_calendar_id'] = calendarId

      const inputStateId = stateId || generateId()
      await db.from('flow_states').upsert({
        id: inputStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
        conversation_id: ctx.conversationId, current_node_id: node.id,
        variables, loop_counters: loopCounters, waiting_variable: '_schedule_day_choice',
        status: 'waiting', updated_at: new Date(),
      }, { onConflict: 'flow_id,conversation_id' })
      return { success: true, paused: true }
    }

    // ── Evolution all-at-once: user picked a number ──
    if (step === 'evo_pick') {
      const evoResponse = (variables['_schedule_evo_choice'] || '').trim()

      if (evoResponse === '0' || evoResponse.toLowerCase().includes('voltar')) {
        variables['agendamento_status'] = 'voltou'
        Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
        return { success: true }
      }

      const num = parseInt(evoResponse)
      let slotMap: Record<string, { date: string; time: string; price?: number }> = {}
      try { slotMap = JSON.parse(variables['_schedule_slot_map'] || '{}') } catch {}

      const selected = slotMap[String(num)]
      if (!selected) {
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Por favor, digite um número válido.' })
        variables['_schedule_step'] = '1'
        Object.keys(variables).filter(k => k.startsWith('_schedule_') && k !== '_schedule_node_id').forEach(k => delete variables[k])
        return await this.executeGoogleCalendarNode(node, ctx, flowId, data, variables, loopCounters, stateId)
      }

      // Salva seleção e pede confirmação antes de criar o evento
      variables['_schedule_selected_date'] = selected.date
      variables['_schedule_selected_time'] = selected.time
      variables['_schedule_selected_price'] = selected.price ? String(selected.price) : ''

      const dd3 = selected.date.split('-')[2]
      const mm3 = selected.date.split('-')[1]
      const priceConfirm = selected.price ? `\n💰 Valor: R$ ${selected.price}` : ''
      const confirmMsg = data?.confirmMessage || `*Confirma a reserva?*\n\n📅 Data: ${dd3}/${mm3}\n⏰ Horário: ${selected.time}${priceConfirm}\n\n*1.* Sim, confirmar\n*2.* Não, voltar`
      await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: confirmMsg })

      variables['_schedule_step'] = 'evo_confirm'
      const confirmStateId = stateId || generateId()
      await db.from('flow_states').upsert({
        id: confirmStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
        conversation_id: ctx.conversationId, current_node_id: node.id,
        variables, loop_counters: loopCounters, waiting_variable: '_schedule_confirm_choice',
        status: 'waiting', updated_at: new Date(),
      }, { onConflict: 'flow_id,conversation_id' })
      return { success: true, paused: true }
    }

    // ── Evolution all-at-once: user confirms or cancels ──
    if (step === 'evo_confirm') {
      const confirmResponse = (variables['_schedule_confirm_choice'] || '').trim().toLowerCase()

      // Não confirmou → volta pra lista de horários
      if (confirmResponse === '2' || confirmResponse.includes('não') || confirmResponse.includes('nao') || confirmResponse.includes('voltar')) {
        variables['_schedule_step'] = '1'
        Object.keys(variables).filter(k => k.startsWith('_schedule_') && k !== '_schedule_node_id').forEach(k => delete variables[k])
        return await this.executeGoogleCalendarNode(node, ctx, flowId, data, variables, loopCounters, stateId)
      }

      // Confirmou → criar evento
      if (confirmResponse !== '1' && !confirmResponse.includes('sim')) {
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Por favor, digite *1* para confirmar ou *2* para voltar.' })
        const retryStateId = stateId || generateId()
        await db.from('flow_states').upsert({
          id: retryStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
          conversation_id: ctx.conversationId, current_node_id: node.id,
          variables, loop_counters: loopCounters, waiting_variable: '_schedule_confirm_choice',
          status: 'waiting', updated_at: new Date(),
        }, { onConflict: 'flow_id,conversation_id' })
        return { success: true, paused: true }
      }

      const selectedDate = variables['_schedule_selected_date']
      const selectedTime = variables['_schedule_selected_time']
      const selectedPrice = variables['_schedule_selected_price'] ? Number(variables['_schedule_selected_price']) : undefined
      const { data: contactInfo2 } = await db.from('contacts').select('name').eq('id', ctx.contactId).single()
      const contactName2 = contactInfo2?.name || ctx.phone

      const tz = 'America/Sao_Paulo'
      const [sh2, sm2] = selectedTime.split(':').map(Number)
      const endMinTotal2 = sh2 * 60 + sm2 + duration
      let endDate2 = selectedDate
      let endHour2 = Math.floor(endMinTotal2 / 60)
      const endMinute2 = endMinTotal2 % 60
      if (endHour2 >= 24) { endHour2 -= 24; const nd = new Date(`${selectedDate}T12:00:00`); nd.setDate(nd.getDate() + 1); endDate2 = nd.toISOString().split('T')[0] }
      const endTime2 = `${String(endHour2).padStart(2, '0')}:${String(endMinute2).padStart(2, '0')}`
      const eventTitle2 = this.interpolate(data?.eventTitle || 'Reserva - {{name}}', ctx, { ...variables, name: contactName2 })

      try {
        const event = await calendar.events.insert({
          calendarId,
          requestBody: {
            summary: eventTitle2,
            description: `Agendado via WhatsApp\nCliente: ${contactName2}\nTelefone: +${ctx.phone}`,
            start: { dateTime: `${selectedDate}T${selectedTime}:00`, timeZone: tz },
            end: { dateTime: `${endDate2}T${endTime2}:00`, timeZone: tz },
          },
        })

        const dd = selectedDate.split('-')[2]
        const mm = selectedDate.split('-')[1]
        variables['agendamento_data'] = `${dd}/${mm}`
        variables['agendamento_horario'] = selectedTime
        variables['agendamento_valor'] = selectedPrice ? String(selectedPrice) : ''
        variables['agendamento_status'] = 'agendado'
        variables['agendamento_google_event_id'] = event.data?.id || ''

        const confirmMsg = this.interpolate(
          data?.msgConfirm || `✅ Agendado com sucesso!\n\n📅 Data: ${dd}/${mm}\n⏰ Horário: ${selectedTime}`,
          ctx, variables
        )
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: confirmMsg })

        Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
        await this.logNode(flowId, node.id, ctx, 'success', `Google Calendar: agendado ${selectedDate} ${selectedTime}`)
        return { success: true }
      } catch (err: any) {
        logger.error('Google Calendar create event error (evo)', { err: err.message })
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Desculpe, houve um erro ao agendar. Tente novamente.' })
        return null
      }
    }

    if (step === '2') {
      // Step 2: User picked a day, check Google Calendar for busy times and show available slots
      const dayResponse = variables['_schedule_day_choice'] || ''
      const totalDays = parseInt(variables['_schedule_total_days'] || '0')

      // Handle "Voltar" — exit node, let flow handle it
      const dayLower = dayResponse.trim().toLowerCase()
      const showBackDays = data?.showBackDays !== false
      // Check if user typed the number of the Voltar item (last in list)
      const voltarDayNum = showBackDays ? totalDays + 1 : -1
      if (dayLower === 'voltar_menu' || dayLower === '0' || dayLower.includes('voltar') || dayLower === String(voltarDayNum)) {
        variables['agendamento_status'] = 'voltou'
        Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
        return { success: true }
      }

      // Support: button ID (day_1), text number (1), or title match (Sexta 10/04)
      let choice = 0
      const dayClean = dayResponse.trim()
      if (dayClean.startsWith('day_')) {
        choice = parseInt(dayClean.replace('day_', ''))
      } else if (/^\d+$/.test(dayClean)) {
        choice = parseInt(dayClean)
      } else {
        // Match by day/month in title (e.g. "Sexta 10/04")
        for (let i = 1; i <= totalDays; i++) {
          const dayDate = variables[`_schedule_day_${i}`]
          if (!dayDate) continue
          const dd = dayDate.split('-')[2]
          const mm = dayDate.split('-')[1]
          if (dayClean.includes(`${dd}/${mm}`)) { choice = i; break }
        }
      }

      if (choice < 1 || choice > totalDays) {
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: `Por favor, selecione uma das opções.` })
        variables['_schedule_step'] = '1'
        return await this.executeGoogleCalendarNode(node, ctx, flowId, data, variables, loopCounters, stateId)
      }

      const selectedDate = variables[`_schedule_day_${choice}`]
      variables['_schedule_selected_date'] = selectedDate

      // Full day: skip time selection, create event directly
      if (isFullDay) {
        const { data: contactInfo } = await db.from('contacts').select('name').eq('id', ctx.contactId).single()
        const contactName = contactInfo?.name || ctx.phone
        const eventTitle = this.interpolate(data?.eventTitle || 'Reserva - {{name}}', ctx, { ...variables, name: contactName })
        const priceTable2 = data?.priceTable || {}
        const selectedDow = new Date(`${selectedDate}T12:00:00`).getDay()
        const dayKeyPrice = dayKeys[selectedDow]
        const price = priceTable2[`${dayKeyPrice}_dia`]

        try {
          await calendar.events.insert({
            calendarId,
            requestBody: {
              summary: eventTitle,
              description: `Agendado via WhatsApp\nCliente: ${contactName}\nTelefone: +${ctx.phone}`,
              start: { date: selectedDate },
              end: { date: (() => { const next = new Date(`${selectedDate}T12:00:00`); next.setDate(next.getDate() + 1); return next.toISOString().split('T')[0] })() },
            },
          })

          const dd = selectedDate.split('-')[2]
          const mm = selectedDate.split('-')[1]
          variables['agendamento_data'] = `${dd}/${mm}`
          variables['agendamento_horario'] = 'Dia inteiro'
          variables['agendamento_valor'] = price ? String(price) : ''
          variables['agendamento_status'] = 'agendado'

          const confirmMsg = this.interpolate(
            data?.msgConfirm || `✅ Agendado com sucesso!\n\n📅 Data: ${dd}/${mm}\n\nTe enviaremos um lembrete antes.`,
            ctx, variables
          )
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: confirmMsg })

          Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
          await this.logNode(flowId, node.id, ctx, 'success', `Google Calendar: dia inteiro ${selectedDate}`)
          return { success: true }
        } catch (err: any) {
          logger.error('Google Calendar full day event error', { err: err.message })
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Desculpe, houve um erro ao agendar. Tente novamente.' })
          return null
        }
      }

      // Generate all possible slots
      const [startH, startM] = workStart.split(':').map(Number)
      const [endH, endM] = workEnd.split(':').map(Number)
      let startMin = startH * 60 + startM
      const endMin = (endH === 0 && endM === 0) ? 24 * 60 : endH * 60 + endM
      const allSlots: string[] = []
      while (startMin + duration <= endMin) {
        const hh = String(Math.floor(startMin / 60)).padStart(2, '0')
        const mmSlot = String(startMin % 60).padStart(2, '0')
        allSlots.push(`${hh}:${mmSlot}`)
        startMin += duration
      }

      // Query Google Calendar for busy times on this date
      try {
        const tz = 'America/Sao_Paulo'

        // Se workEnd é 00:00 (meia-noite), usa o dia seguinte
        let endDateForQuery = selectedDate
        let endTimeForQuery = workEnd
        if (workEnd === '00:00') {
          const nextDay = new Date(`${selectedDate}T12:00:00`)
          nextDay.setDate(nextDay.getDate() + 1)
          endDateForQuery = nextDay.toISOString().split('T')[0]
          endTimeForQuery = '00:00'
        }

        const { data: busyData } = await calendar.freebusy.query({
          requestBody: {
            timeMin: `${selectedDate}T${workStart}:00-03:00`,
            timeMax: `${endDateForQuery}T${endTimeForQuery}:00-03:00`,
            timeZone: tz,
            items: [{ id: calendarId }],
          },
        })

        const busySlots = busyData.calendars?.[calendarId]?.busy || []
        const priceTable = data?.priceTable || {}
        const selectedDayOfWeek = new Date(`${selectedDate}T12:00:00`).getDay()
        const dayKeyForPrice = dayKeys[selectedDayOfWeek] // mon, tue, etc

        const available = allSlots.filter(slot => {
          // Check if slot is marked as unavailable (price = 0) in price table
          const priceKey = `${dayKeyForPrice}_${slot}`
          if (priceTable[priceKey] === 0) return false

          const slotStartMs = new Date(`${selectedDate}T${slot}:00-03:00`).getTime()
          const slotEndMs = slotStartMs + duration * 60 * 1000

          return !busySlots.some((busy: any) => {
            const busyStartMs = new Date(busy.start).getTime()
            const busyEndMs = new Date(busy.end).getTime()
            return slotStartMs < busyEndMs && slotEndMs > busyStartMs
          })
        })

        if (available.length === 0) {
          // Sai do nó e deixa o flow decidir (oferecer outra quadra, etc)
          variables['agendamento_status'] = 'sem_horario'
          Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
          return { success: true }
        }

        const slotRows: { id: string; title: string }[] = []
        available.forEach((s, i) => {
          variables[`_schedule_slot_${i + 1}`] = s
          const priceKey = `${dayKeyForPrice}_${s}`
          const price = priceTable[priceKey]
          const priceLabel = price ? ` - R$ ${price}` : ''
          variables[`_schedule_price_${i + 1}`] = price ? String(price) : ''
          slotRows.push({ id: `slot_${i + 1}`, title: `${s}${priceLabel}` })
        })

        const dd2 = selectedDate.split('-')[2]
        const mm2 = selectedDate.split('-')[1]
        const timeMsg = data?.msgAskTime || `⏰ Horários disponíveis para ${dd2}/${mm2}:`
        const showBack = data?.showBackButton !== false
        if (showBack) slotRows.push({ id: 'voltar_dias', title: '↩ Voltar' })
        if (slotRows.length <= 3) {
          const buttons = slotRows.map(r => ({ id: r.id, title: r.title }))
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: timeMsg, interactiveType: 'button', buttons })
        } else {
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: timeMsg, interactiveType: 'list', listRows: slotRows, listButtonText: data?.listButtonSlots || 'Ver horários' })
        }

        variables['_schedule_step'] = '3'
        variables['_schedule_total_slots'] = String(available.length)

        const inputStateId = stateId || generateId()
        await db.from('flow_states').upsert({
          id: inputStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
          conversation_id: ctx.conversationId, current_node_id: node.id,
          variables, loop_counters: loopCounters, waiting_variable: '_schedule_slot_choice',
          status: 'waiting', updated_at: new Date(),
        }, { onConflict: 'flow_id,conversation_id' })
        return { success: true, paused: true }

      } catch (err: any) {
        logger.error('Google Calendar freebusy error', { err: err.message })
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Desculpe, houve um erro ao consultar horários. Tente novamente.' })
        return null
      }
    }

    if (step === '3') {
      // Step 3: User picked a time, create Google Calendar event
      const slotResponse = variables['_schedule_slot_choice'] || ''
      const totalSlots = parseInt(variables['_schedule_total_slots'] || '0')

      // Handle "Voltar" — go back to day selection
      const slotLower = slotResponse.trim().toLowerCase()
      const showBack = data?.showBackButton !== false
      const voltarSlotNum = showBack ? totalSlots + 1 : -1
      if (slotLower === 'voltar_dias' || slotLower === '0' || slotLower.includes('voltar') || slotLower === String(voltarSlotNum)) {
        variables['_schedule_step'] = '1'
        // Clean slot variables
        Object.keys(variables).filter(k => k.match(/^_schedule_(slot|price)_/)).forEach(k => delete variables[k])
        return await this.executeGoogleCalendarNode(node, ctx, flowId, data, variables, loopCounters, stateId)
      }

      // Support: button ID (slot_1), text number (1), time text (21:00), title with price (21:00 - R$ 280)
      let choice = 0
      const slotClean = slotResponse.trim()
      if (slotClean.startsWith('slot_')) {
        choice = parseInt(slotClean.replace('slot_', ''))
      } else if (/^\d+$/.test(slotClean)) {
        choice = parseInt(slotClean)
      } else {
        // Extract time from response (handles "21:00 - R$ 280" or just "21:00")
        const timeMatch = slotClean.match(/(\d{2}:\d{2})/)
        const timeFromResponse = timeMatch ? timeMatch[1] : slotClean
        for (let i = 1; i <= totalSlots; i++) {
          if (variables[`_schedule_slot_${i}`] === timeFromResponse || variables[`_schedule_slot_${i}`] === slotClean) { choice = i; break }
        }
      }

      if (choice < 1 || choice > totalSlots) {
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: `Por favor, selecione uma das opções.` })
        variables['_schedule_step'] = '2'
        variables['_schedule_day_choice'] = variables['_schedule_selected_date'] ? `day_${Object.keys(variables).filter(k => k.startsWith('_schedule_day_') && !k.includes('choice')).findIndex(k => variables[k] === variables['_schedule_selected_date']) + 1}` : '1'
        return await this.executeGoogleCalendarNode(node, ctx, flowId, data, variables, loopCounters, stateId)
      }

      const selectedTime = variables[`_schedule_slot_${choice}`]
      const selectedDate = variables['_schedule_selected_date']

      // Get contact name for event title
      const { data: contactInfo } = await db.from('contacts').select('name').eq('id', ctx.contactId).single()
      const contactName = contactInfo?.name || ctx.phone

      // Create event start/end with timezone
      const tz = 'America/Sao_Paulo'
      const [sh, sm] = selectedTime.split(':').map(Number)
      const endMinTotal = sh * 60 + sm + duration

      // Handle midnight crossover (e.g. 23:00 + 60min = 00:00 next day)
      let endDate = selectedDate
      let endHour = Math.floor(endMinTotal / 60)
      const endMinute = endMinTotal % 60
      if (endHour >= 24) {
        endHour -= 24
        const nextDay = new Date(`${selectedDate}T12:00:00`)
        nextDay.setDate(nextDay.getDate() + 1)
        endDate = nextDay.toISOString().split('T')[0]
      }
      const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`

      const eventTitle = this.interpolate(data?.eventTitle || 'Reserva - {{name}}', ctx, { ...variables, name: contactName })

      try {
        const event = await calendar.events.insert({
          calendarId,
          requestBody: {
            summary: eventTitle,
            description: `Agendado via WhatsApp\nCliente: ${contactName}\nTelefone: +${ctx.phone}`,
            start: { dateTime: `${selectedDate}T${selectedTime}:00`, timeZone: tz },
            end: { dateTime: `${endDate}T${endTime}:00`, timeZone: tz },
          },
        })

        const dd = selectedDate.split('-')[2]
        const mm = selectedDate.split('-')[1]

        // Save to flow variables BEFORE sending confirm so {{variables}} work
        variables['agendamento_data'] = `${dd}/${mm}`
        variables['agendamento_horario'] = selectedTime
        variables['agendamento_valor'] = variables[`_schedule_price_${choice}`] || ''
        variables['agendamento_status'] = 'agendado'
        variables['agendamento_google_event_id'] = event.data?.id || ''

        const confirmMsg = this.interpolate(
          data?.msgConfirm || `✅ Agendado com sucesso!\n\n📅 Data: ${dd}/${mm}\n⏰ Horário: ${selectedTime}\n\nTe enviaremos um lembrete antes do horário.`,
          ctx, variables
        )
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: confirmMsg })

        // Clean up internal variables
        Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])

        await this.logNode(flowId, node.id, ctx, 'success', `Google Calendar: agendado ${selectedDate} ${selectedTime}`)
        return { success: true }

      } catch (err: any) {
        logger.error('Google Calendar create event error', { err: err.message })
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Desculpe, houve um erro ao agendar. Tente novamente.' })
        return null
      }
    }

    return null
  }

  // ── Cancel appointment via Google Calendar ──────────────────────────────────
  private async executeCancelAppointment(
    node: any, ctx: FlowContext, flowId: string, data: any,
    variables: Record<string, string>, loopCounters: Record<string, number>,
    stateId: string | undefined, calendar: any, calendarId: string
  ): Promise<{ success: boolean; paused?: boolean } | null> {
    const cancelStep = variables['_cancel_step'] || '1'

    if (cancelStep === '1') {
      // Step 1: Search for upcoming events with this contact's phone
      try {
        const now = new Date()
        const futureLimit = new Date()
        futureLimit.setDate(futureLimit.getDate() + 60)

        const phoneSearch = ctx.phone.slice(-8)
        logger.info('Cancel: searching events', { calendarId, phone: ctx.phone, phoneSearch })

        // First try with q parameter, then without (fallback)
        const { data: events } = await calendar.events.list({
          calendarId,
          timeMin: now.toISOString(),
          timeMax: futureLimit.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 50,
        })

        const allItems = events.items || []
        logger.info('Cancel: total events found', { total: allItems.length, titles: allItems.slice(0, 5).map((e: any) => e.summary) })

        const items = allItems.filter((e: any) => {
          const inDesc = e.description && e.description.includes(phoneSearch)
          const inTitle = e.summary && e.summary.includes(phoneSearch)
          return inDesc || inTitle
        })

        logger.info('Cancel: events matching phone', { matched: items.length, phoneSearch })

        if (items.length === 0) {
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Você não tem agendamentos futuros para cancelar.' })
          variables['cancelamento_status'] = 'nenhum'
          return { success: true }
        }

        // Show events as list (with Brazil timezone)
        const eventRows: { id: string; title: string }[] = []
        items.forEach((e: any, i: number) => {
          const start = new Date(e.start.dateTime || e.start.date)
          const brDate = start.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
          const brTime = start.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false })
          variables[`_cancel_event_${i + 1}`] = e.id
          // WhatsApp list title max 24 chars
          eventRows.push({ id: `cancel_${i + 1}`, title: `${brDate} ${brTime}` })
        })
        eventRows.push({ id: 'cancel_voltar', title: '↩ Voltar' })

        const msg = '📋 Seus agendamentos. Qual deseja cancelar?'
        if (eventRows.length <= 3) {
          const buttons = eventRows.map(r => ({ id: r.id, title: r.title }))
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: msg, interactiveType: 'button', buttons })
        } else {
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: msg, interactiveType: 'list', listRows: eventRows, listButtonText: 'Ver agendamentos' })
        }

        variables['_cancel_step'] = '2'
        variables['_cancel_total'] = String(items.length)

        const inputStateId = stateId || generateId()
        await db.from('flow_states').upsert({
          id: inputStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
          conversation_id: ctx.conversationId, current_node_id: node.id,
          variables, loop_counters: loopCounters, waiting_variable: '_cancel_choice',
          status: 'waiting', updated_at: new Date(),
        }, { onConflict: 'flow_id,conversation_id' })
        return { success: true, paused: true }

      } catch (err: any) {
        logger.error('Google Calendar list events error', { err: err.message })
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Desculpe, houve um erro ao buscar seus agendamentos.' })
        return null
      }
    }

    if (cancelStep === '2') {
      // Step 2: User picked an event to cancel
      const response = (variables['_cancel_choice'] || '').trim()
      const total = parseInt(variables['_cancel_total'] || '0')

      // Handle "Voltar"
      if (response === 'cancel_voltar' || response.toLowerCase().includes('voltar')) {
        variables['cancelamento_status'] = 'voltou'
        Object.keys(variables).filter(k => k.startsWith('_cancel_')).forEach(k => delete variables[k])
        return { success: true }
      }

      // Find which event was selected
      let choice = 0
      if (response.startsWith('cancel_')) {
        choice = parseInt(response.replace('cancel_', ''))
      } else if (/^\d+$/.test(response)) {
        choice = parseInt(response)
      } else {
        // Match by date in title
        for (let i = 1; i <= total; i++) {
          if (response.includes('/')) { choice = i; break }
        }
      }

      if (choice < 1 || choice > total) {
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Por favor, selecione uma das opções.' })
        variables['_cancel_step'] = '1'
        return await this.executeCancelAppointment(node, ctx, flowId, data, variables, loopCounters, stateId, calendar, calendarId)
      }

      const eventId = variables[`_cancel_event_${choice}`]
      if (!eventId) { return null }

      try {
        await calendar.events.delete({ calendarId, eventId })
        const cancelMsg = this.interpolate(data?.msgConfirm || '✅ Agendamento cancelado com sucesso!', ctx, variables)
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: cancelMsg })
        variables['cancelamento_status'] = 'cancelado'
        Object.keys(variables).filter(k => k.startsWith('_cancel_')).forEach(k => delete variables[k])
        await this.logNode(flowId, node.id, ctx, 'success', `Google Calendar: evento ${eventId} cancelado`)
        return { success: true }
      } catch (err: any) {
        logger.error('Google Calendar delete event error', { err: err.message })
        await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Desculpe, houve um erro ao cancelar. Tente novamente.' })
        return null
      }
    }

    return null
  }

  private interpolate(template: string, ctx: FlowContext, variables: Record<string, string> = {}): string {
    let result = template
      .replace(/\{\{phone\}\}/gi, ctx.phone)
      .replace(/\{\{telefone\}\}/gi, ctx.phone)
      .replace(/\{\{message\}\}/gi, ctx.messageBody)
      .replace(/\{\{contactId\}\}/gi, ctx.contactId)
      .replace(/\{\{conversationId\}\}/gi, ctx.conversationId)
      .replace(/\{\{channelId\}\}/gi, ctx.channelId)
      .replace(/\{\{tenantId\}\}/gi, ctx.tenantId)
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), String(value))
    }
    return result
  }

  private async sendMessage(opts: { tenantId: string; channelId: string; contactId: string; conversationId: string; to: string; contentType: string; body?: string; mediaUrl?: string; interactiveType?: string; buttons?: any[]; listRows?: any[]; listButtonText?: string; footer?: string }): Promise<void> {
    const response = await fetch(`${MESSAGE_SERVICE_URL}/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify(opts),
    })
    if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(`Failed to send message: ${JSON.stringify(err)}`) }
  }

  private async logNode(flowId: string, nodeId: string, ctx: FlowContext, status: string, detail: string): Promise<void> {
    try { await db.from('flow_logs').insert({ id: generateId(), flow_id: flowId, node_id: nodeId, tenant_id: ctx.tenantId, contact_id: ctx.contactId, conversation_id: ctx.conversationId, status, detail }) } catch (err) { logger.warn('Failed to log flow node', { flowId, nodeId, err }) }
  }
}

export const flowEngine = new FlowEngine()