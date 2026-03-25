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

        // Verifica cooldown antes de executar
        const onCooldown = await this.isOnCooldown(flow, ctx)
        if (onCooldown) {
          logger.info('Flow skipped — cooldown active', { flowId: flow.id, cooldownType: flow.cooldown_type })
          continue
        }

        logger.info('Flow triggered', { flowId: flow.id, tenantId: ctx.tenantId })
        await this.executeFlow(flow, ctx)
        break
      }
    } catch (err) {
      logger.error('Flow engine error', { err, tenantId: ctx.tenantId })
    }
  }

  private async isOnCooldown(flow: any, ctx: FlowContext): Promise<boolean> {
    const cooldownType = flow.cooldown_type || '24h'

    // 'always' = sem cooldown, sempre dispara
    if (cooldownType === 'always') return false

    // Busca última execução completa desse flow nessa conversa
    const { data } = await db
      .from('flow_logs')
      .select('created_at')
      .eq('flow_id', flow.id)
      .eq('conversation_id', ctx.conversationId)
      .eq('status', 'flow_executed')
      .order('created_at', { ascending: false })
      .limit(1)

    if (!data || data.length === 0) return false // nunca executou

    const lastExecution = new Date(data[0].created_at)

    if (cooldownType === 'once') return true // já executou, nunca mais

    if (cooldownType === '24h') {
      const diff = Date.now() - lastExecution.getTime()
      return diff < 24 * 60 * 60 * 1000
    }

    return false
  }

  private async checkFlowTrigger(flow: any, ctx: FlowContext): Promise<boolean> {
    const { data: nodes } = await db
      .from('flow_nodes')
      .select('*')
      .eq('flow_id', flow.id)

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
      case 'trigger_outside_hours': {
        const start = data?.start ?? 9
        const end = data?.end ?? 18
        const days = data?.days ?? [1, 2, 3, 4, 5]
        const now = new Date()
        const day = now.getDay()
        const hour = now.getHours()
        return !days.includes(day) || hour < start || hour >= end
      }
      default:
        return false
    }
  }

  private async executeFlow(flow: any, ctx: FlowContext): Promise<void> {
    const { data: nodes } = await db
      .from('flow_nodes')
      .select('*')
      .eq('flow_id', flow.id)

    const { data: edges } = await db
      .from('flow_edges')
      .select('*')
      .eq('flow_id', flow.id)

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
    const MAX_STEPS = 50

    while (currentNode && stepCount < MAX_STEPS) {
      stepCount++
      const result = await this.executeNode(currentNode, ctx, flow.id)
      const nextHandle = result.success ? 'success' : 'error'
      currentNode = this.getNextNode(currentNode.id, nextHandle, edgeMap, nodeMap)
    }

    // Salva log de execução completa para controle de cooldown
    await this.logNode(flow.id, 'flow_completed', ctx, 'flow_executed', `Flow executado com ${stepCount} passos`)

    logger.info('Flow executed', { flowId: flow.id, steps: stepCount, tenantId: ctx.tenantId })
  }

  private getNextNode(nodeId: string, handle: string, edgeMap: Map<string, any[]>, nodeMap: Map<string, any>): any | null {
    const key = `${nodeId}:${handle}`
    const edges = edgeMap.get(key)
    if (!edges || edges.length === 0) return null
    const targetId = edges[0].target_node
    return nodeMap.get(targetId) || null
  }

  private async executeNode(node: any, ctx: FlowContext, flowId: string): Promise<{ success: boolean }> {
    const { type, data } = node

    try {
      logger.info('Executing flow node', { nodeId: node.id, type, flowId })

      switch (type) {
        case 'send_message': {
          const message = this.interpolate(data?.message || '', ctx)
          if (!message) break
          const delay = data?.delay || 0
          if (delay > 0) await new Promise(r => setTimeout(r, delay * 1000))
          await this.sendMessage({
            tenantId: ctx.tenantId,
            channelId: ctx.channelId,
            contactId: ctx.contactId,
            conversationId: ctx.conversationId,
            to: ctx.phone,
            body: message,
          })
          break
        }

        case 'wait': {
          const seconds = data?.seconds || 0
          const minutes = data?.minutes || 0
          const hours = data?.hours || 0
          const totalMs = (seconds + minutes * 60 + hours * 3600) * 1000
          if (totalMs > 0 && totalMs <= 300000) {
            await new Promise(r => setTimeout(r, totalMs))
          }
          break
        }

        case 'add_tag': {
          const tagId = data?.tagId
          if (!tagId) break
          await db.from('contact_tags').upsert(
            { contact_id: ctx.contactId, tag_id: tagId },
            { onConflict: 'contact_id,tag_id', ignoreDuplicates: true }
          )
          break
        }

        case 'move_pipeline': {
          const stage = data?.stage
          if (!stage) break
          await db.from('conversations')
            .update({ pipeline_stage: stage })
            .eq('id', ctx.conversationId)
          emitPusher(ctx.tenantId, 'conversation.updated', {
            conversationId: ctx.conversationId,
            pipelineStage: stage,
          })
          break
        }

        case 'assign_agent': {
          const notifyMessage = data?.message
          if (notifyMessage) {
            const message = this.interpolate(notifyMessage, ctx)
            const delay = data?.delay || 0
            if (delay > 0) await new Promise(r => setTimeout(r, delay * 1000))
            await this.sendMessage({
              tenantId: ctx.tenantId,
              channelId: ctx.channelId,
              contactId: ctx.contactId,
              conversationId: ctx.conversationId,
              to: ctx.phone,
              body: message,
            })
          }
          break
        }

        default:
          logger.warn('Unknown node type in flow engine', { type, nodeId: node.id })
      }

      await this.logNode(flowId, node.id, ctx, 'success', `Nó ${type} executado`)
      return { success: true }

    } catch (err: any) {
      logger.error('Flow node error', { nodeId: node.id, type, err: err.message })
      await this.logNode(flowId, node.id, ctx, 'error', err.message)
      return { success: false }
    }
  }

  private interpolate(template: string, ctx: FlowContext): string {
    return template
      .replace(/\{\{phone\}\}/gi, ctx.phone)
      .replace(/\{\{telefone\}\}/gi, ctx.phone)
  }

  private async sendMessage(opts: {
    tenantId: string; channelId: string; contactId: string
    conversationId: string; to: string; body: string
  }): Promise<void> {
    const response = await fetch(`${MESSAGE_SERVICE_URL}/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({
        tenantId: opts.tenantId,
        channelId: opts.channelId,
        contactId: opts.contactId,
        conversationId: opts.conversationId,
        to: opts.to,
        contentType: 'text',
        body: opts.body,
      }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Failed to send flow message: ${JSON.stringify(err)}`)
    }
  }

  private async logNode(
    flowId: string, nodeId: string, ctx: FlowContext,
    status: string, detail: string
  ): Promise<void> {
    try {
      await db.from('flow_logs').insert({
        id: generateId(),
        flow_id: flowId,
        node_id: nodeId,
        tenant_id: ctx.tenantId,
        contact_id: ctx.contactId,
        conversation_id: ctx.conversationId,
        status,
        detail,
      })
    } catch { }
  }
}

export const flowEngine = new FlowEngine()
