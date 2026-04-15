import { Router } from 'express'
import { z } from 'zod'
import { contactService } from '../services/contact.service'
import { requireAuth, requireRole, validate, ok, paginationSchema, AppError, cachedGet, db } from '@autozap/utils'
import { PLAN_LIMITS, type PlanSlug } from '@autozap/types'

const router = Router()
router.use(requireAuth)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createContactSchema = z.object({
  phone: z.string().min(8),
  name: z.string().optional(),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  company: z.string().optional(),
  origin: z.string().optional(),
  notes: z.string().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  metadata: z.record(z.any()).optional(),
})

const updateContactSchema = z.object({
  name: z.string().optional(),
  email: z.union([z.string().email(), z.literal('')]).optional().nullable(),
  company: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(['active', 'blocked', 'unsubscribed']).optional(),
  metadata: z.record(z.any()).optional(),
})

const tagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

const addTagsSchema = z.object({ tagIds: z.array(z.string().uuid()) })

const dealAdjustmentsSchema = z.object({
  discount: z.number().min(0),
  surcharge: z.number().min(0),
  shipping: z.number().min(0),
  coupon: z.string().max(50).optional(),
})

// ─── Contacts ─────────────────────────────────────────────────────────────────

// GET /contacts
router.get('/contacts', async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query)
    const { search, status, tagId, origin } = req.query as any
    const result = await contactService.listContacts(req.auth.tid, {
      search, status, tagId, origin, page, limit,
    })
    res.json(ok(result.contacts, result.meta))
  } catch (err) { next(err) }
})

// POST /contacts
router.post('/contacts', validate(createContactSchema), async (req, res, next) => {
  try {
    // ── Plan limit check ──
    const planSlug = await cachedGet(`tenant-plan:${req.auth.tid}`, 120, async () => {
      const { data } = await db.from('tenants').select('plan_slug').eq('id', req.auth.tid).single()
      return (data?.plan_slug || 'pending') as PlanSlug
    })
    const planLimits = PLAN_LIMITS[planSlug] ?? PLAN_LIMITS.pending
    const { count } = await db.from('contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', req.auth.tid)
    if (planLimits.contacts !== null && (count ?? 0) >= planLimits.contacts) {
      throw new AppError('PLAN_LIMIT', `Seu plano permite ${planLimits.contacts} contatos`, 403)
    }

    const contact = await contactService.createContact({ tenantId: req.auth.tid, ...req.body })
    res.status(201).json(ok(contact))
  } catch (err) { next(err) }
})

// GET /contacts/export — download CSV
router.get('/contacts/export', async (req, res, next) => {
  try {
    // ── Plan limit check: reports ──
    const exportPlanSlug = await cachedGet(`tenant-plan:${req.auth.tid}`, 120, async () => {
      const { data } = await db.from('tenants').select('plan_slug').eq('id', req.auth.tid).single()
      return (data?.plan_slug || 'pending') as PlanSlug
    })
    const exportPlanLimits = PLAN_LIMITS[exportPlanSlug] ?? PLAN_LIMITS.pending
    if (!exportPlanLimits.reports) {
      throw new AppError('PLAN_LIMIT', 'Exportação de relatórios não disponível no seu plano', 403)
    }

    const tagId = req.query.tagId as string | undefined
    const csv = await contactService.exportContacts(req.auth.tid, tagId)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv')
    res.send(csv)
  } catch (err) { next(err) }
})

// DELETE /contacts/all — excluir todos os contatos do tenant
router.delete('/contacts/all', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    const { error, count } = await db
      .from('contacts')
      .delete({ count: 'exact' })
      .eq('tenant_id', req.auth.tid)

    if (error) throw new Error(error.message)
    res.json(ok({ message: 'All contacts deleted', count }))
  } catch (err) { next(err) }
})

// GET /contacts/:id
router.get('/contacts/:id', async (req, res, next) => {
  try {
    const contact = await contactService.getContact(req.params.id, req.auth.tid)
    res.json(ok(contact))
  } catch (err) { next(err) }
})

// PATCH /contacts/:id
router.patch('/contacts/:id', validate(updateContactSchema), async (req, res, next) => {
  try {
    const contact = await contactService.updateContact(req.params.id, req.auth.tid, req.body)
    res.json(ok(contact))
  } catch (err) { next(err) }
})

