import { db, logger, generateId, decryptCredentials } from '@autozap/utils'
import { interpolate, sendMessage, logNode, cached, emitPusher } from '../helpers'
import type { FlowContext, FlowNodeData, FlowNodeRow, FlowEdgeRow, NodeResult } from '../types'

type EdgeMap = Map<string, FlowEdgeRow[]>
type NodeMap = Map<string, FlowNodeRow>

export async function executeGoogleCalendarNode(
  node: any, ctx: FlowContext, flowId: string, data: any,
  variables: Record<string, string>, loopCounters: Record<string, number>, stateId?: string
): Promise<{ success: boolean; paused?: boolean; ended?: boolean } | null> {
  const calendarId = data?.googleCalendarId
  if (!calendarId) { await logNode(flowId, node.id, ctx, 'error', 'Google Calendar não configurado'); return null }

  // Get tenant Google tokens
  const { data: tenant } = await db.from('tenants').select('metadata').eq('id', ctx.tenantId).single()
  const meta = tenant?.metadata || {}
  if (!meta.google_access_token) { await logNode(flowId, node.id, ctx, 'error', 'Google não conectado'); return null }

  const { google } = require('googleapis')
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
  oauth2Client.setCredentials({
    access_token: meta.google_access_token,
    refresh_token: meta.google_refresh_token,
  })

  // Auto-refresh tokens
  oauth2Client.on('tokens', async (tokens: any) => {
    if (tokens.access_token) {
      await db.from('tenants').update({
        metadata: { ...meta, google_access_token: tokens.access_token, google_token_expiry: tokens.expiry_date },
        updated_at: new Date(),
      }).eq('id', ctx.tenantId)
    }
  })

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  // Se é um nó diferente do que estava em waiting, resetar pro step 1
  // Isso evita que states de outro nó de agendamento interfiram
  const prevNodeId = variables['_schedule_node_id']
  if (prevNodeId && prevNodeId !== node.id) {
    // Limpa variáveis de agendamento anterior
    Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
  }
  variables['_schedule_node_id'] = node.id

  // ── Cancel mode ──────────────────────────────────────────────────────────
  if ((data?.calendarAction || 'schedule') === 'cancel') {
    return await executeCancelAppointment(node, ctx, flowId, data, variables, loopCounters, stateId, calendar, calendarId)
  }

  // Detect channel type for Evolution all-at-once mode
  const { data: channelInfo } = await cached(`channel-type:${ctx.channelId}`, 60_000, async () => {
    return await db.from('channels').select('type').eq('id', ctx.channelId).single()
  })
  const isEvolution = channelInfo?.type === 'evolution'

  const step = variables['_schedule_step'] || '1'

  const duration = data?.eventDuration || 60
  const isFullDay = duration >= 720 // 12h+ = dia inteiro
  const workStart = data?.workStart || '08:00'
  const workEnd = data?.workEnd || '18:00'
  const workDays = data?.workDays || { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }
  const advanceDays = data?.advanceDays || 7
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const fullDayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

  if (step === '1') {
    // Step 1: Show only days that have at least 1 available slot
    const today = new Date()
    const days: string[] = []
    const priceTable = data?.priceTable || {}

    // Collect candidate days
    const candidateDays: { dateStr: string; dayName: string; dd: string; mm: string; dayKey: string }[] = []
    for (let i = 0; i <= advanceDays; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      const dayKey = dayKeys[d.getDay()]
      if (workDays[dayKey]) {
        candidateDays.push({
          dateStr: d.toISOString().split('T')[0],
          dayName: fullDayNames[d.getDay()],
          dd: String(d.getDate()).padStart(2, '0'),
          mm: String(d.getMonth() + 1).padStart(2, '0'),
          dayKey,
        })
      }
    }

    // Query Google Calendar for the entire date range to check availability
    let busyByDay: Record<string, { start: string; end: string }[]> = {}
    if (candidateDays.length > 0) {
      try {
        const rangeStart = candidateDays[0].dateStr
        const lastDate = candidateDays[candidateDays.length - 1].dateStr
        const nextDay = new Date(`${lastDate}T12:00:00`)
        nextDay.setDate(nextDay.getDate() + 1)
        const rangeEnd = nextDay.toISOString().split('T')[0]

        const { data: busyData } = await calendar.freebusy.query({
          requestBody: {
            timeMin: `${rangeStart}T00:00:00-03:00`,
            timeMax: `${rangeEnd}T00:00:00-03:00`,
            timeZone: 'America/Sao_Paulo',
            items: [{ id: calendarId }],
          },
        })

        const allBusy = busyData.calendars?.[calendarId]?.busy || []
        logger.info('Freebusy pre-check result', { calendarId: calendarId.slice(0, 20), rangeStart, rangeEnd, busyCount: allBusy.length, busyPeriods: allBusy.map((b: any) => `${b.start} - ${b.end}`) })
        for (const busy of allBusy) {
          // Mark ALL days covered by this busy period, not just the start
          const bStart = new Date(busy.start)
          const bEnd = new Date(busy.end)
          const cursor = new Date(bStart)
          while (cursor < bEnd) {
            const dayStr = cursor.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
            if (!busyByDay[dayStr]) busyByDay[dayStr] = []
            busyByDay[dayStr].push(busy)
            cursor.setDate(cursor.getDate() + 1)
          }
        }
        logger.info('BusyByDay', { days: Object.keys(busyByDay), candidateDates: candidateDays.map(d => d.dateStr) })
      } catch (err: any) {
        logger.warn('Freebusy pre-check failed, showing all days', { err: err.message })
      }
    }

    // Generate time slots
    const [sH, sM] = workStart.split(':').map(Number)
    const [eH, eM] = workEnd.split(':').map(Number)
    const slotEndMin = (eH === 0 && eM === 0) ? 24 * 60 : eH * 60 + eM

    // Filter: only show days that have at least 1 available slot
    const dayRows: { id: string; title: string }[] = []
    for (const cd of candidateDays) {
      let hasAvailable = false

      if (isFullDay) {
        // Full day: check if day has price=0 (unavailable) or any event
        const priceKey = `${cd.dayKey}_dia`
        if (priceTable[priceKey] === 0) continue
        const dayBusy = busyByDay[cd.dateStr] || []
        hasAvailable = dayBusy.length === 0
      } else {
        let slotMin = sH * 60 + sM
        while (slotMin + duration <= slotEndMin) {
          const slotTime = `${String(Math.floor(slotMin / 60)).padStart(2, '0')}:${String(slotMin % 60).padStart(2, '0')}`
          const priceKey = `${cd.dayKey}_${slotTime}`
          if (priceTable[priceKey] === 0) { slotMin += duration; continue }

          const slotStartMs = new Date(`${cd.dateStr}T${slotTime}:00-03:00`).getTime()
          const slotEndMs = slotStartMs + duration * 60 * 1000
          const dayBusy = busyByDay[cd.dateStr] || []
          const isBusy = dayBusy.some(b => {
            const bStart = new Date(b.start).getTime()
            const bEnd = new Date(b.end).getTime()
            return slotStartMs < bEnd && slotEndMs > bStart
          })

          if (!isBusy) { hasAvailable = true; break }
          slotMin += duration
        }
      }

      if (hasAvailable) {
        const idx = dayRows.length + 1
        dayRows.push({ id: `day_${idx}`, title: `${cd.dayName} ${cd.dd}/${cd.mm}` })
        days.push(`${idx}`)
        variables[`_schedule_day_${idx}`] = cd.dateStr
      }
    }

    if (dayRows.length === 0) {
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: data?.msgNoSlots || 'Desculpe, não temos horários disponíveis no momento.' })
      variables['agendamento_status'] = 'sem_horario'
      Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
      return { success: true }
    }

    // ── Evolution: all-at-once mode (show all days + times + prices in one message) ──
    if (isEvolution && !isFullDay) {
      const priceTable = data?.priceTable || {}
      const [sH, sM] = workStart.split(':').map(Number)
      const [eH, eM] = workEnd.split(':').map(Number)
      const slotEndMin = (eH === 0 && eM === 0) ? 24 * 60 : eH * 60 + eM

      let globalIdx = 1
      const lines: string[] = []
      const slotMap: Record<number, { date: string; time: string; price?: number }> = {}

      for (const cd of candidateDays.filter(c => dayRows.some(r => r.title.includes(c.dd + '/' + c.mm)))) {
        const dayBusy = busyByDay[cd.dateStr] || []
        let slotMin = sH * 60 + sM
        const daySlots: string[] = []

        while (slotMin + duration <= slotEndMin) {
          const slotTime = `${String(Math.floor(slotMin / 60)).padStart(2, '0')}:${String(slotMin % 60).padStart(2, '0')}`
          const priceKey = `${cd.dayKey}_${slotTime}`
          if (priceTable[priceKey] === 0) { slotMin += duration; continue }

          const slotStartMs = new Date(`${cd.dateStr}T${slotTime}:00-03:00`).getTime()
          const slotEndMs2 = slotStartMs + duration * 60 * 1000
          const isBusy = dayBusy.some((b: any) => {
            const bStart = new Date(b.start).getTime()
            const bEnd = new Date(b.end).getTime()
            return slotStartMs < bEnd && slotEndMs2 > bStart
          })

          if (!isBusy) {
            const price = priceTable[priceKey]
            const priceLabel = price ? ` - R$ ${price}` : ''
            daySlots.push(`${globalIdx}. ${slotTime}${priceLabel}`)
            slotMap[globalIdx] = { date: cd.dateStr, time: slotTime, price }
            globalIdx++
          }
          slotMin += duration
        }

        if (daySlots.length > 0) {
          lines.push(`\n*${cd.dayName} ${cd.dd}/${cd.mm}:*`)
          lines.push(...daySlots)
        }
      }

      if (Object.keys(slotMap).length === 0) {
        variables['agendamento_status'] = 'sem_horario'
        Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
        return { success: true }
      }

      const showBackDays2 = data?.showBackDays !== false
      if (showBackDays2) lines.push(`\n0. ↩ Voltar`)

      const allMsg = `📅 Horários disponíveis:\n${lines.join('\n')}\n\nDigite o número.`
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: allMsg })

      // Save slot map in variables for step resolution
      variables['_schedule_step'] = 'evo_pick'
      variables['_schedule_slot_map'] = JSON.stringify(slotMap)
      variables['_schedule_total_options'] = String(Object.keys(slotMap).length)

      const inputStateId = stateId || generateId()
      await db.from('flow_states').upsert({
        id: inputStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
        conversation_id: ctx.conversationId, current_node_id: node.id,
        variables, loop_counters: loopCounters, waiting_variable: '_schedule_evo_choice',
        status: 'waiting', updated_at: new Date(),
      }, { onConflict: 'flow_id,conversation_id' })
      return { success: true, paused: true }
    }

    // ── Standard mode (step by step) ──
    const msg = data?.msgAskDate || '📅 Escolha o dia para agendamento:'
    const showBackDays = data?.showBackDays !== false
    if (showBackDays) dayRows.push({ id: 'voltar_menu', title: '↩ Voltar' })
    if (dayRows.length <= 3) {
      const buttons = dayRows.map(r => ({ id: r.id, title: r.title }))
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: msg, interactiveType: 'button', buttons })
    } else {
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: msg, interactiveType: 'list', listRows: dayRows, listButtonText: data?.listButtonDays || 'Ver dias' })
    }

    variables['_schedule_step'] = '2'
    variables['_schedule_total_days'] = String(days.length)
    variables['_schedule_calendar_id'] = calendarId

    const inputStateId = stateId || generateId()
    await db.from('flow_states').upsert({
      id: inputStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
      conversation_id: ctx.conversationId, current_node_id: node.id,
      variables, loop_counters: loopCounters, waiting_variable: '_schedule_day_choice',
      status: 'waiting', updated_at: new Date(),
    }, { onConflict: 'flow_id,conversation_id' })
    return { success: true, paused: true }
  }

  // ── Evolution all-at-once: user picked a number ──
  if (step === 'evo_pick') {
    const evoResponse = (variables['_schedule_evo_choice'] || '').trim()

    if (evoResponse === '0' || evoResponse.toLowerCase().includes('voltar')) {
      variables['agendamento_status'] = 'voltou'
      Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
      return { success: true }
    }

    const num = parseInt(evoResponse)
    let slotMap: Record<string, { date: string; time: string; price?: number }> = {}
    try { slotMap = JSON.parse(variables['_schedule_slot_map'] || '{}') } catch {}

    const selected = slotMap[String(num)]
    if (!selected) {
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Por favor, digite um número válido.' })
      variables['_schedule_step'] = '1'
      Object.keys(variables).filter(k => k.startsWith('_schedule_') && k !== '_schedule_node_id').forEach(k => delete variables[k])
      return await executeGoogleCalendarNode(node, ctx, flowId, data, variables, loopCounters, stateId)
    }

    const selectedDate = selected.date
    const selectedTime = selected.time
    const { data: contactInfo2 } = await db.from('contacts').select('name').eq('id', ctx.contactId).single()
    const contactName2 = contactInfo2?.name || ctx.phone

    const tz = 'America/Sao_Paulo'
    const [sh2, sm2] = selectedTime.split(':').map(Number)
    const endMinTotal2 = sh2 * 60 + sm2 + duration
    let endDate2 = selectedDate
    let endHour2 = Math.floor(endMinTotal2 / 60)
    const endMinute2 = endMinTotal2 % 60
    if (endHour2 >= 24) { endHour2 -= 24; const nd = new Date(`${selectedDate}T12:00:00`); nd.setDate(nd.getDate() + 1); endDate2 = nd.toISOString().split('T')[0] }
    const endTime2 = `${String(endHour2).padStart(2, '0')}:${String(endMinute2).padStart(2, '0')}`
    const eventTitle2 = interpolate(data?.eventTitle || 'Reserva - {{name}}', ctx, { ...variables, name: contactName2 })

    try {
      const event = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: eventTitle2,
          description: `Agendado via WhatsApp\nCliente: ${contactName2}\nTelefone: +${ctx.phone}`,
          start: { dateTime: `${selectedDate}T${selectedTime}:00`, timeZone: tz },
          end: { dateTime: `${endDate2}T${endTime2}:00`, timeZone: tz },
        },
      })

      const dd = selectedDate.split('-')[2]
      const mm = selectedDate.split('-')[1]
      variables['agendamento_data'] = `${dd}/${mm}`
      variables['agendamento_horario'] = selectedTime
      variables['agendamento_valor'] = selected.price ? String(selected.price) : ''
      variables['agendamento_status'] = 'agendado'
      variables['agendamento_google_event_id'] = event.data?.id || ''

      const confirmMsg = interpolate(
        data?.msgConfirm || `✅ Agendado com sucesso!\n\n📅 Data: ${dd}/${mm}\n⏰ Horário: ${selectedTime}`,
        ctx, variables
      )
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: confirmMsg })

      Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
      await logNode(flowId, node.id, ctx, 'success', `Google Calendar: agendado ${selectedDate} ${selectedTime}`)
      return { success: true }
    } catch (err: any) {
      logger.error('Google Calendar create event error (evo)', { err: err.message })
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Desculpe, houve um erro ao agendar. Tente novamente.' })
      return null
    }
  }

  if (step === '2') {
    // Step 2: User picked a day, check Google Calendar for busy times and show available slots
    const dayResponse = variables['_schedule_day_choice'] || ''
    const totalDays = parseInt(variables['_schedule_total_days'] || '0')

    // Handle "Voltar" — exit node, let flow handle it
    const dayLower = dayResponse.trim().toLowerCase()
    const showBackDays = data?.showBackDays !== false
    // Check if user typed the number of the Voltar item (last in list)
    const voltarDayNum = showBackDays ? totalDays + 1 : -1
    if (dayLower === 'voltar_menu' || dayLower === '0' || dayLower.includes('voltar') || dayLower === String(voltarDayNum)) {
      variables['agendamento_status'] = 'voltou'
      Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
      return { success: true }
    }

    // Support: button ID (day_1), text number (1), or title match (Sexta 10/04)
    let choice = 0
    const dayClean = dayResponse.trim()
    if (dayClean.startsWith('day_')) {
      choice = parseInt(dayClean.replace('day_', ''))
    } else if (/^\d+$/.test(dayClean)) {
      choice = parseInt(dayClean)
    } else {
      // Match by day/month in title (e.g. "Sexta 10/04")
      for (let i = 1; i <= totalDays; i++) {
        const dayDate = variables[`_schedule_day_${i}`]
        if (!dayDate) continue
        const dd = dayDate.split('-')[2]
        const mm = dayDate.split('-')[1]
        if (dayClean.includes(`${dd}/${mm}`)) { choice = i; break }
      }
    }

    if (choice < 1 || choice > totalDays) {
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: `Por favor, selecione uma das opções.` })
      variables['_schedule_step'] = '1'
      return await executeGoogleCalendarNode(node, ctx, flowId, data, variables, loopCounters, stateId)
    }

    const selectedDate = variables[`_schedule_day_${choice}`]
    variables['_schedule_selected_date'] = selectedDate

    // Full day: skip time selection, create event directly
    if (isFullDay) {
      const { data: contactInfo } = await db.from('contacts').select('name').eq('id', ctx.contactId).single()
      const contactName = contactInfo?.name || ctx.phone
      const eventTitle = interpolate(data?.eventTitle || 'Reserva - {{name}}', ctx, { ...variables, name: contactName })
      const priceTable2 = data?.priceTable || {}
      const selectedDow = new Date(`${selectedDate}T12:00:00`).getDay()
      const dayKeyPrice = dayKeys[selectedDow]
      const price = priceTable2[`${dayKeyPrice}_dia`]

      try {
        await calendar.events.insert({
          calendarId,
          requestBody: {
            summary: eventTitle,
            description: `Agendado via WhatsApp\nCliente: ${contactName}\nTelefone: +${ctx.phone}`,
            start: { date: selectedDate },
            end: { date: (() => { const next = new Date(`${selectedDate}T12:00:00`); next.setDate(next.getDate() + 1); return next.toISOString().split('T')[0] })() },
          },
        })

        const dd = selectedDate.split('-')[2]
        const mm = selectedDate.split('-')[1]
        variables['agendamento_data'] = `${dd}/${mm}`
        variables['agendamento_horario'] = 'Dia inteiro'
        variables['agendamento_valor'] = price ? String(price) : ''
        variables['agendamento_status'] = 'agendado'

        const confirmMsg = interpolate(
          data?.msgConfirm || `✅ Agendado com sucesso!\n\n📅 Data: ${dd}/${mm}\n\nTe enviaremos um lembrete antes.`,
          ctx, variables
        )
        await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: confirmMsg })

        Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
        await logNode(flowId, node.id, ctx, 'success', `Google Calendar: dia inteiro ${selectedDate}`)
        return { success: true }
      } catch (err: any) {
        logger.error('Google Calendar full day event error', { err: err.message })
        await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Desculpe, houve um erro ao agendar. Tente novamente.' })
        return null
      }
    }

    // Generate all possible slots
    const [startH, startM] = workStart.split(':').map(Number)
    const [endH, endM] = workEnd.split(':').map(Number)
    let startMin = startH * 60 + startM
    const endMin = (endH === 0 && endM === 0) ? 24 * 60 : endH * 60 + endM
    const allSlots: string[] = []
    while (startMin + duration <= endMin) {
      const hh = String(Math.floor(startMin / 60)).padStart(2, '0')
      const mmSlot = String(startMin % 60).padStart(2, '0')
      allSlots.push(`${hh}:${mmSlot}`)
      startMin += duration
    }

    // Query Google Calendar for busy times on this date
    try {
      const tz = 'America/Sao_Paulo'

      // Se workEnd é 00:00 (meia-noite), usa o dia seguinte
      let endDateForQuery = selectedDate
      let endTimeForQuery = workEnd
      if (workEnd === '00:00') {
        const nextDay = new Date(`${selectedDate}T12:00:00`)
        nextDay.setDate(nextDay.getDate() + 1)
        endDateForQuery = nextDay.toISOString().split('T')[0]
        endTimeForQuery = '00:00'
      }

      const { data: busyData } = await calendar.freebusy.query({
        requestBody: {
          timeMin: `${selectedDate}T${workStart}:00-03:00`,
          timeMax: `${endDateForQuery}T${endTimeForQuery}:00-03:00`,
          timeZone: tz,
          items: [{ id: calendarId }],
        },
      })

      const busySlots = busyData.calendars?.[calendarId]?.busy || []
      const priceTable = data?.priceTable || {}
      const selectedDayOfWeek = new Date(`${selectedDate}T12:00:00`).getDay()
      const dayKeyForPrice = dayKeys[selectedDayOfWeek] // mon, tue, etc

      const available = allSlots.filter(slot => {
        // Check if slot is marked as unavailable (price = 0) in price table
        const priceKey = `${dayKeyForPrice}_${slot}`
        if (priceTable[priceKey] === 0) return false

        const slotStartMs = new Date(`${selectedDate}T${slot}:00-03:00`).getTime()
        const slotEndMs = slotStartMs + duration * 60 * 1000

        return !busySlots.some((busy: any) => {
          const busyStartMs = new Date(busy.start).getTime()
          const busyEndMs = new Date(busy.end).getTime()
          return slotStartMs < busyEndMs && slotEndMs > busyStartMs
        })
      })

      if (available.length === 0) {
        // Sai do nó e deixa o flow decidir (oferecer outra quadra, etc)
        variables['agendamento_status'] = 'sem_horario'
        Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])
        return { success: true }
      }

      const slotRows: { id: string; title: string }[] = []
      available.forEach((s, i) => {
        variables[`_schedule_slot_${i + 1}`] = s
        const priceKey = `${dayKeyForPrice}_${s}`
        const price = priceTable[priceKey]
        const priceLabel = price ? ` - R$ ${price}` : ''
        variables[`_schedule_price_${i + 1}`] = price ? String(price) : ''
        slotRows.push({ id: `slot_${i + 1}`, title: `${s}${priceLabel}` })
      })

      const dd2 = selectedDate.split('-')[2]
      const mm2 = selectedDate.split('-')[1]
      const timeMsg = data?.msgAskTime || `⏰ Horários disponíveis para ${dd2}/${mm2}:`
      const showBack = data?.showBackButton !== false
      if (showBack) slotRows.push({ id: 'voltar_dias', title: '↩ Voltar' })
      if (slotRows.length <= 3) {
        const buttons = slotRows.map(r => ({ id: r.id, title: r.title }))
        await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: timeMsg, interactiveType: 'button', buttons })
      } else {
        await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: timeMsg, interactiveType: 'list', listRows: slotRows, listButtonText: data?.listButtonSlots || 'Ver horários' })
      }

      variables['_schedule_step'] = '3'
      variables['_schedule_total_slots'] = String(available.length)

      const inputStateId = stateId || generateId()
      await db.from('flow_states').upsert({
        id: inputStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
        conversation_id: ctx.conversationId, current_node_id: node.id,
        variables, loop_counters: loopCounters, waiting_variable: '_schedule_slot_choice',
        status: 'waiting', updated_at: new Date(),
      }, { onConflict: 'flow_id,conversation_id' })
      return { success: true, paused: true }

    } catch (err: any) {
      logger.error('Google Calendar freebusy error', { err: err.message })
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Desculpe, houve um erro ao consultar horários. Tente novamente.' })
      return null
    }
  }

  if (step === '3') {
    // Step 3: User picked a time, create Google Calendar event
    const slotResponse = variables['_schedule_slot_choice'] || ''
    const totalSlots = parseInt(variables['_schedule_total_slots'] || '0')

    // Handle "Voltar" — go back to day selection
    const slotLower = slotResponse.trim().toLowerCase()
    const showBack = data?.showBackButton !== false
    const voltarSlotNum = showBack ? totalSlots + 1 : -1
    if (slotLower === 'voltar_dias' || slotLower === '0' || slotLower.includes('voltar') || slotLower === String(voltarSlotNum)) {
      variables['_schedule_step'] = '1'
      // Clean slot variables
      Object.keys(variables).filter(k => k.match(/^_schedule_(slot|price)_/)).forEach(k => delete variables[k])
      return await executeGoogleCalendarNode(node, ctx, flowId, data, variables, loopCounters, stateId)
    }

    // Support: button ID (slot_1), text number (1), time text (21:00), title with price (21:00 - R$ 280)
    let choice = 0
    const slotClean = slotResponse.trim()
    if (slotClean.startsWith('slot_')) {
      choice = parseInt(slotClean.replace('slot_', ''))
    } else if (/^\d+$/.test(slotClean)) {
      choice = parseInt(slotClean)
    } else {
      // Extract time from response (handles "21:00 - R$ 280" or just "21:00")
      const timeMatch = slotClean.match(/(\d{2}:\d{2})/)
      const timeFromResponse = timeMatch ? timeMatch[1] : slotClean
      for (let i = 1; i <= totalSlots; i++) {
        if (variables[`_schedule_slot_${i}`] === timeFromResponse || variables[`_schedule_slot_${i}`] === slotClean) { choice = i; break }
      }
    }

    if (choice < 1 || choice > totalSlots) {
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: `Por favor, selecione uma das opções.` })
      variables['_schedule_step'] = '2'
      variables['_schedule_day_choice'] = variables['_schedule_selected_date'] ? `day_${Object.keys(variables).filter(k => k.startsWith('_schedule_day_') && !k.includes('choice')).findIndex(k => variables[k] === variables['_schedule_selected_date']) + 1}` : '1'
      return await executeGoogleCalendarNode(node, ctx, flowId, data, variables, loopCounters, stateId)
    }

    const selectedTime = variables[`_schedule_slot_${choice}`]
    const selectedDate = variables['_schedule_selected_date']

    // Get contact name for event title
    const { data: contactInfo } = await db.from('contacts').select('name').eq('id', ctx.contactId).single()
    const contactName = contactInfo?.name || ctx.phone

    // Create event start/end with timezone
    const tz = 'America/Sao_Paulo'
    const [sh, sm] = selectedTime.split(':').map(Number)
    const endMinTotal = sh * 60 + sm + duration

    // Handle midnight crossover (e.g. 23:00 + 60min = 00:00 next day)
    let endDate = selectedDate
    let endHour = Math.floor(endMinTotal / 60)
    const endMinute = endMinTotal % 60
    if (endHour >= 24) {
      endHour -= 24
      const nextDay = new Date(`${selectedDate}T12:00:00`)
      nextDay.setDate(nextDay.getDate() + 1)
      endDate = nextDay.toISOString().split('T')[0]
    }
    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`

    const eventTitle = interpolate(data?.eventTitle || 'Reserva - {{name}}', ctx, { ...variables, name: contactName })

    try {
      const event = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: eventTitle,
          description: `Agendado via WhatsApp\nCliente: ${contactName}\nTelefone: +${ctx.phone}`,
          start: { dateTime: `${selectedDate}T${selectedTime}:00`, timeZone: tz },
          end: { dateTime: `${endDate}T${endTime}:00`, timeZone: tz },
        },
      })

      const dd = selectedDate.split('-')[2]
      const mm = selectedDate.split('-')[1]

      // Save to flow variables BEFORE sending confirm so {{variables}} work
      variables['agendamento_data'] = `${dd}/${mm}`
      variables['agendamento_horario'] = selectedTime
      variables['agendamento_valor'] = variables[`_schedule_price_${choice}`] || ''
      variables['agendamento_status'] = 'agendado'
      variables['agendamento_google_event_id'] = event.data?.id || ''

      const confirmMsg = interpolate(
        data?.msgConfirm || `✅ Agendado com sucesso!\n\n📅 Data: ${dd}/${mm}\n⏰ Horário: ${selectedTime}\n\nTe enviaremos um lembrete antes do horário.`,
        ctx, variables
      )
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: confirmMsg })

      // Clean up internal variables
      Object.keys(variables).filter(k => k.startsWith('_schedule_')).forEach(k => delete variables[k])

      await logNode(flowId, node.id, ctx, 'success', `Google Calendar: agendado ${selectedDate} ${selectedTime}`)
      return { success: true }

    } catch (err: any) {
      logger.error('Google Calendar create event error', { err: err.message })
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Desculpe, houve um erro ao agendar. Tente novamente.' })
      return null
    }
  }

  return null
}

// ── Cancel appointment via Google Calendar ──────────────────────────────────
export async function executeCancelAppointment(
  node: any, ctx: FlowContext, flowId: string, data: any,
  variables: Record<string, string>, loopCounters: Record<string, number>,
  stateId: string | undefined, calendar: any, calendarId: string
): Promise<{ success: boolean; paused?: boolean } | null> {
  const cancelStep = variables['_cancel_step'] || '1'

  if (cancelStep === '1') {
    // Step 1: Search for upcoming events with this contact's phone
    try {
      const now = new Date()
      const futureLimit = new Date()
      futureLimit.setDate(futureLimit.getDate() + 60)

      const phoneSearch = ctx.phone.slice(-8)
      logger.info('Cancel: searching events', { calendarId, phone: ctx.phone, phoneSearch })

      // First try with q parameter, then without (fallback)
      const { data: events } = await calendar.events.list({
        calendarId,
        timeMin: now.toISOString(),
        timeMax: futureLimit.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
      })

      const allItems = events.items || []
      logger.info('Cancel: total events found', { total: allItems.length, titles: allItems.slice(0, 5).map((e: any) => e.summary) })

      const items = allItems.filter((e: any) => {
        const inDesc = e.description && e.description.includes(phoneSearch)
        const inTitle = e.summary && e.summary.includes(phoneSearch)
        return inDesc || inTitle
      })

      logger.info('Cancel: events matching phone', { matched: items.length, phoneSearch })

      if (items.length === 0) {
        await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Você não tem agendamentos futuros para cancelar.' })
        variables['cancelamento_status'] = 'nenhum'
        return { success: true }
      }

      // Show events as list (with Brazil timezone)
      const eventRows: { id: string; title: string }[] = []
      items.forEach((e: any, i: number) => {
        const start = new Date(e.start.dateTime || e.start.date)
        const brDate = start.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
        const brTime = start.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false })
        variables[`_cancel_event_${i + 1}`] = e.id
        // WhatsApp list title max 24 chars
        eventRows.push({ id: `cancel_${i + 1}`, title: `${brDate} ${brTime}` })
      })
      eventRows.push({ id: 'cancel_voltar', title: '↩ Voltar' })

      const msg = '📋 Seus agendamentos. Qual deseja cancelar?'
      if (eventRows.length <= 3) {
        const buttons = eventRows.map(r => ({ id: r.id, title: r.title }))
        await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: msg, interactiveType: 'button', buttons })
      } else {
        await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'interactive', body: msg, interactiveType: 'list', listRows: eventRows, listButtonText: 'Ver agendamentos' })
      }

      variables['_cancel_step'] = '2'
      variables['_cancel_total'] = String(items.length)

      const inputStateId = stateId || generateId()
      await db.from('flow_states').upsert({
        id: inputStateId, flow_id: flowId, tenant_id: ctx.tenantId, contact_id: ctx.contactId,
        conversation_id: ctx.conversationId, current_node_id: node.id,
        variables, loop_counters: loopCounters, waiting_variable: '_cancel_choice',
        status: 'waiting', updated_at: new Date(),
      }, { onConflict: 'flow_id,conversation_id' })
      return { success: true, paused: true }

    } catch (err: any) {
      logger.error('Google Calendar list events error', { err: err.message })
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Desculpe, houve um erro ao buscar seus agendamentos.' })
      return null
    }
  }

  if (cancelStep === '2') {
    // Step 2: User picked an event to cancel
    const response = (variables['_cancel_choice'] || '').trim()
    const total = parseInt(variables['_cancel_total'] || '0')

    // Handle "Voltar"
    if (response === 'cancel_voltar' || response.toLowerCase().includes('voltar')) {
      variables['cancelamento_status'] = 'voltou'
      Object.keys(variables).filter(k => k.startsWith('_cancel_')).forEach(k => delete variables[k])
      return { success: true }
    }

    // Find which event was selected
    let choice = 0
    if (response.startsWith('cancel_')) {
      choice = parseInt(response.replace('cancel_', ''))
    } else if (/^\d+$/.test(response)) {
      choice = parseInt(response)
    } else {
      // Match by date in title
      for (let i = 1; i <= total; i++) {
        if (response.includes('/')) { choice = i; break }
      }
    }

    if (choice < 1 || choice > total) {
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Por favor, selecione uma das opções.' })
      variables['_cancel_step'] = '1'
      return await executeCancelAppointment(node, ctx, flowId, data, variables, loopCounters, stateId, calendar, calendarId)
    }

    const eventId = variables[`_cancel_event_${choice}`]
    if (!eventId) { return null }

    try {
      await calendar.events.delete({ calendarId, eventId })
      const cancelMsg = interpolate(data?.msgConfirm || '✅ Agendamento cancelado com sucesso!', ctx, variables)
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: cancelMsg })
      variables['cancelamento_status'] = 'cancelado'
      Object.keys(variables).filter(k => k.startsWith('_cancel_')).forEach(k => delete variables[k])
      await logNode(flowId, node.id, ctx, 'success', `Google Calendar: evento ${eventId} cancelado`)
      return { success: true }
    } catch (err: any) {
      logger.error('Google Calendar delete event error', { err: err.message })
      await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: 'Desculpe, houve um erro ao cancelar. Tente novamente.' })
      return null
    }
  }

  return null
}

