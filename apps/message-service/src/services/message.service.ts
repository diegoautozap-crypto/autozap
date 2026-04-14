import { v4 as uuidv4 } from 'uuid'
import { db, logger, AppError, generateId, decryptCredentials } from '@autozap/utils'
import { PLAN_LIMITS, type PlanSlug } from '@autozap/types'
import type { NormalizedMessage, MessageStatusUpdate } from './types'
import { automationService } from './automation.service'
import { flowEngine } from './flow.engine'

// In-memory cache for tenant data
const tenantCache = new Map<string, { data: any; expires: number }>()
function getCachedTenant(tenantId: string, ttlMs: number, fetcher: () => Promise<any>): Promise<any> {
  const entry = tenantCache.get(tenantId)
  if (entry && entry.expires > Date.now()) return Promise.resolve(entry.data)
  return fetcher().then(data => { tenantCache.set(tenantId, { data, expires: Date.now() + ttlMs }); return data })
}

const PUSHER_APP_ID  = process.env.PUSHER_APP_ID
const PUSHER_KEY     = process.env.PUSHER_KEY
const PUSHER_SECRET  = process.env.PUSHER_SECRET
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER || 'sa1'

export interface QueueMessageInput {
  tenantId: string; channelId: string; contactId: string; conversationId: string
  to: string; contentType: string; body?: string; mediaUrl?: string; campaignId?: string
}

function looksLikePhone(name: string): boolean {
  return /^[\d\s+\-()]+$/.test(name.trim())
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

// ─── Webhook dispatcher ───────────────────────────────────────────────────────
async function dispatchWebhook(tenantId: string, event: string, payload: object): Promise<void> {
  try {
    const { data: configs } = await db
      .from('webhook_configs')
      .select('url, events, secret')
      .eq('tenant_id', tenantId)
      .eq('active', true)

    if (!configs || configs.length === 0) return

    for (const config of configs) {
      const events: string[] = config.events || []
      if (!events.includes(event) && !events.includes('*')) continue

      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        tenant_id: tenantId,
        data: payload,
      })

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }

      // Assinar o payload com HMAC-SHA256 se o cliente configurou um secret
      if (config.secret) {
        const crypto = await import('crypto')
        const sig = crypto.createHmac('sha256', config.secret).update(body).digest('hex')
        headers['X-AutoZap-Signature'] = `sha256=${sig}`
      }

      fetch(config.url, { method: 'POST', headers, body })
        .then(async (res) => {
          if (!res.ok) logger.warn('Webhook delivery failed', { url: config.url, status: res.status, event })
          else logger.info('Webhook delivered', { url: config.url, event })
        })
        .catch(err => logger.error('Webhook dispatch error', { url: config.url, event, err }))
    }
  } catch (err) {
    logger.error('dispatchWebhook error', { tenantId, event, err })
  }
}

async function saveMessageError(params: {
  tenantId: string; channelId?: string; phone?: string; errorCode?: string
  errorMessage?: string; messageId?: string; rawPayload?: object
}): Promise<void> {
  try {
    await db.from('message_errors').insert({
      tenant_id: params.tenantId, channel_id: params.channelId || null,
      phone: params.phone || null, error_code: params.errorCode || null,
      error_message: params.errorMessage || null, message_id: params.messageId || null,
      raw_payload: params.rawPayload || null,
    })
  } catch (err) { logger.error('Failed to save message error', { err }) }
}

export class MessageService {

