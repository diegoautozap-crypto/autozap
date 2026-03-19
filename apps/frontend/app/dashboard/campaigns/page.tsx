'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, RefreshCw, X, Send, Upload, Play, Pause, Loader2, ChevronLeft, ChevronRight, BarChart2, CheckCheck, AlertCircle, TrendingUp } from 'lucide-react'

const S: Record<string, { color: string; bg: string; label: string }> = {
  running:   { color: '#16a34a', bg: '#f0fdf4', label: 'Enviando' },
  completed: { color: '#2563eb', bg: '#eff6ff', label: 'Concluída' },
  draft:     { color: '#6b7280', bg: '#f9fafb', label: 'Rascunho' },
  paused:    { color: '#d97706', bg: '#fffbeb', label: 'Pausada' },
  failed:    { color: '#dc2626', bg: '#fef2f2', label: 'Falhou' },
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

  const { data: progress } = useQuery({
    queryKey: ['progress', selectedCamp?.id],
    queryFn: async () => { const { data } = await campaignApi.get(`/campaigns/${selectedCamp.id}/progress`); return data.data },
    enabled: !!selectedCamp?.id,
    refetchInterval: 3000,
  })

  const totalCampaigns = campaigns?.length ?? 0
  const totalPages = Math.ceil(totalCampaigns / PAGE_SIZE)
  const paginatedCampaigns = campaigns?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? []

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setContactsText(ev.target?.result as string)
    reader.readAsText(file)
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: campData } = await campaignApi.post('/campaigns', {
        channelId: selectedChannel,
        name: campaignName,
        messageTemplate: ' ',
        curlTemplate: curlText.trim().replace(/ \\\n/g, ' ').replace(/ \\\r\n/g, ' ').replace(/'/g, '"'),
        messagesPerMin,
      })
      const campId = campData.data.id
      const rows = contactsText.split('\n').filter(Boolean).map(line => {
        const parts = line.split(',')
        const phone = parts[0]?.trim().replace(/\D/g, '')
        const message = parts.slice(1).join(',').trim()
        return { phone, name: message || phone, message: message || '' }
      }).filter(r => r.phone && r.phone.length >= 8)
      if (rows.length > 0) await campaignApi.post(`/campaigns/${campId}/contacts/import`, { rows })
      return campData.data
    },
    onSuccess: (camp) => {
      toast.success('Campanha criada!')
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      setShowModal(false)
      setSelectedCamp(camp)
      setCampaignName(''); setContactsText(''); setCurlText(''); setSelectedChannel('')
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

  const prog = progress || selectedCamp
  const total = prog?.total || prog?.total_contacts || 0
  const sent = prog?.sent || prog?.sent_count || 0
  const delivered = prog?.delivered || prog?.delivered_count || 0
  const failed = prog?.failed || prog?.failed_count || 0
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0

  const label = (text: string) => (
    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>{text}</label>
  )

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

      {/* ✅ Layout split: lista esquerda + progresso direita */}
      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>

        {/* Lista de campanhas */}
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
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 100px 100px', gap: '8px', padding: '11px 16px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb' }}>
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
                      style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 100px 100px', gap: '8px', padding: '12px 16px', borderBottom: '1px solid #f9fafb', cursor: 'pointer', background: isSelected ? '#f0fdf4' : '#fff', transition: 'background 0.1s', alignItems: 'center', borderLeft: isSelected ? '3px solid #16a34a' : '3px solid transparent' }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#fafafa' }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#fff' }}
                    >
                      <div>
                        <div style={{ fontWeight: 500, color: '#111827', fontSize: '13px', marginBottom: '4px' }}>{camp.name}</div>
                        <div style={{ height: '2px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
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

                {/* Paginação */}
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

        {/* ✅ Painel de progresso — lado direito fixo */}
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

              {/* Barra de progresso */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>Progresso</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>{pct}%</span>
                </div>
                <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#16a34a', borderRadius: '99px', transition: 'width 0.4s' }} />
                </div>
              </div>

              {/* Métricas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                {[
                  { label: 'Total', value: total, color: '#6b7280', icon: BarChart2 },
                  { label: 'Enviadas', value: sent, color: '#2563eb', icon: Send },
                  { label: 'Entregues', value: delivered, color: '#16a34a', icon: CheckCheck },
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

              {/* Taxa de entrega */}
              {sent > 0 && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={14} color="#16a34a" />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#15803d' }}>{deliveryRate}% entregues</div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>de {sent.toLocaleString()} enviadas</div>
                  </div>
                </div>
              )}

              {/* Botões de ação */}
              <div style={{ marginTop: '14px' }}>
                {selectedCamp.status === 'running' && (
                  <button onClick={() => pauseMutation.mutate(selectedCamp.id)}
                    style={{ width: '100%', padding: '8px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#6b7280', fontWeight: 500 }}>
                    <Pause size={13} /> Pausar campanha
                  </button>
                )}
                {['draft', 'paused'].includes(selectedCamp.status) && (
                  <button onClick={() => startMutation.mutate(selectedCamp.id)}
                    style={{ width: '100%', padding: '8px', background: '#16a34a', border: 'none', color: '#fff', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Play size={13} /> Disparar campanha
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

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#111827' }}>Nova Campanha</h2>
              <button onClick={() => setShowModal(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#6b7280', padding: '6px', display: 'flex' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              {label('Nome da campanha')}
              <input style={inputStyle} placeholder="Ex: Promoção Black Friday" value={campaignName} onChange={e => setCampaignName(e.target.value)} />
            </div>

            <div style={{ marginBottom: '16px' }}>
              {label('Canal WhatsApp')}
              <select style={{ ...inputStyle, appearance: 'none' } as any} value={selectedChannel} onChange={e => setSelectedChannel(e.target.value)}>
                <option value="">Selecionar canal...</option>
                {channels?.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              </select>
            </div>

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

            <div style={{ marginBottom: '16px' }}>
              {label('cURL do Gupshup')}
              <textarea style={{ ...inputStyle, minHeight: '100px', resize: 'vertical', fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.6 } as any} placeholder="curl -X POST https://api.gupshup.io/..." value={curlText} onChange={e => setCurlText(e.target.value)} />
            </div>

            <div style={{ marginBottom: '22px' }}>
              {label('Mensagens por minuto (anti-ban)')}
              <input type="number" min="1" max="300" style={{ ...inputStyle, width: '100px' } as any} value={messagesPerMin} onChange={e => setMessagesPerMin(Number(e.target.value))} />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '14px', cursor: 'pointer', color: '#374151', fontWeight: 500 }}>
                Cancelar
              </button>
              <button onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !campaignName || !selectedChannel || !curlText}
                style={{ flex: 1, padding: '10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: createMutation.isPending || !campaignName || !selectedChannel || !curlText ? 'not-allowed' : 'pointer', opacity: createMutation.isPending || !campaignName || !selectedChannel || !curlText ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {createMutation.isPending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />}
                Criar campanha
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
