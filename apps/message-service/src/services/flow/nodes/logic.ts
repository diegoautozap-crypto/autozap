import { db, logger, generateId } from '@autozap/utils'
import { interpolate, sendMessage, evaluateBranch, evaluateCondition, evaluateLoopCondition, emitPusher } from '../helpers'
import type { FlowContext, FlowNodeData, FlowNodeRow, FlowEdgeRow, NodeResult, ConditionBranch } from '../types'

type EdgeMap = Map<string, FlowEdgeRow[]>
type NodeMap = Map<string, FlowNodeRow>
type GetNextNode = (nodeId: string, handle: string, edgeMap: EdgeMap, nodeMap: NodeMap) => FlowNodeRow | undefined
type ExecuteNode = (node: FlowNodeRow, ctx: FlowContext, flowId: string, variables: Record<string, string>, loopCounters: Record<string, number>, edgeMap: EdgeMap, nodeMap: NodeMap, stateId?: string) => Promise<NodeResult>
type ExecuteFlow = (flow: any, ctx: FlowContext, variables: Record<string, string>) => Promise<void>

export async function handleWait(
  node: FlowNodeRow, ctx: FlowContext, flowId: string, data: FlowNodeData,
  variables: Record<string, string>, loopCounters: Record<string, number>,
  stateId: string | undefined, edgeMap: EdgeMap, nodeMap: NodeMap, getNextNode: GetNextNode,
): Promise<NodeResult | null> {
  const totalMs = ((data?.seconds || 0) + (data?.minutes || 0) * 60 + (data?.hours || 0) * 3600 + (Number(data?.days) || 0) * 86400) * 1000
  if (totalMs <= 0) return null
  if (totalMs <= 300_000) { await new Promise(r => setTimeout(r, totalMs)); return { success: true } }
  const nextNode = getNextNode(node.id, 'success', edgeMap, nodeMap)
  if (!nextNode) return null
  const newStateId = stateId || generateId()
  await db.from('flow_states').upsert({
    id: newStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
    conversation_id: ctx.conversationId, current_node_id: node.id, variables, loop_counters: loopCounters,
    status: 'delayed', delay_until: new Date(Date.now() + totalMs).toISOString(), updated_at: new Date(),
  }, { onConflict: 'flow_id,conversation_id' })
  const { flowResumeQueue } = await import('../../../workers/flow.worker')
  await flowResumeQueue.add('resume', { stateId: newStateId, flowId, tenantId: ctx.tenantId, contactId: ctx.contactId, conversationId: ctx.conversationId, channelId: ctx.channelId, phone: ctx.phone, resumeNodeId: nextNode.id }, { delay: totalMs })
  logger.info('Flow delayed via BullMQ', { flowId, delayMs: totalMs })
  return { success: true, delayed: true }
}

export async function handleCondition(
  node: FlowNodeRow, ctx: FlowContext, flowId: string, data: FlowNodeData,
  variables: Record<string, string>, loopCounters: Record<string, number>,
  stateId: string | undefined, edgeMap: EdgeMap, nodeMap: NodeMap,
  getNextNode: GetNextNode, executeNode: ExecuteNode,
): Promise<NodeResult> {
  const branches: ConditionBranch[] = data?.branches || []
  if (branches.length > 0) {
    let matchedHandle: string | null = null
    for (const branch of branches) { if (evaluateBranch(branch, ctx, variables)) { matchedHandle = `branch_${branch.id}`; break } }
    const handle = matchedHandle || 'fallback'
    let nextNode = getNextNode(node.id, handle, edgeMap, nodeMap)
    let steps = 0
    while (nextNode && steps < 50) {
      steps++
      const result = await executeNode(nextNode, ctx, flowId, variables, loopCounters, edgeMap, nodeMap, stateId)
      if (result.paused || result.ended || result.delayed) return result
      nextNode = getNextNode(nextNode.id, result.nextHandle || (result.success ? 'success' : 'error'), edgeMap, nodeMap)
    }
    return { success: true }
  }
  const conditionMet = evaluateCondition(data, ctx, variables)
  let nextNode = getNextNode(node.id, conditionMet ? 'true' : 'false', edgeMap, nodeMap)
  let steps = 0
  while (nextNode && steps < 50) {
    steps++
    const result = await executeNode(nextNode, ctx, flowId, variables, loopCounters, edgeMap, nodeMap, stateId)
    if (result.paused || result.ended || result.delayed) return result
    nextNode = getNextNode(nextNode.id, result.success ? 'success' : 'error', edgeMap, nodeMap)
  }
  return { success: true }
}

