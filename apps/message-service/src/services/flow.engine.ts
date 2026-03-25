import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { generateId } from '@autozap/utils'
import OpenAI from 'openai'

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
        if (onCooldown) {
          logger.info('Flow skipped — cooldown active', { flowId: flow.id, cooldownType: flow.cooldown_type })
          continue
        }

        logger.info('Flow triggered', { flowId: flow.id, tenantId: ctx.tenantId })
        await this.executeFlow(flow, ctx, {})
        break
      }
    } catch (err) {
      logger.error('Flow engine error', { err, tenantId: ctx.tenantId })
    }
  }

  private async resumeWaitingFlow(ctx: FlowContext): Promise<boolean> {
    const { data: state } = await db
      .from('flow_states')
      .select('*')
      .eq('conversation_id', ctx.conversationId)
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!state) return false

    logger.info('Resuming waiting flow', { flowId: state.flow_id, nodeId: state.current_node_id })

    const variables = state.variables || {}
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

    let currentNode = this.getNextNode(state.current_node_id, 'success', edgeMap, nodeMap)
    let stepCount = 0

    while (currentNode && stepCount < 50) {
      stepCount++
      const result = await this.executeNode(currentNode, ctx, flow.id, variables, edgeMap, nodeMap, state.id)
      if (result.paused || result.ended) break
      const nextHandle = result.success ? 'success' : 'error'
      currentNode = this.getNextNode(currentNode.id, nextHandle, edgeMap, nodeMap)
    }

    await db.from('flow_states').update({ status: 'completed', updated_at: new Date() }).eq('id', state.id)
    await this.logNode(flow.id, generateId(), ctx, 'flow_executed', `Flow retomado e executado`)
    return true
  }

  private async isOnCooldown(flow: any, ctx: FlowContext): Promise<boolean> {
    const cooldownType = flow.cooldown_type || '24h'
    if (cooldownType === 'always') return false

    const { data } = await db
      .from('flow_logs')
      .select('created_at')
      .eq('flow_id', flow.id)
      .eq('conversation_id', ctx.conversationId)
      .eq('status', 'flow_executed')
      .order('created_at', { ascending: false })
      .limit(1)

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
        const body = (ctx.messageBody || '').toLowerCase()
        return keywords.some((kw: string) => body.includes(kw.toLowerCase().trim()))
      }
      case 'trigger_first_message': {
        if (!ctx.isFirstMessage) return false
        const keywords: string[] = data?.keywords || []
        if (keywords.length === 0) return true
        const body = (ctx.messageBody || '').toLowerCase()
        return keywords.some((kw: string) => body.includes(kw.toLowerCase().trim()))
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

    while (currentNode && stepCount < 50) {
      stepCount++
      const result = await this.executeNode(currentNode, ctx, flow.id, variables, edgeMap, nodeMap, null)
      if (result.paused || result.ended) break
      const nextHandle = result.success ? 'success' : 'error'
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
    variables: Record<string, any>,
    edgeMap: Map<string, any[]>, nodeMap: Map<string, any>,
    stateId: string | null
  ): Promise<{ success: boolean; paused?: boolean; ended?: boolean }> {
    const { type, data } = node

    try {
      logger.info('Executing flow node', { nodeId: node.id, type, flowId })

      switch (type) {

        case 'send_message': {
          const message = this.interpolate(data?.message || '', ctx, variables)
          if (!message) break
          const delay = data?.delay || 0
          if (delay > 0) await new Promise(r => setTimeout(r, delay * 1000))
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
            const question = this.interpolate(data.question, ctx, variables)
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: question })
          }
          const saveVar = data?.saveAs || 'resposta'
          await db.from('flow_states').upsert({
            id: stateId || generateId(),
            flow_id: flowId,
            tenant_id: ctx.tenantId,
            contact_id: ctx.contactId,
            conversation_id: ctx.conversationId,
            current_node_id: node.id,
            variables,
            waiting_variable: saveVar,
            status: 'waiting',
            updated_at: new Date(),
          }, { onConflict: 'flow_id,conversation_id' })
          return { success: true, paused: true }
        }

        case 'ai': {
          const openaiKey = data?.apiKey || process.env.OPENAI_API_KEY
          if (!openaiKey) {
            logger.warn('AI node: no OpenAI API key configured')
            break
          }

          const openai = new OpenAI({ apiKey: openaiKey })
          const aiMode = data?.mode || 'respond'
          const systemPrompt = data?.systemPrompt || 'Você é um assistente prestativo e responde de forma clara e objetiva.'
          const userMessage = this.interpolate(data?.userMessage || ctx.messageBody, ctx, variables)

          let prompt = ''

          if (aiMode === 'respond') {
            prompt = userMessage
          } else if (aiMode === 'classify') {
            const options = (data?.classifyOptions || '').split(',').map((s: string) => s.trim()).filter(Boolean)
            prompt = `Classifique a mensagem a seguir em UMA das categorias: ${options.join(', ')}.\nResponda APENAS com a categoria, sem explicações.\n\nMensagem: "${userMessage}"`
          } else if (aiMode === 'extract') {
            const field = data?.extractField || 'informação'
            prompt = `Extraia apenas ${field} da mensagem a seguir. Responda apenas com o valor extraído, sem explicações.\n\nMensagem: "${userMessage}"`
          } else if (aiMode === 'summarize') {
            prompt = `Resuma a seguinte mensagem em uma frase curta:\n\n"${userMessage}"`
          }

          const completion = await openai.chat.completions.create({
            model: data?.model || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            max_tokens: data?.maxTokens || 500,
            temperature: data?.temperature ?? 0.7,
          })

          const aiResponse = completion.choices[0]?.message?.content?.trim() || ''
          logger.info('AI node response', { mode: aiMode, response: aiResponse.slice(0, 100) })

          // Salva resposta em variável
          if (data?.saveAs) {
            variables[data.saveAs] = aiResponse
          }

          // Se modo responder, envia a mensagem para o cliente
          if (aiMode === 'respond' && aiResponse) {
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: aiResponse })
          }

          break
        }

        case 'webhook': {
          const url = this.interpolate(data?.url || '', ctx, variables)
          if (!url) break

          const method = (data?.method || 'POST').toUpperCase()
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }

          if (data?.headers) {
            try {
              const customHeaders = typeof data.headers === 'string' ? JSON.parse(data.headers) : data.headers
              Object.assign(headers, customHeaders)
            } catch { }
          }

          let body: string | undefined
          if (method !== 'GET') {
            const rawBody = data?.body || '{}'
            const interpolatedBody = this.interpolate(rawBody, ctx, variables)
            try {
              JSON.parse(interpolatedBody)
              body = interpolatedBody
            } catch {
              body = JSON.stringify({ phone: ctx.phone, message: ctx.messageBody, contactId: ctx.contactId, conversationId: ctx.conversationId, ...variables })
            }
          }

          const response = await fetch(url, {
            method,
            headers,
            body: method !== 'GET' ? body : undefined,
            signal: AbortSignal.timeout(10000),
          })

          const responseText = await response.text()

          if (data?.saveResponseAs) {
            try {
              const json = JSON.parse(responseText)
              if (data?.responseField) {
                const fieldValue = data.responseField.split('.').reduce((obj: any, key: string) => obj?.[key], json)
                variables[data.saveResponseAs] = String(fieldValue ?? responseText)
              } else {
                variables[data.saveResponseAs] = responseText
              }
            } catch {
              variables[data.saveResponseAs] = responseText
            }
          }

          variables['webhook_status'] = String(response.status)
          variables['webhook_ok'] = response.ok ? 'true' : 'false'
          break
        }

        case 'condition': {
          const conditionMet = this.evaluateCondition(data, ctx, variables)
          const handle = conditionMet ? 'true' : 'false'
          let nextNode = this.getNextNode(node.id, handle, edgeMap, nodeMap)
          let steps = 0
          while (nextNode && steps < 50) {
            steps++
            const result = await this.executeNode(nextNode, ctx, flowId, variables, edgeMap, nodeMap, stateId)
            if (result.paused || result.ended) return result
            nextNode = this.getNextNode(nextNode.id, result.success ? 'success' : 'error', edgeMap, nodeMap)
          }
          return { success: true }
        }

        case 'wait': {
          const seconds = data?.seconds || 0
          const minutes = data?.minutes || 0
          const hours = data?.hours || 0
          const totalMs = (seconds + minutes * 60 + hours * 3600) * 1000
          if (totalMs > 0 && totalMs <= 300000) await new Promise(r => setTimeout(r, totalMs))
          break
        }

        case 'add_tag': {
          if (!data?.tagId) break
          await db.from('contact_tags').upsert(
            { contact_id: ctx.contactId, tag_id: data.tagId },
            { onConflict: 'contact_id,tag_id', ignoreDuplicates: true }
          )
          break
        }

        case 'remove_tag': {
          if (!data?.tagId) break
          await db.from('contact_tags')
            .delete()
            .eq('contact_id', ctx.contactId)
            .eq('tag_id', data.tagId)
          break
        }

        case 'update_contact': {
          const updateData: any = {}
          if (data?.field === 'name' && data?.value) {
            updateData.name = this.interpolate(data.value, ctx, variables)
          } else if (data?.field === 'phone' && data?.value) {
            updateData.phone = this.interpolate(data.value, ctx, variables)
          } else if (data?.field === 'custom' && data?.customField && data?.value) {
            // Salva em metadata do contato
            const { data: contact } = await db.from('contacts').select('metadata').eq('id', ctx.contactId).single()
            const metadata = contact?.metadata || {}
            metadata[data.customField] = this.interpolate(data.value, ctx, variables)
            updateData.metadata = metadata
          }
          if (Object.keys(updateData).length > 0) {
            await db.from('contacts').update(updateData).eq('id', ctx.contactId)
          }
          break
        }

        case 'move_pipeline': {
          const stage = data?.stage
          if (!stage) break
          await db.from('conversations').update({ pipeline_stage: stage }).eq('id', ctx.conversationId)
          emitPusher(ctx.tenantId, 'conversation.updated', { conversationId: ctx.conversationId, pipelineStage: stage })
          break
        }

        case 'assign_agent': {
          if (data?.message) {
            const message = this.interpolate(data.message, ctx, variables)
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: message })
          }
          // Pausa o bot para atendimento humano
          await db.from('conversations').update({ bot_active: false }).eq('id', ctx.conversationId)
          break
        }

        case 'go_to': {
          // Redireciona para outro flow
          const targetFlowId = data?.targetFlowId
          if (!targetFlowId) break
          const { data: targetFlow } = await db.from('flows').select('*').eq('id', targetFlowId).eq('tenant_id', ctx.tenantId).single()
          if (!targetFlow || !targetFlow.is_active) break
          logger.info('Go to flow', { from: flowId, to: targetFlowId })
          await this.executeFlow(targetFlow, ctx, variables)
          return { success: true, ended: true }
        }

        case 'end': {
          // Finaliza o flow explicitamente
          logger.info('Flow ended by end node', { flowId, nodeId: node.id })
          if (data?.message) {
            const message = this.interpolate(data.message, ctx, variables)
            await this.sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: message })
          }
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

  private evaluateCondition(data: any, ctx: FlowContext, variables: Record<string, any>): boolean {
    const { conditionType, field, operator, value } = data || {}
    let fieldValue = ''
    if (conditionType === 'message') fieldValue = ctx.messageBody || ''
    else if (conditionType === 'variable') fieldValue = variables[field] || ''
    else if (conditionType === 'phone') fieldValue = ctx.phone || ''
    else if (conditionType === 'webhook_status') fieldValue = variables['webhook_status'] || ''
    else fieldValue = ctx.messageBody || ''

    const val = (value || '').toLowerCase()
    const fv = fieldValue.toLowerCase()

    switch (operator) {
      case 'contains':     return fv.includes(val)
      case 'not_contains': return !fv.includes(val)
      case 'equals':       return fv === val
      case 'not_equals':   return fv !== val
      case 'starts_with':  return fv.startsWith(val)
      case 'ends_with':    return fv.endsWith(val)
      case 'is_empty':     return fv === ''
      case 'is_not_empty': return fv !== ''
      default:             return fv.includes(val)
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

  private async sendMessage(opts: {
    tenantId: string; channelId: string; contactId: string
    conversationId: string; to: string; contentType: string
    body?: string; mediaUrl?: string
  }): Promise<void> {
    const response = await fetch(`${MESSAGE_SERVICE_URL}/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({
        tenantId: opts.tenantId, channelId: opts.channelId,
        contactId: opts.contactId, conversationId: opts.conversationId,
        to: opts.to, contentType: opts.contentType,
        body: opts.body, mediaUrl: opts.mediaUrl,
      }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Failed to send message: ${JSON.stringify(err)}`)
    }
  }

  private async logNode(flowId: string, nodeId: string, ctx: FlowContext, status: string, detail: string): Promise<void> {
    try {
      await db.from('flow_logs').insert({
        id: generateId(), flow_id: flowId, node_id: nodeId,
        tenant_id: ctx.tenantId, contact_id: ctx.contactId,
        conversation_id: ctx.conversationId, status, detail,
      })
    } catch { }
  }
}

export const flowEngine = new FlowEngine()