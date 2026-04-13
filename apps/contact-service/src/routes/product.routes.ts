import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, validate, ok, db, AppError, cachedGet } from '@autozap/utils'
import { PLAN_LIMITS, type PlanSlug } from '@autozap/types'
import crypto from 'crypto'

const router = Router()
router.use(requireAuth)


const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.number().min(0).optional(),
  description: z.string().max(2000).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  image_url: z.string().max(2000).optional().nullable(),
})

const updateProductSchema = z.object({
  name: z.string().max(255).optional(),
  price: z.number().min(0).optional(),
  description: z.string().max(2000).optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  image_url: z.string().max(2000).optional().nullable(),

})

const dealAdjustmentsSchema = z.object({
  discount: z.number().min(0),
  surcharge: z.number().min(0),
  shipping: z.number().min(0),
  coupon: z.string().max(50).optional(),
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

router.post('/products', validate(createProductSchema), async (req, res, next) => {
  try {
    const { name, description, price, sku, category, image_url } = req.body
    // Plan limit: products (active only)
    const productPlanSlug = await cachedGet(`tenant-plan:${req.auth.tid}`, 120, async () => {
      const { data } = await db.from('tenants').select('plan_slug').eq('id', req.auth.tid).single()
      return (data?.plan_slug || 'pending') as PlanSlug
    })
    const planLimits = PLAN_LIMITS[productPlanSlug] ?? PLAN_LIMITS.pending
    const { count: productCount } = await db.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', req.auth.tid).eq('is_active', true)
    if (planLimits.products !== null && (productCount ?? 0) >= planLimits.products) {
      throw new AppError('PLAN_LIMIT', `Seu plano permite ${planLimits.products} produtos`, 403)
    }
    const { data, error } = await db.from('products').insert({
      id: (await import('@autozap/utils')).generateId(),
      tenant_id: req.auth.tid, name, description: description || null, price: price || 0, sku: sku || null, category: category || null, image_url: image_url || null, is_active: true,
    }).select().single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/products/:id', validate(updateProductSchema), async (req, res, next) => {
  try {
    const update: any = { updated_at: new Date() }
    if (req.body.name !== undefined) update.name = req.body.name
    if (req.body.description !== undefined) update.description = req.body.description
    if (req.body.price !== undefined) update.price = req.body.price
    if (req.body.sku !== undefined) update.sku = req.body.sku
    if (req.body.category !== undefined) update.category = req.body.category
    if (req.body.image_url !== undefined) update.image_url = req.body.image_url
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
// ── Tenant ownership helper ──────────────────────────────────────────────────
async function validateContactOwnership(contactId: string, tenantId: string): Promise<void> {
  const { data } = await db.from('contacts').select('id').eq('id', contactId).eq('tenant_id', tenantId).maybeSingle()
  if (!data) throw new AppError('FORBIDDEN', 'Contato não encontrado ou não pertence à sua conta', 403)
}

const batchPurchaseSchema = z.object({
  contactId: z.string().uuid(),
  conversationId: z.string().uuid().optional().nullable(),
  items: z.array(z.object({ productId: z.string().uuid(), qty: z.number().int().min(1).default(1) })).min(1),
  discount: z.number().min(0).optional(),
  surcharge: z.number().min(0).optional(),
  shipping: z.number().min(0).optional(),
  coupon: z.string().optional().nullable(),
})

router.post('/purchases/batch', async (req, res, next) => {
  try {
    const parsed = batchPurchaseSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }); return }
    const { contactId, conversationId, items, discount, surcharge, shipping, coupon } = parsed.data
    await validateContactOwnership(contactId, req.auth.tid)
    // Busca preços de todos os produtos
    const productIds = items.map((i: any) => i.productId)
    const { data: productsData } = await db.from('products').select('id, price').in('id', productIds).eq('tenant_id', req.auth.tid)
    const priceMap: Record<string, number> = {}
    for (const p of (productsData || [])) priceMap[p.id] = Number(p.price)

    const disc = Number(discount) || 0
    const sur = Number(surcharge) || 0
    const ship = Number(shipping) || 0
    const orderId = crypto.randomUUID()
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
      // Desconto e acréscimo proporcionais, frete inteiro só no primeiro item
      const proportion = orderSubtotal > 0 ? subtotal / orderSubtotal : (1 / items.length)
      const itemDisc = Math.round(disc * proportion * 100) / 100
      const itemSur = Math.round(sur * proportion * 100) / 100
      const isFirst = idx === 0
      const itemTotal = Math.max(0, subtotal - itemDisc + itemSur)
      const { data, error } = await db.from('purchases').insert({
        tenant_id: req.auth.tid, contact_id: contactId, product_id: item.productId,
        conversation_id: conversationId || null, quantity: qty,
        unit_price: unitPrice, total_price: itemTotal,
        discount: itemDisc, surcharge: itemSur,
        shipping: isFirst ? ship : 0,
        coupon: isFirst ? (coupon || null) : null,
        order_id: orderId,
      }).select('*, products(name, price, sku)').single()
      if (error) throw error
      created.push(data)
    }
    res.status(201).json(ok(created))
  } catch (err) { next(err) }
})

const createPurchaseSchema = z.object({
  contactId: z.string().uuid('contactId inválido'),
  productId: z.string().uuid('productId inválido'),
  quantity: z.number().int().min(1).optional().default(1),
  notes: z.string().optional(),
  conversationId: z.string().uuid().optional().nullable(),
  discount: z.number().min(0).optional().default(0),
  surcharge: z.number().min(0).optional().default(0),
  shipping: z.number().min(0).optional().default(0),
  coupon: z.string().optional(),
})

router.post('/purchases', validate(createPurchaseSchema), async (req, res, next) => {
  try {
    const { contactId, productId, quantity, notes, conversationId, discount, surcharge, shipping, coupon } = req.body
    await validateContactOwnership(contactId, req.auth.tid)
    const { data: product } = await db.from('products').select('price')
      .eq('id', productId).eq('tenant_id', req.auth.tid).single()
    if (!product) { res.status(404).json({ error: 'Product not found' }); return }
    const qty = quantity || 1
    const unitPrice = product.price
    const subtotal = unitPrice * qty
    const disc = Number(discount) || 0
    const sur = Number(surcharge) || 0
    const ship = Number(shipping) || 0
    const totalPrice = Math.max(0, subtotal - disc + sur)
    const { data, error } = await db.from('purchases').insert({
      tenant_id: req.auth.tid, contact_id: contactId, product_id: productId,
      conversation_id: conversationId || null, quantity: qty,
      unit_price: unitPrice, total_price: totalPrice, notes,
      order_id: crypto.randomUUID(),
      discount: disc, surcharge: sur, shipping: ship, coupon: coupon || null,
    }).select('*, products(name, price, sku)').single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

const updatePurchaseSchema = z.object({
  quantity: z.number().int().min(1).optional(),
  discount: z.number().min(0).optional(),
  surcharge: z.number().min(0).optional(),
  shipping: z.number().min(0).optional(),
  coupon: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
})

router.patch('/purchases/:id', validate(updatePurchaseSchema), async (req, res, next) => {
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
      update.total_price = Math.max(0, (current.unit_price * qty) - disc + sur)
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
      .select('id, contact_id, order_id, quantity, unit_price, total_price, discount, surcharge, shipping, coupon, created_at, products(name, price, sku)')
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