export async function handleLoopRepeat(
  node: FlowNodeRow, ctx: FlowContext, flowId: string, data: FlowNodeData,
  variables: Record<string, string>, loopCounters: Record<string, number>,
  stateId: string | undefined, edgeMap: EdgeMap, nodeMap: NodeMap,
  getNextNode: GetNextNode, executeNode: ExecuteNode,
): Promise<NodeResult> {
  const maxTimes = data?.times || 1
  const countKey = `loop_repeat_${node.id}`
  const current = loopCounters[countKey] || 0
  if (current < maxTimes) {
    loopCounters[countKey] = current + 1
    variables['loop_index'] = String(current + 1)
    let loopNode = getNextNode(node.id, 'loop', edgeMap, nodeMap)
    let steps = 0
    while (loopNode && steps < 100) {
      steps++
      if (loopNode.id === node.id) break
      const result = await executeNode(loopNode, ctx, flowId, variables, loopCounters, edgeMap, nodeMap, stateId)
      if (result.paused || result.ended || result.delayed) return result
      const next = getNextNode(loopNode.id, result.nextHandle || (result.success ? 'success' : 'error'), edgeMap, nodeMap)
      if (!next || next.id === node.id) break
      loopNode = next
    }
    if (loopCounters[countKey] < maxTimes) return { success: true, nextHandle: 'loop' }
  }
  loopCounters[countKey] = 0
  return { success: true, nextHandle: 'done' }
}

export function handleLoopRetry(
  node: FlowNodeRow, data: FlowNodeData, loopCounters: Record<string, number>,
): NodeResult {
  const maxRetries = data?.maxRetries || 3
  const countKey = `loop_retry_${node.id}`
  const current = loopCounters[countKey] || 0
  if (current >= maxRetries) { loopCounters[countKey] = 0; return { success: true, nextHandle: 'exhausted' } }
  loopCounters[countKey] = current + 1
  return { success: true, nextHandle: 'loop' }
}

export function handleLoopWhile(
  node: FlowNodeRow, ctx: FlowContext, data: FlowNodeData,
  variables: Record<string, string>, loopCounters: Record<string, number>,
): NodeResult {
  const maxIterations = data?.maxIterations || 10
  const countKey = `loop_while_${node.id}`
  const current = loopCounters[countKey] || 0
  if (current >= maxIterations) { loopCounters[countKey] = 0; return { success: true, nextHandle: 'done' } }
  if (evaluateLoopCondition(data, ctx, variables)) {
    loopCounters[countKey] = current + 1
    return { success: true, nextHandle: 'loop' }
  }
  loopCounters[countKey] = 0
  return { success: true, nextHandle: 'done' }
}

export function handleSplitAB(data: FlowNodeData, variables: Record<string, string>): NodeResult {
  const paths = data?.splitPaths || [{ label: 'A', weight: 50 }, { label: 'B', weight: 50 }]
  const totalWeight = paths.reduce((sum: number, p: any) => sum + (p.weight || 1), 0)
  const rand = Math.random() * totalWeight
  let cumulative = 0
  let selectedIndex = 0
  for (let i = 0; i < paths.length; i++) {
    cumulative += paths[i].weight || 1
    if (rand <= cumulative) { selectedIndex = i; break }
  }
  variables['ab_path'] = paths[selectedIndex].label || String.fromCharCode(65 + selectedIndex)
  return { success: true, nextHandle: `split_${selectedIndex}` }
}

export function handleRandomPath(data: FlowNodeData, variables: Record<string, string>): NodeResult {
  const rpaths = data?.randomPaths || ['A', 'B']
  const idx = Math.floor(Math.random() * rpaths.length)
  variables['random_path'] = rpaths[idx]
  return { success: true, nextHandle: `random_${idx}` }
}

export async function handleGoTo(
  node: FlowNodeRow, ctx: FlowContext, flowId: string, data: FlowNodeData,
  variables: Record<string, string>, executeFlow: ExecuteFlow,
): Promise<NodeResult | null> {
  if (!data?.targetFlowId) return null
  const visitedKey = '__visited_flows'
  const visited = new Set((variables[visitedKey] || '').split(',').filter(Boolean))
  if (visited.has(data.targetFlowId)) {
    logger.warn('Flow recursion detected', { flowId, targetFlowId: data.targetFlowId })
    return null
  }
  visited.add(flowId)
  variables[visitedKey] = Array.from(visited).join(',')
  const { data: targetFlow } = await db.from('flows').select('*').eq('id', data.targetFlowId).eq('tenant_id', ctx.tenantId).single()
  if (!targetFlow || !targetFlow.is_active) return null
  await executeFlow(targetFlow, ctx, variables)
  return { success: true, ended: true }
}

export async function handleEnd(
  ctx: FlowContext, data: FlowNodeData, variables: Record<string, string>,
): Promise<NodeResult> {
  if (data?.message) await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: interpolate(data.message, ctx, variables) })
  await db.from('flow_states').update({ status: 'completed', updated_at: new Date() }).eq('conversation_id', ctx.conversationId).eq('tenant_id', ctx.tenantId).eq('status', 'waiting')
  return { success: true, ended: true }
}
