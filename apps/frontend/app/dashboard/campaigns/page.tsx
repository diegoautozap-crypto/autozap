'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, RefreshCw, X, Send, Upload, Play, Pause, Loader2, ChevronLeft, ChevronRight, BarChart2, CheckCheck, AlertCircle, TrendingUp, Trash2, FileText, Clock, Calendar, Megaphone } from 'lucide-react'

const S: Record<string, { color: string; bg: string; dot: string; label: string; bar: string }> = {
  running:   { color: '#16a34a', bg: '#F0FDF4', dot: '#16a34a', label: 'Enviando',  bar: '#16a34a' },
  completed: { color: '#5C6474', bg: '#F4F5F8', dot: '#16a34a', label: 'Concluída', bar: '#16a34a' },
  draft:     { color: '#9CA5B3', bg: '#F9FAFB', dot: '#D1D5DB', label: 'Rascunho',  bar: '#D1D5DB' },
  paused:    { color: '#D97706', bg: '#FFFBEB', dot: '#F59E0B', label: 'Pausada',   bar: '#F59E0B' },
  failed:    { color: '#DC2626', bg: '#FEF2F2', dot: '#EF4444', label: 'Falhou',    bar: '#EF4444' },
  scheduled: { color: '#7C3AED', bg: '#F5F3FF', dot: '#8B5CF6', label: 'Agendada',  bar: '#8B5CF6' },
}

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: '#FAFAFA', border: '1px solid #E8EAED',
  borderRadius: '8px', fontSize: '13.5px', outline: 'none',
  color: '#111827', transition: 'all 0.15s',
  fontFamily: 'inherit',
}

const PAGE_SIZE = 10

