import { Router } from 'express'
import { z } from 'zod'
import { contactService } from '../services/contact.service'
import { requireAuth, requireRole, validate } from '../middleware/contact.middleware'
import { ok, paginationSchema } from '@autozap/utils'

const router = Router()
router.use(requireAuth)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createContactSchema = z.object({
  phone: z.string().min(8),
  name: z.string().optional(),
  email: z.string().email().optional(),
  company: z.string().optional(),
  origin: z.string().optional(),
  notes: z.string().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
})

const updateContactSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional().nullable(),
  company: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(['active', 'blocked', 'unsubscribed']).optional(),
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
    const contact = await contactService.createContact({ tenantId: req.auth.tid, ...req.body })
    res.status(201).json(ok(contact))
  } catch (err) { next(err) }
})

// GET /contacts/export — download CSV
router.get('/contacts/export', async (req, res, next) => {
  try {
    const csv = await contactService.exportContacts(req.auth.tid)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv')
    res.send(csv)
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

// DELETE /contacts/:id
router.delete('/contacts/:id', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    await contactService.deleteContact(req.params.id, req.auth.tid)
    res.json(ok({ message: 'Contact deleted' }))
  } catch (err) { next(err) }
})

// POST /contacts/:id/tags — add tags
router.post('/contacts/:id/tags', validate(addTagsSchema), async (req, res, next) => {
  try {
    await contactService.addTags(req.params.id, req.body.tagIds)
    res.json(ok({ message: 'Tags added' }))
  } catch (err) { next(err) }
})

// DELETE /contacts/:id/tags — remove tags
router.delete('/contacts/:id/tags', validate(addTagsSchema), async (req, res, next) => {
  try {
    await contactService.removeTags(req.params.id, req.body.tagIds)
    res.json(ok({ message: 'Tags removed' }))
  } catch (err) { next(err) }
})

// ─── Tags ─────────────────────────────────────────────────────────────────────

// GET /tags
router.get('/tags', async (req, res, next) => {
  try {
    const tags = await contactService.listTags(req.auth.tid)
    res.json(ok(tags))
  } catch (err) { next(err) }
})

// POST /tags
router.post('/tags', validate(tagSchema), async (req, res, next) => {
  try {
    const tag = await contactService.createTag(req.auth.tid, req.body.name, req.body.color)
    res.status(201).json(ok(tag))
  } catch (err) { next(err) }
})

// DELETE /tags/:id
router.delete('/tags/:id', requireRole('admin', 'owner'), async (req, res, next) => {
  try {
    await contactService.deleteTag(req.params.id, req.auth.tid)
    res.json(ok({ message: 'Tag deleted' }))
  } catch (err) { next(err) }
})

// ─── Import CSV ───────────────────────────────────────────────────────────────

// POST /contacts/import
router.post('/contacts/import', async (req, res, next) => {
  try {
    const { rows } = req.body
    if (!Array.isArray(rows)) throw new Error('rows must be an array')
    const result = await contactService.importContacts(req.auth.tid, rows)
    res.json(ok(result))
  } catch (err) { next(err) }
})

export default router