  private async transcribeAudio(messageId: string, tenantId: string, channelId: string, mediaId: string): Promise<string | null> {
    try {
      // Get OpenAI key
      const { data: tenant } = await db.from('tenants').select('metadata').eq('id', tenantId).single()
      const whisperKey = tenant?.metadata?.openai_api_key || process.env.OPENAI_API_KEY
      if (!whisperKey) return null

      // Get channel credentials
      const { data: channel } = await db.from('channels').select('credentials, type').eq('id', channelId).single()
      const rawCreds = channel?.credentials || {}
      const creds = typeof rawCreds === 'string' ? JSON.parse(rawCreds) : rawCreds
      let metaToken: string | undefined
      let apiKey: string | undefined
      try {
        metaToken = creds.metaToken?.startsWith('EAA') ? creds.metaToken : decryptCredentials(creds).metaToken
        apiKey = creds.apiKey?.length < 100 ? creds.apiKey : decryptCredentials(creds).apiKey
      } catch { metaToken = creds.metaToken; apiKey = creds.apiKey }

      let audioBuffer: Buffer | null = null

      // 1. Meta Graph API (media ID is numeric)
      if (metaToken && /^\d+$/.test(mediaId)) {
        const metaRes = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, { headers: { Authorization: `Bearer ${metaToken}` } })
        if (metaRes.ok) {
          const metaData = await metaRes.json() as any
          if (metaData.url) {
            const audioRes = await fetch(metaData.url, { headers: { Authorization: `Bearer ${metaToken}` } })
            if (audioRes.ok) audioBuffer = Buffer.from(await audioRes.arrayBuffer())
          }
        }
      }

      // 2. Fallback: Gupshup API
      if (!audioBuffer && apiKey) {
        const gupshupRes = await fetch(`https://api.gupshup.io/wa/api/v1/media/${mediaId}`, { headers: { apikey: apiKey } })
        if (gupshupRes.ok) {
          const ct = gupshupRes.headers.get('content-type') || ''
          if (ct.includes('audio') || ct.includes('ogg') || ct.includes('octet')) {
            audioBuffer = Buffer.from(await gupshupRes.arrayBuffer())
          }
        }
      }

      // 3. Direct URL fallback
      if (!audioBuffer && mediaId.startsWith('http')) {
        const res = await fetch(mediaId, { signal: AbortSignal.timeout(15000) })
        if (res.ok) audioBuffer = Buffer.from(await res.arrayBuffer())
      }

      if (!audioBuffer || audioBuffer.length === 0) return null

      // Transcribe
      const { default: OpenAI, toFile } = await import('openai')
      const openai = new OpenAI({ apiKey: whisperKey })
      const file = await toFile(audioBuffer, 'audio.ogg', { type: 'audio/ogg' })
      const transcription = await openai.audio.transcriptions.create({ file, model: 'whisper-1', language: 'pt' })
      logger.info('Audio transcribed', { messageId, text: transcription.text?.slice(0, 50) })
      return transcription.text || null
    } catch (err) {
      logger.error('Audio transcription failed', { messageId, err: err instanceof Error ? err.message : String(err) })
      return null
    }
  }

  async queueMessage(input: QueueMessageInput): Promise<string> {
    const messageUuid = uuidv4()
    const { error } = await db.from('messages').insert({
      id: generateId(), message_uuid: messageUuid,
      tenant_id: input.tenantId, conversation_id: input.conversationId,
      channel_id: input.channelId, contact_id: input.contactId,
      direction: 'outbound', content_type: input.contentType,
      body: input.body, media_url: input.mediaUrl,
      status: 'queued', campaign_id: input.campaignId, retry_count: 0,
    }).select('id').single()
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    const lastMsg = input.body || `[${input.contentType}]`
    await db.from('conversations').update({
      last_message: lastMsg,
      last_message_at: new Date(),
      status: 'open',
    }).eq('id', input.conversationId)
    emitPusher(input.tenantId, 'conversation.updated', { conversationId: input.conversationId, lastMessage: lastMsg, lastMessageAt: new Date() })
    return messageUuid
  }

  async processInbound(tenantId: string, channelId: string, msg: NormalizedMessage): Promise<void> {
    const contact = await this.findOrCreateContact(tenantId, msg.from)
    const senderName = msg.senderName || (msg.raw as any)?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name
    if (senderName && (!contact.name || looksLikePhone(contact.name))) {
      await db.from('contacts').update({ name: senderName }).eq('id', contact.id).eq('tenant_id', tenantId)
    }
    const conversation = await this.findOrCreateConversation(tenantId, channelId, contact.id, msg.channelType)

    // fromMe = mensagem enviada pelo celular (coexistência) — salva como outbound
    const direction = msg.fromMe ? 'outbound' : 'inbound'

    // Skip if already exists (avoid duplicating messages sent from CRM)
    if (msg.fromMe && msg.externalId) {
      const { data: existing } = await db.from('messages').select('id').eq('external_id', msg.externalId).eq('tenant_id', tenantId).maybeSingle()
      if (existing) return
    }

    const messageId = generateId()
    let messageBody = msg.body
    await db.from('messages').insert({
      id: messageId, message_uuid: uuidv4(), tenant_id: tenantId,
      conversation_id: conversation.id, channel_id: channelId, contact_id: contact.id,
      direction, content_type: msg.contentType, body: messageBody,
      media_url: msg.mediaUrl, media_mime_type: msg.mediaMimeType,
      external_id: msg.externalId, status: direction === 'outbound' ? 'sent' : 'delivered',
      sent_at: msg.timestamp, delivered_at: msg.timestamp,
    })

    // Auto-transcribe audio
    if (msg.contentType === 'audio' && msg.mediaUrl) {
      this.transcribeAudio(messageId, tenantId, channelId, msg.mediaUrl).then(text => {
        if (text) {
          messageBody = `🎙️ ${text}`
          db.from('messages').update({ body: messageBody }).eq('id', messageId).then(() => {})
          db.from('conversations').update({ last_message: messageBody }).eq('id', conversation.id).then(() => {})
          emitPusher(tenantId, 'conversation.updated', { conversationId: conversation.id })
        }
      }).catch(() => {})
    }

    await db.from('conversations').update({
      last_message: messageBody || `[${msg.contentType}]`,
      last_message_at: msg.timestamp,
      ...(!msg.fromMe ? { status: 'waiting' } : {}),
    }).eq('id', conversation.id)
    if (!msg.fromMe) {
      try { await db.rpc('increment_unread', { p_conversation_id: conversation.id }) } catch {
        await db.from('conversations').update({ unread_count: (conversation.unread_count || 0) + 1 }).eq('id', conversation.id)
      }
    }
    await db.from('contacts').update({ last_interaction_at: msg.timestamp }).eq('id', contact.id).eq('tenant_id', tenantId)

    // fromMe (enviado pelo celular) — atualiza conversa mas não dispara flows/webhooks
    // O cooldown do flow controla quando o bot pode disparar novamente
    if (msg.fromMe) {
      const body = (msg.body || '').trim().toLowerCase()

      // Comando #bot → reativa o bot na conversa (caso tenha sido pausado manualmente pelo CRM)
      if (body === '#bot') {
        await db.from('conversations').update({ bot_active: true, updated_at: new Date() }).eq('id', conversation.id).eq('tenant_id', tenantId)
        await db.from('messages').delete().eq('id', messageId)
        emitPusher(tenantId, 'conversation.updated', { conversationId: conversation.id, botActive: true })
        logger.info('Bot reativado via comando #bot', { conversationId: conversation.id, tenantId })
        return
      }

      // Comando #pausar → pausa o bot manualmente (pra atendimento humano prolongado)
      if (body === '#pausar' || body === '#pause') {
        await db.from('conversations').update({ bot_active: false, updated_at: new Date() }).eq('id', conversation.id).eq('tenant_id', tenantId)
        await db.from('messages').delete().eq('id', messageId)
        emitPusher(tenantId, 'conversation.updated', { conversationId: conversation.id, botActive: false })
        logger.info('Bot pausado via comando #pausar', { conversationId: conversation.id, tenantId })
        return
      }

      // Mensagem normal do celular → NÃO pausa o bot automaticamente
      // O cooldown do flow já controla quando pode disparar novamente
      emitPusher(tenantId, 'conversation.updated', { conversationId: conversation.id })
      return
    }

    emitPusher(tenantId, 'inbound.message', {
      conversationId: conversation.id,
      contactId: contact.id,
      phone: msg.from,
      contactName: senderName || contact.name || msg.from,
      body: msg.body,
      contentType: msg.contentType,
      timestamp: msg.timestamp,
    })

    // ─── Webhook: nova mensagem recebida ──────────────────────────────────────
    dispatchWebhook(tenantId, 'message.received', {
      conversation_id: conversation.id,
      contact_id: contact.id,
      contact_name: senderName || contact.name || msg.from,
      phone: msg.from,
      body: msg.body,
      content_type: msg.contentType,
      media_url: msg.mediaUrl || null,
      timestamp: msg.timestamp,
    })

    const { data: convData } = await db
      .from('conversations')
      .select('bot_active')
      .eq('id', conversation.id)
      .single()

    if (convData?.bot_active === false) {
      logger.info('Bot pausado — pulando flows e automações', { conversationId: conversation.id, tenantId })
      return
    }

    const { count: msgCount } = await db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('contact_id', contact.id)
      .eq('direction', 'inbound')

    const isFirstMessage = (msgCount || 0) <= 1

    const automationCtx = {
      tenantId, channelId,
      contactId: contact.id,
      conversationId: conversation.id,
      phone: msg.from,
      messageBody: msg.body || '',
      isFirstMessage,
      hour: new Date().getHours(),
    }

    automationService.processAutomations(automationCtx)
      .catch(err => logger.error('Automation error', { err }))

    let flowMatched = false
    try {
      flowMatched = await flowEngine.processFlows(automationCtx)
    } catch (err) {
      logger.error('Flow engine error', { err })
    }

    if (!flowMatched) {
      this.tryAIChatbot(tenantId, channelId, conversation.id, contact.id, msg.from, msg.body || '')
        .catch(err => logger.error('AI chatbot error', { err }))
    }

    // ─── Schedule auto-reply check (5 min delay) ─────────────────────────────
    try {
      const { autoReplyQueue } = await import('../workers/message.worker')
      await autoReplyQueue.add(
        'auto-reply-check',
        { tenantId, conversationId: conversation.id, channelId, contactId: contact.id, phone: msg.from },
        { delay: 5 * 60 * 1000, jobId: `auto-reply-${conversation.id}-${Date.now()}` },
      )
    } catch (err) {
      logger.error('Failed to schedule auto-reply', { err })
    }

    // ─── Schedule agent email notification (10 min delay) ────────────────────
    try {
      const { agentNotifyQueue } = await import('../workers/message.worker')
      await agentNotifyQueue.add(
        'agent-notify-check',
        { tenantId, conversationId: conversation.id },
        { delay: 10 * 60 * 1000, jobId: `agent-notify-${conversation.id}-${Date.now()}` },
      )
    } catch (err) {
      logger.error('Failed to schedule agent notification', { err })
    }

    logger.info('Inbound message processed', { tenantId, contactId: contact.id, conversationId: conversation.id })
  }

  async takeOver(conversationId: string, tenantId: string): Promise<void> {
    const { error } = await db
      .from('conversations')
      .update({ bot_active: false })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    emitPusher(tenantId, 'conversation.updated', { conversationId, botActive: false })

    // ─── Webhook: humano assumiu conversa ─────────────────────────────────────
    dispatchWebhook(tenantId, 'conversation.assigned', { conversation_id: conversationId })

    logger.info('Bot pausado — humano assumiu', { conversationId, tenantId })
  }

  async releaseBot(conversationId: string, tenantId: string): Promise<void> {
    const { error } = await db
      .from('conversations')
      .update({ bot_active: true })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    emitPusher(tenantId, 'conversation.updated', { conversationId, botActive: true })
    logger.info('Bot reativado', { conversationId, tenantId })
  }

  async updateStatus(tenantId: string, channelId: string, update: MessageStatusUpdate): Promise<void> {
    const { externalId, status, timestamp, errorMessage, errorCode, phone } = update as any
    logger.info('Webhook status received', { externalId, status, tenantId })
    if (status === 'failed' && errorCode) {
      await saveMessageError({ tenantId, channelId, phone, errorCode: String(errorCode), errorMessage: errorMessage || 'Unknown error', messageId: externalId, rawPayload: update as any })
    }
    const { data: rows, error: rpcError } = await db.rpc('update_message_status', {
      p_external_id: externalId, p_tenant_id: tenantId, p_status: status,
      p_delivered_at: status === 'delivered' ? timestamp : null,
      p_read_at: status === 'read' ? timestamp : null,
      p_failed_at: status === 'failed' ? timestamp : null,
      p_error_msg: errorMessage ?? null,
    })
    if (rpcError) {
      logger.error('update_message_status RPC failed', { externalId, error: rpcError.message })
      await this.savePending(externalId, tenantId, status, timestamp, errorMessage)
      return
    }
    const row = Array.isArray(rows) ? rows[0] : rows
    if (!row?.updated) {
      const { data: exists } = await db.from('messages').select('id, status').eq('external_id', externalId).eq('tenant_id', tenantId).maybeSingle()
      if (!exists) await this.savePending(externalId, tenantId, status, timestamp, errorMessage)
      return
    }
    logger.info('Message status updated', { externalId, newStatus: status, campaignId: row.campaign_id })
    if (row.campaign_id && (status === 'delivered' || status === 'read' || status === 'failed')) {
      const field = status === 'delivered' ? 'delivered_count' : status === 'read' ? 'read_count' : 'failed_count'
      try {
        const { data: incremented } = await db.rpc('increment_campaign_counter_safe', {
          p_external_id: externalId, p_campaign_id: row.campaign_id, p_field: field, p_status: status,
        })
        if (incremented) logger.info('Campaign counter incremented', { campaignId: row.campaign_id, field })
      } catch (err) { logger.warn('increment_campaign_counter_safe failed', { err }) }
    }
    if (row.conversation_id) {
      emitPusher(tenantId, 'message.status', { externalId, status, conversationId: row.conversation_id })
    }
  }

  // ─── Webhook disparado quando conversa muda de status (aberta/fechada) ──────
  async notifyConversationStatusChanged(tenantId: string, conversationId: string, status: string, contactPhone?: string): Promise<void> {
    dispatchWebhook(tenantId, 'conversation.status_changed', {
      conversation_id: conversationId,
      status,
      phone: contactPhone || null,
    })
  }

  // ─── Webhook disparado quando card é movido no pipeline ──────────────────────
  async notifyPipelineMoved(tenantId: string, conversationId: string, stage: string, contactPhone?: string): Promise<void> {
    dispatchWebhook(tenantId, 'pipeline.stage_changed', {
      conversation_id: conversationId,
      stage,
      phone: contactPhone || null,
    })
  }

  // ─── AI Chatbot fallback ──────────────────────────────────────────────────────
  async tryAIChatbot(tenantId: string, channelId: string, conversationId: string, contactId: string, phone: string, userMessage: string): Promise<void> {
    if (!userMessage.trim()) return

    // 1. Check if AI chatbot is enabled for this channel
    const { data: channel } = await db.from('channels').select('settings').eq('id', channelId).single()
    if (!channel?.settings?.aiChatbotEnabled) return

    // 2. Check AI plan limits
    const { data: tenant } = await getCachedTenant(`tenant:${tenantId}`, 120_000, async () => {
      const r = await db.from('tenants').select('plan_slug, settings, metadata').eq('id', tenantId).single()
      return r
    })
    const planSlug = (tenant?.plan_slug || 'pending') as PlanSlug
    const limits = PLAN_LIMITS[planSlug]
    if (limits.aiResponses === 0) return

    // Check monthly count
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const { count: aiCount } = await db.from('flow_logs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'ai_response')
      .gte('created_at', monthStart.toISOString())
    if (limits.aiResponses !== null && (aiCount ?? 0) >= limits.aiResponses) {
      // Avisa o contato e encaminha pra atendente
      try {
        const { data: ctc } = await db.from('contacts').select('phone').eq('id', contactId).single()
        if (ctc?.phone) {
          await this.queueMessage({
            tenantId, channelId, conversationId, contactId,
            to: ctc.phone, contentType: 'text',
            body: 'No momento nosso assistente automático está indisponível. Um atendente vai te atender em breve! 😊',
          })
        }
        await db.from('conversations').update({ status: 'open', bot_active: false, updated_at: new Date() }).eq('id', conversationId)
      } catch {}
      return
    }

    // 3. Get conversation history (last 20 messages)
    const { data: history } = await db.from('messages')
      .select('direction, body, content_type')
      .eq('conversation_id', conversationId)
      .eq('tenant_id', tenantId)
      .in('content_type', ['text'])
      .not('body', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20)

    // 4. Get contact info
    const { data: contact } = await db.from('contacts')
      .select('name, phone, email, company, metadata')
      .eq('id', contactId)
      .single()

    // 5. Get products catalog
    let productContext = ''
    if (tenant?.settings?.aiIncludeProducts !== false) {
      const { data: products } = await db.from('products')
        .select('name, description, price, category')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .limit(50)
      if (products && products.length > 0) {
        productContext = '\n\nCatálogo de produtos:\n' + products.map((p: any) =>
          `- ${p.name}: R$ ${Number(p.price).toFixed(2)}${p.description ? ' — ' + p.description : ''}${p.category ? ' (' + p.category + ')' : ''}`
        ).join('\n')
      }
    }

    // 6. Build system prompt
    const customPrompt = tenant?.settings?.aiSystemPrompt || ''
    const contactName = contact?.name || 'Cliente'

    const systemPrompt = `${customPrompt || 'Você é um assistente virtual prestativo de atendimento ao cliente. Responda de forma natural, educada e objetiva em português brasileiro.'}

Informações do contato:
- Nome: ${contactName}
${contact?.email ? '- Email: ' + contact.email : ''}
${contact?.company ? '- Empresa: ' + contact.company : ''}
${productContext}

Regras:
- Responda sempre em português brasileiro
- Seja objetivo e útil
- Se não souber algo, diga que vai verificar com a equipe
- Nunca invente informações sobre produtos ou preços que não estejam no catálogo
- Formate valores em R$ (reais)
- NUNCA inclua tags como [INTENT:...], [AÇÃO:...], [STATUS:...] ou qualquer marcação interna na resposta
- A resposta deve ser texto natural, como se fosse um humano respondendo`

    // 7. Build messages array
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ]

    // Add history (reverse to chronological order)
    if (history) {
      for (const m of [...history].reverse()) {
        messages.push({
          role: m.direction === 'inbound' ? 'user' : 'assistant',
          content: m.body,
        })
      }
    }

    // 8. Call OpenAI
    const openaiKey = tenant?.metadata?.openai_api_key || process.env.OPENAI_API_KEY
    if (!openaiKey) return

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: tenant?.settings?.aiModel || 'gpt-4o-mini',
          messages,
          temperature: 0.7,
          max_tokens: 1000,
        }),
      })

      const result = (await response.json()) as any
      let aiReply = result.choices?.[0]?.message?.content?.trim()
      if (!aiReply) return
      // Limpa tags internas que a IA pode gerar
      aiReply = aiReply.replace(/\[INTENT:[^\]]*\]/gi, '').replace(/\[AÇÃO:[^\]]*\]/gi, '').replace(/\[STATUS:[^\]]*\]/gi, '').replace(/\[ACTION:[^\]]*\]/gi, '').trim()

      // 9. Send the AI response via internal endpoint (same as flow engine)
      const MESSAGE_SERVICE_URL = process.env.MESSAGE_SERVICE_URL || 'http://localhost:3004'
      const INTERNAL_SECRET = process.env.INTERNAL_SECRET!
      const sendRes = await fetch(`${MESSAGE_SERVICE_URL}/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
        body: JSON.stringify({ tenantId, channelId, contactId, conversationId, to: phone, contentType: 'text', body: aiReply }),
      })
      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => ({}))
        logger.error('AI chatbot failed to send message', { err })
        return
      }

      // 10. Log AI usage
      await db.from('flow_logs').insert({
        id: generateId(),
        tenant_id: tenantId,
        flow_id: null,
        node_id: 'ai_chatbot',
        contact_id: contactId,
        conversation_id: conversationId,
        status: 'ai_response',
        detail: `Q: ${userMessage.substring(0, 200)} | A: ${aiReply.substring(0, 300)}`,
      })
    } catch (err) {
      logger.error('AI chatbot error', { err, tenantId, conversationId })
    }
  }

  private async savePending(externalId: string, tenantId: string, status: string, timestamp: Date, errorMessage?: string): Promise<void> {
    const { error } = await db.from('pending_status_updates').upsert({
      external_id: externalId, tenant_id: tenantId, status, timestamp,
      error_message: errorMessage, payload: { externalId, status, timestamp, errorMessage },
    }, { onConflict: 'external_id,status', ignoreDuplicates: true })
    if (error) logger.error('Failed to save pending', { externalId, status, error: error.message })
  }

  async markSent(messageUuid: string, externalId: string): Promise<void> {
    await db.from('messages').update({ status: 'sent', external_id: externalId, sent_at: new Date() }).eq('message_uuid', messageUuid)
  }

  async markFailed(messageUuid: string, errorMessage: string, retryCount: number): Promise<void> {
    await db.from('messages').update({
      status: retryCount >= 3 ? 'failed' : 'queued',
      error_message: errorMessage, retry_count: retryCount,
      failed_at: retryCount >= 3 ? new Date() : null,
    }).eq('message_uuid', messageUuid)
  }

  async getPendingMessages(tenantId: string, olderThanMinutes = 5) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000)
    const { data } = await db.from('messages').select('id, message_uuid, external_id, channel_id, tenant_id')
      .eq('tenant_id', tenantId).in('status', ['queued','sent']).lt('sent_at', cutoff.toISOString()).not('external_id', 'is', null).limit(100)
    return data || []
  }

  async listMessages(conversationId: string, tenantId: string, cursor?: string, limit = 30) {
    let query = db.from('messages')
      .select('id, direction, content_type, body, media_url, status, sent_at, created_at, external_id')
      .eq('conversation_id', conversationId).eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }).limit(limit)
    if (cursor) query = query.lt('created_at', cursor)
    const { data, error } = await query
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    return data || []
  }

  private async findOrCreateContact(tenantId: string, phone: string) {
    phone = phone.replace(/^\+/, '')
    if (phone.startsWith('55') && phone.length === 12) phone = phone.slice(0,4) + '9' + phone.slice(4)
    const { data: existing } = await db.from('contacts').select('id, name, avatar_url').eq('tenant_id', tenantId).eq('phone', phone).maybeSingle()
    if (existing) {
      // Busca foto se não tem
      if (!existing.avatar_url) this.fetchProfilePhoto(existing.id, tenantId, phone).catch(() => {})
      return existing
    }
    const { data: created, error } = await db.from('contacts').insert({ id: generateId(), tenant_id: tenantId, phone, name: phone, origin: 'inbound', status: 'active', last_interaction_at: new Date() }).select('id, name').single()
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    // Busca foto do novo contato
    this.fetchProfilePhoto(created.id, tenantId, phone).catch(() => {})
    return created
  }

  private async fetchProfilePhoto(contactId: string, tenantId: string, phone: string): Promise<void> {
    try {
      const { data: channel } = await db.from('channels').select('credentials, type')
        .eq('tenant_id', tenantId).eq('type', 'evolution').eq('status', 'active').limit(1).maybeSingle()
      if (!channel) return

      const creds = decryptCredentials(channel.credentials)
      const baseUrl = creds.baseUrl?.replace(/\/+$/, '')
      const instanceName = creds.instanceName
      const apiKey = creds.apiKey
      if (!baseUrl || !instanceName || !apiKey) return

      const cleanPhone = phone.replace(/\D/g, '')
      const remoteJid = `${cleanPhone}@s.whatsapp.net`

      const res = await fetch(`${baseUrl}/chat/fetchProfilePictureUrl/${instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ number: remoteJid }),
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) return
      const data = await res.json() as any
      const pictureUrl = data?.profilePictureUrl || data?.profilePicUrl || data?.picture || data?.imgUrl || data?.url
      if (!pictureUrl) return

      await db.from('contacts').update({ avatar_url: pictureUrl }).eq('id', contactId)
      logger.info('Profile photo saved', { contactId })
    } catch {
      // Silencioso — foto é opcional
    }
  }

  private async findOrCreateConversation(tenantId: string, channelId: string, contactId: string, channelType: string) {
    const { data: existing } = await db.from('conversations').select('id, unread_count').eq('tenant_id', tenantId).eq('contact_id', contactId).eq('channel_id', channelId).in('status', ['open','waiting']).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (existing) return existing
    const { data: created, error } = await db.from('conversations').insert({ id: generateId(), tenant_id: tenantId, contact_id: contactId, channel_id: channelId, channel_type: channelType, status: 'waiting', pipeline_stage: 'novo', bot_active: true, unread_count: 1, last_message_at: new Date() }).select('id, unread_count').single()
    if (error) throw new AppError('DB_ERROR', error.message, 500)
    return created
  }
}

export const messageService = new MessageService()