import { db, logger } from '@autozap/utils'
import { AppError, NotFoundError, ConflictError, generateId, normalizePhone, paginationMeta } from '@autozap/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateContactInput {
  tenantId: string
  phone: string
  name?: string
  email?: string
  company?: string
  origin?: string
  notes?: string
  metadata?: Record<string, unknown>
  customFields?: Record<string, unknown>
  tagIds?: string[]
}

export interface UpdateContactInput {
  name?: string
  email?: string
  company?: string
  notes?: string
  status?: 'active' | 'blocked' | 'unsubscribed'
  metadata?: Record<string, unknown>
  customFields?: Record<string, unknown>
}

export interface ContactFilter {
  search?: string
  status?: string
  tagId?: string
  origin?: string
  page?: number
  limit?: number
}

// ─── ContactService ───────────────────────────────────────────────────────────

export class ContactService {

  // ── Create ───────────────────────────────────────────────────────────────

  async createContact(input: CreateContactInput) {
    const { tenantId, phone, name, email, company, origin, notes, metadata, customFields, tagIds } = input

    const normalizedPhone = normalizePhone(phone)

    const { data: existing } = await db
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone', normalizedPhone)
      .maybeSingle()

    if (existing) throw new ConflictError(`Contact with phone ${normalizedPhone} already exists`)

    const contactId = generateId()

    const { data, error } = await db.from('contacts').insert({
      id: contactId,
      tenant_id: tenantId,
      phone: normalizedPhone,
      name: name || normalizedPhone,
      email,
      company,
      origin: origin || 'manual',
      notes,
      metadata: metadata || customFields || {},
      status: 'active',
      last_interaction_at: new Date(),
    }).select().single()

    if (error) throw new AppError('DB_ERROR', error.message, 500)

    if (tagIds?.length) {
      await this.addTags(contactId, tagIds, tenantId)
    }

    logger.info('Contact created', { tenantId, contactId, phone: normalizedPhone })
    return data
  }

  // ── Get ──────────────────────────────────────────────────────────────────

  async getContact(contactId: string, tenantId: string) {
    const { data, error } = await db
      .from('contacts')
      .select('*, contact_tags(tag_id, tags(id, name, color))')
      .eq('id', contactId)
      .eq('tenant_id', tenantId)
      .single()

    if (error || !data) throw new NotFoundError('Contact')
    return data
  }

  // ── List with filters ─────────────────────────────────────────────────────

