import { db, generateId, logger, decryptCredentials } from '@autozap/utils'

interface EnsureContactOpts {
  tenantId: string
  phone: string
  name?: string
  email?: string
  origin?: string
  metadata?: Record<string, string> | null
  mergeMetadata?: boolean
}

interface EnsureConversationOpts {
  tenantId: string
  contactId: string
  channelId: string
  channelType: string
  lastMessage?: string
}

interface EnsureResult {
  contactId: string
  conversationId: string
  isNewConversation: boolean
}

export async function ensureContact(opts: EnsureContactOpts): Promise<{ contactId: string; isNew: boolean }> {
  const { tenantId, phone, name, email, origin = 'webhook', metadata } = opts

  // Upsert para evitar race condition em requisições simultâneas
  const { data: upserted } = await db
    .from('contacts')
    .upsert({
      id: generateId(), tenant_id: tenantId, phone, name: name || phone,
      email: email || null, origin, status: 'active', metadata: metadata || null,
      last_interaction_at: new Date(),
    }, { onConflict: 'tenant_id,phone', ignoreDuplicates: false })
    .select('id').single()

  if (!upserted) {
    // Fallback: busca o existente se upsert não retornou
    const { data: existing } = await db
      .from('contacts').select('id').eq('tenant_id', tenantId).eq('phone', phone).single()
    if (!existing) throw new Error('Erro ao criar contato')
    // Busca foto pra contatos existentes sem avatar
    fetchProfilePhoto(existing.id, tenantId, phone).catch(() => {})
    return { contactId: existing.id, isNew: false }
  }

  // Atualiza campos extras se contato já existia
  if (name || email || metadata) {
    // Se mergeMetadata, lê o existente e faz merge
    let finalMetadata = metadata
    if (metadata && opts.mergeMetadata) {
      const { data: existing } = await db.from('contacts').select('metadata').eq('id', upserted.id).single()
      if (existing?.metadata) {
        finalMetadata = { ...(existing.metadata as Record<string, string>), ...metadata }
      }
    }
    const update: Record<string, unknown> = { last_interaction_at: new Date() }
    if (name) update.name = name
    if (email) update.email = email
    if (finalMetadata) update.metadata = finalMetadata
    await db.from('contacts').update(update).eq('id', upserted.id)
  }

  // Busca foto de perfil do WhatsApp (async, não bloqueia)
  fetchProfilePhoto(upserted.id, tenantId, phone).catch(() => {})

  return { contactId: upserted.id, isNew: true }
}

async function fetchProfilePhoto(contactId: string, tenantId: string, phone: string): Promise<void> {
  try {
    // Verifica se já tem foto
    const { data: contact } = await db.from('contacts').select('avatar_url').eq('id', contactId).single()
    if (contact?.avatar_url) return

    // Busca canal Evolution ativo do tenant
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

    let pictureUrl: string | null = null

    try {
      const res = await fetch(`${baseUrl}/chat/fetchProfilePictureUrl/${instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ number: remoteJid }),
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const data = await res.json() as any
        pictureUrl = data?.profilePictureUrl || null
        logger.debug('Evolution profilePic response', { contactId, status: res.status, hasPic: !!pictureUrl })
      } else {
        logger.debug('Evolution profilePic failed', { contactId, status: res.status })
      }
    } catch (err) {
      logger.debug('Evolution profilePic error', { contactId, err: (err as Error).message })
    }

    if (!pictureUrl) return

    await db.from('contacts').update({ avatar_url: pictureUrl }).eq('id', contactId)
    logger.info('Profile photo fetched', { contactId, phone: cleanPhone })
  } catch (err) {
    logger.debug('Profile photo fetch failed', { contactId, err: (err as Error).message })
  }
}

export async function ensureConversation(opts: EnsureConversationOpts): Promise<{ conversationId: string; isNew: boolean }> {
  const { tenantId, contactId, channelId, channelType, lastMessage } = opts

  const { data: existing } = await db
    .from('conversations').select('id').eq('tenant_id', tenantId).eq('contact_id', contactId)
    .eq('channel_id', channelId).in('status', ['open', 'waiting'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (existing) return { conversationId: existing.id, isNew: false }

  const { data: newConv } = await db
    .from('conversations')
    .insert({
      id: generateId(), tenant_id: tenantId, contact_id: contactId,
      channel_id: channelId, channel_type: channelType, status: 'waiting',
      pipeline_stage: 'novo', bot_active: true, unread_count: 1,
      last_message: lastMessage || 'Lead via webhook', last_message_at: new Date(),
    })
    .select('id').single()

  if (!newConv) throw new Error('Erro ao criar conversa')
  return { conversationId: newConv.id, isNew: true }
}

export async function ensureContactAndConversation(
  contactOpts: EnsureContactOpts,
  convOpts: Omit<EnsureConversationOpts, 'tenantId' | 'contactId'> & { lastMessage?: string },
): Promise<EnsureResult> {
  const { contactId } = await ensureContact(contactOpts)
  const { conversationId, isNew } = await ensureConversation({
    tenantId: contactOpts.tenantId,
    contactId,
    ...convOpts,
  })
  return { contactId, conversationId, isNewConversation: isNew }
}
