'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, RefreshCw, X, Send, Upload, Play, Pause, Loader2, ChevronLeft, ChevronRight, BarChart2, CheckCheck, AlertCircle, TrendingUp, Trash2, FileText, Clock, Calendar, Megaphone } from 'lucide-react'

const S: Record<string, { color: string; bg: string; dot: string; label: string }> = {
  running:   { color: '#16a34a', bg: '#f0fdf4', dot: '#22c55e', label: 'Enviando'  },
  completed: { color: '#52525b', bg: '#f4f4f5', dot: '#a1a1aa', label: 'Concluída' },
  draft:     { color: '#71717a', bg: '#fafafa',  dot: '#d4d4d8', label: 'Rascunho'  },
  paused:    { color: '#d97706', bg: '#fffbeb',  dot: '#f59e0b', label: 'Pausada'   },
  failed:    { color: '#dc2626', bg: '#fef2f2',  dot: '#ef4444', label: 'Falhou'    },
  scheduled: { color: '#7c3aed', bg: '#f5f3ff',  dot: '#8b5cf6', label: 'Agendada'  },
}

const PAGE_SIZE = 10

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: '#fff', border: '1px solid #e4e4e7',
  borderRadius: '8px', fontSize: '13.5px', outline: 'none',
  color: '#18181b', fontFamily: 'inherit', transition: 'all 0.15s',
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

  const totalCampaigns      = campaigns?.length ?? 0
  const totalPages          = Math.ceil(totalCampaigns / PAGE_SIZE)
  const paginatedCampaigns  = campaigns?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? []
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
      toast.success(scheduleMode === 'scheduled' ? `Agendada!` : 'Campanha criada e iniciada!')
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
  const isValid      = campaignName && selectedChannel && (useTemplate ? !!selectedTemplate : !!curlText) && (scheduleMode === 'now' || (scheduleMode === 'scheduled' && !!scheduledAt))
  const minDateTime  = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)

  const Lbl = ({ children }: { children: React.ReactNode }) => (
    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#71717a', marginBottom: '6px', letterSpacing: '0.01em' }}>{children}</label>
  )

  return (
    <div style={{ padding: '28px 32px', height: '100%', display: 'flex', flexDirection: 'column', background: '#f4f4f5' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#18181b', letterSpacing: '-0.03em', margin: 0 }}>Campanhas</h1>
          <p style={{ color: '#71717a', fontSize: '13.5px', marginTop: '4px' }}>Gerencie seus disparos em massa</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => refetch()}
            style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e4e4e7', borderRadius: '8px', color: '#52525b', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fafafa' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff' }}>
            <RefreshCw size={13} /> Atualizar
          </button>
          <button onClick={() => setShowModal(true)}
            style={{ padding: '8px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 1px 3px rgba(34,197,94,0.3)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#16a34a' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#22c55e' }}>
            <Plus size={14} /> Nova campanha
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>

        {/* ── Tabela ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            {isLoading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px' }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#d4d4d8' }} />
              </div>
            ) : campaigns?.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '60px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f4f4f5', border: '1px solid #e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Megaphone size={22} color="#a1a1aa" />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: '#18181b', fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>Nenhuma campanha ainda</p>
                  <p style={{ color: '#71717a', fontSize: '13px', margin: 0 }}>Crie seu primeiro disparo em massa</p>
                </div>
                <button onClick={() => setShowModal(true)}
                  style={{ padding: '8px 18px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  + Criar campanha
                </button>
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 120px 120px 100px', gap: '8px', padding: '11px 20px', background: '#fafafa', borderBottom: '1px solid #f4f4f5' }}>
                  {['Campanha', 'Total', 'Enviadas', 'Status', 'Ações'].map(h => (
                    <span key={h} style={{ fontSize: '11px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                  ))}
                </div>

                {/* Rows */}
                {paginatedCampaigns.map((camp: any) => {
                  const s = S[camp.status] || S.draft
                  const p = camp.total_contacts > 0 ? Math.round((camp.sent_count / camp.total_contacts) * 100) : 0
                  const isSelected = selectedCamp?.id === camp.id
                  return (
                    <div key={camp.id} onClick={() => setSelectedCamp(camp)}
                      style={{ display: 'grid', gridTemplateColumns: '2fr 80px 120px 120px 100px', gap: '8px', padding: '13px 20px', borderBottom: '1px solid #f4f4f5', cursor: 'pointer', background: isSelected ? '#f0fdf4' : '#fff', transition: 'background 0.1s', alignItems: 'center', borderLeft: `3px solid ${isSelected ? '#22c55e' : 'transparent'}` }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#fafafa' }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#fff' }}>

                      <div>
                        <div style={{ fontWeight: 500, color: '#18181b', fontSize: '13.5px', letterSpacing: '-0.01em', marginBottom: '2px' }}>{camp.name}</div>
                        {camp.scheduled_at && camp.status === 'scheduled' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#7c3aed', fontWeight: 500, marginTop: '2px' }}>
                            <Clock size={10} />{new Date(camp.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        {camp.status === 'running' && (
                          <div style={{ height: '2px', background: '#f4f4f5', borderRadius: '99px', overflow: 'hidden', marginTop: '6px', width: '70%' }}>
                            <div style={{ width: `${p}%`, height: '100%', background: '#22c55e', borderRadius: '99px', transition: 'width 0.4s' }} />
                          </div>
                        )}
                      </div>

                      <span style={{ color: '#71717a', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{camp.total_contacts.toLocaleString()}</span>

                      <span style={{ color: '#18181b', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                        {camp.sent_count.toLocaleString()}
                        <span style={{ color: '#a1a1aa', fontSize: '11px', marginLeft: '4px' }}>({p}%)</span>
                      </span>

                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', background: s.bg, borderRadius: '6px' }}>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: s.color }}>{s.label}</span>
                      </div>

                      <div onClick={e => e.stopPropagation()}>
                        {camp.status === 'running' ? (
                          <button onClick={() => pauseMutation.mutate(camp.id)}
                            style={{ padding: '5px 10px', background: '#fff', border: '1px solid #e4e4e7', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: '#71717a', fontWeight: 500 }}>
                            <Pause size={10} /> Pausar
                          </button>
                        ) : ['draft', 'paused'].includes(camp.status) ? (
                          <button onClick={() => startMutation.mutate(camp.id)}
                            style={{ padding: '5px 10px', background: '#22c55e', border: 'none', color: '#fff', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Play size={10} fill="#fff" /> Disparar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid #f4f4f5', marginTop: 'auto' }}>
                    <span style={{ fontSize: '12px', color: '#a1a1aa' }}>{((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCampaigns)} de {totalCampaigns}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                        style={{ padding: '5px 8px', background: '#fff', border: '1px solid #e4e4e7', borderRadius: '6px', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#d4d4d8' : '#52525b', display: 'flex' }}>
                        <ChevronLeft size={13} />
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => setPage(p)}
                          style={{ padding: '5px 9px', background: p === page ? '#22c55e' : '#fff', border: `1px solid ${p === page ? '#22c55e' : '#e4e4e7'}`, borderRadius: '6px', cursor: 'pointer', color: p === page ? '#fff' : '#52525b', fontSize: '12px', fontWeight: p === page ? 700 : 400, minWidth: '30px' }}>
                          {p}
                        </button>
                      ))}
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        style={{ padding: '5px 8px', background: '#fff', border: '1px solid #e4e4e7', borderRadius: '6px', cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#d4d4d8' : '#52525b', display: 'flex' }}>
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
            <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', overflow: 'hidden', position: 'sticky', top: 0, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid #f4f4f5', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: '10px' }}>
                  <p style={{ fontSize: '13.5px', fontWeight: 600, color: '#18181b', margin: '0 0 5px', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedCamp.name}</p>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 8px', background: (S[selectedCamp.status] || S.draft).bg, borderRadius: '5px' }}>
                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: (S[selectedCamp.status] || S.draft).dot }} />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: (S[selectedCamp.status] || S.draft).color }}>{(S[selectedCamp.status] || S.draft).label}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedCamp(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '2px', display: 'flex' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#52525b' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa' }}>
                  <X size={14} />
                </button>
              </div>

              <div style={{ padding: '16px 18px' }}>
                {selectedCamp.scheduled_at && selectedCamp.status === 'scheduled' && (
                  <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <Calendar size={13} color="#7c3aed" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: '#6d28d9', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agendada para</p>
                      <p style={{ fontSize: '12px', color: '#7c3aed', margin: 0 }}>{new Date(selectedCamp.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                )}

                {/* Progress */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '7px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Progresso</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#18181b', letterSpacing: '-0.03em' }}>{pct}%</span>
                  </div>
                  <div style={{ height: '4px', background: '#f4f4f5', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#22c55e', borderRadius: '99px', transition: 'width 0.5s ease' }} />
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
                  {[
                    { label: 'Total',     value: total,     color: '#71717a', icon: BarChart2 },
                    { label: 'Enviadas',  value: sent,      color: '#2563eb', icon: Send },
                    { label: 'Entregues', value: delivered, color: '#16a34a', icon: CheckCheck },
                    { label: 'Lidas',     value: read,      color: '#7c3aed', icon: TrendingUp },
                    { label: 'Falhas',    value: failed,    color: '#dc2626', icon: AlertCircle },
                  ].map(({ label, value, color, icon: Icon }) => (
                    <div key={label} style={{ background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: '8px', padding: '9px 11px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                        <Icon size={11} color={color} />
                        <span style={{ fontSize: '10px', color: '#a1a1aa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                      </div>
                      <div style={{ fontSize: '19px', fontWeight: 700, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>

                {sent > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
                    {[
                      { rate: deliveryRate, label: 'entregues', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: CheckCheck },
                      { rate: readRate,     label: 'lidas',     color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', icon: TrendingUp },
                    ].map(({ rate, label, color, bg, border, icon: Icon }) => (
                      <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: '7px', padding: '8px 11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Icon size={12} color={color} />
                          <span style={{ fontSize: '12px', color, fontWeight: 600 }}>{rate}% {label}</span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#a1a1aa' }}>{sent.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedCamp.status === 'running' && (
                    <button onClick={() => pauseMutation.mutate(selectedCamp.id)}
                      style={{ width: '100%', padding: '8px', background: '#fff', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#52525b', fontWeight: 500 }}>
                      <Pause size={13} /> Pausar campanha
                    </button>
                  )}
                  {['draft', 'paused', 'scheduled'].includes(selectedCamp.status) && (
                    <button onClick={() => startMutation.mutate(selectedCamp.id)}
                      style={{ width: '100%', padding: '8px', background: '#22c55e', border: 'none', color: '#fff', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <Play size={13} fill="#fff" /> {selectedCamp.status === 'scheduled' ? 'Disparar agora' : 'Disparar'}
                    </button>
                  )}
                  {['draft', 'paused', 'completed', 'failed', 'scheduled'].includes(selectedCamp.status) && (
                    <button onClick={() => { if (window.confirm(`Deletar "${selectedCamp.name}"?`)) deleteMutation.mutate(selectedCamp.id) }}
                      disabled={deleteMutation.isPending}
                      style={{ width: '100%', padding: '8px', background: '#fff', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#dc2626', fontWeight: 500, opacity: deleteMutation.isPending ? 0.5 : 1 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff' }}>
                      {deleteMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                      Deletar campanha
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <BarChart2 size={20} color="#d4d4d8" />
              </div>
              <p style={{ color: '#a1a1aa', fontSize: '13px' }}>Selecione uma campanha</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f4f4f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#18181b', letterSpacing: '-0.02em', margin: 0 }}>Nova Campanha</h2>
                <p style={{ fontSize: '12.5px', color: '#71717a', marginTop: '3px' }}>Configure o disparo em massa</p>
              </div>
              <button onClick={() => { setShowModal(false); resetModal() }}
                style={{ background: '#f4f4f5', border: 'none', borderRadius: '7px', cursor: 'pointer', color: '#71717a', padding: '6px', display: 'flex' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#e4e4e7' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f4f4f5' }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <Lbl>Nome da campanha</Lbl>
                <input style={inp} placeholder="Ex: Promoção Black Friday" value={campaignName} onChange={e => setCampaignName(e.target.value)}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#22c55e'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(34,197,94,0.1)' }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e4e4e7'; (e.target as HTMLInputElement).style.boxShadow = 'none' }} />
              </div>

              <div>
                <Lbl>Canal WhatsApp</Lbl>
                <select style={{ ...inp, appearance: 'none' } as any} value={selectedChannel} onChange={e => { setSelectedChannel(e.target.value); setSelectedTemplate(''); setTemplateVars([]) }}>
                  <option value="">Selecionar canal...</option>
                  {channels?.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', background: '#f4f4f5', borderRadius: '9px', padding: '3px', gap: '2px', marginBottom: '13px' }}>
                  {[{ v: true, label: 'Template salvo' }, { v: false, label: 'cURL manual' }].map(opt => (
                    <button key={String(opt.v)} onClick={() => setUseTemplate(opt.v)}
                      style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, background: useTemplate === opt.v ? '#fff' : 'transparent', color: useTemplate === opt.v ? '#18181b' : '#71717a', boxShadow: useTemplate === opt.v ? '0 1px 3px rgba(0,0,0,.08)' : 'none', transition: 'all 0.15s' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                {useTemplate ? (
                  selectedChannel ? (
                    templates?.length === 0 ? (
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '13px 15px' }}>
                        <p style={{ fontSize: '13px', color: '#92400e', fontWeight: 500, margin: 0 }}>Nenhum template para este canal</p>
                      </div>
                    ) : (
                      <div>
                        <Lbl>Template</Lbl>
                        <select style={{ ...inp, appearance: 'none' } as any} value={selectedTemplate} onChange={e => handleTemplateChange(e.target.value)}>
                          <option value="">Selecionar template...</option>
                          {templates?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        {selectedTemplateObj && (
                          <div style={{ marginTop: '10px', background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: '8px', padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '7px' }}>
                              <FileText size={12} color="#a1a1aa" />
                              <span style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preview</span>
                              <span style={{ fontSize: '10px', background: '#f0fdf4', color: '#16a34a', padding: '1px 7px', borderRadius: '5px', fontWeight: 700, marginLeft: 'auto', border: '1px solid #bbf7d0' }}>{selectedTemplateObj.category}</span>
                            </div>
                            <p style={{ fontSize: '13px', color: '#18181b', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{selectedTemplateObj.body}</p>
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <div style={{ background: '#fafafa', borderRadius: '8px', padding: '14px 16px', textAlign: 'center', border: '1px solid #f4f4f5' }}>
                      <p style={{ fontSize: '13px', color: '#a1a1aa', margin: 0 }}>Selecione um canal para ver os templates</p>
                    </div>
                  )
                ) : (
                  <div>
                    <Lbl>cURL do Gupshup</Lbl>
                    <textarea style={{ ...inp, minHeight: '90px', resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '11.5px', lineHeight: 1.6 } as any} placeholder="curl -X POST https://api.gupshup.io/..." value={curlText} onChange={e => setCurlText(e.target.value)} />
                  </div>
                )}
              </div>

              <div>
                <Lbl>Contatos — formato: numero,mensagem</Lbl>
                <div onClick={() => fileRef.current?.click()}
                  style={{ border: '2px dashed #e4e4e7', borderRadius: '8px', padding: '16px', textAlign: 'center', cursor: 'pointer', marginBottom: '8px', background: '#fafafa', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#22c55e'; (e.currentTarget as HTMLDivElement).style.background = '#f0fdf4' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e4e4e7'; (e.currentTarget as HTMLDivElement).style.background = '#fafafa' }}>
                  <Upload size={14} color="#a1a1aa" style={{ margin: '0 auto 5px' }} />
                  <p style={{ fontSize: '13px', color: '#71717a', margin: 0 }}>Upload <strong style={{ color: '#18181b' }}>.csv</strong></p>
                </div>
                <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />
                <textarea style={{ ...inp, minHeight: '70px', resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: 1.6 } as any} placeholder="5511999990001,Olá!" value={contactsText} onChange={e => setContactsText(e.target.value)} />
                {contactsText && (
                  <p style={{ fontSize: '12px', color: '#16a34a', marginTop: '5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                    {contactsText.split('\n').filter(Boolean).length} contatos detectados
                  </p>
                )}
              </div>

              <div>
                <Lbl>Mensagens por minuto (anti-ban)</Lbl>
                <input type="number" min="1" max="300" style={{ ...inp, width: '100px' } as any} value={messagesPerMin} onChange={e => setMessagesPerMin(Number(e.target.value))} />
              </div>

              <div>
                <Lbl>Quando disparar?</Lbl>
                <div style={{ display: 'flex', background: '#f4f4f5', borderRadius: '9px', padding: '3px', gap: '2px', marginBottom: '12px' }}>
                  {[{ v: 'now', label: 'Disparar agora', Icon: Send }, { v: 'scheduled', label: 'Agendar', Icon: Calendar }].map(({ v, label, Icon }) => (
                    <button key={v} onClick={() => setScheduleMode(v as any)}
                      style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, background: scheduleMode === v ? '#fff' : 'transparent', color: scheduleMode === v ? '#18181b' : '#71717a', boxShadow: scheduleMode === v ? '0 1px 3px rgba(0,0,0,.08)' : 'none', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
                {scheduleMode === 'scheduled' && (
                  <div>
                    <input type="datetime-local" min={minDateTime} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={inp} />
                    {scheduledAt && (
                      <p style={{ fontSize: '12px', color: '#7c3aed', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500 }}>
                        <Clock size={11} /> {new Date(scheduledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #f4f4f5', display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button onClick={() => { setShowModal(false); resetModal() }}
                style={{ flex: 1, padding: '10px', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '13.5px', cursor: 'pointer', color: '#52525b', fontWeight: 500 }}>
                Cancelar
              </button>
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !isValid}
                style={{ flex: 1, padding: '10px', background: !isValid || createMutation.isPending ? '#d4d4d8' : scheduleMode === 'scheduled' ? '#7c3aed' : '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13.5px', fontWeight: 600, cursor: !isValid || createMutation.isPending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.12s' }}>
                {createMutation.isPending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : scheduleMode === 'scheduled' ? <Calendar size={14} /> : <Send size={14} />}
                {scheduleMode === 'scheduled' ? 'Agendar' : 'Criar e disparar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus, textarea:focus, select:focus { border-color: #22c55e !important; box-shadow: 0 0 0 3px rgba(34,197,94,0.1) !important; outline: none; }
      `}</style>
    </div>
  )
}