// PATCH /contacts/:id/deal-adjustments
router.patch('/contacts/:id/deal-adjustments', validate(dealAdjustmentsSchema), async (req, res, next) => {
  try {
    const { discount, surcharge, shipping, coupon } = req.body
    const adjustments = {
      discount: Number(discount) || 0,
      surcharge: Number(surcharge) || 0,
      shipping: Number(shipping) || 0,
      coupon: coupon || '',
    }
    const { data, error } = await db.from('contacts').update({
      deal_adjustments: adjustments,
      updated_at: new Date(),
    }).eq('id', req.params.id).eq('tenant_id', req.auth.tid).select().single()
    if (error) throw error
    if (!data) { res.status(404).json({ error: 'Contact not found' }); return }
    res.json(ok(data))
  } catch (err) { next(err) }
})

// GET /contacts/:id/deal-adjustments
router.get('/contacts/:id/deal-adjustments', async (req, res, next) => {
  try {
    const { data, error } = await db.from('contacts')
      .select('deal_adjustments')
      .eq('id', req.params.id).eq('tenant_id', req.auth.tid).single()
    if (error) throw error
    res.json(ok(data?.deal_adjustments || { discount: 0, surcharge: 0, shipping: 0, coupon: '' }))
  } catch (err) { next(err) }
})

// GET /contacts/:id/timeline — feed unificado de eventos do contato
router.get('/contacts/:id/timeline', async (req, res, next) => {
  try {
    const contactId = req.params.id
    const tenantId = req.auth.tid
    const limit = Math.min(Number(req.query.limit) || 100, 300)

    // Valida que o contato pertence ao tenant
    const { data: contact } = await db.from('contacts')
      .select('id').eq('id', contactId).eq('tenant_id', tenantId).single()
    if (!contact) { res.status(404).json({ error: 'Contato não encontrado' }); return }

    // Busca IDs auxiliares (conversations e pipeline_cards desse contato)
    // Necessários pra filtrar pipeline_card_events corretamente
    const [convRes, cardRes] = await Promise.all([
      db.from('conversations').select('id').eq('tenant_id', tenantId).eq('contact_id', contactId),
      db.from('pipeline_cards').select('id').eq('tenant_id', tenantId).eq('contact_id', contactId),
    ])
    const convIds: string[] = (convRes.data || []).map((c: any) => c.id)
    const cardIds: string[] = (cardRes.data || []).map((c: any) => c.id)

    // Queries paralelas pros eventos
    const [msgs, cardEvents, tasks, campaigns, tags] = await Promise.all([
      db.from('messages')
        .select('id, direction, content_type, body, created_at, campaign_id')
        .eq('tenant_id', tenantId).eq('contact_id', contactId)
        .order('created_at', { ascending: false }).limit(limit),

      (convIds.length || cardIds.length)
        ? db.from('pipeline_card_events')
            .select('id, event_type, from_column, to_column, from_value, to_value, created_at, card_id, conversation_id, actor:actor_user_id(name), to_user:to_user_id(name)')
            .eq('tenant_id', tenantId)
            .or([
              cardIds.length ? `card_id.in.(${cardIds.join(',')})` : '',
              convIds.length ? `conversation_id.in.(${convIds.join(',')})` : '',
            ].filter(Boolean).join(','))
            .order('created_at', { ascending: false }).limit(limit)
        : Promise.resolve({ data: [] }),

      db.from('tasks')
        .select('id, title, status, priority, due_date, completed_at, created_at, assignee:assigned_to(name)')
        .eq('tenant_id', tenantId).eq('contact_id', contactId)
        .order('created_at', { ascending: false }).limit(limit),

      db.from('campaign_contacts')
        .select('id, status, sent_at, created_at, campaigns(id, name)')
        .eq('tenant_id', tenantId).eq('contact_id', contactId)
        .order('created_at', { ascending: false }).limit(limit),

      db.from('contact_tags')
        .select('tag_id, created_at, tags(id, name, color)')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false }).limit(limit),
    ])

    const events: any[] = []

    for (const m of (msgs.data || [])) {
      const preview = m.body ? (m.body.length > 140 ? m.body.slice(0, 140) + '…' : m.body) : `[${m.content_type}]`
      events.push({
        id: `msg_${m.id}`,
        type: m.direction === 'in' ? 'message_in' : 'message_out',
        at: m.created_at,
        title: m.direction === 'in' ? 'Mensagem recebida' : 'Mensagem enviada',
        body: preview,
        metadata: { campaignId: m.campaign_id || null, contentType: m.content_type },
      })
    }

    for (const e of ((cardEvents as any).data || [])) {
      events.push({
        id: `card_${e.id}`,
        type: `pipeline_${e.event_type}`,
        at: e.created_at,
        title: {
          created: 'Card criado no pipeline',
          moved: 'Card movido',
          value_changed: 'Valor do card alterado',
          assigned: 'Responsável do card alterado',
          deleted: 'Card removido',
        }[e.event_type as string] || 'Evento no pipeline',
        metadata: {
          fromColumn: e.from_column, toColumn: e.to_column,
          fromValue: e.from_value, toValue: e.to_value,
          actor: (e as any).actor?.name || null,
          toUser: (e as any).to_user?.name || null,
        },
      })
    }

    for (const t of (tasks.data || [])) {
      events.push({
        id: `task_${t.id}_created`,
        type: 'task_created',
        at: t.created_at,
        title: `Tarefa criada: ${t.title}`,
        metadata: { status: t.status, priority: t.priority, dueDate: t.due_date, assignee: (t as any).assignee?.name || null },
      })
      if (t.completed_at) {
        events.push({
          id: `task_${t.id}_completed`,
          type: 'task_completed',
          at: t.completed_at,
          title: `Tarefa concluída: ${t.title}`,
          metadata: { assignee: (t as any).assignee?.name || null },
        })
      }
    }

    for (const c of (campaigns.data || [])) {
      const when = c.sent_at || c.created_at
      if (!when) continue
      events.push({
        id: `camp_${c.id}`,
        type: 'campaign_sent',
        at: when,
        title: `Campanha: ${(c as any).campaigns?.name || '—'}`,
        metadata: { status: c.status },
      })
    }

    for (const ct of (tags.data || [])) {
      if (!ct.created_at) continue
      events.push({
        id: `tag_${ct.tag_id}`,
        type: 'tag_added',
        at: ct.created_at,
        title: `Tag aplicada: ${(ct as any).tags?.name || '—'}`,
        metadata: { color: (ct as any).tags?.color || null },
      })
    }

    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

    res.json(ok(events.slice(0, limit)))
  } catch (err) { next(err) }
})

