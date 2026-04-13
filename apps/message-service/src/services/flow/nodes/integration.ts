import { db, logger, decryptCredentials } from '@autozap/utils'
import { interpolate, sendMessage, logNode, cached, getTenantPlanLimits, getMonthlyAiCount } from '../helpers'
import type { FlowContext, FlowNodeData, FlowNodeRow, NodeResult } from '../types'

export async function handleTranscribeAudio(
  node: FlowNodeRow, ctx: FlowContext, flowId: string, data: FlowNodeData,
  variables: Record<string, string>,
): Promise<NodeResult | null> {
  const saveVar = data?.transcribeSaveAs || 'transcricao'

  const { limits } = await getTenantPlanLimits(ctx.tenantId)
  if (!limits.transcription) {
    logger.warn('Transcribe node blocked — plan does not allow', { tenantId: ctx.tenantId })
    variables[saveVar] = ctx.messageBody || ''
    return { success: true }
  }

  const { data: lastMsg } = await db.from('messages').select('content_type, media_url, body')
    .eq('conversation_id', ctx.conversationId).eq('direction', 'inbound')
    .order('created_at', { ascending: false }).limit(1).single()

  if (lastMsg?.content_type === 'audio' && lastMsg?.media_url) {
    let whisperKey = data?.apiKey
    if (!whisperKey) {
      const { data: tenant } = await cached(`tenant:${ctx.tenantId}`, 60_000, async () => { const r = await db.from('tenants').select('metadata').eq('id', ctx.tenantId).single(); return r })
      whisperKey = tenant?.metadata?.openai_api_key || process.env.OPENAI_API_KEY
    }
    if (!whisperKey) { variables[saveVar] = lastMsg.body || ''; return { success: true } }

    try {
      let audioBuffer: Buffer | null = null
      const mediaId = lastMsg.media_url

      const { data: channel } = await cached(`channel:${ctx.channelId}`, 60_000, async () => { const r = await db.from('channels').select('credentials, type').eq('id', ctx.channelId).single(); return r })
      const rawCreds = channel?.credentials || {}
      const creds = typeof rawCreds === 'string' ? JSON.parse(rawCreds) : rawCreds
      const metaToken = creds.metaToken?.startsWith('EAA') ? creds.metaToken : decryptCredentials(creds).metaToken
      const apiKey = creds.apiKey?.length < 100 ? creds.apiKey : decryptCredentials(creds).apiKey

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

      if (!audioBuffer && apiKey) {
        const gupshupRes = await fetch(`https://api.gupshup.io/wa/api/v1/media/${mediaId}`, { headers: { apikey: apiKey } })
        if (gupshupRes.ok) {
          const ct = gupshupRes.headers.get('content-type') || ''
          if (ct.includes('audio') || ct.includes('ogg') || ct.includes('octet')) {
            audioBuffer = Buffer.from(await gupshupRes.arrayBuffer())
          }
        }
      }

      if (audioBuffer && audioBuffer.length > 0) {
        const { default: OpenAI, toFile } = await import('openai')
        const openai = new OpenAI({ apiKey: whisperKey })
        const file = await toFile(audioBuffer, 'audio.ogg', { type: 'audio/ogg' })
        const transcription = await openai.audio.transcriptions.create({ file, model: 'whisper-1', language: data?.transcribeLanguage || 'pt' })
        variables[saveVar] = transcription.text || ''
        ctx.messageBody = transcription.text || ctx.messageBody
      } else {
        variables[saveVar] = lastMsg.body || ctx.messageBody || ''
      }
    } catch (err) {
      logger.error('Transcribe audio error', { err: err instanceof Error ? err.message : String(err) })
      variables[saveVar] = lastMsg.body || ctx.messageBody || ''
    }
  } else {
    variables[saveVar] = lastMsg?.body || ctx.messageBody || ''
  }
  ctx.messageBody = variables[saveVar] || ctx.messageBody
  return { success: true }
}

