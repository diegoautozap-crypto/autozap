import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { generateId } from '@autozap/utils'

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

async function emitPusher(tenantId: string, event: string, data: object): Promise<void> {
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET) return
  try {
    const body = JSON.stringify({ name: event, channel: `tenant-${tenantId}`, data: JSON.stringify(data) })
    const crypto = await import('crypto')
    const ts  = Math.floor(Date.now() / 1000)
    const md5 = crypto.createHash('md5').update(body).digest('hex')
    const sig = crypto.createHmac('sha256', PUSHER_SECRET).update(`POST\n/apps/${PUSHER_APP_ID}/events\nauth_key=${PUSHER_KEY}&auth_timestamp=${ts}&auth_version=1.0&body_md5=${md5}`).digest('hex')
    await fetch(`https://api-${PUSHER_CLUSTER}.pusher.com/apps/${PUSHER_APP_ID}/events?auth_key=${PUSHER_KEY}&auth_timestamp=${ts}&auth_version=1.0&body_md5=${md5}&auth_signature=${sig}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  } catch (err) { logger.error('Failed to emit Pusher event', { err }) }
}

export class FlowEngine {

  async processFlows(ctx: FlowContext): Promise<void> {
    try {
      const resumed = await this.resumeWaitingFlow(ctx)
      if (resumed) return

      const { data: flows } = await db
        .from('flows')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)
        .or(`channel_id.eq.${ctx.channelId},channel_id.is.null`)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

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

  async resumeFromNode(nodeId: string, ctx: FlowContext, flow: any, variables: Record<string, any>, loopCounters: Record<string, number>, edgeMap: Map<string, any[]>, nodeMap: Map<string, any>, stateId: string): Promise<void> {
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
    if (state.waiting_variable) variables[state.waiting_variable] = ctx.messageBody
    await db.from('flow_states').update({ status: 'running', variables, updated_at: new Date() }).eq('id', state.id)

    const { data: flow } = await db.from('flows').select('*').eq('id', state.flow_id).single()
    if (!flow) return false

    const { data: nodes } = await db.from('flow_nodes').select('*').eq('flow_id', flow.id)
    const { data: edges } = await db.from('flow_edges').select('*').eq('flow_id', flow.id)
    const nodeMap = new Map((nodes || []).map((n: any) => [n.id, n]))
    const edgeMap = new Map<string, any[]>()
    for (const edge of (edges || [])) {
      const key = `${edge.source_node}:${edge.source_handle || 'success'}`
      if (!edgeMap.has(key)) edgeMap.set(key, [])
      edgeMap.get(key)!.push(edge)
    }

    let currentNode: any = state.pending_condition_node_id
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

  private async isOnCooldown(flow: any, ctx: FlowContext): Promise<boolean> {
    const cooldownType = flow.cooldown_type || '24h'
    if (cooldownType === 'always') return false
    const { data } = await db.from('flow_logs').select('created_at').eq('flow_id', flow.id).eq('conversation_id', ctx.conversationId).eq('status', 'flow_executed').order('created_at', { ascending: false }).limit(1)
    if (!data || data.length === 0) return false
    const lastExecution = new Date(data[0].created_at)
    if (cooldownType === 'once') return true
    if (cooldownType === '24h') return Date.now() - lastExecution.getTime() < 24 * 60 * 60 * 1000
    return false
  }

  private async checkFlowTrigger(flow: any, ctx: FlowContext): Promise<boolean> {
    const { data: nodes } = await db.from('flow_nodes').select('*').eq('flow_id', flow.id)
    if (!nodes || nodes.length === 0) return false
    const triggerNode = nodes.find((n: any) => n.type.startsWith('trigger_'))
    if (!triggerNode) return false
    return this.evaluateTrigger(triggerNode, ctx)
  }

  private evaluateTrigger(node: any, ctx: FlowContext): boolean {
    const { type, data } = node
    switch (type) {
      case 'trigger_keyword': {
        const keywords: string[] = data?.keywords || []
        if (keywords.length === 0) return false
        const body = (ctx.messageBody || '').toLowerCase().trim()
        const matchType = data?.matchType || 'contains'
        return keywords.some((kw: string) => {
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
        return keywords.some((kw: string) => {
          const k = kw.toLowerCase().trim()
          return matchType === 'equals' ? body === k : body.includes(k)
        })
      }
      case 'trigger_any_reply': return true
      case 'trigger_outside_hours': {
        const start = data?.start ?? 9
        const end = data?.end ?? 18
        const days = data?.days ?? [1, 2, 3, 4, 5]
        const now = new Date()
        return !days.includes(now.getDay()) || now.getHours() < start || now.getHours() >= end
      }
      default: return false
    }
  }

  private async executeFlow(flow: any, ctx: FlowContext, variables: Record<string, any>): Promise<void> {
    const { data: nodes } = await db.from('flow_nodes').select('*').eq('flow_id', flow.id)
    const { data: edges } = await db.from('flow_edges').select('*').eq('flow_id', flow.id)
    if (!nodes || nodes.length === 0) return

    const nodeMap = new Map(nodes.map((n: any) => [n.id, n]))
    const edgeMap = new Map<string, any[]>()
    for (const edge of (edges || [])) {
      const key = `${edge.source_node}:${edge.source_handle || 'success'}`
      if (!edgeMap.has(key)) edgeMap.set(key, [])
      edgeMap.get(key)!.push(edge)
    }

    const triggerNode = nodes.find((n: any) => n.type.startsWith('trigger_'))
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

  private getNextNode(nodeId: string, handle: string, edgeMap: Map<string, any[]>, nodeMap: Map<string, any>): any | null {
    const key = `${nodeId}:${handle}`
    const edges = edgeMap.get(key)
    if (!edges || edges.length === 0) return null
    return nodeMap.get(edges[0].target_node) || null
  }

  private async executeNode(
    node: any, ctx: FlowContext, flowId: string,
    variables: Record<string, any>, loopCounters: Record<string, number>,
    edgeMap: Map<string, any[]>, nodeMap: Map<string, any>, stateId: string | null
  ): Promise<{ success: boolean; paused?: boolean; ended?: boolean; delayed?: boolean; nextHandle?: string }> {
    const { type, data } = node

    try {
      logger.info('Executing flow node', { nodeId: node.id, type, flowId })

      switch (type) {

        case 'send_message': {
          const message = this.interpolate(data?.message || '', ctx, variables)
          if (!message) break
          if (data?.delay > 0) await new Promise(r => setTimeout(r, data.delay * 1000))
          await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: message })
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
          const saveVar = data?.saveAs || 'resposta'
          const nextNode = this.getNextNode(node.id, 'success', edgeMap, nodeMap)
          const pendingConditionNodeId = (nextNode?.type === 'condition') ? nextNode.id : null
          await db.from('flow_states').upsert({
            id: stateId || generateId(), flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
            conversation_id: ctx.conversationId, current_node_id: node.id, pending_condition_node_id: pendingConditionNodeId,
            variables, loop_counters: loopCounters, waiting_variable: saveVar, status: 'waiting', updated_at: new Date(),
          }, { onConflict: 'flow_id,conversation_id' })
          return { success: true, paused: true }
        }

        case 'wait': {
          const totalMs = ((data?.seconds || 0) + (data?.minutes || 0) * 60 + (data?.hours || 0) * 3600 + (data?.days || 0) * 86400) * 1000
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

        case 'ai': {
          const openaiKey = data?.apiKey || process.env.OPENAI_API_KEY
          if (!openaiKey) { logger.warn('AI node: no OpenAI API key configured'); break }
          const { default: OpenAI } = await import('openai')
          const openai = new OpenAI({ apiKey: openaiKey, timeout: 30000, maxRetries: 1 })
          const aiMode = data?.mode || 'respond'
          const userMessage = this.interpolate(data?.userMessage || ctx.messageBody, ctx, variables)
          const maxHistory = data?.historyMessages ?? 20
          let historyMessages: { role: 'user' | 'assistant'; content: string }[] = []
          if (maxHistory > 0) {
            const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
            const { data: history } = await db.from('messages').select('direction, body, content_type, created_at').eq('conversation_id', ctx.conversationId).eq('tenant_id', ctx.tenantId).in('content_type', ['text']).not('body', 'is', null).gte('created_at', startOfDay.toISOString()).order('created_at', { ascending: false }).limit(maxHistory)
            historyMessages = (history || []).reverse().filter((m: any) => m.body?.trim()).map((m: any) => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.body }))
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
          const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: method !== 'GET' ? body : undefined, signal: AbortSignal.timeout(10000) })
          const responseText = await response.text()
          if (data?.saveResponseAs) {
            try {
              const json = JSON.parse(responseText)
              if (data?.responseField) { const fieldValue = data.responseField.split('.').reduce((obj: any, key: string) => obj?.[key], json); variables[data.saveResponseAs] = String(fieldValue ?? responseText) }
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

        case 'add_tag': {
          if (!data?.tagId) break
          await db.from('contact_tags').upsert({ contact_id: ctx.contactId, tag_id: data.tagId }, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true })
          break
        }

        case 'remove_tag': {
          if (!data?.tagId) break
          await db.from('contact_tags').delete().eq('contact_id', ctx.contactId).eq('tag_id', data.tagId)
          break
        }

        case 'update_contact': {
          const updateData: any = {}
          if (data?.field === 'name' && data?.value) { updateData.name = this.interpolate(data.value, ctx, variables) }
          else if (data?.field === 'phone' && data?.value) { updateData.phone = this.interpolate(data.value, ctx, variables) }
          else if (data?.field === 'custom' && data?.customField && data?.value) {
            const { data: contact } = await db.from('contacts').select('metadata').eq('id', ctx.contactId).single()
            const metadata = contact?.metadata || {}
            metadata[data.customField] = this.interpolate(data.value, ctx, variables)
            updateData.metadata = metadata
          }
          if (Object.keys(updateData).length > 0) await db.from('contacts').update(updateData).eq('id', ctx.contactId)
          break
        }

        case 'move_pipeline': {
          const stage = data?.stage
          if (!stage) break
          // Salva pipeline_id junto — suporta múltiplas pipelines
          const pipelineId = data?.pipelineId || null
          await db.from('conversations').update({ pipeline_stage: stage, pipeline_id: pipelineId }).eq('id', ctx.conversationId)
          emitPusher(ctx.tenantId, 'conversation.updated', { conversationId: ctx.conversationId, pipelineStage: stage, pipelineId })
          break
        }

        case 'assign_agent': {
          if (data?.message) await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: this.interpolate(data.message, ctx, variables) })
          await db.from('conversations').update({ bot_active: false }).eq('id', ctx.conversationId)
          break
        }

        case 'go_to': {
          if (!data?.targetFlowId) break
          const { data: targetFlow } = await db.from('flows').select('*').eq('id', data.targetFlowId).eq('tenant_id', ctx.tenantId).single()
          if (!targetFlow || !targetFlow.is_active) break
          await this.executeFlow(targetFlow, ctx, variables)
          return { success: true, ended: true }
        }

        case 'end': {
          if (data?.message) await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: this.interpolate(data.message, ctx, variables) })
          return { success: true, ended: true }
        }

        default:
          logger.warn('Unknown node type', { type, nodeId: node.id })
      }

      await this.logNode(flowId, node.id, ctx, 'success', `Nó ${type} executado`)
      return { success: true }

    } catch (err: any) {
      logger.error('Flow node error', { nodeId: node.id, type, err: err.message })
      await this.logNode(flowId, node.id, ctx, 'error', err.message)
      return { success: false }
    }
  }

  private evaluateLoopCondition(data: any, ctx: FlowContext, variables: Record<string, any>): boolean {
    const field = data?.conditionField || 'variable'
    const operator = data?.conditionOperator || 'is_empty'
    const value = (data?.conditionValue || '').toLowerCase()
    let fv = ''
    if (field === 'message') fv = (ctx.messageBody || '').toLowerCase()
    else if (field === 'variable') fv = (variables[data?.conditionFieldName || ''] || '').toLowerCase()
    else if (field === 'phone') fv = (ctx.phone || '').toLowerCase()
    switch (operator) {
      case 'contains': return fv.includes(value)
      case 'not_contains': return !fv.includes(value)
      case 'equals': return fv === value
      case 'not_equals': return fv !== value
      case 'is_empty': return fv === ''
      case 'is_not_empty': return fv !== ''
      default: return fv.includes(value)
    }
  }

  private evaluateBranch(branch: ConditionBranch, ctx: FlowContext, variables: Record<string, any>): boolean {
    const { logic, rules } = branch
    if (!rules || rules.length === 0) return false
    if (logic === 'OR') return rules.some(rule => this.evaluateRule(rule, ctx, variables))
    return rules.every(rule => this.evaluateRule(rule, ctx, variables))
  }

  private evaluateRule(rule: ConditionRule, ctx: FlowContext, variables: Record<string, any>): boolean {
    let fv = ''
    if (rule.field === 'message') fv = ctx.messageBody || ''
    else if (rule.field === 'variable') fv = variables[rule.fieldName || rule.field] || ''
    else if (rule.field === 'phone') fv = ctx.phone || ''
    else if (rule.field === 'webhook_status') fv = variables['webhook_status'] || ''
    else fv = ctx.messageBody || ''
    const val = (rule.value || '').toLowerCase()
    fv = fv.toLowerCase()
    switch (rule.operator) {
      case 'contains': return fv.includes(val)
      case 'not_contains': return !fv.includes(val)
      case 'equals': return fv === val
      case 'not_equals': return fv !== val
      case 'starts_with': return fv.startsWith(val)
      case 'ends_with': return fv.endsWith(val)
      case 'is_empty': return fv === ''
      case 'is_not_empty': return fv !== ''
      default: return fv.includes(val)
    }
  }

  private evaluateCondition(data: any, ctx: FlowContext, variables: Record<string, any>): boolean {
    const { conditionType, field, operator, value } = data || {}
    let fv = ''
    if (conditionType === 'message') fv = ctx.messageBody || ''
    else if (conditionType === 'variable') fv = variables[field] || ''
    else if (conditionType === 'phone') fv = ctx.phone || ''
    else fv = ctx.messageBody || ''
    const val = (value || '').toLowerCase()
    fv = fv.toLowerCase()
    switch (operator) {
      case 'contains': return fv.includes(val)
      case 'not_contains': return !fv.includes(val)
      case 'equals': return fv === val
      case 'not_equals': return fv !== val
      case 'starts_with': return fv.startsWith(val)
      case 'ends_with': return fv.endsWith(val)
      case 'is_empty': return fv === ''
      case 'is_not_empty': return fv !== ''
      default: return fv.includes(val)
    }
  }

  private interpolate(template: string, ctx: FlowContext, variables: Record<string, any> = {}): string {
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
    try { await db.from('flow_logs').insert({ id: generateId(), flow_id: flowId, node_id: nodeId, tenant_id: ctx.tenantId, contact_id: ctx.contactId, conversation_id: ctx.conversationId, status, detail }) } catch { }
  }
}

export const flowEngine = new FlowEngine()