// DELETE /contacts/:id
router.delete('/contacts/:id', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    await contactService.deleteContact(req.params.id, req.auth.tid)
    res.json(ok({ message: 'Contact deleted' }))
  } catch (err) { next(err) }
})

// POST /contacts/:id/tags
router.post('/contacts/:id/tags', validate(addTagsSchema), async (req, res, next) => {
  try {
    await contactService.addTags(req.params.id, req.body.tagIds, req.auth.tid)
    res.json(ok({ message: 'Tags added' }))
  } catch (err) { next(err) }
})

// DELETE /contacts/:id/tags
router.delete('/contacts/:id/tags', validate(addTagsSchema), async (req, res, next) => {
  try {
    await contactService.removeTags(req.params.id, req.body.tagIds, req.auth.tid)
    res.json(ok({ message: 'Tags removed' }))
  } catch (err) { next(err) }
})

// ─── Tags ─────────────────────────────────────────────────────────────────────

router.get('/tags', async (req, res, next) => {
  try {
    const tags = await contactService.listTags(req.auth.tid)
    res.json(ok(tags))
  } catch (err) { next(err) }
})

router.post('/tags', validate(tagSchema), async (req, res, next) => {
  try {
    const tag = await contactService.createTag(req.auth.tid, req.body.name, req.body.color)
    res.status(201).json(ok(tag))
  } catch (err) { next(err) }
})

router.delete('/tags/:id', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    await contactService.deleteTag(req.params.id, req.auth.tid)
    res.json(ok({ message: 'Tag deleted' }))
  } catch (err) { next(err) }
})

// ─── Import CSV ───────────────────────────────────────────────────────────────

const importContactsSchema = z.object({
  rows: z.array(z.object({
    phone: z.string().min(8, 'Telefone deve ter pelo menos 8 dígitos'),
    name: z.string().optional(),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    company: z.string().optional(),
  })).min(1, 'Envie pelo menos 1 contato').max(10000, 'Máximo 10.000 contatos por importação'),
  tagId: z.string().uuid('tagId inválido').optional(),
})

router.post('/contacts/import', validate(importContactsSchema), async (req, res, next) => {
  try {
    // ── Plan limit check ──
    const importPlanSlug = await cachedGet(`tenant-plan:${req.auth.tid}`, 120, async () => {
      const { data } = await db.from('tenants').select('plan_slug').eq('id', req.auth.tid).single()
      return (data?.plan_slug || 'pending') as PlanSlug
    })
    const importPlanLimits = PLAN_LIMITS[importPlanSlug] ?? PLAN_LIMITS.pending
    const { count: importCount } = await db.from('contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', req.auth.tid)
    if (importPlanLimits.contacts !== null && (importCount ?? 0) >= importPlanLimits.contacts) {
      throw new AppError('PLAN_LIMIT', `Seu plano permite ${importPlanLimits.contacts} contatos`, 403)
    }

    const { rows, tagId } = req.body
    const result = await contactService.importContacts(req.auth.tid, rows, tagId)
    res.json(ok(result))
  } catch (err) { next(err) }
})

export default router
