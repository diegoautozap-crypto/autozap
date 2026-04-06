'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { conversationApi } from '@/lib/api'
import { toast } from 'sonner'
import {
  Calendar, Settings2, Loader2, X, Clock, User, Phone,
  CheckCircle2, XCircle, CalendarCheck, CalendarX, ChevronDown, ChevronUp,
} from 'lucide-react'

/* ---- Types ---- */
interface DaysAvailable { mon: boolean; tue: boolean; wed: boolean; thu: boolean; fri: boolean; sat: boolean; sun: boolean }

interface SchedulingConfig {
  id: string
  name: string
  slot_duration_minutes: number
  days_available: DaysAvailable
  start_time: string
  end_time: string
  break_start: string | null
  break_end: string | null
  advance_days: number
  reminder_minutes: number
  is_active: boolean
}

interface Appointment {
  id: string
  date: string
  start_time: string
  end_time: string
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  notes: string | null
  config_id: string
  contacts?: { name: string; phone: string } | null
}

/* ---- Helpers ---- */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '14px', outline: 'none', color: 'var(--text)',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: 'pointer', appearance: 'auto' as any,
}

const statusColors: Record<string, { bg: string; color: string; label: string }> = {
  scheduled:  { bg: '#dbeafe', color: '#2563eb', label: 'Agendado' },
  confirmed:  { bg: '#dcfce7', color: '#16a34a', label: 'Confirmado' },
  completed:  { bg: '#f0fdf4', color: '#15803d', label: 'Concluído' },
  cancelled:  { bg: '#fef2f2', color: '#dc2626', label: 'Cancelado' },
}

const DAY_KEYS: (keyof DaysAvailable)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function todayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function weekRange() {
  const now = new Date()
  const day = now.getDay()
  const start = new Date(now); start.setDate(now.getDate() - day)
  const end = new Date(start); end.setDate(start.getDate() + 6)
  return { start, end }
}

function monthRange() {
  const now = new Date()
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) }
}

function inRange(dateStr: string, start: Date, end: Date) {
  const d = new Date(dateStr + 'T00:00:00')
  return d >= start && d <= end
}