export default function CampaignsPage() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal]             = useState(false)
  const [contactsText, setContactsText]       = useState('')
  const [curlText, setCurlText]               = useState('')
  const [campaignName, setCampaignName]       = useState('')
  const [selectedChannel, setSelectedChannel] = useState('')
  const [messagesPerMin, setMessagesPerMin]   = useState(60)
  const [selectedCamp, setSelectedCamp]       = useState<any>(null)
  const [page, setPage]                       = useState(1)
  const [useTemplate, setUseTemplate]         = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templateVars, setTemplateVars]       = useState<string[]>([])
  const [scheduleMode, setScheduleMode]       = useState<'now' | 'scheduled'>('now')
  const [scheduledAt, setScheduledAt]         = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: campaigns, isLoading, refetch } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => { const { data } = await campaignApi.get('/campaigns'); return data.data },
    refetchInterval: 5000,
  })

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data },
  })

  const { data: templates } = useQuery({
    queryKey: ['templates', selectedChannel],
    queryFn: async () => { const { data } = await campaignApi.get(`/templates?channelId=${selectedChannel}`); return data.data },
    enabled: !!selectedChannel,
  })

  const { data: progress } = useQuery({
    queryKey: ['progress', selectedCamp?.id],
    queryFn: async () => { const { data } = await campaignApi.get(`/campaigns/${selectedCamp.id}/progress`); return data.data },
    enabled: !!selectedCamp?.id,
    refetchInterval: 3000,
  })

  const totalCampaigns      = campaigns?.length ?? 0
  const totalPages          = Math.ceil(totalCampaigns / PAGE_SIZE)
  const paginatedCampaigns  = campaigns?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? []
  const selectedTemplateObj = templates?.find((t: any) => t.id === selectedTemplate)

  const handleTemplateChange = (id: string) => {
    setSelectedTemplate(id)
    const tmpl = templates?.find((t: any) => t.id === id)
    if (tmpl) setTemplateVars(new Array(tmpl.variables?.length || 0).fill(''))
    else setTemplateVars([])
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setContactsText(ev.target?.result as string)
    reader.readAsText(file)
  }

  const resetModal = () => {
    setCampaignName(''); setContactsText(''); setCurlText('')
    setSelectedChannel(''); setSelectedTemplate(''); setTemplateVars([])
    setUseTemplate(true); setScheduleMode('now'); setScheduledAt('')
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { channelId: selectedChannel, name: campaignName, messageTemplate: ' ', messagesPerMin }
      if (useTemplate && selectedTemplate) { payload.templateId = selectedTemplate }
      else { payload.curlTemplate = curlText.trim().replace(/ \\\n/g, ' ').replace(/ \\\r\n/g, ' ').replace(/'/g, '"') }
      if (scheduleMode === 'scheduled' && scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString()
      const { data: campData } = await campaignApi.post('/campaigns', payload)
      const campId = campData.data.id
      const rows = contactsText.split('\n').filter(Boolean).map(line => {
        const parts = line.split(','); const phone = parts[0]?.trim().replace(/\D/g, '')
        const message = parts.slice(1).join(',').trim()
        return { phone, name: message || phone, message: message || '' }
      }).filter(r => r.phone && r.phone.length >= 8)
      if (rows.length > 0) await campaignApi.post(`/campaigns/${campId}/contacts/import`, { rows })
      if (scheduleMode === 'now') await campaignApi.post(`/campaigns/${campId}/start`)
      return campData.data
    },
    onSuccess: (camp) => {
      const msg = scheduleMode === 'scheduled' ? `Campanha agendada para ${new Date(scheduledAt).toLocaleString('pt-BR')}!` : 'Campanha criada e iniciada!'
      toast.success(msg); queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setShowModal(false); setSelectedCamp(camp); resetModal()
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao criar campanha'),
  })

  const startMutation  = useMutation({ mutationFn: async (id: string) => { await campaignApi.post(`/campaigns/${id}/start`) }, onSuccess: () => { toast.success('Campanha iniciada!'); queryClient.invalidateQueries({ queryKey: ['campaigns'] }) }, onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro') })
  const pauseMutation  = useMutation({ mutationFn: async (id: string) => { await campaignApi.post(`/campaigns/${id}/pause`) }, onSuccess: () => { toast.success('Pausada'); queryClient.invalidateQueries({ queryKey: ['campaigns'] }) } })
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await campaignApi.delete(`/campaigns/${id}`) },
    onSuccess: () => { toast.success('Campanha deletada!'); queryClient.invalidateQueries({ queryKey: ['campaigns'] }); setSelectedCamp(null) },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao deletar'),
  })

  const prog         = progress || selectedCamp
  const total        = prog?.total || prog?.total_contacts || 0
  const sent         = prog?.sent  || prog?.sent_count     || 0
  const delivered    = prog?.delivered || prog?.delivered_count || 0
  const read         = prog?.read  || prog?.read_count     || 0
  const failed       = prog?.failed || prog?.failed_count  || 0
  const pct          = total > 0 ? Math.round((sent / total) * 100) : 0
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0
  const readRate     = sent > 0 ? Math.round((read / sent) * 100) : 0

  const isValid     = campaignName && selectedChannel && (useTemplate ? !!selectedTemplate : !!curlText) && (scheduleMode === 'now' || (scheduleMode === 'scheduled' && !!scheduledAt))
  const minDateTime = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)

  const lbl = (text: string) => (
    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: '#5C6474', marginBottom: '6px', letterSpacing: '0.01em', textTransform: 'uppercase' }}>{text}</label>
  )

  return (
    <div style={{ padding: '28px 32px', height: '100%', display: 'flex', flexDirection: 'column', background: '#F8F9FC', fontFamily: 'inherit' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 750, color: '#0F1623', letterSpacing: '-0.03em', margin: 0, lineHeight: 1.2 }}>Campanhas</h1>
          <p style={{ color: '#9CA5B3', fontSize: '13px', marginTop: '4px', fontWeight: 400 }}>Gerencie seus disparos em massa</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => refetch()} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #E8EAED', borderRadius: '8px', color: '#5C6474', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500, transition: 'all 0.12s', boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F4F5F8'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#D1D5DB' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8EAED' }}>
            <RefreshCw size={13} /> Atualizar
          </button>
          <button onClick={() => setShowModal(true)} style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(22,163,74,0.25)', transition: 'all 0.12s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 14px rgba(22,163,74,0.35)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(22,163,74,0.25)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}>
            <Plus size={14} /> Nova campanha
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>

        {/* ── Lista ──────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: '#fff', border: '1px solid #ECEEF2', borderRadius: '12px', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
            {isLoading ? (
              <div style={{ padding: '80px', textAlign: 'center' }}>
                <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#D1D5DB' }} />
              </div>
            ) : campaigns?.length === 0 ? (
              <div style={{ padding: '80px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#F4F5F8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Megaphone size={24} color="#D1D5DB" />
                </div>
                <div>
                  <p style={{ color: '#5C6474', fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>Nenhuma campanha ainda</p>
                  <p style={{ color: '#9CA5B3', fontSize: '13px', margin: 0 }}>Crie sua primeira campanha para começar a disparar</p>
                </div>
                <button onClick={() => setShowModal(true)} style={{ padding: '9px 20px', background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(22,163,74,0.25)' }}>
                  + Criar primeira campanha
                </button>
              </div>
            ) : (
              <>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 110px 120px 100px', gap: '8px', padding: '11px 20px', background: '#FAFBFC', borderBottom: '1px solid #ECEEF2' }}>
                  {['Campanha', 'Total', 'Enviadas', 'Status', 'Ações'].map(h => (
                    <span key={h} style={{ fontSize: '10.5px', fontWeight: 700, color: '#9CA5B3', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                  ))}
                </div>

                {/* Rows */}
                {paginatedCampaigns.map((camp: any) => {
                  const s          = S[camp.status] || S.draft
                  const p          = camp.total_contacts > 0 ? Math.round((camp.sent_count / camp.total_contacts) * 100) : 0
                  const isSelected = selectedCamp?.id === camp.id
                  return (
                    <div key={camp.id} onClick={() => setSelectedCamp(camp)}
                      style={{ display: 'grid', gridTemplateColumns: '2fr 80px 110px 120px 100px', gap: '8px', padding: '13px 20px', borderBottom: '1px solid #F4F5F8', cursor: 'pointer', background: isSelected ? '#F0FDF4' : '#fff', transition: 'background 0.1s', alignItems: 'center', borderLeft: `3px solid ${isSelected ? '#16a34a' : 'transparent'}` }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#FAFBFC' }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#fff' }}>
                      <div>
                        <div style={{ fontWeight: 550, color: '#0F1623', fontSize: '13.5px', marginBottom: '3px', letterSpacing: '-0.01em' }}>{camp.name}</div>
                        {camp.scheduled_at && camp.status === 'scheduled' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#7C3AED', fontWeight: 500 }}>
                            <Clock size={10} />
                            {new Date(camp.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        {camp.status === 'running' && (
                          <div style={{ height: '2px', background: '#F1F3F7', borderRadius: '99px', overflow: 'hidden', marginTop: '5px', width: '80%' }}>
                            <div style={{ width: `${p}%`, height: '100%', background: s.bar, borderRadius: '99px', transition: 'width 0.4s' }} />
                          </div>
                        )}
                      </div>
                      <span style={{ color: '#374151', fontSize: '13px', fontWeight: 500 }}>{camp.total_contacts.toLocaleString()}</span>
                      <span style={{ color: '#374151', fontSize: '13px', fontWeight: 500 }}>
                        {camp.sent_count.toLocaleString()} <span style={{ color: '#BCC3CE', fontSize: '11px', fontWeight: 400 }}>({p}%)</span>
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: s.color }}>{s.label}</span>
                      </div>
                      <div onClick={e => e.stopPropagation()}>
                        {camp.status === 'running' ? (
                          <button onClick={() => pauseMutation.mutate(camp.id)} style={{ padding: '5px 10px', background: '#F4F5F8', border: '1px solid #E8EAED', borderRadius: '6px', fontSize: '11.5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: '#5C6474', fontWeight: 500 }}>
                            <Pause size={10} /> Pausar
                          </button>
                        ) : ['draft', 'paused'].includes(camp.status) ? (
                          <button onClick={() => startMutation.mutate(camp.id)} style={{ padding: '5px 10px', background: 'linear-gradient(135deg, #16a34a, #15803d)', border: 'none', color: '#fff', borderRadius: '6px', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 4px rgba(22,163,74,0.2)' }}>
                            <Play size={10} fill="#fff" /> Disparar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid #F1F3F7', marginTop: 'auto' }}>
                    <span style={{ fontSize: '12px', color: '#9CA5B3' }}>
                      {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCampaigns)} de {totalCampaigns}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                        style={{ padding: '5px 8px', background: '#fff', border: '1px solid #E8EAED', borderRadius: '6px', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#E8EAED' : '#5C6474', display: 'flex', alignItems: 'center' }}>
                        <ChevronLeft size={13} />
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => setPage(p)}
                          style={{ padding: '5px 9px', background: p === page ? 'linear-gradient(135deg,#16a34a,#15803d)' : '#fff', border: `1px solid ${p === page ? 'transparent' : '#E8EAED'}`, borderRadius: '6px', cursor: 'pointer', color: p === page ? '#fff' : '#5C6474', fontSize: '12px', fontWeight: p === page ? 700 : 400, minWidth: '30px' }}>
                          {p}
                        </button>
                      ))}
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        style={{ padding: '5px 8px', background: '#fff', border: '1px solid #E8EAED', borderRadius: '6px', cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#E8EAED' : '#5C6474', display: 'flex', alignItems: 'center' }}>
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Painel progresso ───────────────────────────────────────────── */}
        <div style={{ width: '272px', flexShrink: 0 }}>
          {selectedCamp ? (
            <div style={{ background: '#fff', border: '1px solid #ECEEF2', borderRadius: '12px', padding: '20px', position: 'sticky', top: 0, boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <p style={{ fontSize: '13.5px', fontWeight: 650, color: '#0F1623', margin: '0 0 4px', letterSpacing: '-0.01em' }}>{selectedCamp.name}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: S[selectedCamp.status]?.dot || '#9CA3AF' }} />
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: S[selectedCamp.status]?.color || '#6B7280' }}>
                      {S[selectedCamp.status]?.label || 'Rascunho'}
                    </span>
                  </div>
                </div>
                <button onClick={() => setSelectedCamp(null)} style={{ background: '#F4F5F8', border: 'none', cursor: 'pointer', color: '#9CA5B3', padding: '5px', borderRadius: '6px', display: 'flex', transition: 'all 0.12s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#ECEEF2' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F4F5F8' }}>
                  <X size={13} />
                </button>
              </div>

              {selectedCamp.scheduled_at && selectedCamp.status === 'scheduled' && (
                <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={13} color="#7C3AED" />
                  <div>
                    <p style={{ fontSize: '11px', fontWeight: 700, color: '#6D28D9', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Agendada para</p>
                    <p style={{ fontSize: '12px', color: '#7C3AED', margin: 0, fontWeight: 500 }}>
                      {new Date(selectedCamp.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )}

              {/* Progress */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '7px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#9CA5B3', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Progresso</span>
                  <span style={{ fontSize: '14px', fontWeight: 750, color: '#0F1623', letterSpacing: '-0.02em' }}>{pct}%</span>
                </div>
                <div style={{ height: '5px', background: '#F1F3F7', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #16a34a, #22c55e)', borderRadius: '99px', transition: 'width 0.5s cubic-bezier(.4,0,.2,1)' }} />
                </div>
              </div>

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px', marginBottom: '14px' }}>
                {[
                  { label: 'Total',     value: total,     color: '#5C6474', icon: BarChart2 },
                  { label: 'Enviadas',  value: sent,      color: '#2563eb', icon: Send },
                  { label: 'Entregues', value: delivered, color: '#16a34a', icon: CheckCheck },
                  { label: 'Lidas',     value: read,      color: '#7C3AED', icon: TrendingUp },
                  { label: 'Falhas',    value: failed,    color: '#DC2626', icon: AlertCircle },
                ].map(({ label, value, color, icon: Icon }) => (
                  <div key={label} style={{ background: '#FAFBFC', border: '1px solid #F1F3F7', borderRadius: '8px', padding: '10px 11px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                      <Icon size={11} color={color} />
                      <span style={{ fontSize: '10.5px', color: '#9CA5B3', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                    </div>
                    <div style={{ fontSize: '19px', fontWeight: 750, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{value.toLocaleString()}</div>
                  </div>
                ))}
              </div>

              {/* Rates */}
              {sent > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '8px 11px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCheck size={12} color="#16a34a" />
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#15803D' }}>{deliveryRate}% entregues</div>
                      <div style={{ fontSize: '11px', color: '#9CA5B3', marginTop: '1px' }}>de {sent.toLocaleString()} enviadas</div>
                    </div>
                  </div>
                  <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '8px', padding: '8px 11px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingUp size={12} color="#7C3AED" />
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#6D28D9' }}>{readRate}% lidas</div>
                      <div style={{ fontSize: '11px', color: '#9CA5B3', marginTop: '1px' }}>de {sent.toLocaleString()} enviadas</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {selectedCamp.status === 'running' && (
                  <button onClick={() => pauseMutation.mutate(selectedCamp.id)}
                    style={{ width: '100%', padding: '8px', background: '#F4F5F8', border: '1px solid #E8EAED', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#5C6474', fontWeight: 500 }}>
                    <Pause size={13} /> Pausar campanha
                  </button>
                )}
                {['draft', 'paused', 'scheduled'].includes(selectedCamp.status) && (
                  <button onClick={() => startMutation.mutate(selectedCamp.id)}
                    style={{ width: '100%', padding: '8px', background: 'linear-gradient(135deg,#16a34a,#15803d)', border: 'none', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(22,163,74,0.2)' }}>
                    <Play size={13} fill="#fff" /> {selectedCamp.status === 'scheduled' ? 'Disparar agora' : 'Disparar campanha'}
                  </button>
                )}
                {['draft', 'paused', 'completed', 'failed', 'scheduled'].includes(selectedCamp.status) && (
                  <button
                    onClick={() => { if (window.confirm(`Deletar "${selectedCamp.name}"?`)) deleteMutation.mutate(selectedCamp.id) }}
                    disabled={deleteMutation.isPending}
                    style={{ width: '100%', padding: '8px', background: '#fff', border: '1px solid #FECACA', borderRadius: '8px', fontSize: '13px', cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#DC2626', fontWeight: 500, opacity: deleteMutation.isPending ? 0.5 : 1 }}>
                    {deleteMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                    Deletar campanha
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #ECEEF2', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#F4F5F8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <BarChart2 size={22} color="#D1D5DB" />
              </div>
              <p style={{ color: '#9CA5B3', fontSize: '13px', fontWeight: 500 }}>Selecione uma campanha para ver o progresso</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Nova Campanha ─────────────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,22,35,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 750, color: '#0F1623', letterSpacing: '-0.02em', margin: 0 }}>Nova Campanha</h2>
                <p style={{ fontSize: '12.5px', color: '#9CA5B3', marginTop: '3px' }}>Preencha os dados para criar o disparo</p>
              </div>
              <button onClick={() => { setShowModal(false); resetModal() }} style={{ background: '#F4F5F8', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#5C6474', padding: '7px', display: 'flex', transition: 'all 0.12s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#ECEEF2' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F4F5F8' }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                {lbl('Nome da campanha')}
                <input style={inp} placeholder="Ex: Promoção Black Friday" value={campaignName} onChange={e => setCampaignName(e.target.value)}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#16a34a'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(22,163,74,0.1)' }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#E8EAED'; (e.target as HTMLInputElement).style.boxShadow = 'none' }} />
              </div>

              <div>
                {lbl('Canal WhatsApp')}
                <select style={{ ...inp, appearance: 'none' } as any} value={selectedChannel} onChange={e => { setSelectedChannel(e.target.value); setSelectedTemplate(''); setTemplateVars([]) }}>
                  <option value="">Selecionar canal...</option>
                  {channels?.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                </select>
              </div>

              {/* Toggle template/curl */}
              <div>
                <div style={{ display: 'flex', background: '#F4F5F8', borderRadius: '9px', padding: '3px', gap: '2px', marginBottom: '14px' }}>
                  {[{ v: true, label: 'Template salvo' }, { v: false, label: 'cURL manual' }].map(opt => (
                    <button key={String(opt.v)} onClick={() => setUseTemplate(opt.v)}
                      style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: 500, background: useTemplate === opt.v ? '#fff' : 'transparent', color: useTemplate === opt.v ? '#0F1623' : '#9CA5B3', boxShadow: useTemplate === opt.v ? '0 1px 4px rgba(0,0,0,.08)' : 'none', transition: 'all 0.15s' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>

                {useTemplate ? (
                  selectedChannel ? (
                    templates?.length === 0 ? (
                      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '13px 15px' }}>
                        <p style={{ fontSize: '13px', color: '#92400E', fontWeight: 500, margin: 0 }}>Nenhum template para este canal</p>
                      </div>
                    ) : (
                      <div>
                        {lbl('Template')}
                        <select style={{ ...inp, appearance: 'none' } as any} value={selectedTemplate} onChange={e => handleTemplateChange(e.target.value)}>
                          <option value="">Selecionar template...</option>
                          {templates?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        {selectedTemplateObj && (
                          <div style={{ marginTop: '10px', background: '#FAFBFC', border: '1px solid #ECEEF2', borderRadius: '9px', padding: '13px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                              <FileText size={12} color="#9CA5B3" />
                              <span style={{ fontSize: '11px', color: '#9CA5B3', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Preview</span>
                              <span style={{ fontSize: '10px', background: '#F0FDF4', color: '#15803D', padding: '1px 7px', borderRadius: '99px', fontWeight: 700, marginLeft: 'auto', border: '1px solid #BBF7D0' }}>{selectedTemplateObj.category}</span>
                            </div>
                            <p style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{selectedTemplateObj.body}</p>
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <div style={{ background: '#F4F5F8', borderRadius: '8px', padding: '14px 16px', textAlign: 'center' }}>
                      <p style={{ fontSize: '13px', color: '#9CA5B3', margin: 0 }}>Selecione um canal para ver os templates</p>
                    </div>
                  )
                ) : (
                  <div>
                    {lbl('cURL do Gupshup')}
                    <textarea style={{ ...inp, minHeight: '100px', resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '11.5px', lineHeight: 1.6 } as any} placeholder="curl -X POST https://api.gupshup.io/..." value={curlText} onChange={e => setCurlText(e.target.value)} />
                  </div>
                )}
              </div>

              {/* Contatos */}
              <div>
                {lbl('Contatos — formato: numero,mensagem')}
                <div onClick={() => fileRef.current?.click()}
                  style={{ border: '2px dashed #E8EAED', borderRadius: '9px', padding: '18px', textAlign: 'center', cursor: 'pointer', marginBottom: '8px', background: '#FAFBFC', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#16a34a'; (e.currentTarget as HTMLDivElement).style.background = '#F0FDF4' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#E8EAED'; (e.currentTarget as HTMLDivElement).style.background = '#FAFBFC' }}>
                  <Upload size={15} color="#BCC3CE" style={{ margin: '0 auto 6px' }} />
                  <p style={{ fontSize: '13px', color: '#9CA5B3', margin: 0 }}>Clique para upload do <strong style={{ color: '#5C6474' }}>.csv</strong></p>
                </div>
                <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />
                <textarea style={{ ...inp, minHeight: '80px', resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: 1.6 } as any} placeholder="5511999990001,Olá!" value={contactsText} onChange={e => setContactsText(e.target.value)} />
                {contactsText && (
                  <p style={{ fontSize: '12px', color: '#16a34a', marginTop: '5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                    {contactsText.split('\n').filter(Boolean).length} contatos detectados
                  </p>
                )}
              </div>

              {/* Velocidade */}
              <div>
                {lbl('Mensagens por minuto (anti-ban)')}
                <input type="number" min="1" max="300" style={{ ...inp, width: '110px' } as any} value={messagesPerMin} onChange={e => setMessagesPerMin(Number(e.target.value))} />
              </div>

              {/* Agendamento */}
              <div>
                {lbl('Quando disparar?')}
                <div style={{ display: 'flex', background: '#F4F5F8', borderRadius: '9px', padding: '3px', gap: '2px', marginBottom: '12px' }}>
                  {[
                    { v: 'now',       label: 'Disparar agora', icon: Send },
                    { v: 'scheduled', label: 'Agendar',        icon: Calendar },
                  ].map(opt => {
                    const Icon = opt.icon
                    return (
                      <button key={opt.v} onClick={() => setScheduleMode(opt.v as any)}
                        style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: 500, background: scheduleMode === opt.v ? '#fff' : 'transparent', color: scheduleMode === opt.v ? '#0F1623' : '#9CA5B3', boxShadow: scheduleMode === opt.v ? '0 1px 4px rgba(0,0,0,.08)' : 'none', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                        <Icon size={12} /> {opt.label}
                      </button>
                    )
                  })}
                </div>
                {scheduleMode === 'scheduled' && (
                  <div>
                    <input type="datetime-local" min={minDateTime} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={inp} />
                    {scheduledAt && (
                      <p style={{ fontSize: '12px', color: '#7C3AED', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 }}>
                        <Clock size={11} /> Será disparada em {new Date(scheduledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button onClick={() => { setShowModal(false); resetModal() }}
                  style={{ flex: 1, padding: '10px', background: '#F4F5F8', border: '1px solid #E8EAED', borderRadius: '8px', fontSize: '13.5px', cursor: 'pointer', color: '#5C6474', fontWeight: 500 }}>
                  Cancelar
                </button>
                <button onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || !isValid}
                  style={{ flex: 1, padding: '10px', background: scheduleMode === 'scheduled' ? 'linear-gradient(135deg,#7C3AED,#6D28D9)' : 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13.5px', fontWeight: 600, cursor: createMutation.isPending || !isValid ? 'not-allowed' : 'pointer', opacity: createMutation.isPending || !isValid ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: !isValid ? 'none' : scheduleMode === 'scheduled' ? '0 2px 8px rgba(124,58,237,0.25)' : '0 2px 8px rgba(22,163,74,0.25)', transition: 'all 0.12s' }}>
                  {createMutation.isPending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : scheduleMode === 'scheduled' ? <Calendar size={14} /> : <Send size={14} />}
                  {scheduleMode === 'scheduled' ? 'Agendar campanha' : 'Criar e disparar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus, textarea:focus, select:focus { border-color: #16a34a !important; box-shadow: 0 0 0 3px rgba(22,163,74,0.08) !important; outline: none; }
      `}</style>
    </div>
  )
}
