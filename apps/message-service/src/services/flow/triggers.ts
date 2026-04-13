import { db, logger } from '@autozap/utils'
import type { FlowContext, FlowRow, FlowNodeRow } from './types'

export async function isOnCooldown(flow: FlowRow, ctx: FlowContext): Promise<boolean> {
  const cooldownType = flow.cooldown_type || '24h'
  if (cooldownType === 'always') return false
  const { data } = await db.from('flow_logs').select('created_at').eq('flow_id', flow.id).eq('conversation_id', ctx.conversationId).eq('status', 'flow_executed').order('created_at', { ascending: false }).limit(1)
  if (!data || data.length === 0) return false
  const lastExecution = new Date(data[0].created_at)
  if (cooldownType === 'once') return true
  if (cooldownType === '24h') return Date.now() - lastExecution.getTime() < 24 * 60 * 60 * 1000
  return false
}

export async function checkFlowTrigger(flow: FlowRow, ctx: FlowContext): Promise<boolean> {
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

  return evaluateTrigger(triggerNode, ctx)
}

export function evaluateTrigger(node: FlowNodeRow, ctx: FlowContext): boolean {
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
