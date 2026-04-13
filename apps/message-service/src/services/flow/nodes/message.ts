import { db, logger, generateId } from '@autozap/utils'
import { interpolate, sendMessage } from '../helpers'
import type { FlowContext, FlowNodeData, FlowNodeRow, FlowEdgeRow, NodeResult } from '../types'

type EdgeMap = Map<string, FlowEdgeRow[]>
type NodeMap = Map<string, FlowNodeRow>
type GetNextNode = (nodeId: string, handle: string, edgeMap: EdgeMap, nodeMap: NodeMap) => FlowNodeRow | undefined

export async function handleSendMessage(
  node: FlowNodeRow, ctx: FlowContext, flowId: string, data: FlowNodeData,
  variables: Record<string, string>, getNextNode: GetNextNode,
): Promise<NodeResult | null> {
  const message = interpolate(data?.message || '', ctx, variables)
  if (!message) return null
  const ch = ctx.channelId

  if (data?.delay && data.delay > 0) {
    const delayMs = data.delay * 1000
    if (delayMs <= 30000) {
      await new Promise(r => setTimeout(r, delayMs))
    } else {
      logger.warn('send_message delay exceeds 30s', { delay: data.delay, nodeId: node.id })
    }
  }

  logger.info('send_message debug', { subtype: data?.subtype, hasButtons: !!data?.buttons?.length, hasListRows: !!data?.listRows?.length, nodeId: node.id })

  if (data?.subtype === 'buttons' && data?.buttons?.length) {
    const buttons = data.buttons.map((b: any, i: number) => ({ id: `btn_${i}`, title: interpolate(b.title || b, ctx, variables) }))
    await sendMessage({ tenantId: ctx.tenantId, channelId: ch, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: message, interactiveType: 'button', buttons, footer: data.footer ? interpolate(data.footer, ctx, variables) : undefined })
  } else if (data?.subtype === 'list' && data?.listRows?.length) {
    const listRows = data.listRows.map((r: any, i: number) => ({ id: `row_${i}`, title: interpolate(r.title || r, ctx, variables), description: r.description ? interpolate(r.description, ctx, variables) : undefined }))
    await sendMessage({ tenantId: ctx.tenantId, channelId: ch, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: message, interactiveType: 'list', listRows, listButtonText: data.listButtonText || 'Ver opções', footer: data.footer ? interpolate(data.footer, ctx, variables) : undefined })
  } else {
    await sendMessage({ tenantId: ctx.tenantId, channelId: ch, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: message })
  }
  return { success: true }
}

export async function handleSendMedia(
  node: FlowNodeRow, ctx: FlowContext, contentType: 'image' | 'video' | 'audio' | 'document', data: FlowNodeData,
): Promise<NodeResult | null> {
  if (!data?.mediaUrl) return null
  const body = contentType === 'document' ? (data.filename || 'documento') : (data.caption || '')
  await sendMessage({
    tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId,
    conversationId: ctx.conversationId, to: ctx.phone, contentType,
    mediaUrl: data.mediaUrl, ...(contentType !== 'audio' ? { body } : {}),
  })
  return { success: true }
}

export async function handleInput(
  node: FlowNodeRow, ctx: FlowContext, flowId: string, data: FlowNodeData,
  variables: Record<string, string>, loopCounters: Record<string, number>,
  stateId: string | undefined, edgeMap: EdgeMap, nodeMap: NodeMap, getNextNode: GetNextNode,
): Promise<NodeResult> {
  if (data?.question) {
    await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: interpolate(data.question, ctx, variables) })
  }
  const saveVar = data?.saveAs || 'resposta'
  const nextNode = getNextNode(node.id, 'success', edgeMap, nodeMap)
  const pendingConditionNodeId = (nextNode?.type === 'condition') ? nextNode.id : null
  const inputStateId = stateId || generateId()
  await db.from('flow_states').upsert({
    id: inputStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
    conversation_id: ctx.conversationId, current_node_id: node.id, pending_condition_node_id: pendingConditionNodeId,
    variables, loop_counters: loopCounters, waiting_variable: saveVar, status: 'waiting', updated_at: new Date(),
  }, { onConflict: 'flow_id,conversation_id' })

  const timeoutMs = data?.timeoutMinutes ? data.timeoutMinutes * 60000 : data?.timeoutHours ? data.timeoutHours * 3600000 : 0
  if (timeoutMs > 0) {
    const { flowResumeQueue } = await import('../../../workers/flow.worker')
    const timeoutNodeId = getNextNode(node.id, 'timeout', edgeMap, nodeMap)?.id
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
