import { Router } from 'express'
import { z } from 'zod'
import { messageService } from '../services/message.service'
import { messageQueue } from '../workers/message.worker'
import { requireInternal } from '../middleware/message.middleware'
import { logger, db, requireAuth, validate, ok, generateId, normalizeBRPhone, rateLimit, AppError, cachedGet } from '@autozap/utils'
import { PLAN_LIMITS, type PlanSlug } from '@autozap/types'
import { ensureContact, ensureConversation } from '../services/contact.helper'

const notifySchema = z.object({
  phone: z.string().min(8),
  message: z.string().min(1).max(10000),
  channelId: z.string().optional(),
  name: z.string().max(255).optional(),
})

const router = Router()

import crypto from 'crypto'

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!

function requireAuthOrInternal(req: any, res: any, next: any): void {
  const secret = req.headers['x-internal-secret'] as string
  if (secret && INTERNAL_SECRET && secret.length === INTERNAL_SECRET.length) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(INTERNAL_SECRET))) { next(); return }
    } catch {}
  }
  requireAuth(req, res, next)
}

function parseTimestamp(ts: any): Date {
  if (!ts) return new Date()
  if (ts instanceof Date) return ts
  if (typeof ts === 'number') return new Date(ts > 1e12 ? ts : ts * 1000)
  const d = new Date(ts)
  if (isNaN(d.getTime())) return new Date()
  return d
}

// ─── Resolve um valor do payload usando mapeamento configurado ────────────────
// fieldMap: [{ externalField: 'telefone', contactField: 'phone' }, ...]
function resolveField(body: any, contactField: string, fieldMap: any[]): string {
  // 1. Tenta pelo mapeamento configurado pelo usuário
  if (fieldMap && fieldMap.length > 0) {
    const mapping = fieldMap.find((m: any) => m.contactField === contactField)
    if (mapping?.externalField) {
      const val = body[mapping.externalField]
      if (val !== undefined && val !== null && val !== '') return String(val)
    }
  }

  // 2. Fallback: aliases padrão por campo
  const defaults: Record<string, string[]> = {
    phone:  ['phone_number', 'phone', 'telefone', 'celular', 'whatsapp', 'fone', 'tel'],
    name:   ['full_name', 'name', 'nome', 'first_name', 'contact_name', 'nome_completo'],
    email:  ['email', 'e-mail', 'e_mail', 'mail', 'email_address'],
    source: ['source', 'origem', 'campaign_name', 'utm_source', 'campanha'],
    message: ['message', 'mensagem', 'texto', 'observacao', 'obs', 'comment'],
  }

  const aliases = defaults[contactField] || []
  for (const alias of aliases) {
    const val = body[alias]
    if (val !== undefined && val !== null && val !== '') return String(val)
  }

  return ''
}

// ─── Internal Routes ──────────────────────────────────────────────────────────

router.post('/internal/inbound', requireInternal, async (req, res, _next) => {
  const { tenantId, channelId, message } = req.body

  // Respond 200 immediately — process flow execution in the background
  res.json(ok({ message: 'Inbound message accepted' }))

  // Background processing (errors are logged, not sent to the client)
  messageService.processInbound(tenantId, channelId, {
    ...message,
    timestamp: parseTimestamp(message.timestamp),
  }).catch(err => {
    logger.error('Background inbound processing failed', { tenantId, channelId, error: (err as Error).message })
  })
})

router.post('/internal/status_update', requireInternal, async (req, res, next) => {
  try {
    const { tenantId, channelId, statusUpdate } = req.body
    await messageService.updateStatus(tenantId, channelId, {
      ...statusUpdate,
      timestamp: parseTimestamp(statusUpdate.timestamp),
    })
    res.json(ok({ message: 'Status updated' }))
  } catch (err) { next(err) }
})

const sendSchema = z.object({
  channelId: z.string().uuid(),
  contactId: z.string().uuid(),
  conversationId: z.string().uuid(),
  tenantId: z.string().uuid().optional(),
  to: z.string().min(1),
  contentType: z.enum(['text', 'image', 'audio', 'video', 'document', 'template', 'interactive']),
  body: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  filename: z.string().optional(),
  campaignId: z.string().uuid().optional(),
  interactiveType: z.enum(['button', 'list']).optional(),
  buttons: z.array(z.object({ id: z.string().optional(), title: z.string() })).optional(),
  listRows: z.array(z.object({ id: z.string().optional(), title: z.string(), description: z.string().optional() })).optional(),
  listButtonText: z.string().optional(),
  footer: z.string().optional(),
})

