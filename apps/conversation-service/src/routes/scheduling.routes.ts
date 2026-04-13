import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, validate, ok, db, generateId } from '@autozap/utils'

const router = Router()
router.use(requireAuth)

// ─── Agendamentos — Scheduling Config ────────────────────────────────────────

/*
-- SQL para criar tabelas no Supabase:

CREATE TABLE scheduling_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Horário de atendimento',
  slot_duration_minutes INT NOT NULL DEFAULT 30,
  days_available JSONB NOT NULL DEFAULT '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}',
  start_time TEXT NOT NULL DEFAULT '09:00',
  end_time TEXT NOT NULL DEFAULT '18:00',
  break_start TEXT,
  break_end TEXT,
  advance_days INT NOT NULL DEFAULT 7,
  reminder_minutes INT NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES channels(id) ON DELETE SET NULL,
  config_id UUID NOT NULL REFERENCES scheduling_config(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  notes TEXT,
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_tenant_date ON appointments(tenant_id, date);
CREATE INDEX idx_appointments_contact ON appointments(contact_id);
CREATE INDEX idx_appointments_config ON appointments(config_id);
CREATE INDEX idx_scheduling_config_tenant ON scheduling_config(tenant_id);
*/

const schedulingConfigSchema = z.object({
  name: z.string().min(1).max(200).optional().default('Horário de atendimento'),
  slotDurationMinutes: z.number().int().min(5).max(480).optional().default(30),
  daysAvailable: z.record(z.string(), z.boolean()).optional().default({ mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().default('09:00'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().default('18:00'),
  breakStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional().default(null),
  breakEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional().default(null),
  advanceDays: z.number().int().min(1).max(90).optional().default(7),
  reminderMinutes: z.number().int().min(0).max(1440).optional().default(60),
  isActive: z.boolean().optional().default(true),
})

const appointmentCreateSchema = z.object({
  contactId: z.string().uuid(),
  conversationId: z.string().uuid().nullable().optional(),
  channelId: z.string().uuid().nullable().optional(),
  configId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).optional().default('scheduled'),
  notes: z.string().max(2000).nullable().optional(),
})

const appointmentUpdateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  notes: z.string().max(2000).nullable().optional(),
  reminderSent: z.boolean().optional(),
})

