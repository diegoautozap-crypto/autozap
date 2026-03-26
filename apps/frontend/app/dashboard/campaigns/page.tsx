'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, RefreshCw, X, Send, Upload, Play, Pause, Loader2, ChevronLeft, ChevronRight, BarChart2, CheckCheck, AlertCircle, TrendingUp, Trash2, FileText, Clock, Calendar } from 'lucide-react'

const S: Record<string, { color: string; bg: string; label: string }> = {
  running:   { color: '#16a34a', bg: '#f0fdf4', label: 'Enviando' },
  completed: { color: '#2563eb', bg: '#eff6ff', label: 'Concluída' },
  draft:     { color: '#6b7280', bg: '#f9fafb', label: 'Rascunho' },
  paused:    { color: '#d97706', bg: '#fffbeb', label: 'Pausada' },
  failed:    { color: '#dc2626', bg: '#fef2f2', label: 'Falhou' },
  scheduled: { color: '#7c3aed', bg: '#f5f3ff', label: 'Agendada' },
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: '#fff', border: '1px solid #e5e7eb',
  borderRadius: '6px', fontSize: '14px', outline: 'none',
  color: '#111827', transition: 'border-color 0.15s',
}

const PAGE_SIZE = 10

export default function CampaignsPage() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [contactsText, setContactsText] = useState('')
  const [curlText, setCurlText] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [selectedChannel, setSelectedChannel] = useState('')
  const [messagesPerMin, setMessagesPerMin] = useState(60)
  const [selectedCamp, setSelectedCamp] = useState<any>(null)
  const [page, setPage] = useState(1)
  const [useTemplate, setUseTemplate] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templateVars, setTemplateVars] = useState<string[]>([])
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
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
    queryFn: async () => {
      const { data } = await campaignApi.get(`/templates?channelId=${selectedChannel}`)
      return data.data
    },
    enabled: !!selectedChannel,
  })

  const { data: progress } = useQuery({
    queryKey: ['progress', selectedCamp?.id],
    queryFn: async () => { const { data } = await campaignApi.get(`/campaigns/${selectedCamp.id}/progress`); return data.data },
    enabled: !!selectedCamp?.id,
    refetchInterval: 3000,
  })

  const totalCampaigns = campaigns?.length ?? 0
  const totalPages = Math.ceil(totalCampaigns / PAGE_SIZE)
  const paginatedCampaigns = campaigns?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? []

  const selectedTemplateObj = templates?.find((t: any) => t.id === selectedTemplate)

  const handleTemplateChange = (id: string) => {
    setSelectedTemplate(id)
    const tmpl = templates?.find((t: any) => t.id === id)
    if (tmpl) setTemplateVars(new Array(tmpl.variables?.length || 0).fill(''))
    else setTemplateVars([])
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
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
      const payload: any = {
        channelId: selectedChannel,
        name: campaignName,
        messageTemplate: ' ',
        messagesPerMin,
      }
      if (useTemplate && selectedTemplate) {
        payload.templateId = selectedTemplate
      } else {
        payload.curlTemplate = curlText.trim().replace(/ \\\n/g, ' ').replace(/ \\\r\n/g, ' ').replace(/'/g, '"')
      }
      if (scheduleMode === 'scheduled' && scheduledAt) {
        payload.scheduledAt = new Date(scheduledAt).toISOString()
      }
      const { data: campData } = await campaignApi.post('/campaigns', payload)
      const campId = campData.data.id
      const rows = contactsText.split('\n').filter(Boolean).map(line => {
        const parts = line.split(',')
        const phone = parts[0]?.trim().replace(/\D/g, '')
        const message = parts.slice(1).join(',').trim()
        return { phone, name: message || phone, message: message || '' }
      }).filter(r => r.phone && r.phone.length >= 8)
      if (rows.length > 0) await campaignApi.post(`/campaigns/${campId}/contacts/import`, { rows })

      // Se agendado, não dispara agora
      if (scheduleMode === 'now') {
        await campaignApi.post(`/campaigns/${campId}/start`)
      }

      return campData.data
    },
    onSuccess: (camp) => {
      const msg = scheduleMode === 'scheduled'
        ? `Campanha agendada para ${new Date(scheduledAt).toLocaleString('pt-BR')}!`
        : 'Campanha criada e iniciada!'
      toast.success(msg)
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setShowModal(false)
      setSelectedCamp(camp)
      resetModal()
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao criar campanha'),
  })

  const startMutation = useMutation({
    mutationFn: async (id: string) => { await campaignApi.post(`/campaigns/${id}/start`) },
    onSuccess: () => { toast.success('Campanha iniciada!'); queryClient.invalidateQueries({ queryKey: ['campaigns'] }) },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro'),
  })

  const pauseMutation = useMutation({
    mutationFn: async (id: string) => { await campaignApi.post(`/campaigns/${id}/pause`) },
    onSuccess: () => { toast.success('Pausada'); queryClient.invalidateQueries({ queryKey: ['campaigns'] }) },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await campaignApi.delete(`/campaigns/${id}`) },
    onSuccess: () => {
      toast.success('Campanha deletada!')
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setSelectedCamp(null)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao deletar'),
  })

  const prog = progress || selectedCamp
  const total = prog?.total || prog?.total_contacts || 0
  const sent = prog?.sent || prog?.sent_count || 0
  const delivered = prog?.delivered || prog?.delivered_count || 0
  const read = prog?.read || prog?.read_count || 0
  const failed = prog?.failed || prog?.failed_count || 0
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0
  const readRate = sent > 0 ? Math.round((read / sent) * 100) : 0

  const isValid = campaignName && selectedChannel &&
    (useTemplate ? !!selectedTemplate : !!curlText) &&
    (scheduleMode === 'now' || (scheduleMode === 'scheduled' && !!scheduledAt))

  const label = (text: string) => (
    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>{text}</label>
  )

  // Data mínima para agendamento (agora + 5 minutos)
  const minDateTime = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)

  return (
    <div style={{ padding: '32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>Campanhas</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '3px' }}>Gerencie seus disparos em massa</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => refetch()}
            style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', color: '#6b7280', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff' }}>
            <RefreshCw size={13} /> Atualizar
          </button>
          <button onClick={() => setShowModal(true)}
            style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#15803d' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#16a34a' }}>
            <Plus size={14} /> Nova campanha
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* Lista */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', flex: 1 }}>
            {isLoading ? (
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#9ca3af' }} />
              </div>
            ) : campaigns?.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '14px' }}>Nenhuma campanha ainda</p>
                <button onClick={() => setShowModal(true)} style={{ padding: '8px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  + Nova campanha
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 120px 100px', gap: '8px', padding: '11px 16px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb' }}>
                  {['Campanha', 'Total', 'Enviadas', 'Status', 'Ações'].map(h => (
                    <span key={h} style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                  ))}
                </div>
                {paginatedCampaigns.map((camp: any) => {
                  const s = S[camp.status] || S.draft
                  const p = camp.total_contacts > 0 ? Math.round((camp.sent_count / camp.total_contacts) * 100) : 0
                  const isSelected = selectedCamp?.id === camp.id
                  return (
                    <div key={camp.id} onClick={() => setSelectedCamp(camp)}
                      style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 120px 100px', gap: '8px', padding: '12px 16px', borderBottom: '1px solid #f9fafb', cursor: 'pointer', background: isSelected ? '#f0fdf4' : '#fff', transition: 'background 0.1s', alignItems: 'center', borderLeft: isSelected ? '3px solid #16a34a' : '3px solid transparent' }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#fafafa' }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#fff' }}>
                      <div>
                        <div style={{ fontWeight: 500, color: '#111827', fontSize: '13px', marginBottom: '2px' }}>{camp.name}</div>
                        {camp.scheduled_at && camp.status === 'scheduled' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#7c3aed' }}>
                            <Clock size={10} />
                            {new Date(camp.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        <div style={{ height: '2px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden', marginTop: '4px' }}>
                          <div style={{ width: `${p}%`, height: '100%', background: s.color, borderRadius: '99px' }} />
                        </div>
                      </div>
                      <span style={{ color: '#374151', fontSize: '13px' }}>{camp.total_contacts.toLocaleString()}</span>
                      <span style={{ color: '#374151', fontSize: '13px' }}>{camp.sent_count.toLocaleString()} <span style={{ color: '#9ca3af', fontSize: '11px' }}>({p}%)</span></span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: s.color, background: s.bg, padding: '2px 8px', borderRadius: '99px', display: 'inline-block' }}>{s.label}</span>
                      <div onClick={e => e.stopPropagation()}>
                        {camp.status === 'running' ? (
                          <button onClick={() => pauseMutation.mutate(camp.id)} style={{ padding: '4px 10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', color: '#6b7280' }}>
                            <Pause size={10} /> Pausar
                          </button>
                        ) : ['draft', 'paused'].includes(camp.status) ? (
                          <button onClick={() => startMutation.mutate(camp.id)} style={{ padding: '4px 10px', background: '#16a34a', border: 'none', color: '#fff', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Play size={10} /> Disparar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid #f3f4f6' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCampaigns)} de {totalCampaigns}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                        style={{ padding: '4px 8px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '5px', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#d1d5db' : '#374151', display: 'flex', alignItems: 'center' }}>
                        <ChevronLeft size={13} />
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => setPage(p)}
                          style={{ padding: '4px 8px', background: p === page ? '#16a34a' : '#fff', border: `1px solid ${p === page ? '#16a34a' : '#e5e7eb'}`, borderRadius: '5px', cursor: 'pointer', color: p === page ? '#fff' : '#374151', fontSize: '12px', fontWeight: p === page ? 600 : 400, minWidth: '28px' }}>
                          {p}
                        </button>
                      ))}
                      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                        style={{ padding: '4px 8px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '5px', cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#d1d5db' : '#374151', display: 'flex', alignItems: 'center' }}>
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Painel progresso */}
        <div style={{ width: '280px', flexShrink: 0 }}>
          {selectedCamp ? (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', position: 'sticky', top: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: 0, marginBottom: '2px' }}>{selectedCamp.name}</p>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: S[selectedCamp.status]?.color || '#6b7280', background: S[selectedCamp.status]?.bg || '#f9fafb', padding: '1px 8px', borderRadius: '99px' }}>
                    {S[selectedCamp.status]?.label || 'Rascunho'}
                  </span>
                </div>
                <button onClick={() => setSelectedCamp(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '2px' }}>
                  <X size={14} />
                </button>
              </div>

              {/* Agendamento info */}
              {selectedCamp.scheduled_at && selectedCamp.status === 'scheduled' && (
                <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={14} color="#7c3aed" />
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: '#6d28d9', margin: 0 }}>Agendada para</p>
                    <p style={{ fontSize: '12px', color: '#7c3aed', margin: 0 }}>
                      {new Date(selectedCamp.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>Progresso</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>{pct}%</span>
                </div>
                <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#16a34a', borderRadius: '99px', transition: 'width 0.4s' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                {[
                  { label: 'Total', value: total, color: '#6b7280', icon: BarChart2 },
                  { label: 'Enviadas', value: sent, color: '#2563eb', icon: Send },
                  { label: 'Entregues', value: delivered, color: '#16a34a', icon: CheckCheck },
                  { label: 'Lidas', value: read, color: '#7c3aed', icon: TrendingUp },
                  { label: 'Falhas', value: failed, color: '#dc2626', icon: AlertCircle },
                ].map(({ label, value, color, icon: Icon }) => (
                  <div key={label} style={{ background: '#f9fafb', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                      <Icon size={12} color={color} />
                      <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 500 }}>{label}</span>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color, letterSpacing: '-0.02em' }}>{value.toLocaleString()}</div>
                  </div>
                ))}
              </div>
              {sent > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCheck size={13} color="#16a34a" />
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#15803d' }}>{deliveryRate}% entregues</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>de {sent.toLocaleString()} enviadas</div>
                    </div>
                  </div>
                  <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingUp size={13} color="#7c3aed" />
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#6d28d9' }}>{readRate}% lidas</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>de {sent.toLocaleString()} enviadas</div>
                    </div>
                  </div>
                </div>
              )}
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {selectedCamp.status === 'running' && (
                  <button onClick={() => pauseMutation.mutate(selectedCamp.id)}
                    style={{ width: '100%', padding: '8px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#6b7280', fontWeight: 500 }}>
                    <Pause size={13} /> Pausar campanha
                  </button>
                )}
                {['draft', 'paused', 'scheduled'].includes(selectedCamp.status) && (
                  <button onClick={() => startMutation.mutate(selectedCamp.id)}
                    style={{ width: '100%', padding: '8px', background: '#16a34a', border: 'none', color: '#fff', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Play size={13} /> {selectedCamp.status === 'scheduled' ? 'Disparar agora' : 'Disparar campanha'}
                  </button>
                )}
                {['draft', 'paused', 'completed', 'failed', 'scheduled'].includes(selectedCamp.status) && (
                  <button
                    onClick={() => { if (window.confirm(`Deletar "${selectedCamp.name}"?`)) deleteMutation.mutate(selectedCamp.id) }}
                    disabled={deleteMutation.isPending}
                    style={{ width: '100%', padding: '8px', background: '#fff', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '13px', cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#dc2626', fontWeight: 500, opacity: deleteMutation.isPending ? 0.5 : 1 }}>
                    {deleteMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                    Deletar campanha
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '32px 20px', textAlign: 'center' }}>
              <BarChart2 size={28} color="#e5e7eb" style={{ margin: '0 auto 10px' }} />
              <p style={{ color: '#9ca3af', fontSize: '13px' }}>Clique em uma campanha para ver o progresso</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Nova Campanha */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#111827' }}>Nova Campanha</h2>
              <button onClick={() => { setShowModal(false); resetModal() }} style={{ background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#6b7280', padding: '6px', display: 'flex' }}>
                <X size={16} />
              </button>
            </div>

            {/* Nome */}
            <div style={{ marginBottom: '16px' }}>
              {label('Nome da campanha')}
              <input style={inputStyle} placeholder="Ex: Promoção Black Friday" value={campaignName} onChange={e => setCampaignName(e.target.value)} />
            </div>

            {/* Canal */}
            <div style={{ marginBottom: '16px' }}>
              {label('Canal WhatsApp')}
              <select style={{ ...inputStyle, appearance: 'none' } as any} value={selectedChannel} onChange={e => { setSelectedChannel(e.target.value); setSelectedTemplate(''); setTemplateVars([]) }}>
                <option value="">Selecionar canal...</option>
                {channels?.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              </select>
            </div>

            {/* Template vs cURL */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '3px', gap: '2px', marginBottom: '14px' }}>
                <button onClick={() => setUseTemplate(true)}
                  style={{ flex: 1, padding: '7px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, background: useTemplate ? '#fff' : 'transparent', color: useTemplate ? '#111827' : '#6b7280', boxShadow: useTemplate ? '0 1px 3px rgba(0,0,0,.08)' : 'none', transition: 'all 0.15s' }}>
                  Usar template salvo
                </button>
                <button onClick={() => setUseTemplate(false)}
                  style={{ flex: 1, padding: '7px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, background: !useTemplate ? '#fff' : 'transparent', color: !useTemplate ? '#111827' : '#6b7280', boxShadow: !useTemplate ? '0 1px 3px rgba(0,0,0,.08)' : 'none', transition: 'all 0.15s' }}>
                  Colar cURL manual
                </button>
              </div>

              {useTemplate ? (
                selectedChannel ? (
                  templates?.length === 0 ? (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '14px 16px' }}>
                      <p style={{ fontSize: '13px', color: '#92400e', fontWeight: 500, margin: '0 0 4px' }}>Nenhum template cadastrado para este canal</p>
                    </div>
                  ) : (
                    <div>
                      {label('Template')}
                      <select style={{ ...inputStyle, appearance: 'none' } as any} value={selectedTemplate} onChange={e => handleTemplateChange(e.target.value)}>
                        <option value="">Selecionar template...</option>
                        {templates?.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      {selectedTemplateObj && (
                        <div style={{ marginTop: '10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <FileText size={13} color="#6b7280" />
                            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>Preview</span>
                            <span style={{ fontSize: '10px', background: '#f0fdf4', color: '#15803d', padding: '1px 6px', borderRadius: '99px', fontWeight: 600, marginLeft: 'auto' }}>{selectedTemplateObj.category}</span>
                          </div>
                          <p style={{ fontSize: '13px', color: '#111827', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{selectedTemplateObj.body}</p>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div style={{ background: '#f3f4f6', borderRadius: '8px', padding: '14px 16px', textAlign: 'center' }}>
                    <p style={{ fontSize: '13px', color: '#9ca3af' }}>Selecione um canal para ver os templates</p>
                  </div>
                )
              ) : (
                <div>
                  {label('cURL do Gupshup')}
                  <textarea style={{ ...inputStyle, minHeight: '100px', resize: 'vertical', fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.6 } as any} placeholder="curl -X POST https://api.gupshup.io/..." value={curlText} onChange={e => setCurlText(e.target.value)} />
                </div>
              )}
            </div>

            {/* Contatos */}
            <div style={{ marginBottom: '16px' }}>
              {label('Contatos — formato: numero,mensagem')}
              <div onClick={() => fileRef.current?.click()}
                style={{ border: '2px dashed #e5e7eb', borderRadius: '8px', padding: '16px', textAlign: 'center', cursor: 'pointer', marginBottom: '8px', background: '#fafafa' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#16a34a'; (e.currentTarget as HTMLDivElement).style.background = '#f0fdf4' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLDivElement).style.background = '#fafafa' }}>
                <Upload size={16} color="#9ca3af" style={{ margin: '0 auto 6px' }} />
                <p style={{ fontSize: '13px', color: '#6b7280' }}>Clique para upload do <strong style={{ color: '#111827' }}>.csv</strong></p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />
              <textarea style={{ ...inputStyle, minHeight: '90px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.6 } as any} placeholder="5511999990001,Olá!" value={contactsText} onChange={e => setContactsText(e.target.value)} />
              {contactsText && <p style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px', fontWeight: 500 }}>{contactsText.split('\n').filter(Boolean).length} contatos detectados</p>}
            </div>

            {/* Velocidade */}
            <div style={{ marginBottom: '16px' }}>
              {label('Mensagens por minuto (anti-ban)')}
              <input type="number" min="1" max="300" style={{ ...inputStyle, width: '100px' } as any} value={messagesPerMin} onChange={e => setMessagesPerMin(Number(e.target.value))} />
            </div>

            {/* ── Agendamento ── */}
            <div style={{ marginBottom: '22px' }}>
              {label('Quando disparar?')}
              <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '3px', gap: '2px', marginBottom: '12px' }}>
                <button onClick={() => setScheduleMode('now')}
                  style={{ flex: 1, padding: '7px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, background: scheduleMode === 'now' ? '#fff' : 'transparent', color: scheduleMode === 'now' ? '#111827' : '#6b7280', boxShadow: scheduleMode === 'now' ? '0 1px 3px rgba(0,0,0,.08)' : 'none', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                  <Send size={12} /> Disparar agora
                </button>
                <button onClick={() => setScheduleMode('scheduled')}
                  style={{ flex: 1, padding: '7px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500, background: scheduleMode === 'scheduled' ? '#fff' : 'transparent', color: scheduleMode === 'scheduled' ? '#111827' : '#6b7280', boxShadow: scheduleMode === 'scheduled' ? '0 1px 3px rgba(0,0,0,.08)' : 'none', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                  <Calendar size={12} /> Agendar
                </button>
              </div>
              {scheduleMode === 'scheduled' && (
                <div>
                  <input
                    type="datetime-local"
                    min={minDateTime}
                    value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)}
                    style={{ ...inputStyle }}
                  />
                  {scheduledAt && (
                    <p style={{ fontSize: '12px', color: '#7c3aed', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} />
                      Será disparada em {new Date(scheduledAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setShowModal(false); resetModal() }} style={{ flex: 1, padding: '10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '14px', cursor: 'pointer', color: '#374151', fontWeight: 500 }}>
                Cancelar
              </button>
              <button onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !isValid}
                style={{ flex: 1, padding: '10px', background: scheduleMode === 'scheduled' ? '#7c3aed' : '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: createMutation.isPending || !isValid ? 'not-allowed' : 'pointer', opacity: createMutation.isPending || !isValid ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {createMutation.isPending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : scheduleMode === 'scheduled' ? <Calendar size={15} /> : <Send size={15} />}
                {scheduleMode === 'scheduled' ? 'Agendar campanha' : 'Criar e disparar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus, textarea:focus, select:focus { border-color: #16a34a !important; box-shadow: 0 0 0 3px rgba(22,163,74,0.1) !important; outline: none; }
      `}</style>
    </div>
  )
}
