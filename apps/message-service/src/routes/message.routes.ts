import { Router } from 'express'
import { z } from 'zod'
import { messageService } from '../services/message.service'
import { messageQueue } from '../workers/message.worker'
import { requireAuth, validate, requireInternal } from '../middleware/message.middleware'
import { ok, generateId } from '@autozap/utils'
import { db } from '../lib/db'

const router = Router()

const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'autozap_internal'

function requireAuthOrInternal(req: any, res: any, next: any): void {
  const secret = req.headers['x-internal-secret']
  if (secret === INTERNAL_SECRET) { next(); return }
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

router.post('/internal/inbound', requireInternal, async (req, res, next) => {
  try {
    const { tenantId, channelId, message } = req.body
    await messageService.processInbound(tenantId, channelId, {
      ...message,
      timestamp: parseTimestamp(message.timestamp),
    })
    res.json(ok({ message: 'Inbound message processed' }))
  } catch (err) { next(err) }
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
  contentType: z.enum(['text', 'image', 'audio', 'video', 'document', 'template']),
  body: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  campaignId: z.string().uuid().optional(),
})

router.post('/messages/send', requireAuthOrInternal, validate(sendSchema), async (req, res, next) => {
  try {
    const { channelId, contactId, conversationId, to, contentType, body, mediaUrl, campaignId } = req.body
    const secret = req.headers['x-internal-secret']
    const tenantId = secret === INTERNAL_SECRET
      ? (req.body.tenantId || req.auth?.tid)
      : req.auth.tid

    const messageUuid = await messageService.queueMessage({
      tenantId, channelId, contactId, conversationId,
      to, contentType, body, mediaUrl, campaignId,
    })

    await messageQueue.add('send', {
      messageUuid, tenantId, channelId, to, contentType, body, mediaUrl, retryCount: 0,
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
router.post('/webhook/lead/:token', async (req, res, next) => {
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

    let normalizedPhone = phone.replace(/^\+/, '')
    if (normalizedPhone.startsWith('55') && normalizedPhone.length === 12) {
      normalizedPhone = normalizedPhone.slice(0, 4) + '9' + normalizedPhone.slice(4)
    }

    const { data: existingContact } = await db
      .from('contacts').select('id').eq('tenant_id', tenantId).eq('phone', normalizedPhone).maybeSingle()

    let contactId: string
    if (existingContact) {
      contactId = existingContact.id
      await db.from('contacts').update({ name, email: email || undefined, origin: source, last_interaction_at: new Date() }).eq('id', contactId)
    } else {
      const { data: newContact, error: contactError } = await db
        .from('contacts')
        .insert({ id: generateId(), tenant_id: tenantId, phone: normalizedPhone, name, email: email || null, origin: source, status: 'active', last_interaction_at: new Date() })
        .select('id').single()
      if (contactError || !newContact) { res.status(500).json({ error: 'Erro ao criar contato' }); return }
      contactId = newContact.id
    }

    const { data: existingConv } = await db
      .from('conversations').select('id').eq('tenant_id', tenantId).eq('contact_id', contactId)
      .eq('channel_id', channel.id).in('status', ['open', 'waiting'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    let conversationId: string
    if (existingConv) {
      conversationId = existingConv.id
    } else {
      const { data: newConv, error: convError } = await db
        .from('conversations')
        .insert({ id: generateId(), tenant_id: tenantId, contact_id: contactId, channel_id: channel.id, channel_type: channel.type, status: 'waiting', pipeline_stage: 'lead', bot_active: true, unread_count: 1, last_message: message || `Lead via ${source}`, last_message_at: new Date() })
        .select('id').single()
      if (convError || !newConv) { res.status(500).json({ error: 'Erro ao criar conversa' }); return }
      conversationId = newConv.id
    }

    const noteBody = [`📋 Lead recebido via ${source}`, name ? `👤 Nome: ${name}` : null, email ? `📧 Email: ${email}` : null, message ? `💬 Mensagem: ${message}` : null, `📱 Telefone: ${normalizedPhone}`].filter(Boolean).join('\n')
    await db.from('conversation_notes').insert({ conversation_id: conversationId, tenant_id: tenantId, body: noteBody })

    res.json(ok({ success: true, contact_id: contactId, conversation_id: conversationId, phone: normalizedPhone, name }))
  } catch (err) { next(err) }
})

// ─── Webhook de entrada para flows (com mapeamento de campos) ─────────────────
router.post('/webhook/flow/:flowId/:token', async (req, res, next) => {
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

    if (!phone) { res.status(400).json({ error: 'Campo de telefone é obrigatório. Configure o mapeamento no nó Webhook de entrada.' }); return }

    const { data: channel } = await db
      .from('channels').select('id, type').eq('tenant_id', tenantId).limit(1).single()

    if (!channel) { res.status(400).json({ error: 'Nenhum canal encontrado para este tenant' }); return }

    let normalizedPhone = phone.replace(/^\+/, '')
    if (normalizedPhone.startsWith('55') && normalizedPhone.length === 12) {
      normalizedPhone = normalizedPhone.slice(0, 4) + '9' + normalizedPhone.slice(4)
    }

    const { data: existingContact } = await db
      .from('contacts').select('id').eq('tenant_id', tenantId).eq('phone', normalizedPhone).maybeSingle()

    let contactId: string
    if (existingContact) {
      contactId = existingContact.id
      await db.from('contacts').update({ name: name || undefined, email: email || undefined, last_interaction_at: new Date() }).eq('id', contactId)
    } else {
      const { data: newContact, error: contactError } = await db
        .from('contacts')
        .insert({ id: generateId(), tenant_id: tenantId, phone: normalizedPhone, name: name || normalizedPhone, email: email || null, origin: source, status: 'active', last_interaction_at: new Date() })
        .select('id').single()
      if (contactError || !newContact) { res.status(500).json({ error: 'Erro ao criar contato' }); return }
      contactId = newContact.id
    }

    const { data: existingConv } = await db
      .from('conversations').select('id').eq('tenant_id', tenantId).eq('contact_id', contactId)
      .eq('channel_id', channel.id).in('status', ['open', 'waiting'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    let conversationId: string
    if (existingConv) {
      conversationId = existingConv.id
    } else {
      const { data: newConv, error: convError } = await db
        .from('conversations')
        .insert({ id: generateId(), tenant_id: tenantId, contact_id: contactId, channel_id: channel.id, channel_type: channel.type, status: 'waiting', pipeline_stage: 'lead', bot_active: true, unread_count: 1, last_message: messageBody, last_message_at: new Date() })
        .select('id').single()
      if (convError || !newConv) { res.status(500).json({ error: 'Erro ao criar conversa' }); return }
      conversationId = newConv.id
    }

    // Dispara o flow com todos os dados brutos como variáveis
    const { flowEngine } = await import('../services/flow.engine')
    await flowEngine.processWebhookFlow(flow.id, {
      tenantId,
      channelId: channel.id,
      contactId,
      conversationId,
      phone: normalizedPhone,
      messageBody,
      isFirstMessage: !existingConv,
      webhookData: body,
    })

    res.json({ success: true, contact_id: contactId, conversation_id: conversationId, phone: normalizedPhone, name })
  } catch (err) { next(err) }
})

export default router