router.post('/messages/send', requireAuthOrInternal, validate(sendSchema), async (req, res, next) => {
  try {
    const { channelId, contactId, conversationId, to, contentType, body, mediaUrl, filename, campaignId, interactiveType, buttons, listRows, listButtonText, footer } = req.body
    const secret = req.headers['x-internal-secret']
    const isInternal = secret && INTERNAL_SECRET && secret === INTERNAL_SECRET
    const tenantId = isInternal
      ? (req.body.tenantId || req.auth?.tid)
      : req.auth.tid
    if (!tenantId) { res.status(401).json({ error: 'Tenant not resolved' }); return }

    // ── Hard message limit check (só pra campanhas) ──
    if (campaignId) {
      const planSlug = await cachedGet(`tenant-plan:${tenantId}`, 120, async () => {
        const { data } = await db.from('tenants').select('plan_slug').eq('id', tenantId).single()
        return (data?.plan_slug || 'pending') as PlanSlug
      })
      const limits = PLAN_LIMITS[planSlug] ?? PLAN_LIMITS.pending
      if (limits.messages !== null) {
        const { data: tenant } = await db.from('tenants').select('messages_sent_this_period').eq('id', tenantId).single()
        if (tenant && (tenant.messages_sent_this_period ?? 0) >= limits.messages) {
          throw new AppError('PLAN_LIMIT', `Limite de ${limits.messages} mensagens de campanha atingido no seu plano`, 403)
        }
      }
    }

    // Salva body com opções pra exibir no CRM
    let savedBody = body
    if (contentType === 'interactive' && interactiveType === 'button' && buttons?.length) {
      savedBody = `${body || ''}\n\n${buttons.map((b: any) => `• ${b.title}`).join('\n')}`
    } else if (contentType === 'interactive' && interactiveType === 'list' && listRows?.length) {
      savedBody = `${body || ''}\n\n${listRows.map((r: any) => `• ${r.title}`).join('\n')}`
    }

    const messageUuid = await messageService.queueMessage({
      tenantId, channelId, contactId, conversationId,
      to, contentType: contentType === 'interactive' ? 'text' : contentType, body: savedBody, mediaUrl, campaignId,
    })

    await messageQueue.add('send', {
      messageUuid, tenantId, channelId, to, contentType, body, mediaUrl, filename, retryCount: 0,
      interactiveType, buttons, listRows, listButtonText, footer,
    })

    res.json(ok({ messageUuid, status: 'queued' }))
  } catch (err) { next(err) }
})

router.get('/messages/:conversationId', requireAuth, async (req, res, next) => {
  try {
    const { cursor, limit } = req.query
    const messages = await messageService.listMessages(
      req.params.conversationId,
      req.auth.tid,
      cursor as string | undefined,
      Number(limit) || 30,
    )
    res.json(ok(messages))
  } catch (err) { next(err) }
})

router.post('/messages/conversations/:conversationId/take-over', requireAuth, async (req, res, next) => {
  try {
    await messageService.takeOver(req.params.conversationId, req.auth.tid)
    res.json(ok({ message: 'Bot pausado' }))
  } catch (err) { next(err) }
})

router.post('/messages/conversations/:conversationId/release-bot', requireAuth, async (req, res, next) => {
  try {
    await messageService.releaseBot(req.params.conversationId, req.auth.tid)
    res.json(ok({ message: 'Bot reativado' }))
  } catch (err) { next(err) }
})

// ─── Webhook de entrada (público) — por tenant ────────────────────────────────
router.post('/webhook/lead/:token', rateLimit({ max: 120 }), async (req, res, next) => {
  try {
    const { data: tenant, error } = await db
      .from('tenants')
      .select('id')
      .eq('webhook_token', req.params.token)
      .single()

    if (error || !tenant) { res.status(401).json({ error: 'Token inválido' }); return }

    const tenantId = tenant.id
    const body = req.body
    const fieldMap: any[] = []

    const phone = resolveField(body, 'phone', fieldMap).replace(/\D/g, '')
    const name = resolveField(body, 'name', fieldMap) || phone
    const email = resolveField(body, 'email', fieldMap)
    const source = resolveField(body, 'source', fieldMap) || 'webhook'
    const message = resolveField(body, 'message', fieldMap)

    if (!phone) { res.status(400).json({ error: 'Campo de telefone é obrigatório' }); return }

    const { data: channel } = await db
      .from('channels').select('id, type').eq('tenant_id', tenantId).limit(1).single()

    if (!channel) { res.status(400).json({ error: 'Nenhum canal encontrado para este tenant' }); return }

    const normalizedPhone = normalizeBRPhone(phone)

    const { contactId } = await ensureContact({ tenantId, phone: normalizedPhone, name, email, origin: source })
    const { conversationId } = await ensureConversation({ tenantId, contactId, channelId: channel.id, channelType: channel.type, lastMessage: message || `Lead via ${source}` })

    const noteBody = [`📋 Lead recebido via ${source}`, name ? `👤 Nome: ${name}` : null, email ? `📧 Email: ${email}` : null, message ? `💬 Mensagem: ${message}` : null, `📱 Telefone: ${normalizedPhone}`].filter(Boolean).join('\n')
    await db.from('conversation_notes').insert({ conversation_id: conversationId, tenant_id: tenantId, body: noteBody })

    res.json(ok({ success: true, contact_id: contactId, conversation_id: conversationId, phone: normalizedPhone, name }))
  } catch (err) { next(err) }
})

