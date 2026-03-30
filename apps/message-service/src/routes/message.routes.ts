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
  if (secret === INTERNAL_SECRET) {
    next()
    return
  }
  requireAuth(req, res, next)
}

function parseTimestamp(ts: any): Date {
  if (!ts) return new Date()
  if (ts instanceof Date) return ts
  if (typeof ts === 'number') {
    return new Date(ts > 1e12 ? ts : ts * 1000)
  }
  const d = new Date(ts)
  if (isNaN(d.getTime())) return new Date()
  return d
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

// ─── Webhook de entrada (público) ─────────────────────────────────────────────
// Recebe leads de formulários externos (Meta Ads, Zapier, Make, n8n, etc)
// URL: POST /webhook/lead/:token
// O token é gerado por tenant e fica na página de Settings
router.post('/webhook/lead/:token', async (req, res, next) => {
  try {
    // Busca o tenant pelo token
    const { data: tenant, error } = await db
      .from('tenants')
      .select('id')
      .eq('webhook_token', req.params.token)
      .single()

    if (error || !tenant) {
      res.status(401).json({ error: 'Token inválido' })
      return
    }

    const tenantId = tenant.id
    const body = req.body

    // Normaliza os campos — aceita diferentes formatos de formulário
    // Meta Ads usa: full_name, phone_number, email
    // Zapier/Make podem usar: name, phone, email ou campos customizados
    const phone = (
      body.phone_number || body.phone || body.telefone ||
      body.celular || body.whatsapp || ''
    ).toString().replace(/\D/g, '')

    const name = (
      body.full_name || body.name || body.nome ||
      body.first_name || body.contact_name || phone
    ).toString().trim()

    const email = (body.email || '').toString().trim()
    const source = (body.source || body.origem || body.campaign_name || 'webhook').toString()
    const message = (body.message || body.mensagem || body.observacao || '').toString()

    if (!phone) {
      res.status(400).json({ error: 'Campo phone/phone_number é obrigatório' })
      return
    }

    // Busca o primeiro canal ativo do tenant para criar a conversa
    const { data: channel } = await db
      .from('channels')
      .select('id, type')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .limit(1)
      .single()

    if (!channel) {
      res.status(400).json({ error: 'Nenhum canal ativo encontrado para este tenant' })
      return
    }

    // Cria ou atualiza o contato
    let normalizedPhone = phone.replace(/^\+/, '')
    if (normalizedPhone.startsWith('55') && normalizedPhone.length === 12) {
      normalizedPhone = normalizedPhone.slice(0, 4) + '9' + normalizedPhone.slice(4)
    }

    const { data: existingContact } = await db
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone', normalizedPhone)
      .maybeSingle()

    let contactId: string

    if (existingContact) {
      contactId = existingContact.id
      // Atualiza nome se não tinha
      await db
        .from('contacts')
        .update({ name, email: email || undefined, origin: source, last_interaction_at: new Date() })
        .eq('id', contactId)
    } else {
      const { data: newContact, error: contactError } = await db
        .from('contacts')
        .insert({
          id: generateId(),
          tenant_id: tenantId,
          phone: normalizedPhone,
          name,
          email: email || null,
          origin: source,
          status: 'active',
          last_interaction_at: new Date(),
        })
        .select('id')
        .single()

      if (contactError || !newContact) {
        res.status(500).json({ error: 'Erro ao criar contato' })
        return
      }
      contactId = newContact.id
    }

    // Verifica se já tem conversa aberta para esse contato
    const { data: existingConv } = await db
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .eq('channel_id', channel.id)
      .in('status', ['open', 'waiting'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let conversationId: string

    if (existingConv) {
      conversationId = existingConv.id
    } else {
      const { data: newConv, error: convError } = await db
        .from('conversations')
        .insert({
          id: generateId(),
          tenant_id: tenantId,
          contact_id: contactId,
          channel_id: channel.id,
          channel_type: channel.type,
          status: 'waiting',
          pipeline_stage: 'lead',
          bot_active: true,
          unread_count: 1,
          last_message: message || `Lead via ${source}`,
          last_message_at: new Date(),
        })
        .select('id')
        .single()

      if (convError || !newConv) {
        res.status(500).json({ error: 'Erro ao criar conversa' })
        return
      }
      conversationId = newConv.id
    }

    // Salva uma nota interna com os dados do formulário
    const noteBody = [
      `📋 Lead recebido via ${source}`,
      name ? `👤 Nome: ${name}` : null,
      email ? `📧 Email: ${email}` : null,
      message ? `💬 Mensagem: ${message}` : null,
      `📱 Telefone: ${normalizedPhone}`,
    ].filter(Boolean).join('\n')

    await db.from('conversation_notes').insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      body: noteBody,
    })

    res.json(ok({
      success: true,
      contact_id: contactId,
      conversation_id: conversationId,
      phone: normalizedPhone,
      name,
    }))
  } catch (err) { next(err) }
})

export default router