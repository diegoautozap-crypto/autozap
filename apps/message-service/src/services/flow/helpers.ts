import { db, logger, generateId, decryptCredentials } from '@autozap/utils'
import { PLAN_LIMITS, type PlanSlug } from '@autozap/types'
import type { FlowContext, FlowNodeData, ConditionBranch, ConditionRule } from './types'

const MESSAGE_SERVICE_URL = process.env.MESSAGE_SERVICE_URL || 'http://localhost:3004'
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!
const PUSHER_APP_ID  = process.env.PUSHER_APP_ID
const PUSHER_KEY     = process.env.PUSHER_KEY
const PUSHER_SECRET  = process.env.PUSHER_SECRET
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER || 'sa1'

// ─── In-memory cache ─────────────────────────────────────────────────────────
const cache = new Map<string, { data: any; expires: number }>()
export function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const entry = cache.get(key)
  if (entry && entry.expires > Date.now()) return Promise.resolve(entry.data as T)
  return fetcher().then(data => {
    cache.set(key, { data, expires: Date.now() + ttlMs })
    if (cache.size > 500) {
      const now = Date.now()
      for (const [k, v] of cache) { if (v.expires < now) cache.delete(k) }
    }
    return data
  })
}

// ─── Pusher ──────────────────────────────────────────────────────────────────
let pusherFailCount = 0
let pusherCircuitOpen = 0

export async function emitPusher(tenantId: string, event: string, data: object): Promise<void> {
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET) return
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

// ─── Emoji numbers ───────────────────────────────────────────────────────────
const NUM_EMOJIS = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']
export function numEmoji(n: number): string {
  if (n >= 0 && n <= 10) return NUM_EMOJIS[n]
  return String(n).split('').map(d => NUM_EMOJIS[parseInt(d)] || d).join('')
}

// ─── Interpolation ───────────────────────────────────────────────────────────
export function interpolate(template: string, ctx: FlowContext, variables: Record<string, string> = {}): string {
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

// ─── Send Message ────────────────────────────────────────────────────────────
export async function sendMessage(opts: { tenantId: string; channelId: string; contactId: string; conversationId: string; to: string; contentType: string; body?: string; mediaUrl?: string; interactiveType?: string; buttons?: any[]; listRows?: any[]; listButtonText?: string; footer?: string }): Promise<void> {
  const response = await fetch(`${MESSAGE_SERVICE_URL}/messages/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
    body: JSON.stringify(opts),
  })
  if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(`Failed to send message: ${JSON.stringify(err)}`) }
}

// ─── Log Node ────────────────────────────────────────────────────────────────
export async function logNode(flowId: string, nodeId: string, ctx: FlowContext, status: string, detail: string): Promise<void> {
  try { await db.from('flow_logs').insert({ id: generateId(), flow_id: flowId, node_id: nodeId, tenant_id: ctx.tenantId, contact_id: ctx.contactId, conversation_id: ctx.conversationId, status, detail }) } catch (err) { logger.warn('Failed to log flow node', { flowId, nodeId, err }) }
}

// ─── Plan Limits ─────────────────────────────────────────────────────────────
export async function getTenantPlanLimits(tenantId: string): Promise<{ planSlug: PlanSlug; limits: typeof PLAN_LIMITS[PlanSlug] }> {
  const { data: tenant } = await cached(`tenant-plan:${tenantId}`, 60_000, async () => {
    const r = await db.from('tenants').select('plan_slug').eq('id', tenantId).single()
    return r
  })
  const planSlug = (tenant?.plan_slug || 'pending') as PlanSlug
  const limits = PLAN_LIMITS[planSlug] ?? PLAN_LIMITS.pending
  return { planSlug, limits }
}

export async function getMonthlyAiCount(tenantId: string): Promise<number> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { count } = await db
    .from('flow_logs').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'ai_response')
    .gte('created_at', monthStart)
  return count ?? 0
}

// ─── Condition Helpers ───────────────────────────────────────────────────────
export function extractNumber(text: string): number {
  const direct = Number(text.replace(/[.,\s]/g, ''))
  if (!isNaN(direct) && text.replace(/\s/g, '').length > 0) return direct

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

  const kMatch = t.match(/(\d+)\s*k/)
  if (kMatch) return Number(kMatch[1]) * 1000

  const milMatch = t.match(/(\d+)\s*mil/)
  if (milMatch) return Number(milMatch[1]) * 1000

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

  if (result === 0) {
    const numMatch = t.match(/[\d.,]+/)
    if (numMatch) return Number(numMatch[0].replace(/[.,]/g, ''))
  }

  return result
}

export function matchOperator(fv: string, operator: string, rawVal: string): boolean {
  fv = fv.toLowerCase()
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
    case 'greater_than':  return extractNumber(fv) > extractNumber(val)
    case 'less_than':     return extractNumber(fv) < extractNumber(val)
    case 'greater_equal': return extractNumber(fv) >= extractNumber(val)
    case 'less_equal':    return extractNumber(fv) <= extractNumber(val)
    default:             return values.length > 1 ? values.some(v => fv.includes(v)) : fv.includes(val)
  }
}

export function evaluateRule(rule: ConditionRule, ctx: FlowContext, variables: Record<string, string>): boolean {
  let fv = ''
  if (rule.field === 'message') fv = ctx.messageBody || ''
  else if (rule.field === 'variable') fv = variables[rule.fieldName || rule.field] || ''
  else if (rule.field === 'phone') fv = ctx.phone || ''
  else if (rule.field === 'webhook_status') fv = variables['webhook_status'] || ''
  else fv = ctx.messageBody || ''
  return matchOperator(fv, rule.operator, rule.value || '')
}

export function evaluateBranch(branch: ConditionBranch, ctx: FlowContext, variables: Record<string, string>): boolean {
  const { logic, rules } = branch
  if (!rules || rules.length === 0) return false
  if (logic === 'OR') return rules.some(rule => evaluateRule(rule, ctx, variables))
  return rules.every(rule => evaluateRule(rule, ctx, variables))
}

export function evaluateCondition(data: FlowNodeData, ctx: FlowContext, variables: Record<string, string>): boolean {
  const { conditionType, field, operator, value } = data || {}
  let fv = ''
  if (conditionType === 'message') fv = ctx.messageBody || ''
  else if (conditionType === 'variable') fv = variables[field] || ''
  else if (conditionType === 'phone') fv = ctx.phone || ''
  else fv = ctx.messageBody || ''
  return matchOperator(fv, operator || 'contains', value || '')
}

export function evaluateLoopCondition(data: FlowNodeData, ctx: FlowContext, variables: Record<string, string>): boolean {
  const field = data?.conditionField || 'variable'
  const operator = data?.conditionOperator || 'is_empty'
  const value = data?.conditionValue || ''
  let fv = ''
  if (field === 'message') fv = ctx.messageBody || ''
  else if (field === 'variable') fv = variables[data?.conditionFieldName || ''] || ''
  else if (field === 'phone') fv = ctx.phone || ''
  return matchOperator(fv, operator, value)
}