// ─── Webhook de notificação (manda msg pro WhatsApp de um número) ─────────────
router.post('/webhook/notify/:token', rateLimit({ max: 60 }), validate(notifySchema), async (req, res, next) => {
  try {
    const { data: tenant, error } = await db.from('tenants').select('id').eq('webhook_token', req.params.token).single()
    if (error || !tenant) { res.status(401).json({ error: 'Token inválido' }); return }

    const { phone, message, channelId: bodyChannelId } = req.body

    const tenantId = tenant.id
    const normalizedPhone = normalizeBRPhone(phone.replace(/\D/g, ''))

    // Usa channelId do body se vier como UUID válido, senão busca canal ativo
    const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    let channel: any
    if (bodyChannelId && isUUID(bodyChannelId)) {
      const { data } = await db.from('channels').select('id, type').eq('id', bodyChannelId).eq('tenant_id', tenantId).single()
      channel = data
    }
    if (!channel) {
      const { data } = await db.from('channels').select('id, type').eq('tenant_id', tenantId).eq('status', 'active').limit(1).single()
      channel = data
    }
    if (!channel) { res.status(400).json({ error: 'Nenhum canal ativo encontrado' }); return }

    // Garante contato + conversa
    const { contactId } = await ensureContact({ tenantId, phone: normalizedPhone, name: req.body.name || normalizedPhone, origin: 'notification' })
    const { conversationId } = await ensureConversation({ tenantId, contactId, channelId: channel.id, channelType: channel.type, lastMessage: message })

    // Envia mensagem
    const messageUuid = await messageService.queueMessage({
      tenantId, channelId: channel.id, contactId, conversationId,
      to: normalizedPhone, contentType: 'text', body: message,
    })
    await messageQueue.add('send', { messageUuid, tenantId, channelId: channel.id, to: normalizedPhone, contentType: 'text', body: message, retryCount: 0 })

    res.json(ok({ success: true, phone: normalizedPhone, message: 'Notificação enviada' }))
  } catch (err) { next(err) }
})

// ─── Webhook de entrada para flows (com mapeamento de campos) ─────────────────
// Gzip/deflate já é descomprimido pelo middleware global em index.ts
router.post('/webhook/flow/:flowId/:token', rateLimit({ max: 120 }), async (req, res, next) => {
  try {
    // Busca o flow e seu mapeamento de campos configurado
    const { data: flow, error } = await db
      .from('flows')
      .select('id, tenant_id, is_active, webhook_token, webhook_field_map')
      .eq('id', req.params.flowId)
      .eq('webhook_token', req.params.token)
      .single()

    if (error || !flow) { res.status(401).json({ error: 'Token inválido ou flow não encontrado' }); return }
    if (!flow.is_active) { res.status(400).json({ error: 'Flow está pausado' }); return }

    const tenantId = flow.tenant_id
    const body = req.body

    // Usa o mapeamento configurado pelo usuário no editor de flows
    // fieldMap: [{ externalField: 'telefone', contactField: 'phone' }, ...]
    const fieldMap: any[] = flow.webhook_field_map || []

    const phone = resolveField(body, 'phone', fieldMap).replace(/\D/g, '')
    const name = resolveField(body, 'name', fieldMap) || phone
    const email = resolveField(body, 'email', fieldMap)
    const source = resolveField(body, 'source', fieldMap) || 'webhook'
    const messageBody = resolveField(body, 'message', fieldMap) || `Lead via ${source}`

    const { data: channel } = await db
      .from('channels').select('id, type').eq('tenant_id', tenantId).limit(1).single()

    if (!channel) { res.status(400).json({ error: 'Nenhum canal encontrado para este tenant' }); return }

    // Normaliza telefone — se não veio telefone, usa um placeholder temporário
    const normalizedPhone = phone ? normalizeBRPhone(phone) : ''
    const tempPhone = normalizedPhone || `webhook_temp_${Date.now()}`

    const { contactId } = await ensureContact({ tenantId, phone: tempPhone, name, email, origin: source })
    const { conversationId, isNew: isNewConv } = await ensureConversation({ tenantId, contactId, channelId: channel.id, channelType: channel.type, lastMessage: messageBody })

    // Dispara o flow com todos os dados brutos como variáveis
    const { flowEngine } = await import('../services/flow.engine')
    await flowEngine.processWebhookFlow(flow.id, {
      tenantId,
      channelId: channel.id,
      contactId,
      conversationId,
      phone: tempPhone,
      messageBody,
      isFirstMessage: isNewConv,
      webhookData: body,
    })

    res.json({ success: true, contact_id: contactId, conversation_id: conversationId, phone: tempPhone, name })
  } catch (err) { next(err) }
})

export default router