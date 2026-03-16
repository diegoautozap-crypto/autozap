'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, RefreshCw, X, Send, Upload, Play, Pause, Loader2 } from 'lucide-react'

const S: Record<string, { color: string; bg: string; label: string }> = {
  running:   { color: '#25d366', bg: '#25d36620', label: 'Enviando' },
  completed: { color: '#3b82f6', bg: '#3b82f620', label: 'Concluída' },
  draft:     { color: '#6b7280', bg: '#6b728020', label: 'Rascunho' },
  paused:    { color: '#f59e0b', bg: '#f59e0b20', label: 'Pausada' },
  failed:    { color: '#ef4444', bg: '#ef444420', label: 'Falhou' },
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px',
  background: '#f9fafb', border: '1px solid #e5e7eb',
  borderRadius: '6px', fontSize: '14px', outline: 'none',
  color: '#1a1f2e',
}

export default function CampaignsPage() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [contactsText, setContactsText] = useState('')
  const [curlText, setCurlText] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [selectedChannel, setSelectedChannel] = useState('')
  const [messagesPerMin, setMessagesPerMin] = useState(10)
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
      // 1. Create campaign
      const { data: campData } = await campaignApi.post('/campaigns', {
        channelId: selectedChannel,
        name: campaignName,
        messageTemplate: ' ',
        curlTemplate: curlText.trim().replace(/ \\\n/g, ' ').replace(/ \\\r\n/g, ' ').replace(/'/g, '"'),
        messagesPerMin,
      })
      const campId = campData.data.id

      // 2. Import contacts
      const rows = contactsText.split('\n').filter(Boolean).map(line => {
        const parts = line.split(',')
        const phone = parts[0]?.trim().replace(/\D/g, '')
        // Second column onwards is the message (may contain commas)
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
    <div style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Campanhas</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Gerencie seus disparos em massa</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => refetch()}
            style={{ padding: '9px 14px', background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} /> Atualizar
          </button>
          <button
            onClick={() => setShowModal(true)}
            style={{ padding: '9px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} /> Nova campanha
          </button>
        </div>
      </div>

      {/* Campaign list */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '10px', boxShadow: 'var(--shadow)' }}>
        {isLoading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />
          </div>
        ) : campaigns?.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>Nenhuma campanha criada ainda</p>
            <button
              onClick={() => setShowModal(true)}
              style={{ padding: '9px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              + Nova campanha
            </button>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 120px', gap: '16px', padding: '12px 20px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              <span>Campanha</span><span>Total</span><span>Enviadas</span><span>Status</span><span>Ações</span>
            </div>
            {campaigns?.map((camp: any) => {
              const s = S[camp.status] || S.draft
              const p = camp.total_contacts > 0 ? Math.round((camp.sent_count / camp.total_contacts) * 100) : 0
              return (
                <div
                  key={camp.id}
                  onClick={() => setSelectedCamp(camp)}
                  style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 120px',
                    gap: '16px', padding: '16px 20px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: selectedCamp?.id === camp.id ? '#f0fdf4' : 'transparent',
                  }}
                  onMouseEnter={e => { if (selectedCamp?.id !== camp.id) (e.currentTarget as HTMLDivElement).style.background = '#f9fafb' }}
                  onMouseLeave={e => { if (selectedCamp?.id !== camp.id) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                >
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--text)', fontSize: '14px', marginBottom: '6px' }}>{camp.name}</div>
                    <div style={{ height: '3px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${p}%`, height: '100%', background: s.color, borderRadius: '2px' }} />
                    </div>
                  </div>
                  <span style={{ color: 'var(--text)', fontSize: '14px', display: 'flex', alignItems: 'center' }}>{camp.total_contacts}</span>
                  <span style={{ color: 'var(--text)', fontSize: '14px', display: 'flex', alignItems: 'center' }}>{camp.sent_count} ({p}%)</span>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: s.color, background: s.bg, padding: '3px 10px', borderRadius: '999px' }}>
                      {s.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={e => e.stopPropagation()}>
                    {camp.status === 'running' ? (
                      <button
                        onClick={() => pauseMutation.mutate(camp.id)}
                        style={{ padding: '6px 12px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Pause size={12} /> Pausar
                      </button>
                    ) : ['draft', 'paused'].includes(camp.status) ? (
                      <button
                        onClick={() => startMutation.mutate(camp.id)}
                        style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Play size={12} /> Disparar
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
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '10px', boxShadow: 'var(--shadow)', padding: '24px', marginTop: '16px' }}>
          <h3 style={{ fontWeight: 600, fontSize: '16px', marginBottom: '16px' }}>{selectedCamp.name} — Progresso</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Total', value: prog?.total || prog?.total_contacts || 0 },
              { label: 'Enviadas', value: prog?.sent || prog?.sent_count || 0 },
              { label: 'Entregues', value: prog?.delivered || prog?.delivered_count || 0 },
              { label: 'Falhas', value: prog?.failed || prog?.failed_count || 0 },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>{value}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: '4px', transition: 'width .5s' }} />
          </div>
          <div style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px' }}>{pct}% concluído</div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px',
        }}>
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '32px',
            width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1f2e' }}>Nova Campanha</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
                <X size={20} />
              </button>
            </div>

            {/* Name */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                Nome da campanha
              </label>
              <input
                style={inputStyle}
                placeholder="Ex: Promoção Black Friday"
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
              />
            </div>

            {/* Channel */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                Canal WhatsApp
              </label>
              <select
                style={inputStyle as any}
                value={selectedChannel}
                onChange={e => setSelectedChannel(e.target.value)}
              >
                <option value="">Selecionar canal...</option>
                {channels?.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              </select>
            </div>

            {/* Contacts */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                Contatos — <span style={{ color: '#6b7280', fontWeight: 400 }}>formato: numero,mensagem</span>
              </label>

              {/* Upload area */}
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: '2px dashed #d1d5db', borderRadius: '8px',
                  padding: '20px', textAlign: 'center', cursor: 'pointer',
                  marginBottom: '10px',
                  background: '#f9fafb',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#25d366'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#d1d5db'}
              >
                <Upload size={20} color="#9ca3af" style={{ margin: '0 auto 8px' }} />
                <p style={{ fontSize: '13px', color: '#6b7280' }}>
                  Clique para fazer upload do <strong>.csv</strong>
                </p>
                <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>ou cole os números abaixo</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />

              <textarea
                style={{ ...inputStyle, minHeight: '100px', resize: 'vertical', fontFamily: 'monospace', fontSize: '13px' } as any}
                placeholder={'5511999990001,Olá!\n5511999990002,Oi tudo bem?'}
                value={contactsText}
                onChange={e => setContactsText(e.target.value)}
              />
              {contactsText && (
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  {contactsText.split('\n').filter(Boolean).length} contatos detectados
                </p>
              )}
            </div>

            {/* cURLs */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                cURLs do Gupshup — <span style={{ color: '#6b7280', fontWeight: 400 }}>um por linha</span>
              </label>
              <textarea
                style={{ ...inputStyle, minHeight: '120px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' } as any}
                placeholder={'curl -X POST https://api.gupshup.io/...'}
                value={curlText}
                onChange={e => setCurlText(e.target.value)}
              />
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                Use <code style={{ background: '#f3f4f6', padding: '0 4px', borderRadius: '3px' }}>{'{{destination_phone_number}}'}</code> para o número do destinatário
              </p>
            </div>

            {/* Messages per min */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                Mensagens por minuto (anti-ban)
              </label>
              <input
                type="number" min="1" max="60"
                style={{ ...inputStyle, width: '120px' } as any}
                value={messagesPerMin}
                onChange={e => setMessagesPerMin(Number(e.target.value))}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ flex: 1, padding: '11px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', color: '#374151' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !campaignName || !selectedChannel || !curlText}
                style={{
                  flex: 1, padding: '11px', background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                  cursor: createMutation.isPending || !campaignName || !selectedChannel || !curlText ? 'not-allowed' : 'pointer',
                  opacity: createMutation.isPending || !campaignName || !selectedChannel || !curlText ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                {createMutation.isPending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                Criar campanha
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } input:focus, textarea:focus, select:focus { border-color: #25d366 !important; outline: none; }`}</style>
    </div>
  )
}