export async function handleAi(
  node: FlowNodeRow, ctx: FlowContext, flowId: string, data: FlowNodeData,
  variables: Record<string, string>,
): Promise<NodeResult | null> {
  const { limits } = await getTenantPlanLimits(ctx.tenantId)
  if (limits.aiResponses !== null) {
    const currentAiCount = await getMonthlyAiCount(ctx.tenantId)
    if (currentAiCount >= limits.aiResponses) {
      logger.warn('AI node blocked — monthly limit reached', { tenantId: ctx.tenantId })
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Nosso atendimento automático está temporariamente indisponível. Um atendente vai te responder em breve!' })
      await db.from('conversations').update({ bot_active: false }).eq('id', ctx.conversationId).eq('tenant_id', ctx.tenantId)
      return { success: true }
    }
  }

  let openaiKey = data?.apiKey
  if (!openaiKey) {
    const { data: tenant } = await cached(`tenant:${ctx.tenantId}`, 60_000, async () => { const r = await db.from('tenants').select('metadata').eq('id', ctx.tenantId).single(); return r })
    openaiKey = tenant?.metadata?.openai_api_key || process.env.OPENAI_API_KEY
  }
  if (!openaiKey) { logger.warn('AI node: no OpenAI API key'); return { success: true } }

  const { default: OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: openaiKey, timeout: 30000, maxRetries: 1 })
  const aiMode = data?.mode || 'respond'
  const userMessage = interpolate(data?.userMessage || ctx.messageBody, ctx, variables)
  const maxHistory = data?.historyMessages ?? 20

  let historyMessages: { role: 'user' | 'assistant'; content: string }[] = []
  if (maxHistory > 0) {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
    const { data: history } = await db.from('messages').select('direction, body, content_type, created_at').eq('conversation_id', ctx.conversationId).eq('tenant_id', ctx.tenantId).in('content_type', ['text']).not('body', 'is', null).gte('created_at', startOfDay.toISOString()).order('created_at', { ascending: false }).limit(maxHistory)
    historyMessages = (history || []).reverse().filter((m: { body?: string }) => m.body?.trim()).map((m: { direction: string; body: string }) => ({ role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.body }))
  }

  let messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = []
  if (aiMode === 'respond') {
    messages = [{ role: 'system', content: data?.systemPrompt || 'Você é um assistente prestativo.' }, ...historyMessages]
    const last = historyMessages[historyMessages.length - 1]
    if (!last || last.content !== userMessage) messages.push({ role: 'user', content: userMessage })
  } else if (aiMode === 'classify') {
    const options = (data?.classifyOptions || '').split(',').map((s: string) => s.trim()).filter(Boolean)
    messages = [{ role: 'system', content: `Classifique em UMA das categorias: ${options.join(', ')}. Responda APENAS com a categoria.` }, { role: 'user', content: userMessage }]
  } else if (aiMode === 'extract') {
    messages = [{ role: 'system', content: `Extraia apenas ${data?.extractField || 'informação'}. Responda apenas com o valor.` }, { role: 'user', content: userMessage }]
  } else if (aiMode === 'summarize') {
    messages = [{ role: 'system', content: 'Resuma em uma frase curta.' }, { role: 'user', content: userMessage }]
  }

  const completion = await openai.chat.completions.create({ model: data?.model || 'gpt-4o-mini', messages, max_tokens: data?.maxTokens || 1000, temperature: data?.temperature ?? 0.7 })
  const aiResponse = completion.choices[0]?.message?.content?.trim() || ''
  if (data?.saveAs) variables[data.saveAs] = aiResponse
  if (aiMode === 'respond' && aiResponse) await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: aiResponse })
  await logNode(flowId, node.id, ctx, 'ai_response', `AI ${aiMode}: ${aiResponse.slice(0, 100)}`)
  return { success: true }
}

export async function handleWebhook(
  node: FlowNodeRow, ctx: FlowContext, flowId: string, data: FlowNodeData,
  variables: Record<string, string>,
): Promise<NodeResult | null> {
  const url = interpolate(data?.url || '', ctx, variables)
  if (!url) return null
  const method = (data?.method || 'POST').toUpperCase()
  let body: string | undefined
  if (method !== 'GET') {
    const interpolatedBody = interpolate(data?.body || '{}', ctx, variables)
    try { JSON.parse(interpolatedBody); body = interpolatedBody } catch { body = JSON.stringify({ phone: ctx.phone, message: ctx.messageBody, contactId: ctx.contactId, conversationId: ctx.conversationId, ...variables }) }
  }
  const customHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
  if (data?.headers && Array.isArray(data.headers)) {
    for (const h of data.headers) {
      if (h.key && h.value) customHeaders[interpolate(h.key, ctx, variables)] = interpolate(h.value, ctx, variables)
    }
  }
  const response = await fetch(url, { method, headers: customHeaders, body: method !== 'GET' ? body : undefined, signal: AbortSignal.timeout(10000) })
  const responseText = await response.text()
  if (data?.saveResponseAs) {
    try {
      const json = JSON.parse(responseText)
      if (data?.responseField) { const fieldValue = data.responseField.split('.').reduce((obj: Record<string, unknown>, key: string) => (obj?.[key] as Record<string, unknown>), json); variables[data.saveResponseAs] = String(fieldValue ?? responseText) }
      else { variables[data.saveResponseAs] = responseText }
    } catch { variables[data.saveResponseAs] = responseText }
  }
  variables['webhook_status'] = String(response.status)
  variables['webhook_ok'] = response.ok ? 'true' : 'false'
  return { success: true }
}
