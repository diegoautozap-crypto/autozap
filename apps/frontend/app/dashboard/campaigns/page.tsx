'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, RefreshCw, X, Send, Upload, Play, Pause, Loader2, ChevronLeft, ChevronRight, BarChart2, CheckCheck, AlertCircle, TrendingUp, Trash2, FileText, Clock, Calendar, Megaphone } from 'lucide-react'

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:        '#0A0A0B',
  surface:   '#111113',
  surface2:  '#18181B',
  border:    '#1F1F23',
  border2:   '#2A2A30',
  text:      '#FAFAFA',
  muted:     '#71717A',
  subtle:    '#3F3F46',
  accent:    '#22C55E',
  accentDim: '#16A34A',
  accentGlow:'rgba(34,197,94,0.15)',
}

const S: Record<string, { color: string; bg: string; label: string }> = {
  running:   { color: '#22C55E', bg: 'rgba(34,197,94,0.1)',   label: 'Enviando'  },
  completed: { color: '#A1A1AA', bg: 'rgba(161,161,170,0.1)', label: 'Concluída' },
  draft:     { color: '#52525B', bg: 'rgba(82,82,91,0.2)',    label: 'Rascunho'  },
  paused:    { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  label: 'Pausada'   },
  failed:    { color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   label: 'Falhou'    },
  scheduled: { color: '#A78BFA', bg: 'rgba(167,139,250,0.1)', label: 'Agendada'  },
}

const PAGE_SIZE = 10

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: T.surface2, border: `1px solid ${T.border2}`,
  borderRadius: '8px', fontSize: '13px', outline: 'none',
  color: T.text, fontFamily: 'inherit',
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

