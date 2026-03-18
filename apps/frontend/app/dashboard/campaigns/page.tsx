'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, RefreshCw, X, Send, Upload, Play, Pause, Loader2 } from 'lucide-react'

const S: Record<string, { color: string; bg: string; label: string }> = {
  running:   { color: '#a3e635', bg: 'rgba(163,230,53,0.12)',  label: 'Enviando' },
  completed: { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  label: 'Concluída' },
  draft:     { color: 'rgba(232,255,224,0.4)', bg: 'rgba(232,255,224,0.06)', label: 'Rascunho' },
  paused:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  label: 'Pausada' },
  failed:    { color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: 'Falhou' },
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px',
  background: 'rgba(10,30,18,0.8)',
  border: '1px solid rgba(163,230,53,0.2)',
  borderRadius: '8px', fontSize: '14px', outline: 'none',
  color: '#e8ffe0',
}

export default function CampaignsPage() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [contactsText, setContactsText] = useState('')
  const [curlText, setCurlText] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [selectedChannel, setSelectedChannel] = useState('')
  const [messagesPerMin, setMessagesPerMin] = useState(60)
  const [selectedCamp, setSelectedCamp] = useState<any>(null)
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
      if (rows.length > 0) {
        await campaignApi.post(`/campaigns/${campId}/contacts/import`, { rows })
      }
      return campData.data
    },
    onSuccess: (camp) => {
      toast.success(`Campanha criada com ${contactsText.split('\n').filter(Boolean).length} contatos!`)
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
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0

  return (
    <div style={{ padding: '32px', position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ width: '3px', height: '14px', background: '#a3e635', borderRadius: '2px', boxShadow: '0 0 6px rgba(163,230,53,0.8)' }} />
            <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#a3e635', fontWeight: 700 }}>
              Disparos
            </span>
          </div>
          <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '26px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#e8ffe0' }}>
            Campanhas
          </h1>
          <p style={{ color: 'rgba(232,255,224,0.4)', fontSize: '13px', marginTop: '3px' }}>Gerencie seus disparos em massa</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => refetch()}
            style={{
              padding: '9px 14px',
              background: 'rgba(163,230,53,0.06)',
              border: '1px solid rgba(163,230,53,0.2)',
              borderRadius: '8px', color: 'rgba(232,255,224,0.6)',
              fontSize: '13px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(163,230,53,0.4)'; (e.currentTarget as HTMLButtonElement).style.color = '#a3e635' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(163,230,53,0.2)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(232,255,224,0.6)' }}
          >
            <RefreshCw size={14} /> Atualizar
          </button>
          <button
            onClick={() => setShowModal(true)}
            style={{
              padding: '9px 16px',
              background: '#a3e635', color: '#050e08',
              border: 'none', borderRadius: '8px',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.05em', textTransform: 'uppercase',
              boxShadow: '0 0 16px rgba(163,230,53,0.3)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 24px rgba(163,230,53,0.5)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 16px rgba(163,230,53,0.3)' }}
          >
            <Plus size={14} /> Nova campanha
          </button>
        </div>
      </div>

      {/* Campaign list */}
      <div style={{
        background: 'rgba(10,30,18,0.8)',
        border: '1px solid rgba(163,230,53,0.12)',
        borderRadius: '12px',
        backdropFilter: 'blur(20px)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Top line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(163,230,53,0.4), transparent)' }} />

        {isLoading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#a3e635' }} />
          </div>
        ) : campaigns?.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <p style={{ color: 'rgba(232,255,224,0.4)', fontSize: '14px', marginBottom: '16px' }}>Nenhuma campanha criada ainda</p>
            <button onClick={() => setShowModal(true)} style={{ padding: '9px 20px', background: '#a3e635', color: '#050e08', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              + Nova campanha
            </button>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 120px',
              gap: '16px', padding: '12px 20px',
              borderBottom: '1px solid rgba(163,230,53,0.08)',
              color: 'rgba(163,230,53,0.5)',
              fontSize: '11px', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.1em',
              fontFamily: 'Rajdhani, sans-serif',
            }}>
              <span>Campanha</span><span>Total</span><span>Enviadas</span><span>Status</span><span>Ações</span>
            </div>

            {campaigns?.map((camp: any) => {
              const s = S[camp.status] || S.draft
              const p = camp.total_contacts > 0 ? Math.round((camp.sent_count / camp.total_contacts) * 100) : 0
              const isSelected = selectedCamp?.id === camp.id
              return (
                <div
                  key={camp.id}
                  onClick={() => setSelectedCamp(camp)}
                  style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 120px',
                    gap: '16px', padding: '14px 20px',
                    borderBottom: '1px solid rgba(163,230,53,0.06)',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(163,230,53,0.06)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(163,230,53,0.03)' }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                >
                  <div>
                    <div style={{ fontWeight: 500, color: '#e8ffe0', fontSize: '14px', marginBottom: '6px' }}>{camp.name}</div>
                    <div style={{ height: '3px', background: 'rgba(163,230,53,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${p}%`, height: '100%', background: s.color, borderRadius: '2px', boxShadow: `0 0 4px ${s.color}` }} />
                    </div>
                  </div>
                  <span style={{ color: '#e8ffe0', fontSize: '14px', display: 'flex', alignItems: 'center' }}>{camp.total_contacts}</span>
                  <span style={{ color: '#e8ffe0', fontSize: '14px', display: 'flex', alignItems: 'center' }}>{camp.sent_count} ({p}%)</span>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: s.color, background: s.bg, padding: '3px 10px', borderRadius: '999px', border: `1px solid ${s.color}30`, fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.05em' }}>
                      {s.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={e => e.stopPropagation()}>
                    {camp.status === 'running' ? (
                      <button
                        onClick={() => pauseMutation.mutate(camp.id)}
                        style={{ padding: '5px 12px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: '#fbbf24' }}
                      >
                        <Pause size={11} /> Pausar
                      </button>
                    ) : ['draft', 'paused'].includes(camp.status) ? (
                      <button
                        onClick={() => startMutation.mutate(camp.id)}
                        style={{ padding: '5px 12px', background: '#a3e635', border: 'none', color: '#050e08', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 0 8px rgba(163,230,53,0.3)' }}
                      >
                        <Play size={11} /> Disparar
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Progress detail */}
      {selectedCamp && (
        <div style={{
          background: 'rgba(10,30,18,0.8)', border: '1px solid rgba(163,230,53,0.12)',
          borderRadius: '12px', backdropFilter: 'blur(20px)',
          padding: '22px', marginTop: '14px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(163,230,53,0.4), transparent)' }} />
          <h3 style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: '16px', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '16px', color: '#e8ffe0' }}>
            {selectedCamp.name} — Progresso
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: 'Total',     value: prog?.total || prog?.total_contacts || 0,   color: '#a3e635' },
              { label: 'Enviadas',  value: prog?.sent || prog?.sent_count || 0,         color: '#34d399' },
              { label: 'Entregues', value: prog?.delivered || prog?.delivered_count || 0, color: '#60a5fa' },
              { label: 'Falhas',    value: prog?.failed || prog?.failed_count || 0,     color: '#f87171' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'rgba(163,230,53,0.04)', border: `1px solid ${color}20`, borderRadius: '10px', padding: '14px' }}>
                <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '28px', fontWeight: 700, color, lineHeight: 1, marginBottom: '4px' }}>{value}</div>
                <div style={{ color: 'rgba(232,255,224,0.4)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Rajdhani, sans-serif' }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ height: '6px', background: 'rgba(163,230,53,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #4d7c0f, #a3e635)', borderRadius: '3px', boxShadow: '0 0 8px rgba(163,230,53,0.4)', transition: 'width .5s' }} />
          </div>
          <div style={{ textAlign: 'right', color: '#a3e635', fontSize: '12px', fontWeight: 700, fontFamily: 'Rajdhani, sans-serif', marginTop: '6px' }}>{pct}% CONCLUÍDO</div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{
            background: '#071210', borderRadius: '14px', padding: '28px',
            width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto',
            border: '1px solid rgba(163,230,53,0.2)',
            boxShadow: '0 0 40px rgba(163,230,53,0.1), 0 20px 60px rgba(0,0,0,0.8)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(163,230,53,0.6), transparent)' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
              <h2 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '20px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#e8ffe0' }}>
                Nova Campanha
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'rgba(163,230,53,0.06)', border: '1px solid rgba(163,230,53,0.15)', borderRadius: '6px', cursor: 'pointer', color: 'rgba(232,255,224,0.5)', padding: '4px', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            {[
              { label: 'Nome da campanha', field: 'name' },
            ].map(() => (
              <div key="name" style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'rgba(163,230,53,0.6)', marginBottom: '6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Rajdhani, sans-serif' }}>
                  Nome da campanha
                </label>
                <input style={inputStyle} placeholder="Ex: Promoção Black Friday" value={campaignName} onChange={e => setCampaignName(e.target.value)} />
              </div>
            ))}

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'rgba(163,230,53,0.6)', marginBottom: '6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Rajdhani, sans-serif' }}>
                Canal WhatsApp
              </label>
              <select style={{ ...inputStyle, appearance: 'none' } as any} value={selectedChannel} onChange={e => setSelectedChannel(e.target.value)}>
                <option value="">Selecionar canal...</option>
                {channels?.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'rgba(163,230,53,0.6)', marginBottom: '6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Rajdhani, sans-serif' }}>
                Contatos — formato: numero,mensagem
              </label>
              <div
                onClick={() => fileRef.current?.click()}
                style={{ border: '2px dashed rgba(163,230,53,0.2)', borderRadius: '8px', padding: '16px', textAlign: 'center', cursor: 'pointer', marginBottom: '8px', background: 'rgba(163,230,53,0.03)', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(163,230,53,0.5)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(163,230,53,0.06)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(163,230,53,0.2)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(163,230,53,0.03)' }}
              >
                <Upload size={18} color="rgba(163,230,53,0.5)" style={{ margin: '0 auto 6px' }} />
                <p style={{ fontSize: '13px', color: 'rgba(232,255,224,0.5)' }}>Clique para upload do <strong style={{ color: '#a3e635' }}>.csv</strong></p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />
              <textarea
                style={{ ...inputStyle, minHeight: '90px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' } as any}
                placeholder="5511999990001,Olá!\n5511999990002,Oi tudo bem?"
                value={contactsText}
                onChange={e => setContactsText(e.target.value)}
              />
              {contactsText && (
                <p style={{ fontSize: '11px', color: '#a3e635', marginTop: '4px' }}>
                  {contactsText.split('\n').filter(Boolean).length} contatos detectados
                </p>
              )}
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'rgba(163,230,53,0.6)', marginBottom: '6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Rajdhani, sans-serif' }}>
                cURL do Gupshup
              </label>
              <textarea style={{ ...inputStyle, minHeight: '110px', resize: 'vertical', fontFamily: 'monospace', fontSize: '11px' } as any} placeholder="curl -X POST https://api.gupshup.io/..." value={curlText} onChange={e => setCurlText(e.target.value)} />
            </div>

            <div style={{ marginBottom: '22px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'rgba(163,230,53,0.6)', marginBottom: '6px', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Rajdhani, sans-serif' }}>
                Msgs/minuto (anti-ban)
              </label>
              <input type="number" min="1" max="300" style={{ ...inputStyle, width: '120px' } as any} value={messagesPerMin} onChange={e => setMessagesPerMin(Number(e.target.value))} />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '11px', background: 'rgba(163,230,53,0.06)', border: '1px solid rgba(163,230,53,0.15)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: 'rgba(232,255,224,0.6)' }}>
                Cancelar
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !campaignName || !selectedChannel || !curlText}
                style={{
                  flex: 1, padding: '11px', background: '#a3e635', color: '#050e08',
                  border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  cursor: createMutation.isPending || !campaignName || !selectedChannel || !curlText ? 'not-allowed' : 'pointer',
                  opacity: createMutation.isPending || !campaignName || !selectedChannel || !curlText ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.05em', textTransform: 'uppercase',
                  boxShadow: '0 0 16px rgba(163,230,53,0.3)',
                }}
              >
                {createMutation.isPending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                Criar campanha
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus, textarea:focus, select:focus { border-color: rgba(163,230,53,0.5) !important; box-shadow: 0 0 0 3px rgba(163,230,53,0.08) !important; outline: none; }
        select option { background: #071210; color: #e8ffe0; }
      `}</style>
    </div>
  )
}