router.get('/scheduling', async (req, res, next) => {
  try {
    const { data, error } = await db
      .from('scheduling_config')
      .select('*')
      .eq('tenant_id', req.auth.tid)
      .order('created_at', { ascending: true })
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.post('/scheduling', validate(schedulingConfigSchema), async (req, res, next) => {
  try {
    const { name, slotDurationMinutes, daysAvailable, startTime, endTime, breakStart, breakEnd, advanceDays, reminderMinutes, isActive } = req.body
    const { data, error } = await db
      .from('scheduling_config')
      .insert({
        tenant_id: req.auth.tid,
        name,
        slot_duration_minutes: slotDurationMinutes,
        days_available: daysAvailable,
        start_time: startTime,
        end_time: endTime,
        break_start: breakStart || null,
        break_end: breakEnd || null,
        advance_days: advanceDays,
        reminder_minutes: reminderMinutes,
        is_active: isActive,
      })
      .select()
      .single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/scheduling/:id', async (req, res, next) => {
  try {
    const update: any = {}
    if (req.body.name !== undefined) update.name = req.body.name
    if (req.body.slotDurationMinutes !== undefined) update.slot_duration_minutes = req.body.slotDurationMinutes
    if (req.body.daysAvailable !== undefined) update.days_available = req.body.daysAvailable
    if (req.body.startTime !== undefined) update.start_time = req.body.startTime
    if (req.body.endTime !== undefined) update.end_time = req.body.endTime
    if (req.body.breakStart !== undefined) update.break_start = req.body.breakStart
    if (req.body.breakEnd !== undefined) update.break_end = req.body.breakEnd
    if (req.body.advanceDays !== undefined) update.advance_days = req.body.advanceDays
    if (req.body.reminderMinutes !== undefined) update.reminder_minutes = req.body.reminderMinutes
    if (req.body.isActive !== undefined) update.is_active = req.body.isActive
    const { data, error } = await db
      .from('scheduling_config')
      .update(update)
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select()
      .single()
    if (error || !data) { res.status(404).json({ error: 'Config não encontrada' }); return }
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/scheduling/:id', async (req, res, next) => {
  try {
    const { error } = await db
      .from('scheduling_config')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
    if (error) throw error
    res.json(ok({ message: 'Config de agendamento excluída' }))
  } catch (err) { next(err) }
})

// ─── Agendamentos — Appointments ─────────────────────────────────────────────

router.get('/appointments', async (req, res, next) => {
  try {
    const { date, status, contactId } = req.query as any
    let query = db
      .from('appointments')
      .select('*, contacts(id, name, phone), scheduling_config(id, name, slot_duration_minutes)')
      .eq('tenant_id', req.auth.tid)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(200)
    if (date) query = query.eq('date', date)
    if (status && status !== 'all') query = query.eq('status', status)
    if (contactId) query = query.eq('contact_id', contactId)
    const { data, error } = await query
    if (error) throw error
    res.json(ok(data || []))
  } catch (err) { next(err) }
})

router.get('/appointments/available-slots', async (req, res, next) => {
  try {
    const { configId, date } = req.query as any
    if (!configId || !date) { res.status(400).json({ error: 'configId and date are required' }); return }

    // 1. Busca config
    const { data: config, error: configError } = await db
      .from('scheduling_config')
      .select('*')
      .eq('id', configId)
      .eq('tenant_id', req.auth.tid)
      .single()
    if (configError || !config) { res.status(404).json({ error: 'Config não encontrada' }); return }
    if (!config.is_active) { res.json(ok([])); return }

    // Verifica se o dia da semana está disponível
    const dayMap: Record<number, string> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' }
    const dateObj = new Date(date + 'T00:00:00')
    const dayKey = dayMap[dateObj.getUTCDay()]
    if (!config.days_available[dayKey]) { res.json(ok([])); return }

    // Verifica advance_days
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const maxDate = new Date(today)
    maxDate.setDate(maxDate.getDate() + config.advance_days)
    if (dateObj < today || dateObj > maxDate) { res.json(ok([])); return }

    // 2. Gera todos os slots possíveis
    const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const formatTime = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

    const startMins = parseTime(config.start_time)
    const endMins = parseTime(config.end_time)
    const breakStartMins = config.break_start ? parseTime(config.break_start) : null
    const breakEndMins = config.break_end ? parseTime(config.break_end) : null
    const duration = config.slot_duration_minutes

    const allSlots: { start: string; end: string }[] = []
    for (let t = startMins; t + duration <= endMins; t += duration) {
      const slotEnd = t + duration
      // Pula slots que colidem com o intervalo
      if (breakStartMins !== null && breakEndMins !== null) {
        if (t < breakEndMins && slotEnd > breakStartMins) continue
      }
      allSlots.push({ start: formatTime(t), end: formatTime(slotEnd) })
    }

    // 3. Filtra slots já ocupados
    const { data: booked } = await db
      .from('appointments')
      .select('start_time, end_time')
      .eq('tenant_id', req.auth.tid)
      .eq('config_id', configId)
      .eq('date', date)
      .neq('status', 'cancelled')

    const bookedSet = new Set((booked || []).map((b: any) => `${b.start_time}-${b.end_time}`))
    const available = allSlots.filter(s => !bookedSet.has(`${s.start}-${s.end}`))

    res.json(ok(available))
  } catch (err) { next(err) }
})

router.post('/appointments', validate(appointmentCreateSchema), async (req, res, next) => {
  try {
    const { contactId, conversationId, channelId, configId, date, startTime, endTime, status, notes } = req.body

    // Valida que config pertence ao tenant
    const { data: config } = await db.from('scheduling_config').select('id').eq('id', configId).eq('tenant_id', req.auth.tid).single()
    if (!config) { res.status(404).json({ error: 'Config não encontrada' }); return }

    // Valida que contato pertence ao tenant
    const { data: contact } = await db.from('contacts').select('id').eq('id', contactId).eq('tenant_id', req.auth.tid).single()
    if (!contact) { res.status(404).json({ error: 'Contato não encontrado' }); return }

    // Verifica conflito de horário
    const { data: conflict } = await db
      .from('appointments')
      .select('id')
      .eq('tenant_id', req.auth.tid)
      .eq('config_id', configId)
      .eq('date', date)
      .eq('start_time', startTime)
      .neq('status', 'cancelled')
      .limit(1)
    if (conflict && conflict.length > 0) { res.status(409).json({ error: 'Horário já ocupado' }); return }

    const { data, error } = await db
      .from('appointments')
      .insert({
        tenant_id: req.auth.tid,
        contact_id: contactId,
        conversation_id: conversationId || null,
        channel_id: channelId || null,
        config_id: configId,
        date,
        start_time: startTime,
        end_time: endTime,
        status: status || 'scheduled',
        notes: notes || null,
      })
      .select('*, contacts(id, name, phone)')
      .single()
    if (error) throw error
    res.status(201).json(ok(data))
  } catch (err) { next(err) }
})

router.patch('/appointments/:id', validate(appointmentUpdateSchema), async (req, res, next) => {
  try {
    const update: any = { updated_at: new Date().toISOString() }
    if (req.body.date !== undefined) update.date = req.body.date
    if (req.body.startTime !== undefined) update.start_time = req.body.startTime
    if (req.body.endTime !== undefined) update.end_time = req.body.endTime
    if (req.body.status !== undefined) update.status = req.body.status
    if (req.body.notes !== undefined) update.notes = req.body.notes
    if (req.body.reminderSent !== undefined) update.reminder_sent = req.body.reminderSent

    // Se estiver reagendando, verifica conflito
    if (update.date && update.start_time) {
      const { data: existing } = await db.from('appointments').select('config_id').eq('id', req.params.id).eq('tenant_id', req.auth.tid).single()
      if (existing) {
        const { data: conflict } = await db
          .from('appointments')
          .select('id')
          .eq('tenant_id', req.auth.tid)
          .eq('config_id', existing.config_id)
          .eq('date', update.date)
          .eq('start_time', update.start_time)
          .neq('status', 'cancelled')
          .neq('id', req.params.id)
          .limit(1)
        if (conflict && conflict.length > 0) { res.status(409).json({ error: 'Horário já ocupado' }); return }
      }
    }

    const { data, error } = await db
      .from('appointments')
      .update(update)
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select('*, contacts(id, name, phone)')
      .single()
    if (error || !data) { res.status(404).json({ error: 'Agendamento não encontrado' }); return }
    res.json(ok(data))
  } catch (err) { next(err) }
})

router.delete('/appointments/:id', async (req, res, next) => {
  try {
    // Cancela ao invés de deletar hard, para manter histórico
    const { data, error } = await db
      .from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('tenant_id', req.auth.tid)
      .select()
      .single()
    if (error || !data) { res.status(404).json({ error: 'Agendamento não encontrado' }); return }
    res.json(ok({ message: 'Agendamento cancelado' }))
  } catch (err) { next(err) }
})

export default router// deploy 1775502038