export default function CampaignsPage() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal]               = useState(false)
  const [contactsText, setContactsText]         = useState('')
  const [curlText, setCurlText]                 = useState('')
  const [campaignName, setCampaignName]         = useState('')
  const [selectedChannel, setSelectedChannel]   = useState('')
  const [messagesPerMin, setMessagesPerMin]     = useState(60)
  const [selectedCamp, setSelectedCamp]         = useState<any>(null)
  const [page, setPage]                         = useState(1)
  const [useTemplate, setUseTemplate]           = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templateVars, setTemplateVars]         = useState<string[]>([])
  const [scheduleMode, setScheduleMode]         = useState<'now' | 'scheduled'>('now')
  const [scheduledAt, setScheduledAt]           = useState('')
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

  const totalCampaigns     = campaigns?.length ?? 0
  const totalPages         = Math.ceil(totalCampaigns / PAGE_SIZE)
  const paginatedCampaigns = campaigns?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? []
  const selectedTemplateObj = templates?.find((t: any) => t.id === selectedTemplate)

  const handleTemplateChange = (id: string) => {
    setSelectedTemplate(id)
    const tmpl = templates?.find((t: any) => t.id === id)
    setTemplateVars(tmpl ? new Array(tmpl.variables?.length || 0).fill('') : [])
  }
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setContactsText(ev.target?.result as string)
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
      if (useTemplate && selectedTemplate) payload.templateId = selectedTemplate
      else payload.curlTemplate = curlText.trim().replace(/ \\\n/g,' ').replace(/ \\\r\n/g,' ').replace(/'/g,'"')
      if (scheduleMode === 'scheduled' && scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString()
      const { data: campData } = await campaignApi.post('/campaigns', payload)
      const campId = campData.data.id
      const rows = contactsText.split('\n').filter(Boolean).map(line => {
        const parts = line.split(','); const phone = parts[0]?.trim().replace(/\D/g,'')
        return { phone, name: parts.slice(1).join(',').trim() || phone, message: parts.slice(1).join(',').trim() || '' }
      }).filter(r => r.phone && r.phone.length >= 8)
      if (rows.length > 0) await campaignApi.post(`/campaigns/${campId}/contacts/import`, { rows })
      if (scheduleMode === 'now') await campaignApi.post(`/campaigns/${campId}/start`)
      return campData.data
    },
    onSuccess: camp => {
      toast.success(scheduleMode === 'scheduled' ? `Agendada para ${new Date(scheduledAt).toLocaleString('pt-BR')}!` : 'Campanha criada e iniciada!')
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setShowModal(false); setSelectedCamp(camp); resetModal()
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro'),
  })
  const startMutation  = useMutation({ mutationFn: async (id: string) => { await campaignApi.post(`/campaigns/${id}/start`) }, onSuccess: () => { toast.success('Iniciada!'); queryClient.invalidateQueries({ queryKey: ['campaigns'] }) }, onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro') })
  const pauseMutation  = useMutation({ mutationFn: async (id: string) => { await campaignApi.post(`/campaigns/${id}/pause`) }, onSuccess: () => { toast.success('Pausada'); queryClient.invalidateQueries({ queryKey: ['campaigns'] }) } })
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await campaignApi.delete(`/campaigns/${id}`) },
    onSuccess: () => { toast.success('Deletada!'); queryClient.invalidateQueries({ queryKey: ['campaigns'] }); setSelectedCamp(null) },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro'),
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

  const Lbl = ({ children }: { children: React.ReactNode }) => (
    <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: T.muted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</label>
  )

  const PrimaryBtn = ({ children, onClick, disabled, style = {} }: any) => (
    <button onClick={onClick} disabled={disabled} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '9px 18px', background: disabled ? T.subtle : T.accent, color: disabled ? T.muted : '#000', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s', letterSpacing: '-0.01em', ...style }}>
      {children}
    </button>
  )

  const GhostBtn = ({ children, onClick, style = {} }: any) => (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '9px 14px', background: 'transparent', color: T.muted, border: `1px solid ${T.border2}`, borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', ...style }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.subtle; (e.currentTarget as HTMLButtonElement).style.color = T.text }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.border2; (e.currentTarget as HTMLButtonElement).style.color = T.muted }}>
      {children}
    </button>
  )

  return (
    <div style={{ padding: '32px 36px', height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, color: T.text, fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: T.text, letterSpacing: '-0.04em', margin: 0, lineHeight: 1 }}>Campanhas</h1>
          <p style={{ color: T.muted, fontSize: '13px', marginTop: '6px', letterSpacing: '-0.01em' }}>Gerencie seus disparos em massa</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <GhostBtn onClick={() => refetch()}><RefreshCw size={13} /> Atualizar</GhostBtn>
          <PrimaryBtn onClick={() => setShowModal(true)}><Plus size={14} /> Nova campanha</PrimaryBtn>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>

        {/* ── Tabela ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '12px', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {isLoading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: T.subtle }} />
              </div>
            ) : campaigns?.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', border: `1px solid ${T.border2}`, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Megaphone size={20} color={T.subtle} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: T.text, fontSize: '14px', fontWeight: 600, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Nenhuma campanha</p>
                  <p style={{ color: T.muted, fontSize: '13px', margin: 0 }}>Crie seu primeiro disparo em massa</p>
                </div>
                <PrimaryBtn onClick={() => setShowModal(true)}><Plus size={13} /> Criar campanha</PrimaryBtn>
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 120px 110px 100px', gap: '8px', padding: '12px 20px', borderBottom: `1px solid ${T.border}` }}>
                  {['Campanha', 'Total', 'Enviadas', 'Status', 'Ações'].map(h => (
                    <span key={h} style={{ fontSize: '10px', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</span>
                  ))}
                </div>

                {/* Rows */}
                {paginatedCampaigns.map((camp: any) => {
                  const s = S[camp.status] || S.draft
                  const p = camp.total_contacts > 0 ? Math.round((camp.sent_count / camp.total_contacts) * 100) : 0
                  const isSelected = selectedCamp?.id === camp.id
                  return (
                    <div key={camp.id} onClick={() => setSelectedCamp(camp)}
                      style={{ display: 'grid', gridTemplateColumns: '2fr 80px 120px 110px 100px', gap: '8px', padding: '14px 20px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer', alignItems: 'center', background: isSelected ? 'rgba(34,197,94,0.04)' : 'transparent', borderLeft: `2px solid ${isSelected ? T.accent : 'transparent'}`, transition: 'all 0.1s' }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = T.surface2 }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}>

                      <div>
                        <div style={{ fontWeight: 500, color: T.text, fontSize: '13.5px', letterSpacing: '-0.02em', marginBottom: '2px' }}>{camp.name}</div>
                        {camp.scheduled_at && camp.status === 'scheduled' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#A78BFA', fontWeight: 500, marginTop: '2px' }}>
                            <Clock size={10} />
                            {new Date(camp.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        {camp.status === 'running' && (
                          <div style={{ height: '2px', background: T.border2, borderRadius: '99px', overflow: 'hidden', marginTop: '6px', width: '70%' }}>
                            <div style={{ width: `${p}%`, height: '100%', background: T.accent, borderRadius: '99px', transition: 'width 0.4s', boxShadow: `0 0 6px ${T.accentGlow}` }} />
                          </div>
                        )}
                      </div>

                      <span style={{ color: T.muted, fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{camp.total_contacts.toLocaleString()}</span>

                      <span style={{ color: T.text, fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                        {camp.sent_count.toLocaleString()}
                        <span style={{ color: T.muted, fontSize: '11px', marginLeft: '4px' }}>({p}%)</span>
                      </span>

                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', background: s.bg, borderRadius: '6px', width: 'fit-content' }}>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: s.color, letterSpacing: '-0.01em' }}>{s.label}</span>
                      </div>

                      <div onClick={e => e.stopPropagation()}>
                        {camp.status === 'running' ? (
                          <button onClick={() => pauseMutation.mutate(camp.id)}
                            style={{ padding: '5px 10px', background: T.surface2, border: `1px solid ${T.border2}`, borderRadius: '6px', fontSize: '11.5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: T.muted, fontWeight: 500 }}>
                            <Pause size={10} /> Pausar
                          </button>
                        ) : ['draft', 'paused'].includes(camp.status) ? (
                          <button onClick={() => startMutation.mutate(camp.id)}
                            style={{ padding: '5px 10px', background: T.accent, border: 'none', color: '#000', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Play size={10} fill="#000" /> Disparar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: `1px solid ${T.border}`, marginTop: 'auto' }}>
                    <span style={{ fontSize: '12px', color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
                      {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCampaigns)} de {totalCampaigns}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                        style={{ padding: '5px 8px', background: T.surface2, border: `1px solid ${T.border2}`, borderRadius: '6px', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? T.subtle : T.muted, display: 'flex', alignItems: 'center' }}>
                        <ChevronLeft size={13} />
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => setPage(p)}
                          style={{ padding: '5px 9px', background: p === page ? T.accent : T.surface2, border: `1px solid ${p === page ? T.accent : T.border2}`, borderRadius: '6px', cursor: 'pointer', color: p === page ? '#000' : T.muted, fontSize: '12px', fontWeight: p === page ? 700 : 400, minWidth: '30px' }}>
                          {p}
                        </button>
                      ))}
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        style={{ padding: '5px 8px', background: T.surface2, border: `1px solid ${T.border2}`, borderRadius: '6px', cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? T.subtle : T.muted, display: 'flex', alignItems: 'center' }}>
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Painel lateral ─────────────────────────────────────────────── */}
        <div style={{ width: '268px', flexShrink: 0 }}>
          {selectedCamp ? (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '12px', overflow: 'hidden', position: 'sticky', top: 0 }}>
              {/* Camp header */}
              <div style={{ padding: '16px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: '10px' }}>
                  <p style={{ fontSize: '13.5px', fontWeight: 600, color: T.text, margin: '0 0 5px', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedCamp.name}</p>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 8px', background: (S[selectedCamp.status] || S.draft).bg, borderRadius: '5px' }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: (S[selectedCamp.status] || S.draft).color }} />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: (S[selectedCamp.status] || S.draft).color }}>{(S[selectedCamp.status] || S.draft).label}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedCamp(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.subtle, padding: '2px', display: 'flex', flexShrink: 0 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = T.muted }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = T.subtle }}>
                  <X size={14} />
                </button>
              </div>

              <div style={{ padding: '16px 18px' }}>
                {/* Scheduled banner */}
                {selectedCamp.scheduled_at && selectedCamp.status === 'scheduled' && (
                  <div style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <Calendar size={13} color="#A78BFA" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: '#A78BFA', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Agendada para</p>
                      <p style={{ fontSize: '12px', color: '#C4B5FD', margin: 0 }}>
                        {new Date(selectedCamp.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                )}

                {/* Progress */}
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Progresso</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: T.text, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                  </div>
                  <div style={{ height: '3px', background: T.border2, borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: T.accent, borderRadius: '99px', transition: 'width 0.5s ease', boxShadow: pct > 0 ? `0 0 8px ${T.accentGlow}` : 'none' }} />
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '14px' }}>
                  {[
                    { label: 'Total',     value: total,     color: T.muted,   icon: BarChart2 },
                    { label: 'Enviadas',  value: sent,      color: '#60A5FA', icon: Send },
                    { label: 'Entregues', value: delivered, color: T.accent,  icon: CheckCheck },
                    { label: 'Lidas',     value: read,      color: '#A78BFA', icon: TrendingUp },
                    { label: 'Falhas',    value: failed,    color: '#F87171', icon: AlertCircle },
                  ].map(({ label, value, color, icon: Icon }) => (
                    <div key={label} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                        <Icon size={11} color={color} />
                        <span style={{ fontSize: '10px', color: T.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>

                {/* Rates */}
                {sent > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                    {[
                      { rate: deliveryRate, label: 'entregues', color: T.accent,  bg: T.accentGlow, icon: CheckCheck },
                      { rate: readRate,     label: 'lidas',     color: '#A78BFA', bg: 'rgba(167,139,250,0.1)', icon: TrendingUp },
                    ].map(({ rate, label, color, bg, icon: Icon }) => (
                      <div key={label} style={{ background: bg, border: `1px solid ${color}22`, borderRadius: '8px', padding: '9px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <Icon size={12} color={color} />
                          <span style={{ fontSize: '12px', color, fontWeight: 600 }}>{rate}% {label}</span>
                        </div>
                        <span style={{ fontSize: '11px', color: T.muted }}>{sent.toLocaleString()} envios</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedCamp.status === 'running' && (
                    <GhostBtn onClick={() => pauseMutation.mutate(selectedCamp.id)} style={{ width: '100%' }}>
                      <Pause size={13} /> Pausar campanha
                    </GhostBtn>
                  )}
                  {['draft', 'paused', 'scheduled'].includes(selectedCamp.status) && (
                    <PrimaryBtn onClick={() => startMutation.mutate(selectedCamp.id)} style={{ width: '100%' }}>
                      <Play size={13} fill="#000" /> {selectedCamp.status === 'scheduled' ? 'Disparar agora' : 'Disparar'}
                    </PrimaryBtn>
                  )}
                  {['draft', 'paused', 'completed', 'failed', 'scheduled'].includes(selectedCamp.status) && (
                    <button onClick={() => { if (window.confirm(`Deletar "${selectedCamp.name}"?`)) deleteMutation.mutate(selectedCamp.id) }}
                      disabled={deleteMutation.isPending}
                      style={{ width: '100%', padding: '9px', background: 'transparent', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#F87171', fontWeight: 500, opacity: deleteMutation.isPending ? 0.5 : 1, transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.5)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.05)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.25)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
                      {deleteMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                      Deletar campanha
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', border: `1px solid ${T.border2}`, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <BarChart2 size={18} color={T.subtle} />
              </div>
              <p style={{ color: T.muted, fontSize: '13px', letterSpacing: '-0.01em' }}>Selecione uma campanha</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: T.surface, border: `1px solid ${T.border2}`, borderRadius: '16px', padding: '0', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,.6)' }}>
            {/* Modal header */}
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: 700, color: T.text, letterSpacing: '-0.03em', margin: 0 }}>Nova Campanha</h2>
                <p style={{ fontSize: '12px', color: T.muted, marginTop: '3px' }}>Configure o disparo em massa</p>
              </div>
              <button onClick={() => { setShowModal(false); resetModal() }}
                style={{ background: T.surface2, border: `1px solid ${T.border2}`, borderRadius: '7px', cursor: 'pointer', color: T.muted, padding: '6px', display: 'flex' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = T.text }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = T.muted }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Nome */}
              <div>
                <Lbl>Nome da campanha</Lbl>
                <input style={inp} placeholder="Ex: Promoção Black Friday" value={campaignName} onChange={e => setCampaignName(e.target.value)}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = T.accent; (e.target as HTMLInputElement).style.boxShadow = `0 0 0 3px ${T.accentGlow}` }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = T.border2; (e.target as HTMLInputElement).style.boxShadow = 'none' }} />
              </div>

              {/* Canal */}
              <div>
                <Lbl>Canal WhatsApp</Lbl>
                <select style={{ ...inp, appearance: 'none' } as any} value={selectedChannel} onChange={e => { setSelectedChannel(e.target.value); setSelectedTemplate(''); setTemplateVars([]) }}>
                  <option value="">Selecionar canal...</option>
                  {channels?.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                </select>
              </div>

              {/* Toggle */}
              <div>
                <div style={{ display: 'flex', background: T.bg, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '3px', gap: '2px', marginBottom: '14px' }}>
                  {[{ v: true, label: 'Template salvo' }, { v: false, label: 'cURL manual' }].map(opt => (
                    <button key={String(opt.v)} onClick={() => setUseTemplate(opt.v)}
                      style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: 500, background: useTemplate === opt.v ? T.surface2 : 'transparent', color: useTemplate === opt.v ? T.text : T.muted, boxShadow: useTemplate === opt.v ? `0 1px 3px rgba(0,0,0,.3), inset 0 0 0 1px ${T.border2}` : 'none', transition: 'all 0.15s' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>

                {useTemplate ? (
                  selectedChannel ? (
                    templates?.length === 0 ? (
                      <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '13px 15px' }}>
                        <p style={{ fontSize: '13px', color: '#FCD34D', fontWeight: 500, margin: 0 }}>Nenhum template para este canal</p>
                      </div>
                    ) : (
                      <div>
                        <Lbl>Template</Lbl>
                        <select style={{ ...inp, appearance: 'none' } as any} value={selectedTemplate} onChange={e => handleTemplateChange(e.target.value)}>
                          <option value="">Selecionar template...</option>
                          {templates?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        {selectedTemplateObj && (
                          <div style={{ marginTop: '10px', background: T.surface2, border: `1px solid ${T.border2}`, borderRadius: '9px', padding: '13px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                              <FileText size={12} color={T.muted} />
                              <span style={{ fontSize: '10px', color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Preview</span>
                              <span style={{ fontSize: '10px', background: T.accentGlow, color: T.accent, padding: '1px 7px', borderRadius: '5px', fontWeight: 700, marginLeft: 'auto', border: `1px solid ${T.accent}33` }}>{selectedTemplateObj.category}</span>
                            </div>
                            <p style={{ fontSize: '13px', color: T.text, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', opacity: 0.85 }}>{selectedTemplateObj.body}</p>
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <div style={{ background: T.surface2, borderRadius: '8px', padding: '14px 16px', textAlign: 'center', border: `1px solid ${T.border}` }}>
                      <p style={{ fontSize: '13px', color: T.muted, margin: 0 }}>Selecione um canal para ver os templates</p>
                    </div>
                  )
                ) : (
                  <div>
                    <Lbl>cURL do Gupshup</Lbl>
                    <textarea style={{ ...inp, minHeight: '90px', resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '11.5px', lineHeight: 1.6 } as any} placeholder="curl -X POST https://api.gupshup.io/..." value={curlText} onChange={e => setCurlText(e.target.value)} />
                  </div>
                )}
              </div>

              {/* Contatos */}
              <div>
                <Lbl>Contatos — formato: numero,mensagem</Lbl>
                <div onClick={() => fileRef.current?.click()}
                  style={{ border: `1px dashed ${T.border2}`, borderRadius: '9px', padding: '18px', textAlign: 'center', cursor: 'pointer', marginBottom: '8px', background: T.surface2, transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = T.accent; (e.currentTarget as HTMLDivElement).style.background = T.accentGlow }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = T.border2; (e.currentTarget as HTMLDivElement).style.background = T.surface2 }}>
                  <Upload size={14} color={T.subtle} style={{ margin: '0 auto 6px' }} />
                  <p style={{ fontSize: '13px', color: T.muted, margin: 0 }}>Upload <strong style={{ color: T.text }}>.csv</strong></p>
                </div>
                <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />
                <textarea style={{ ...inp, minHeight: '70px', resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: 1.6 } as any} placeholder="5511999990001,Olá!" value={contactsText} onChange={e => setContactsText(e.target.value)} />
                {contactsText && (
                  <p style={{ fontSize: '12px', color: T.accent, marginTop: '5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: T.accent, display: 'inline-block' }} />
                    {contactsText.split('\n').filter(Boolean).length} contatos detectados
                  </p>
                )}
              </div>

              {/* Velocidade */}
              <div>
                <Lbl>Mensagens por minuto (anti-ban)</Lbl>
                <input type="number" min="1" max="300" style={{ ...inp, width: '100px' } as any} value={messagesPerMin} onChange={e => setMessagesPerMin(Number(e.target.value))} />
              </div>

              {/* Quando */}
              <div>
                <Lbl>Quando disparar?</Lbl>
                <div style={{ display: 'flex', background: T.bg, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '3px', gap: '2px', marginBottom: '12px' }}>
                  {[{ v: 'now', label: 'Disparar agora', Icon: Send }, { v: 'scheduled', label: 'Agendar', Icon: Calendar }].map(({ v, label, Icon }) => (
                    <button key={v} onClick={() => setScheduleMode(v as any)}
                      style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: 500, background: scheduleMode === v ? T.surface2 : 'transparent', color: scheduleMode === v ? T.text : T.muted, boxShadow: scheduleMode === v ? `0 1px 3px rgba(0,0,0,.3), inset 0 0 0 1px ${T.border2}` : 'none', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
                {scheduleMode === 'scheduled' && (
                  <div>
                    <input type="datetime-local" min={minDateTime} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={inp} />
                    {scheduledAt && (
                      <p style={{ fontSize: '12px', color: '#A78BFA', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 }}>
                        <Clock size={11} /> {new Date(scheduledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ padding: '16px 24px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: '8px', flexShrink: 0 }}>
              <GhostBtn onClick={() => { setShowModal(false); resetModal() }} style={{ flex: 1 }}>Cancelar</GhostBtn>
              <PrimaryBtn onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !isValid} style={{ flex: 1, background: !isValid || createMutation.isPending ? T.subtle : scheduleMode === 'scheduled' ? '#A78BFA' : T.accent, color: !isValid || createMutation.isPending ? T.muted : scheduleMode === 'scheduled' ? '#000' : '#000' }}>
                {createMutation.isPending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : scheduleMode === 'scheduled' ? <Calendar size={14} /> : <Send size={14} />}
                {scheduleMode === 'scheduled' ? 'Agendar' : 'Criar e disparar'}
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus, textarea:focus, select:focus { border-color: ${T.accent} !important; box-shadow: 0 0 0 3px ${T.accentGlow} !important; outline: none; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: ${T.border2}; border-radius: 99px; }
        option { background: ${T.surface2}; color: ${T.text}; }
      `}</style>
    </div>
  )
}
