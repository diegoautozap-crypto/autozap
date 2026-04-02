import { Router } from 'express'
import { z } from 'zod'
import { contactService } from '../services/contact.service'
import { requireAuth, requireRole, validate } from '../middleware/contact.middleware'
import { ok, paginationSchema, AppError } from '@autozap/utils'
import { PLAN_LIMITS, type PlanSlug } from '@autozap/types'
import { db } from '../lib/db'

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
    const { data: tenantData } = await db.from('tenants').select('plan_slug').eq('id', req.auth.tid).single()
    const planSlug = (tenantData?.plan_slug || 'pending') as PlanSlug
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
    const { data: tenantExport } = await db.from('tenants').select('plan_slug').eq('id', req.auth.tid).single()
    const exportPlanSlug = (tenantExport?.plan_slug || 'pending') as PlanSlug
    const exportPlanLimits = PLAN_LIMITS[exportPlanSlug] ?? PLAN_LIMITS.pending
    if (!exportPlanLimits.reports) {
      throw new AppError('PLAN_LIMIT', 'Exportação de relatórios não disponível no seu plano', 403)
    }

    const csv = await contactService.exportContacts(req.auth.tid)
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
router.patch('/contacts/:id/deal-adjustments', async (req, res, next) => {
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

router.post('/contacts/import', async (req, res, next) => {
  try {
    // ── Plan limit check ──
    const { data: tenantImport } = await db.from('tenants').select('plan_slug').eq('id', req.auth.tid).single()
    const importPlanSlug = (tenantImport?.plan_slug || 'pending') as PlanSlug
    const importPlanLimits = PLAN_LIMITS[importPlanSlug] ?? PLAN_LIMITS.pending
    const { count: importCount } = await db.from('contacts').select('id', { count: 'exact', head: true }).eq('tenant_id', req.auth.tid)
    if (importPlanLimits.contacts !== null && (importCount ?? 0) >= importPlanLimits.contacts) {
      throw new AppError('PLAN_LIMIT', `Seu plano permite ${importPlanLimits.contacts} contatos`, 403)
    }

    const { rows, tagId } = req.body
    if (!Array.isArray(rows)) throw new Error('rows must be an array')
    const result = await contactService.importContacts(req.auth.tid, rows, tagId)
    res.json(ok(result))
  } catch (err) { next(err) }
})

// ─── Products ─────────────────────────────────────────────────────────────────

router.get('/products', async (req, res, next) => {
  try {
    const { data, error } = await db.from('products').select('*')
      .eq('tenant_id', req.auth.tid).eq('is_active', true)
      .order('name', { ascending: true })
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.post('/products', async (req, res, next) => {
  try {
    const { name, description, price, sku, category } = req.body
    if (!name) { res.status(400).json({ error: 'name required' }); return }
    // Plan limit: products (active only)
    const { data: tenantData } = await db.from('tenants').select('plan_slug').eq('id', req.auth.tid).single()
    const planLimits = PLAN_LIMITS[(tenantData?.plan_slug || 'pending') as PlanSlug] ?? PLAN_LIMITS.pending
    const { count: productCount } = await db.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', req.auth.tid).eq('is_active', true)
    if (planLimits.products !== null && (productCount ?? 0) >= planLimits.products) {
      throw new AppError('PLAN_LIMIT', `Seu plano permite ${planLimits.products} produtos`, 403)
    }
    const { data, error } = await db.from('products').insert({
      tenant_id: req.auth.tid, name, description, price: price || 0, sku, category,
    }).select().single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/products/:id', async (req, res, next) => {
  try {
    const update: any = { updated_at: new Date() }
    if (req.body.name !== undefined) update.name = req.body.name
    if (req.body.description !== undefined) update.description = req.body.description
    if (req.body.price !== undefined) update.price = req.body.price
    if (req.body.sku !== undefined) update.sku = req.body.sku
    if (req.body.category !== undefined) update.category = req.body.category
    if (req.body.is_active !== undefined) update.is_active = req.body.is_active
    const { data, error } = await db.from('products').update(update)
      .eq('id', req.params.id).eq('tenant_id', req.auth.tid).select().single()
    if (error || !data) { res.status(404).json({ error: 'Product not found' }); return }
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/products/:id', async (req, res, next) => {
  try {
    await db.from('products').update({ is_active: false })
      .eq('id', req.params.id).eq('tenant_id', req.auth.tid)
    res.json(ok({ message: 'Product deleted' }))
  } catch (err) { next(err) }
})

// ─── Purchases ────────────────────────────────────────────────────────────────

router.get('/contacts/:contactId/purchases', async (req, res, next) => {
  try {
    const { data, error } = await db.from('purchases')
      .select('*, products(name, price, sku)')
      .eq('tenant_id', req.auth.tid).eq('contact_id', req.params.contactId)
      .order('created_at', { ascending: false })
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

// POST /purchases/batch — pedido com múltiplos produtos
router.post('/purchases/batch', async (req, res, next) => {
  try {
    const { contactId, conversationId, items, discount, surcharge, shipping, coupon } = req.body
    if (!contactId || !items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'contactId and items[] required' }); return
    }
    // Busca preços de todos os produtos
    const productIds = items.map((i: any) => i.productId)
    const { data: productsData } = await db.from('products').select('id, price').in('id', productIds).eq('tenant_id', req.auth.tid)
    const priceMap: Record<string, number> = {}
    for (const p of (productsData || [])) priceMap[p.id] = Number(p.price)

    const disc = Number(discount) || 0
    const sur = Number(surcharge) || 0
    const ship = Number(shipping) || 0
    const created = []

    // Calcula subtotal geral pra distribuir ajustes proporcionalmente
    const itemSubs = items.map((item: any) => {
      const unitPrice = priceMap[item.productId] || 0
      return unitPrice * (item.qty || 1)
    })
    const orderSubtotal = itemSubs.reduce((a: number, b: number) => a + b, 0)

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx]
      const unitPrice = priceMap[item.productId] || 0
      const qty = item.qty || 1
      const subtotal = unitPrice * qty
      // Distribui ajustes proporcionalmente pelo peso de cada item
      const proportion = orderSubtotal > 0 ? subtotal / orderSubtotal : (1 / items.length)
      const itemDisc = Math.round(disc * proportion * 100) / 100
      const itemSur = Math.round(sur * proportion * 100) / 100
      const itemShip = Math.round(ship * proportion * 100) / 100
      const itemTotal = Math.max(0, subtotal - itemDisc + itemSur + itemShip)
      const { data, error } = await db.from('purchases').insert({
        tenant_id: req.auth.tid, contact_id: contactId, product_id: item.productId,
        conversation_id: conversationId || null, quantity: qty,
        unit_price: unitPrice, total_price: itemTotal,
        discount: itemDisc, surcharge: itemSur, shipping: itemShip,
        coupon: idx === 0 ? (coupon || null) : null,
      }).select('*, products(name, price, sku)').single()
      if (error) throw error
      created.push(data)
    }
    res.status(201).json(ok(created))
  } catch (err) { next(err) }
})

router.post('/purchases', async (req, res, next) => {
  try {
    const { contactId, productId, quantity, notes, conversationId, discount, surcharge, shipping, coupon } = req.body
    if (!contactId || !productId) { res.status(400).json({ error: 'contactId and productId required' }); return }
    const { data: product } = await db.from('products').select('price')
      .eq('id', productId).eq('tenant_id', req.auth.tid).single()
    if (!product) { res.status(404).json({ error: 'Product not found' }); return }
    const qty = quantity || 1
    const unitPrice = product.price
    const subtotal = unitPrice * qty
    const disc = Number(discount) || 0
    const sur = Number(surcharge) || 0
    const ship = Number(shipping) || 0
    const totalPrice = Math.max(0, subtotal - disc + sur + ship)
    const { data, error } = await db.from('purchases').insert({
      tenant_id: req.auth.tid, contact_id: contactId, product_id: productId,
      conversation_id: conversationId || null, quantity: qty,
      unit_price: unitPrice, total_price: totalPrice, notes,
      discount: disc, surcharge: sur, shipping: ship, coupon: coupon || null,
    }).select('*, products(name, price, sku)').single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/purchases/:id', async (req, res, next) => {
  try {
    const update: any = {}
    if (req.body.quantity !== undefined) update.quantity = req.body.quantity
    if (req.body.discount !== undefined) update.discount = Number(req.body.discount) || 0
    if (req.body.surcharge !== undefined) update.surcharge = Number(req.body.surcharge) || 0
    if (req.body.shipping !== undefined) update.shipping = Number(req.body.shipping) || 0
    if (req.body.coupon !== undefined) update.coupon = req.body.coupon || null
    if (req.body.notes !== undefined) update.notes = req.body.notes
    // Recalcular total se necessário
    if (Object.keys(update).length > 0) {
      const { data: current } = await db.from('purchases').select('unit_price, quantity, discount, surcharge, shipping')
        .eq('id', req.params.id).eq('tenant_id', req.auth.tid).single()
      if (!current) { res.status(404).json({ error: 'Purchase not found' }); return }
      const qty = update.quantity ?? current.quantity
      const disc = update.discount ?? current.discount ?? 0
      const sur = update.surcharge ?? current.surcharge ?? 0
      const ship = update.shipping ?? current.shipping ?? 0
      update.total_price = Math.max(0, (current.unit_price * qty) - disc + sur + ship)
    }
    const { data, error } = await db.from('purchases').update(update)
      .eq('id', req.params.id).eq('tenant_id', req.auth.tid)
      .select('*, products(name, price, sku)').single()
    if (error) throw error
    if (!data) { res.status(404).json({ error: 'Purchase not found' }); return }
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/purchases/:id', async (req, res, next) => {
  try {
    await db.from('purchases').delete()
      .eq('id', req.params.id).eq('tenant_id', req.auth.tid)
    res.json(ok({ message: 'Purchase deleted' }))
  } catch (err) { next(err) }
})

router.get('/purchases/by-contact', async (req, res, next) => {
  try {
    const { data, error } = await db.from('purchases')
      .select('id, contact_id, quantity, unit_price, total_price, discount, surcharge, shipping, coupon, products(name, price, sku)')
      .eq('tenant_id', req.auth.tid)
      .order('created_at', { ascending: false })
    if (error) throw error
    const grouped: Record<string, any[]> = {}
    for (const p of (data || [])) {
      if (!grouped[p.contact_id]) grouped[p.contact_id] = []
      grouped[p.contact_id].push(p)
    }
    res.json(ok(grouped))
  } catch (err) { next(err) }
})

router.get('/purchases/summary', async (req, res, next) => {
  try {
    const { data, error } = await db.from('purchases')
      .select('product_id, products(name, price), quantity, unit_price, total_price, discount, surcharge, shipping')
      .eq('tenant_id', req.auth.tid)
    if (error) throw error
    const summary: Record<string, {
      productId: string; name: string; unitPrice: number;
      totalQty: number; totalSales: number; // nº de pedidos
      subtotal: number; totalDiscount: number; totalSurcharge: number; totalShipping: number; totalRevenue: number;
      avgTicket: number;
    }> = {}
    for (const p of (data || [])) {
      const pid = p.product_id
      if (!summary[pid]) summary[pid] = {
        productId: pid, name: (p as any).products?.name || '', unitPrice: (p as any).products?.price || 0,
        totalQty: 0, totalSales: 0, subtotal: 0,
        totalDiscount: 0, totalSurcharge: 0, totalShipping: 0, totalRevenue: 0, avgTicket: 0,
      }
      summary[pid].totalQty += p.quantity
      summary[pid].totalSales += 1
      summary[pid].subtotal += Number(p.unit_price || 0) * p.quantity
      summary[pid].totalDiscount += Number(p.discount || 0)
      summary[pid].totalSurcharge += Number(p.surcharge || 0)
      summary[pid].totalShipping += Number(p.shipping || 0)
      summary[pid].totalRevenue += Number(p.total_price || 0)
    }
    // Calcula ticket médio
    for (const s of Object.values(summary)) {
      s.avgTicket = s.totalSales > 0 ? s.totalRevenue / s.totalSales : 0
    }
    res.json(ok(Object.values(summary)))
  } catch (err) { next(err) }
})

export default router