  async listContacts(tenantId: string, filter: ContactFilter = {}) {
    const { search, status, tagId, origin, page = 1, limit = 20 } = filter
    const offset = (page - 1) * limit

    let query = db
      .from('contacts')
      .select('id, phone, name, email, company, status, origin, metadata, last_interaction_at, created_at, contact_tags(tag_id, tags(id, name, color))', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('last_interaction_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (status) query = query.eq('status', status)
    if (origin) query = query.eq('origin', origin)

    if (search) {
      const s = search.replace(/[%_'"\\,()]/g, '').trim()
      if (s) query = query.or(`name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`)
    }

    if (tagId) {
      const { data: taggedContacts } = await db
        .from('contact_tags')
        .select('contact_id')
        .eq('tag_id', tagId)

      const ids = (taggedContacts || []).map((t: any) => t.contact_id)
      if (ids.length === 0) return { contacts: [], meta: paginationMeta(0, page, limit) }
      query = query.in('id', ids)
    }

    const { data, count, error } = await query
    if (error) throw new AppError('DB_ERROR', error.message, 500)

    return {
      contacts: data || [],
      meta: paginationMeta(count || 0, page, limit),
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async updateContact(contactId: string, tenantId: string, input: UpdateContactInput) {
    // Aceita tanto metadata quanto customFields (compatibilidade)
    const metadataValue = input.metadata || input.customFields

    const updatePayload: any = {}
    if (input.name !== undefined) updatePayload.name = input.name
    if (input.email !== undefined) updatePayload.email = input.email
    if (input.company !== undefined) updatePayload.company = input.company
    if (input.notes !== undefined) updatePayload.notes = input.notes
    if (input.status !== undefined) updatePayload.status = input.status
    if (metadataValue !== undefined) updatePayload.metadata = metadataValue

    const { data, error } = await db
      .from('contacts')
      .update(updatePayload)
      .eq('id', contactId)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (error || !data) throw new NotFoundError('Contact')
    return data
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async deleteContact(contactId: string, tenantId: string) {
    const { error } = await db
      .from('contacts')
      .delete()
      .eq('id', contactId)
      .eq('tenant_id', tenantId)

    if (error) throw new AppError('DB_ERROR', error.message, 500)
    logger.info('Contact deleted', { contactId, tenantId })
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  async addTags(contactId: string, tagIds: string[], tenantId: string) {
    // Valida que o contato pertence ao tenant
    const { data: contact } = await db.from('contacts').select('id').eq('id', contactId).eq('tenant_id', tenantId).single()
    if (!contact) throw new AppError('NOT_FOUND', 'Contact not found', 404)
    // Valida que as tags pertencem ao tenant
    const { data: validTags } = await db.from('tags').select('id').eq('tenant_id', tenantId).in('id', tagIds)
    const validIds = (validTags || []).map(t => t.id)
    if (validIds.length === 0) return
    const rows = validIds.map(tagId => ({ contact_id: contactId, tag_id: tagId }))
    await db.from('contact_tags').upsert(rows, { onConflict: 'contact_id,tag_id' })
  }

  async removeTags(contactId: string, tagIds: string[], tenantId: string) {
    // Valida que o contato pertence ao tenant
    const { data: contact } = await db.from('contacts').select('id').eq('id', contactId).eq('tenant_id', tenantId).single()
    if (!contact) throw new AppError('NOT_FOUND', 'Contact not found', 404)
    await db.from('contact_tags')
      .delete()
      .eq('contact_id', contactId)
      .in('tag_id', tagIds)
  }

  // ── List tags ─────────────────────────────────────────────────────────────

  async listTags(tenantId: string) {
    const { data, error } = await db
      .from('tags')
      .select('*, contact_tags(count)')
      .eq('tenant_id', tenantId)
      .order('name')

    if (error) throw new AppError('DB_ERROR', error.message, 500)
    return (data || []).map((tag: any) => ({
      ...tag,
      contact_count: tag.contact_tags?.[0]?.count || 0,
      contact_tags: undefined,
    }))
  }

  async createTag(tenantId: string, name: string, color = '#5a8dee') {
    const { data, error } = await db.from('tags').insert({
      id: generateId(),
      tenant_id: tenantId,
      name,
      color,
    }).select().single()

    if (error) throw new ConflictError(`Tag "${name}" already exists`)
    return data
  }

  async deleteTag(tagId: string, tenantId: string) {
    await db.from('tags').delete().eq('id', tagId).eq('tenant_id', tenantId)
  }

  // ── Import CSV ────────────────────────────────────────────────────────────

  async importContacts(tenantId: string, rows: any[], tagId?: string): Promise<{ imported: number; skipped: number; errors: number }> {
    let imported = 0
    let skipped = 0
    let errors = 0
    const createdIds: string[] = []

    for (const row of rows) {
      try {
        if (!row.phone) { errors++; continue }
        const contact = await this.createContact({
          tenantId,
          phone: row.phone,
          name: row.name,
          email: row.email,
          company: row.company,
          origin: 'csv_import',
        })
        createdIds.push(contact.id)
        imported++
      } catch (err: any) {
        if (err.code === 'CONFLICT') {
          skipped++
          // Se tem tag, busca o contato existente para aplicar a tag também
          if (tagId) {
            const phone = normalizePhone(row.phone)
            const { data: existing } = await db.from('contacts').select('id').eq('tenant_id', tenantId).eq('phone', phone).maybeSingle()
            if (existing) createdIds.push(existing.id)
          }
        }
        else errors++
      }
    }

    // Aplica tag a todos os contatos importados (novos + existentes)
    if (tagId && createdIds.length > 0) {
      const tagRows = createdIds.map(contactId => ({ contact_id: contactId, tag_id: tagId }))
      const chunkSize = 500
      for (let i = 0; i < tagRows.length; i += chunkSize) {
        await db.from('contact_tags').upsert(tagRows.slice(i, i + chunkSize), { onConflict: 'contact_id,tag_id', ignoreDuplicates: true })
      }
    }

    logger.info('CSV import completed', { tenantId, imported, skipped, errors, tagId })
    return { imported, skipped, errors }
  }

  // ── Export CSV ────────────────────────────────────────────────────────────

  async exportContacts(tenantId: string, tagId?: string): Promise<string> {
    let contactIds: string[] | null = null
    if (tagId) {
      const { data: tagContacts } = await db.from('contact_tags').select('contact_id').eq('tag_id', tagId)
      contactIds = (tagContacts || []).map((r: any) => r.contact_id)
      if (contactIds.length === 0) return 'phone,name,email,company,status,origin,created_at'
    }

    let query = db
      .from('contacts')
      .select('phone, name, email, company, status, origin, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50000)

    if (contactIds) query = query.in('id', contactIds)

    const { data } = await query
    const rows = data || []
    const header = 'phone,name,email,company,status,origin,created_at'
    const lines = rows.map((r: any) =>
      `${r.phone},${r.name || ''},${r.email || ''},${r.company || ''},${r.status},${r.origin},${r.created_at}`
    )

    return [header, ...lines].join('\n')
  }
}

export const contactService = new ContactService()