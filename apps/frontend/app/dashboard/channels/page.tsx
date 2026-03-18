'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Radio, Trash2, X, Check, Loader2, Copy, ExternalLink, Eye, EyeOff } from 'lucide-react'

const WEBHOOK_BASE = process.env.NEXT_PUBLIC_CHANNEL_SERVICE_URL || ''

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: '#fff', border: '1px solid #e5e7eb',
  borderRadius: '6px', fontSize: '14px', outline: 'none', color: '#111827',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600,
  color: '#6b7280', marginBottom: '5px',
  textTransform: 'uppercase', letterSpacing: '0.04em',
}

export default function ChannelsPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [form, setForm] = useState({
    name: '',
    apiKey: '',
    source: '',
    srcName: '',
    metaToken: '',
  })

  const { data: channels, isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const { data } = await channelApi.get('/channels')
      return data.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      await channelApi.post('/channels', {
        name: form.name,
        type: 'gupshup',
        phoneNumber: form.source,
        credentials: {
          apiKey: form.apiKey,
          source: form.source,
          srcName: form.srcName,
          metaToken: form.metaToken || undefined,
        },
        settings: {},
      })
    },
    onSuccess: () => {
      toast.success('Canal criado!')
      queryClient.invalidateQueries({ queryKey: ['channels'] })
      setShowForm(false)
      setForm({ name: '', apiKey: '', source: '', srcName: '', metaToken: '' })
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao criar canal'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await channelApi.delete(`/channels/${id}`)
    },
    onSuccess: () => {
      toast.success('Canal removido!')
      queryClient.invalidateQueries({ queryKey: ['channels'] })
    },
    onError: () => toast.error('Erro ao remover canal'),
  })

  const copyWebhook = (channelId: string, apiKey: string) => {
    const url = `${WEBHOOK_BASE}/webhook/gupshup/${apiKey}`
    navigator.clipboard.writeText(url)
    toast.success('URL do webhook copiada!')
  }

  const toggleApiKey = (id: string) => {
    setShowApiKey(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>Canais</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '3px' }}>Configure seus números do WhatsApp via Gupshup</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#15803d' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#16a34a' }}
        >
          <Plus size={14} /> Novo canal
        </button>
      </div>

      {/* Guia rápido */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#1d4ed8', marginBottom: '8px' }}>📋 Como configurar</p>
        <ol style={{ fontSize: '13px', color: '#374151', lineHeight: 1.8, paddingLeft: '18px', margin: 0 }}>
          <li>Crie uma conta em <a href="https://gupshup.io" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>gupshup.io</a> e crie um app WhatsApp</li>
          <li>Copie o <strong>API Key</strong> e o número <strong>Source</strong> do dashboard do Gupshup</li>
          <li>Adicione o canal aqui e copie a <strong>URL do Webhook</strong></li>
          <li>Cole a URL no Gupshup em <strong>Webhooks → URL de retorno</strong>, formato <strong>Meta (v3)</strong></li>
          <li>Ative os eventos: <strong>Mensagem</strong> e <strong>Recebido</strong></li>
        </ol>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '22px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h3 style={{ fontWeight: 600, fontSize: '15px', color: '#111827' }}>Novo canal Gupshup</h3>
            <button onClick={() => setShowForm(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#6b7280', padding: '4px', display: 'flex' }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Nome do canal *</label>
              <input style={inputStyle} placeholder="Ex: WhatsApp Vendas" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Número source (sem +) *</label>
              <input style={inputStyle} placeholder="15558406981" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>API Key do Gupshup *</label>
              <input style={inputStyle} placeholder="sk_xxxxxxxxxxxxxxxxxx" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>src.name (nome do app) *</label>
              <input style={inputStyle} placeholder="MeuApp" value={form.srcName} onChange={e => setForm({ ...form, srcName: e.target.value })} />
            </div>
          </div>

          {/* Meta Token — opcional */}
          <div style={{ marginBottom: '18px', padding: '14px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
            <label style={{ ...labelStyle, marginBottom: '4px' }}>Token do Meta (opcional — para visualizar mídias recebidas)</label>
            <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>
              Encontre em: Meta Business Manager → WhatsApp → API Setup → System User Token
            </p>
            <input
              style={inputStyle}
              type="password"
              placeholder="EAAxxxxxxx..."
              value={form.metaToken}
              onChange={e => setForm({ ...form, metaToken: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.name || !form.apiKey || !form.source}
              style={{ padding: '9px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !form.name || !form.apiKey || !form.source ? 0.5 : 1 }}
            >
              {createMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
              Criar canal
            </button>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de canais */}
      {isLoading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} />
        </div>
      ) : channels?.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '60px', textAlign: 'center' }}>
          <Radio size={32} color="#e5e7eb" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '14px' }}>Nenhum canal configurado ainda</p>
          <button onClick={() => setShowForm(true)} style={{ padding: '8px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            + Novo canal
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {channels?.map((ch: any) => {
            const webhookUrl = `${WEBHOOK_BASE}/webhook/gupshup/${ch.webhookApiKey}`
            const isVisible = showApiKey[ch.id]
            return (
              <div key={ch.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Radio size={16} color="#16a34a" />
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '14px', color: '#111827', margin: 0 }}>{ch.name}</p>
                      <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>{ch.phoneNumber || ch.phone_number || ''}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', padding: '2px 10px', borderRadius: '99px' }}>
                      Ativo
                    </span>
                    <button
                      onClick={() => { if (confirm('Remover canal?')) deleteMutation.mutate(ch.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px', display: 'flex', borderRadius: '4px' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* API Key */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ ...labelStyle, marginBottom: '4px' }}>API Key</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      readOnly
                      type={isVisible ? 'text' : 'password'}
                      value={ch.webhookApiKey || ''}
                      style={{ ...inputStyle, flex: 1, background: '#f9fafb', color: '#374151', fontSize: '13px' }}
                    />
                    <button onClick={() => toggleApiKey(ch.id)} style={{ padding: '9px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', display: 'flex', color: '#6b7280' }}>
                      {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Webhook URL */}
                <div>
                  <label style={{ ...labelStyle, marginBottom: '4px' }}>URL do Webhook — cole no Gupshup</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      readOnly
                      value={webhookUrl}
                      style={{ ...inputStyle, flex: 1, background: '#f9fafb', color: '#374151', fontSize: '12px', fontFamily: 'monospace' }}
                    />
                    <button
                      onClick={() => copyWebhook(ch.id, ch.webhookApiKey)}
                      style={{ padding: '9px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', display: 'flex', color: '#6b7280' }}
                      title="Copiar"
                    >
                      <Copy size={14} />
                    </button>
                    <a href="https://app.gupshup.io" target="_blank" rel="noopener noreferrer" style={{ padding: '9px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', display: 'flex', color: '#6b7280', textDecoration: 'none' }} title="Abrir Gupshup">
                      <ExternalLink size={14} />
                    </a>
                  </div>
                  {!ch.hasMetaToken && (
                    <p style={{ fontSize: '11px', color: '#f59e0b', marginTop: '6px' }}>
                      ⚠️ Token do Meta não configurado — mídias recebidas (fotos, áudios) não serão exibidas
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } input:focus { border-color: #16a34a !important; box-shadow: 0 0 0 3px rgba(22,163,74,0.1) !important; }`}</style>
    </div>
  )
}
