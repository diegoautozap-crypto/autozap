import { db } from '../lib/db'
import { generateId } from '@autozap/utils'

interface EnsureContactOpts {
  tenantId: string
  phone: string
  name?: string
  email?: string
  origin?: string
  metadata?: Record<string, string> | null
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

  const { data: existing } = await db
    .from('contacts').select('id, metadata').eq('tenant_id', tenantId).eq('phone', phone).maybeSingle()

  if (existing) {
    const merged = { ...(existing.metadata || {}), ...(metadata || {}) }
    const update: Record<string, unknown> = { last_interaction_at: new Date(), metadata: merged }
    if (name) update.name = name
    if (email) update.email = email
    await db.from('contacts').update(update).eq('id', existing.id)
    return { contactId: existing.id, isNew: false }
  }

  const { data: newContact } = await db
    .from('contacts')
    .insert({
      id: generateId(), tenant_id: tenantId, phone, name: name || phone,
      email: email || null, origin, status: 'active', metadata: metadata || null,
      last_interaction_at: new Date(),
    })
    .select('id').single()

  if (!newContact) throw new Error('Erro ao criar contato')
  return { contactId: newContact.id, isNew: true }
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
      pipeline_stage: 'lead', bot_active: true, unread_count: 1,
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