/* ---- Component ---- */
export default function SchedulingPage() {
  const queryClient = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Config form state
  const defaultDays: DaysAvailable = { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }
  const [cfgSlotDuration, setCfgSlotDuration] = useState(30)
  const [cfgDays, setCfgDays] = useState<DaysAvailable>(defaultDays)
  const [cfgStart, setCfgStart] = useState('09:00')
  const [cfgEnd, setCfgEnd] = useState('18:00')
  const [cfgBreakStart, setCfgBreakStart] = useState('')
  const [cfgBreakEnd, setCfgBreakEnd] = useState('')
  const [cfgAdvanceDays, setCfgAdvanceDays] = useState(7)
  const [cfgReminder, setCfgReminder] = useState(60)

  /* ---- Queries ---- */
  const { data: config, isLoading: configLoading } = useQuery<SchedulingConfig | null>({
    queryKey: ['scheduling-config'],
    queryFn: async () => {
      const { data } = await conversationApi.get('/scheduling')
      const list = data.data || []
      return Array.isArray(list) && list.length > 0 ? list[0] : null
    },
  })

  const { data: appointments = [], isLoading: apptLoading } = useQuery<Appointment[]>({
    queryKey: ['appointments', selectedDate],
    queryFn: async () => {
      const { data } = await conversationApi.get(`/appointments?date=${selectedDate}`)
      return data.data || []
    },
  })

  // We also fetch the whole week and month for summary cards
  const { data: allAppointments = [] } = useQuery<Appointment[]>({
    queryKey: ['appointments-month'],
    queryFn: async () => {
      const mr = monthRange()
      const startStr = mr.start.toISOString().slice(0, 10)
      const endStr = mr.end.toISOString().slice(0, 10)
      const { data } = await conversationApi.get(`/appointments?startDate=${startStr}&endDate=${endStr}`)
      return data.data || []
    },
  })

  /* ---- Summary stats ---- */
  const todayCount = appointments.length
  const wr = weekRange()
  const weekCount = allAppointments.filter(a => inRange(a.date, wr.start, wr.end)).length
  const mr = monthRange()
  const completedMonth = allAppointments.filter(a => a.status === 'completed' && inRange(a.date, mr.start, mr.end)).length
  const cancelledMonth = allAppointments.filter(a => a.status === 'cancelled' && inRange(a.date, mr.start, mr.end)).length

  const summaryCards = [
    { icon: Calendar, color: '#2563eb', label: 'Hoje', value: String(todayCount) },
    { icon: CalendarCheck, color: '#6366f1', label: 'Esta semana', value: String(weekCount) },
    { icon: CheckCircle2, color: '#22c55e', label: 'Concluídos (mês)', value: String(completedMonth) },
    { icon: CalendarX, color: '#ef4444', label: 'Cancelados (mês)', value: String(cancelledMonth) },
  ]

  /* ---- Mutations ---- */
  const saveConfigMutation = useMutation({
    mutationFn: async (body: any) => {
      if (config?.id) {
        await conversationApi.patch(`/scheduling/${config.id}`, body)
      } else {
        await conversationApi.post('/scheduling', body)
      }
    },
    onSuccess: () => {
      toast.success('Configuração salva')
      queryClient.invalidateQueries({ queryKey: ['scheduling-config'] })
      setShowConfigModal(false)
    },
    onError: () => toast.error('Erro ao salvar configuração'),
  })

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: any }) => {
      await conversationApi.patch(`/appointments/${id}`, body)
    },
    onSuccess: () => {
      toast.success('Agendamento atualizado')
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      queryClient.invalidateQueries({ queryKey: ['appointments-month'] })
    },
    onError: () => toast.error('Erro ao atualizar agendamento'),
  })

  /* ---- Config modal helpers ---- */
  function openConfigModal() {
    if (config) {
      setCfgSlotDuration(config.slot_duration_minutes)
      setCfgDays(config.days_available || defaultDays)
      setCfgStart(config.start_time)
      setCfgEnd(config.end_time)
      setCfgBreakStart(config.break_start || '')
      setCfgBreakEnd(config.break_end || '')
      setCfgAdvanceDays(config.advance_days)
      setCfgReminder(config.reminder_minutes)
    }
    setShowConfigModal(true)
  }

  function handleSaveConfig() {
    const body = {
      slot_duration_minutes: cfgSlotDuration,
      days_available: cfgDays,
      start_time: cfgStart,
      end_time: cfgEnd,
      break_start: cfgBreakStart || null,
      break_end: cfgBreakEnd || null,
      advance_days: cfgAdvanceDays,
      reminder_minutes: cfgReminder,
    }
    saveConfigMutation.mutate(body)
  }

  function toggleDay(key: keyof DaysAvailable) {
    setCfgDays(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function handleStatusChange(appt: Appointment, newStatus: string) {
    updateAppointmentMutation.mutate({ id: appt.id, body: { status: newStatus } })
  }

  const sortedAppointments = useMemo(
    () => [...appointments].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')),
    [appointments],
  )

  const isLoading = configLoading || apptLoading

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Calendar size={22} color="#2563eb" />
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Agenda</h1>
        </div>
        <button onClick={openConfigModal} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#1d4ed8')} onMouseLeave={e => (e.currentTarget.style.background = '#2563eb')}>
          <Settings2 size={15} /> Configurar horários
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {summaryCards.map((c, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <c.icon size={14} color={c.color} />
              <span style={{ fontSize: '11px', color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</span>
            </div>
            <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Date picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Data:</label>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          style={{ ...inputStyle, width: 'auto' }}
        />
        <button
          onClick={() => setSelectedDate(todayStr())}
          style={{ padding: '7px 14px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          Hoje
        </button>
      </div>

      {/* Appointments list */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Loader2 size={28} color="var(--text-faint)" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : sortedAppointments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-faint)' }}>
          <Calendar size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
          <p style={{ fontSize: '15px', fontWeight: 500 }}>Nenhum agendamento para esta data</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sortedAppointments.map(appt => {
            const isExpanded = expandedId === appt.id
            const st = statusColors[appt.status] || statusColors.scheduled

            return (
              <div key={appt.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', transition: 'border-color 0.15s' }}>
                {/* Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : appt.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 16px', cursor: 'pointer' }}
                >
                  {/* Time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '70px' }}>
                    <Clock size={14} color="var(--text-faint)" />
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{appt.start_time}</span>
                  </div>

                  {/* Contact name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <User size={14} color="var(--text-faint)" />
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {appt.contacts?.name || 'Sem nome'}
                      </span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <span style={{ fontSize: '11px', fontWeight: 600, color: st.color, background: st.bg, padding: '3px 10px', borderRadius: '99px', whiteSpace: 'nowrap' }}>
                    {st.label}
                  </span>

                  {/* Expand icon */}
                  {isExpanded ? <ChevronUp size={16} color="var(--text-faint)" /> : <ChevronDown size={16} color="var(--text-faint)" />}
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* Phone */}
                      {appt.contacts?.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Phone size={13} color="var(--text-faint)" />
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{appt.contacts?.phone}</span>
                        </div>
                      )}

                      {/* Notes */}
                      {appt.notes && (
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, background: 'var(--bg)', borderRadius: '8px', padding: '10px 12px' }}>
                          {appt.notes}
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                        {appt.status !== 'confirmed' && appt.status !== 'completed' && appt.status !== 'cancelled' && (
                          <button
                            onClick={() => handleStatusChange(appt, 'confirmed')}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', background: '#dcfce7', color: '#16a34a', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            <CheckCircle2 size={13} /> Confirmar
                          </button>
                        )}
                        {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                          <button
                            onClick={() => handleStatusChange(appt, 'completed')}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', background: '#f0fdf4', color: '#15803d', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            <CheckCircle2 size={13} /> Concluir
                          </button>
                        )}
                        {appt.status !== 'cancelled' && appt.status !== 'completed' && (
                          <button
                            onClick={() => handleStatusChange(appt, 'cancelled')}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 14px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            <XCircle size={13} /> Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Configuration Modal */}
      {showConfigModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setShowConfigModal(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
          <div style={{ position: 'relative', background: 'var(--bg-card)', borderRadius: '16px', padding: '28px 32px', width: '100%', maxWidth: '520px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Configurar horários</h2>
              <button onClick={() => setShowConfigModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', padding: '4px' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Slot duration */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Duração do slot</label>
                <select value={cfgSlotDuration} onChange={e => setCfgSlotDuration(Number(e.target.value))} style={selectStyle}>
                  <option value={15}>15 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={45}>45 minutos</option>
                  <option value={60}>1 hora</option>
                </select>
              </div>

              {/* Days available */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Dias disponíveis</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {DAY_LABELS.map((label, idx) => {
                    const dayKey = DAY_KEYS[idx]
                    const active = cfgDays[dayKey] === true
                    return (
                      <button
                        key={idx}
                        onClick={() => toggleDay(dayKey)}
                        style={{
                          padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                          border: active ? 'none' : '1px solid var(--border)',
                          background: active ? '#2563eb' : 'var(--bg-input)',
                          color: active ? '#fff' : 'var(--text-muted)',
                          transition: 'all 0.12s ease',
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Start / End time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Início</label>
                  <input type="time" value={cfgStart} onChange={e => setCfgStart(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Fim</label>
                  <input type="time" value={cfgEnd} onChange={e => setCfgEnd(e.target.value)} style={inputStyle} />
                </div>
              </div>

              {/* Break start / end */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Início do intervalo</label>
                  <input type="time" value={cfgBreakStart} onChange={e => setCfgBreakStart(e.target.value)} placeholder="Opcional" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Fim do intervalo</label>
                  <input type="time" value={cfgBreakEnd} onChange={e => setCfgBreakEnd(e.target.value)} placeholder="Opcional" style={inputStyle} />
                </div>
              </div>

              {/* Advance days & Reminder */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Dias de antecedência</label>
                  <input type="number" min={1} max={365} value={cfgAdvanceDays} onChange={e => setCfgAdvanceDays(Number(e.target.value))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Lembrete (min antes)</label>
                  <input type="number" min={0} max={1440} value={cfgReminder} onChange={e => setCfgReminder(Number(e.target.value))} style={inputStyle} />
                </div>
              </div>
            </div>

            {/* Save */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button onClick={() => setShowConfigModal(false)} style={{ padding: '9px 18px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleSaveConfig} disabled={saveConfigMutation.isPending} style={{ padding: '9px 22px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: saveConfigMutation.isPending ? 'not-allowed' : 'pointer', opacity: saveConfigMutation.isPending ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                {saveConfigMutation.isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
