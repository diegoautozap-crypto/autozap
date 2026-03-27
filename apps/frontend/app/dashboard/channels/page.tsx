'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { channelApi, tenantApi } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Radio, Trash2, X, Check, Loader2, Copy, ExternalLink, Eye, EyeOff, Pencil } from 'lucide-react'

const WEBHOOK_BASE = process.env.NEXT_PUBLIC_CHANNEL_SERVICE_URL || ''

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: '#FAFAFA', border: '1px solid #E8EAED',
  borderRadius: '8px', fontSize: '13.5px', outline: 'none',
  color: '#111827', transition: 'all 0.15s', fontFamily: 'inherit',
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700,
  color: '#9CA5B3', marginBottom: '5px',
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

const CHANNEL_LIMITS: Record<string, number> = {
  trial: 1, starter: 1, pro: 5, enterprise: 10, unlimited: 999,
}

const emptyForm = { name: '', apiKey: '', source: '', srcName: '', metaToken: '' }

export default function ChannelsPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm]     = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [form, setForm]             = useState(emptyForm)

  const { data: channels, isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data },
  })

  const { data: tenant } = useQuery({
    queryKey: ['tenant'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant'); return data.data },
  })

  const channelLimit = CHANNEL_LIMITS[tenant?.planSlug || 'trial'] ?? 1
  const channelCount = channels?.length ?? 0
  const atLimit      = channelCount >= channelLimit

  const createMutation = useMutation({
    mutationFn: async () => {
      await channelApi.post('/channels', {
        name: form.name, type: 'gupshup', phoneNumber: form.source,
        credentials: { apiKey: form.apiKey, source: form.source, srcName: form.srcName, metaToken: form.metaToken || undefined },
        settings: {},
      })
    },
    onSuccess: () => {
      toast.success('Canal criado!'); queryClient.invalidateQueries({ queryKey: ['channels'] })
      setShowForm(false); setForm(emptyForm)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao criar canal'),
  })

  const editMutation = useMutation({
    mutationFn: async () => {
      await channelApi.patch(`/channels/${editingId}`, {
        name: form.name, phoneNumber: form.source,
        credentials: { apiKey: form.apiKey, source: form.source, srcName: form.srcName, metaToken: form.metaToken || undefined },
      })
    },
    onSuccess: () => {
      toast.success('Canal atualizado!'); queryClient.invalidateQueries({ queryKey: ['channels'] })
      setShowForm(false); setEditingId(null); setForm(emptyForm)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao atualizar canal'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await channelApi.delete(`/channels/${id}`) },
    onSuccess: () => { toast.success('Canal removido!'); queryClient.invalidateQueries({ queryKey: ['channels'] }) },
    onError: () => toast.error('Erro ao remover canal'),
  })

  const openEdit = (ch: any) => {
    setForm({ name: ch.name || '', apiKey: ch.webhookApiKey || '', source: ch.source || ch.phoneNumber || '', srcName: ch.srcName || '', metaToken: '' })
    setEditingId(ch.id); setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm) }
  const copyWebhook = (channelId: string, apiKey: string) => {
    navigator.clipboard.writeText(`${WEBHOOK_BASE}/webhook/gupshup/${apiKey}`)
    toast.success('URL do webhook copiada!')
  }
  const toggleApiKey = (id: string) => setShowApiKey(prev => ({ ...prev, [id]: !prev[id] }))
  const handleSubmit = () => editingId ? editMutation.mutate() : createMutation.mutate()
  const isPending = createMutation.isPending || editMutation.isPending

  return (
    <div style={{ padding: '28px 32px', maxWidth: '860px', background: '#F8F9FC', minHeight: '100%' }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 750, color: '#0F1623', letterSpacing: '-0.03em', margin: 0, lineHeight: 1.2 }}>Canais</h1>
          <p style={{ color: '#9CA5B3', fontSize: '13px', marginTop: '4px' }}>Configure seus números do WhatsApp via Gupshup</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            fontSize: '12px', fontWeight: 600,
            color: atLimit ? '#DC2626' : '#5C6474',
            background: atLimit ? '#FEF2F2' : '#F4F5F8',
            border: `1px solid ${atLimit ? '#FECACA' : '#E8EAED'}`,
            padding: '4px 12px', borderRadius: '99px',
          }}>
            {channelCount}/{channelLimit} canal{channelLimit > 1 ? 'is' : ''}
          </div>
          <button
            onClick={() => {
              if (atLimit) { toast.error(`Seu plano permite ${channelLimit} canal${channelLimit > 1 ? 'is' : ''}. Faça upgrade para adicionar mais.`); return }
              closeForm(); setShowForm(true)
            }}
            style={{ padding: '8px 16px', background: atLimit ? '#E8EAED' : 'linear-gradient(135deg,#16a34a,#15803d)', color: atLimit ? '#9CA5B3' : '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: atLimit ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: atLimit ? 'none' : '0 2px 8px rgba(22,163,74,0.25)', transition: 'all 0.12s' }}
            onMouseEnter={e => { if (!atLimit) { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 14px rgba(22,163,74,0.35)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' } }}
            onMouseLeave={e => { if (!atLimit) { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(22,163,74,0.25)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' } }}
          >
            <Plus size={14} /> Novo canal
          </button>
        </div>
      </div>

      {/* ── Guia rápido ──────────────────────────────────────────────────── */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '16px 18px', marginBottom: '20px' }}>
        <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#1D4ED8', marginBottom: '8px', letterSpacing: '-0.01em' }}>📋 Como configurar</p>
        <ol style={{ fontSize: '13px', color: '#374151', lineHeight: 1.9, paddingLeft: '18px', margin: 0 }}>
          <li>Crie uma conta em <a href="https://gupshup.io" target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', fontWeight: 500 }}>gupshup.io</a> e crie um app WhatsApp</li>
          <li>Copie o <strong>API Key</strong> e o número <strong>Source</strong> do dashboard do Gupshup</li>
          <li>Adicione o canal aqui e copie a <strong>URL do Webhook</strong></li>
          <li>Cole a URL no Gupshup em <strong>Webhooks → URL de retorno</strong>, formato <strong>Meta (v3)</strong></li>
          <li>Ative os eventos: <strong>Mensagem</strong> e <strong>Recebido</strong></li>
        </ol>
      </div>

      {/* ── Form criar/editar ─────────────────────────────────────────────── */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #ECEEF2', borderRadius: '12px', padding: '22px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: '14.5px', color: '#0F1623', margin: 0, letterSpacing: '-0.01em' }}>
                {editingId ? 'Editar canal' : 'Novo canal Gupshup'}
              </h3>
              <p style={{ fontSize: '12px', color: '#9CA5B3', marginTop: '3px' }}>
                {editingId ? 'Atualize as credenciais do canal' : 'Preencha as credenciais do Gupshup'}
              </p>
            </div>
            <button onClick={closeForm} style={{ background: '#F4F5F8', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#5C6474', padding: '7px', display: 'flex', transition: 'all 0.12s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#ECEEF2' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F4F5F8' }}>
              <X size={15} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            {[
              { label: 'Nome do canal *',         key: 'name',    placeholder: 'Ex: WhatsApp Vendas' },
              { label: 'Número source (sem +) *', key: 'source',  placeholder: '15558406981' },
              { label: 'API Key do Gupshup *',    key: 'apiKey',  placeholder: 'sk_xxxxxxxxxxxxxxxxxx' },
              { label: 'src.name (nome do app) *',key: 'srcName', placeholder: 'MeuApp' },
            ].map(field => (
              <div key={field.key}>
                <label style={lbl}>{field.label}</label>
                <input style={inp} placeholder={field.placeholder}
                  value={(form as any)[field.key]}
                  onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                  onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#16a34a'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(22,163,74,0.08)'; (e.target as HTMLInputElement).style.background = '#fff' }}
                  onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#E8EAED'; (e.target as HTMLInputElement).style.boxShadow = 'none'; (e.target as HTMLInputElement).style.background = '#FAFAFA' }}
                />
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '20px', padding: '14px 16px', background: '#FAFBFC', borderRadius: '9px', border: '1px solid #ECEEF2' }}>
            <label style={lbl}>Token do Meta <span style={{ color: '#BCC3CE', fontWeight: 500, textTransform: 'none', fontSize: '11px', letterSpacing: 0 }}>(opcional)</span></label>
            <p style={{ fontSize: '12px', color: '#9CA5B3', marginBottom: '8px', lineHeight: 1.5 }}>
              Meta Business Manager → WhatsApp → API Setup → System User Token — necessário para visualizar mídias recebidas
            </p>
            <input style={inp} type="password"
              placeholder={editingId ? 'Deixe em branco para manter o atual' : 'EAAxxxxxxx...'}
              value={form.metaToken} onChange={e => setForm({ ...form, metaToken: e.target.value })}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#16a34a'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(22,163,74,0.08)'; (e.target as HTMLInputElement).style.background = '#fff' }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#E8EAED'; (e.target as HTMLInputElement).style.boxShadow = 'none'; (e.target as HTMLInputElement).style.background = '#FAFAFA' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleSubmit} disabled={isPending || !form.name || !form.apiKey || !form.source}
              style={{ padding: '9px 20px', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !form.name || !form.apiKey || !form.source ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !form.name || !form.apiKey || !form.source ? 0.5 : 1, boxShadow: '0 2px 8px rgba(22,163,74,0.2)', transition: 'all 0.12s' }}>
              {isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
              {editingId ? 'Salvar alterações' : 'Criar canal'}
            </button>
            <button onClick={closeForm} style={{ padding: '9px 16px', background: '#F4F5F8', border: '1px solid #E8EAED', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#5C6474', fontWeight: 500 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Lista de canais ───────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ padding: '80px', textAlign: 'center' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#D1D5DB' }} />
        </div>
      ) : channels?.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #ECEEF2', borderRadius: '12px', padding: '72px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#F4F5F8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Radio size={24} color="#D1D5DB" />
          </div>
          <p style={{ color: '#5C6474', fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>Nenhum canal configurado</p>
          <p style={{ color: '#9CA5B3', fontSize: '13px', margin: '0 0 18px' }}>Conecte seu número do WhatsApp para começar a receber mensagens</p>
          <button onClick={() => setShowForm(true)} style={{ padding: '9px 20px', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(22,163,74,0.25)' }}>
            + Novo canal
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {channels?.map((ch: any) => {
            const webhookUrl = `${WEBHOOK_BASE}/webhook/gupshup/${ch.webhookApiKey}`
            const isVisible  = showApiKey[ch.id]
            return (
              <div key={ch.id} style={{ background: '#fff', border: '1px solid #ECEEF2', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)', transition: 'box-shadow 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,.07)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,.04)' }}>

                {/* Canal header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'linear-gradient(135deg,#F0FDF4,#DCFCE7)', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Radio size={16} color="#16a34a" />
                    </div>
                    <div>
                      <p style={{ fontWeight: 650, fontSize: '14px', color: '#0F1623', margin: '0 0 2px', letterSpacing: '-0.01em' }}>{ch.name}</p>
                      <p style={{ fontSize: '12px', color: '#9CA5B3', margin: 0, fontFamily: 'ui-monospace, monospace' }}>{ch.phoneNumber || ch.phone_number || ''}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 600, color: '#16a34a', background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '3px 10px', borderRadius: '99px' }}>
                      <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#16a34a' }} />
                      Ativo
                    </div>
                    <button onClick={() => openEdit(ch)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#BCC3CE', padding: '5px', display: 'flex', borderRadius: '6px', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6366F1'; (e.currentTarget as HTMLButtonElement).style.background = '#EEF2FF' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#BCC3CE'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                      title="Editar canal">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => { if (confirm('Remover canal?')) deleteMutation.mutate(ch.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#BCC3CE', padding: '5px', display: 'flex', borderRadius: '6px', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#EF4444'; (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#BCC3CE'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: '1px', background: '#F1F3F7', marginBottom: '14px' }} />

                {/* API Key */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={lbl}>API Key</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input readOnly type={isVisible ? 'text' : 'password'} value={ch.webhookApiKey || ''}
                      style={{ ...inp, flex: 1, background: '#FAFBFC', color: '#5C6474', fontSize: '12.5px', fontFamily: 'ui-monospace, monospace', cursor: 'default' }} />
                    <button onClick={() => toggleApiKey(ch.id)}
                      style={{ padding: '9px 10px', background: '#FAFBFC', border: '1px solid #E8EAED', borderRadius: '8px', cursor: 'pointer', display: 'flex', color: '#9CA5B3', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F4F5F8'; (e.currentTarget as HTMLButtonElement).style.color = '#5C6474' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FAFBFC'; (e.currentTarget as HTMLButtonElement).style.color = '#9CA5B3' }}>
                      {isVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>

                {/* Webhook URL */}
                <div>
                  <label style={lbl}>URL do Webhook — cole no Gupshup</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input readOnly value={webhookUrl}
                      style={{ ...inp, flex: 1, background: '#FAFBFC', color: '#5C6474', fontSize: '11.5px', fontFamily: 'ui-monospace, monospace', cursor: 'default' }} />
                    <button onClick={() => copyWebhook(ch.id, ch.webhookApiKey)}
                      style={{ padding: '9px 10px', background: '#FAFBFC', border: '1px solid #E8EAED', borderRadius: '8px', cursor: 'pointer', display: 'flex', color: '#9CA5B3', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F4F5F8'; (e.currentTarget as HTMLButtonElement).style.color = '#5C6474' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FAFBFC'; (e.currentTarget as HTMLButtonElement).style.color = '#9CA5B3' }}
                      title="Copiar">
                      <Copy size={13} />
                    </button>
                    <a href="https://app.gupshup.io" target="_blank" rel="noopener noreferrer"
                      style={{ padding: '9px 10px', background: '#FAFBFC', border: '1px solid #E8EAED', borderRadius: '8px', cursor: 'pointer', display: 'flex', color: '#9CA5B3', textDecoration: 'none', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#F4F5F8'; (e.currentTarget as HTMLAnchorElement).style.color = '#5C6474' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#FAFBFC'; (e.currentTarget as HTMLAnchorElement).style.color = '#9CA5B3' }}
                      title="Abrir Gupshup">
                      <ExternalLink size={13} />
                    </a>
                  </div>
                  {!ch.hasMetaToken && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', padding: '7px 10px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '7px' }}>
                      <span style={{ fontSize: '13px' }}>⚠️</span>
                      <p style={{ fontSize: '11.5px', color: '#92400E', margin: 0, fontWeight: 500 }}>Token do Meta não configurado — mídias recebidas não serão exibidas</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus, textarea:focus, select:focus { border-color: #16a34a !important; box-shadow: 0 0 0 3px rgba(22,163,74,0.08) !important; background: #fff !important; }
      `}</style>
    </div>
  )
}
