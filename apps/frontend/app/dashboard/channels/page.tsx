'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { channelApi, tenantApi } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Radio, Trash2, X, Check, Loader2, Copy, ExternalLink, Eye, EyeOff, Pencil, QrCode, Wifi, WifiOff, Bot } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { usePermissions } from '@/store/permissions.store'

const WEBHOOK_BASE = process.env.NEXT_PUBLIC_CHANNEL_SERVICE_URL || ''

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '13.5px', outline: 'none',
  color: 'var(--text)', fontFamily: 'inherit', transition: 'all 0.15s',
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600,
  color: 'var(--text-muted)', marginBottom: '5px', letterSpacing: '0.01em',
}

const CHANNEL_LIMITS: Record<string, number> = {
  pending: 0, starter: 5, pro: 10, enterprise: 30, unlimited: 999,
}

type ChannelFormType = 'gupshup' | 'evolution' | 'instagram' | 'messenger'
const emptyForm = { name: '', apiKey: '', source: '', srcName: '', metaToken: '', phoneNumberId: '', channelType: 'gupshup' as ChannelFormType, baseUrl: '', instanceName: '', aiChatbotEnabled: false, accessToken: '', pageId: '', appSecret: '' }

export default function ChannelsPage() {
  const t = useT()
  const { isAdmin, canEdit, canDelete } = usePermissions()
  const queryClient = useQueryClient()
  const [showForm, setShowForm]     = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
  const [form, setForm]             = useState(emptyForm)
  const [qrData, setQrData]         = useState<Record<string, { base64?: string; pairingCode?: string; loading?: boolean; connected?: boolean }>>({})
  const [evoStatus, setEvoStatus]   = useState<Record<string, { state?: string; loading?: boolean }>>({})

  const { data: channels, isLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data },
  })
  const { data: tenant } = useQuery({
    queryKey: ['tenant'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant'); return data.data },
  })

  const channelLimit = CHANNEL_LIMITS[tenant?.planSlug || 'pending'] ?? 5
  const channelCount = channels?.length ?? 0
  const atLimit      = channelCount >= channelLimit

  const createMutation = useMutation({
    mutationFn: async () => {
      if (form.channelType === 'instagram' || form.channelType === 'messenger') {
        await channelApi.post('/channels', { name: form.name, type: form.channelType, phoneNumber: '', credentials: { accessToken: form.accessToken, pageId: form.pageId, appSecret: form.appSecret }, settings: {} })
      } else if (form.channelType === 'evolution') {
        await channelApi.post('/channels', { name: form.name, type: 'evolution', phoneNumber: '', credentials: { apiKey: form.apiKey, baseUrl: form.baseUrl, instanceName: form.instanceName }, settings: {} })
      } else {
        await channelApi.post('/channels', { name: form.name, type: 'gupshup', phoneNumber: form.source, credentials: { apiKey: form.apiKey, source: form.source, srcName: form.srcName, metaToken: form.metaToken || undefined, phoneNumberId: form.phoneNumberId || undefined }, settings: {} })
      }
    },
    onSuccess: () => { toast.success(t('channels.toast.created')); queryClient.invalidateQueries({ queryKey: ['channels'] }); setShowForm(false); setForm(emptyForm) },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || t('channels.toast.errorCreate')),
  })
  const editMutation = useMutation({
    mutationFn: async () => {
      const settingsPayload = { aiChatbotEnabled: form.aiChatbotEnabled }
      if (form.channelType === 'instagram' || form.channelType === 'messenger') {
        await channelApi.patch(`/channels/${editingId}`, { name: form.name, credentials: { accessToken: form.accessToken, pageId: form.pageId, appSecret: form.appSecret }, settings: settingsPayload })
      } else if (form.channelType === 'evolution') {
        await channelApi.patch(`/channels/${editingId}`, { name: form.name, credentials: { apiKey: form.apiKey, baseUrl: form.baseUrl, instanceName: form.instanceName }, settings: settingsPayload })
      } else {
        await channelApi.patch(`/channels/${editingId}`, { name: form.name, phoneNumber: form.source, credentials: { apiKey: form.apiKey, source: form.source, srcName: form.srcName, metaToken: form.metaToken || undefined, phoneNumberId: form.phoneNumberId || undefined }, settings: settingsPayload })
      }
    },
    onSuccess: () => { toast.success(t('channels.toast.updated')); queryClient.invalidateQueries({ queryKey: ['channels'] }); setShowForm(false); setEditingId(null); setForm(emptyForm) },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || t('channels.toast.errorUpdate')),
  })
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await channelApi.delete(`/channels/${id}`) },
    onSuccess: () => { toast.success(t('channels.toast.deleted')); queryClient.invalidateQueries({ queryKey: ['channels'] }) },
    onError: () => toast.error(t('channels.toast.errorDelete')),
  })

  const openEdit = (ch: any) => {
    const aiEnabled = ch.settings?.aiChatbotEnabled ?? false
    if (ch.type === 'instagram' || ch.type === 'messenger') {
      setForm({ name: ch.name || '', apiKey: '', source: '', srcName: '', metaToken: '', phoneNumberId: '', channelType: ch.type as ChannelFormType, baseUrl: '', instanceName: '', aiChatbotEnabled: aiEnabled, accessToken: '', pageId: ch.pageId || '', appSecret: '' })
    } else if (ch.type === 'evolution') {
      setForm({ name: ch.name || '', apiKey: ch.webhookApiKey || '', source: '', srcName: '', metaToken: '', phoneNumberId: '', channelType: 'evolution', baseUrl: ch.baseUrl || '', instanceName: ch.instanceName || '', aiChatbotEnabled: aiEnabled, accessToken: '', pageId: '', appSecret: '' })
    } else {
      setForm({ name: ch.name || '', apiKey: ch.webhookApiKey || '', source: ch.source || ch.phoneNumber || '', srcName: ch.srcName || '', metaToken: '', phoneNumberId: '', channelType: 'gupshup', baseUrl: '', instanceName: '', aiChatbotEnabled: aiEnabled, accessToken: '', pageId: '', appSecret: '' })
    }
    setEditingId(ch.id); setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm) }
  const copyWebhook = (_: string, apiKey: string) => { navigator.clipboard.writeText(`${WEBHOOK_BASE}/webhook/gupshup/${apiKey}`); toast.success(t('channels.toast.webhookCopied')) }
  const toggleApiKey = (id: string) => setShowApiKey(prev => ({ ...prev, [id]: !prev[id] }))
  const handleSubmit = () => editingId ? editMutation.mutate() : createMutation.mutate()
  const isPending = createMutation.isPending || editMutation.isPending
  const isFormValid = (form.channelType === 'instagram' || form.channelType === 'messenger')
    ? !!(form.name && form.accessToken && form.pageId && form.appSecret)
    : form.channelType === 'evolution'
    ? !!(form.name && form.apiKey && form.baseUrl && form.instanceName)
    : !!(form.name && form.apiKey && form.source)

  const fetchQrCode = async (channelId: string) => {
    setQrData(prev => ({ ...prev, [channelId]: { loading: true } }))
    try {
      const { data } = await channelApi.get(`/channels/${channelId}/evolution/qrcode`)
      const qr = data.data
      setQrData(prev => ({ ...prev, [channelId]: { base64: qr?.base64 || qr?.qrcode?.base64, pairingCode: qr?.pairingCode, loading: false, connected: qr?.instance?.state === 'open' } }))
    } catch {
      toast.error('Erro ao buscar QR Code')
      setQrData(prev => ({ ...prev, [channelId]: { loading: false } }))
    }
  }

  const fetchEvoStatus = async (channelId: string) => {
    setEvoStatus(prev => ({ ...prev, [channelId]: { loading: true } }))
    try {
      const { data } = await channelApi.get(`/channels/${channelId}/evolution/status`)
      const inst = data.data
      setEvoStatus(prev => ({ ...prev, [channelId]: { state: inst?.instance?.state || 'unknown', loading: false } }))
    } catch {
      setEvoStatus(prev => ({ ...prev, [channelId]: { state: 'error', loading: false } }))
    }
  }

  const focusInp = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = '#22c55e'; e.target.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.1)' }
  const blurInp  = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }

  return (
    <div className="mobile-page" style={{ padding: '28px 32px', maxWidth: '860px', background: 'var(--bg)', minHeight: '100%' }}>

      {/* Header */}
      <div className="mobile-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', margin: 0 }}>{t('channels.title')}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', marginTop: '4px' }}>{t('channels.configure')}</p>
        </div>
        <div className="mobile-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: atLimit ? '#dc2626' : '#52525b', background: atLimit ? '#fef2f2' : 'var(--bg-card)', border: `1px solid ${atLimit ? '#fecaca' : 'var(--border)'}`, padding: '4px 12px', borderRadius: '99px' }}>
            {channelCount}/{channelLimit} {channelLimit > 1 ? t('channels.channelsPlural') : t('channels.channelSingular')}
          </div>
          {canEdit('/dashboard/channels') && (
          <button
            onClick={() => { if (atLimit) { toast.error(`${t('channels.toast.planLimit')} ${channelLimit} ${channelLimit > 1 ? t('channels.channelsPlural') : t('channels.channelSingular')}. Fazer upgrade: /dashboard/settings#planos`); return }; closeForm(); setShowForm(true) }}
            style={{ padding: '8px 16px', background: atLimit ? 'var(--border)' : '#22c55e', color: atLimit ? 'var(--text-faint)' : '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: atLimit ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: atLimit ? 'none' : '0 1px 3px rgba(34,197,94,0.3)', transition: 'all 0.12s' }}
            onMouseEnter={e => { if (!atLimit) (e.currentTarget as HTMLButtonElement).style.background = '#16a34a' }}
            onMouseLeave={e => { if (!atLimit) (e.currentTarget as HTMLButtonElement).style.background = '#22c55e' }}>
            <Plus size={14} /> {t('channels.new')}
          </button>
          )}
        </div>
      </div>

      {/* Guia rápido */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '16px 18px', marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, color: '#1d4ed8', marginBottom: '8px' }}>📋 {t('channels.howTo')}</p>
        <ol style={{ fontSize: '13px', color: '#374151', lineHeight: 1.9, paddingLeft: '18px', margin: 0 }}>
          <li>{t('channels.step1')} <a href="https://gupshup.io" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: 500 }}>gupshup.io</a> {t('channels.step1Suffix')}</li>
          <li>{t('channels.step2')} <strong>API Key</strong> {t('channels.step2Suffix')}</li>
          <li>{t('channels.step3')}</li>
          <li>{t('channels.step4')}</li>
          <li>{t('channels.step5')}</li>
        </ol>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '22px', marginBottom: '20px', boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,.04))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: '14.5px', color: 'var(--text)', margin: 0 }}>{editingId ? t('channels.editChannel') : t('channels.newChannelForm')}</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>{editingId ? t('channels.updateCredentials') : t('channels.fillCredentials')}</p>
            </div>
            <button onClick={closeForm} style={{ background: 'var(--bg)', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-muted)', padding: '7px', display: 'flex' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--border)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)' }}>
              <X size={15} />
            </button>
          </div>

          {/* Channel type selector */}
          {!editingId && (
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Tipo de canal</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { value: 'gupshup' as ChannelFormType, label: 'Gupshup', color: '#6366f1' },
                  { value: 'evolution' as ChannelFormType, label: 'Evolution API', color: '#22c55e' },
                  // Instagram e Messenger: backend pronto, habilitar no frontend quando configurar app Meta
                  // { value: 'instagram' as ChannelFormType, label: 'Instagram', color: '#e1306c' },
                  // { value: 'messenger' as ChannelFormType, label: 'Messenger', color: '#0084ff' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setForm({ ...form, channelType: opt.value })}
                    style={{ flex: 1, padding: '10px 16px', background: form.channelType === opt.value ? `${opt.color}11` : 'var(--bg)', border: `1.5px solid ${form.channelType === opt.value ? opt.color : 'var(--border)'}`, borderRadius: '9px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: form.channelType === opt.value ? opt.color : 'var(--text-muted)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Radio size={14} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Common: Name */}
          <div style={{ marginBottom: '14px' }}>
            <label style={lbl}>{t('channels.formName')}</label>
            <input style={inp} placeholder={t('channels.formNamePlaceholder')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} onFocus={focusInp} onBlur={blurInp} />
          </div>

          {(form.channelType === 'instagram' || form.channelType === 'messenger') ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={lbl}>Page ID</label>
                  <input style={inp} placeholder="123456789012345" value={form.pageId} onChange={e => setForm({ ...form, pageId: e.target.value })} onFocus={focusInp} onBlur={blurInp} />
                </div>
                <div>
                  <label style={lbl}>Access Token</label>
                  <input style={inp} type="password" placeholder="EAAxxxxxxx..." value={form.accessToken} onChange={e => setForm({ ...form, accessToken: e.target.value })} onFocus={focusInp} onBlur={blurInp} />
                </div>
                <div>
                  <label style={lbl}>App Secret</label>
                  <input style={inp} type="password" placeholder="abc123def456..." value={form.appSecret} onChange={e => setForm({ ...form, appSecret: e.target.value })} onFocus={focusInp} onBlur={blurInp} />
                </div>
              </div>

              <div style={{ marginBottom: '20px', padding: '14px 16px', background: form.channelType === 'instagram' ? '#fdf2f8' : '#eff6ff', borderRadius: '9px', border: `1px solid ${form.channelType === 'instagram' ? '#fbcfe8' : '#bfdbfe'}` }}>
                <p style={{ fontSize: '12px', color: form.channelType === 'instagram' ? '#9d174d' : '#1d4ed8', margin: 0, lineHeight: 1.6 }}>
                  Configure o webhook no Meta Developers para: <strong>{WEBHOOK_BASE}/webhook/meta</strong>
                  <br />Defina a variavel <strong>META_WEBHOOK_VERIFY_TOKEN</strong> no servidor para o token de verificacao escolhido.
                </p>
              </div>
            </>
          ) : form.channelType === 'gupshup' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                {[
                  { label: t('channels.formSource'),  key: 'source',  placeholder: '15558406981' },
                  { label: t('channels.formApiKey'),   key: 'apiKey',  placeholder: 'sk_xxxxxxxxxxxxxxxxxx' },
                  { label: t('channels.formSrcName'), key: 'srcName', placeholder: t('channels.formSrcNamePlaceholder') },
                ].map(field => (
                  <div key={field.key}>
                    <label style={lbl}>{field.label}</label>
                    <input style={inp} placeholder={field.placeholder} value={(form as any)[field.key]} onChange={e => setForm({ ...form, [field.key]: e.target.value })} onFocus={focusInp} onBlur={blurInp} />
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: '20px', padding: '14px 16px', background: 'var(--bg-input)', borderRadius: '9px', border: '1px solid var(--divider)' }}>
                <label style={lbl}>{t('channels.formMetaToken')} <span style={{ color: 'var(--text-faint)', fontWeight: 400, textTransform: 'none', fontSize: '11px' }}>({t('channels.formOptional')})</span></label>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.5 }}>{t('channels.formMetaTokenHint')}</p>
                <input style={inp} type="password" placeholder={editingId ? t('channels.formMetaTokenKeep') : 'EAAxxxxxxx...'} value={form.metaToken} onChange={e => setForm({ ...form, metaToken: e.target.value })} onFocus={focusInp} onBlur={blurInp} />
              </div>
              <div style={{ marginBottom: '20px', padding: '14px 16px', background: 'var(--bg-input)', borderRadius: '9px', border: '1px solid var(--divider)' }}>
                <label style={lbl}>Phone Number ID <span style={{ color: 'var(--text-faint)', fontWeight: 400, textTransform: 'none', fontSize: '11px' }}>(opcional — necessário pra botões interativos)</span></label>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.5 }}>ID do número no Meta Business. Encontre em business.facebook.com → WhatsApp Manager</p>
                <input style={inp} placeholder="Ex: 1104144786108073" value={form.phoneNumberId} onChange={e => setForm({ ...form, phoneNumberId: e.target.value })} onFocus={focusInp} onBlur={blurInp} />
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={lbl}>Base URL</label>
                  <input style={inp} placeholder="https://api.evolution.com" value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} onFocus={focusInp} onBlur={blurInp} />
                </div>
                <div>
                  <label style={lbl}>Global API Key</label>
                  <input style={inp} placeholder="sua-api-key-global" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} onFocus={focusInp} onBlur={blurInp} />
                </div>
                <div>
                  <label style={lbl}>Instance Name</label>
                  <input style={inp} placeholder="minha-instancia" value={form.instanceName} onChange={e => setForm({ ...form, instanceName: e.target.value })} onFocus={focusInp} onBlur={blurInp} />
                </div>
              </div>

              <div style={{ marginBottom: '20px', padding: '14px 16px', background: '#f0fdf4', borderRadius: '9px', border: '1px solid #bbf7d0' }}>
                <p style={{ fontSize: '12px', color: '#166534', margin: 0, lineHeight: 1.6 }}>
                  Apos criar o canal, use o botao de QR Code para escanear e conectar sua instancia do WhatsApp.
                  Configure o webhook na Evolution API para: <strong>{WEBHOOK_BASE}/webhook/evolution/{form.instanceName || '{instanceName}'}</strong>
                </p>
              </div>
            </>
          )}

          {/* Toggle: Chatbot IA neste canal */}
          {editingId && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-input)', borderRadius: '9px', border: '1px solid var(--divider)', marginBottom: '16px' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', display: 'block' }}>Chatbot IA ativo neste canal</span>
                <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>O chatbot de IA respondera automaticamente neste canal</span>
              </div>
              <button onClick={() => setForm({ ...form, aiChatbotEnabled: !form.aiChatbotEnabled })}
                style={{ position: 'relative' as const, width: '40px', height: '22px', background: form.aiChatbotEnabled ? '#22c55e' : 'var(--border)', borderRadius: '99px', border: 'none', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute' as const, top: '3px', left: form.aiChatbotEnabled ? '20px' : '3px', width: '16px', height: '16px', background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,.15)' }} />
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleSubmit} disabled={isPending || !isFormValid}
              style={{ padding: '9px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !isFormValid ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !isFormValid ? 0.5 : 1 }}>
              {isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
              {editingId ? t('channels.saveChanges') : t('channels.createChannel')}
            </button>
            <button onClick={closeForm} style={{ padding: '9px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#52525b', fontWeight: 500 }}>{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div style={{ padding: '80px', textAlign: 'center' }}><Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faintest)' }} /></div>
      ) : channels?.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '72px', textAlign: 'center', boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,.04))' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Radio size={24} color="var(--text-faintest)" />
          </div>
          <p style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 600, margin: '0 0 4px' }}>{t('channels.noChannels')}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 18px' }}>{t('channels.connectToStart')}</p>
          {canEdit('/dashboard/channels') && <button onClick={() => setShowForm(true)} style={{ padding: '9px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>+ {t('channels.new')}</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {channels?.map((ch: any) => {
            const isEvolution = ch.type === 'evolution'
            const isMeta = ch.type === 'instagram' || ch.type === 'messenger'
            const webhookUrl = isMeta
              ? `${WEBHOOK_BASE}/webhook/meta`
              : isEvolution
              ? `${WEBHOOK_BASE}/webhook/evolution/${ch.instanceName || ch.credentials?.instanceName || ''}`
              : `${WEBHOOK_BASE}/webhook/gupshup/${ch.webhookApiKey}`
            const isVisible  = showApiKey[ch.id]
            const qr = qrData[ch.id]
            const evoSt = evoStatus[ch.id]
            return (
              <div key={ch.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,.04))', transition: 'box-shadow 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,.07)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,.04)' }}>

                {/* Header do canal */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: ch.type === 'instagram' ? '#fdf2f8' : ch.type === 'messenger' ? '#eff6ff' : isEvolution ? '#eff6ff' : '#f0fdf4', border: `1px solid ${ch.type === 'instagram' ? '#fbcfe8' : ch.type === 'messenger' ? '#bfdbfe' : isEvolution ? '#bfdbfe' : '#bbf7d0'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Radio size={17} color={ch.type === 'instagram' ? '#e1306c' : ch.type === 'messenger' ? '#0084ff' : isEvolution ? '#2563eb' : '#16a34a'} />
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)', margin: '0 0 2px', letterSpacing: '-0.01em' }}>{ch.name}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: 0, fontFamily: 'ui-monospace, monospace' }}>
                        {isMeta ? `${ch.type === 'instagram' ? 'Instagram' : 'Messenger'} - Page ${ch.pageId || ''}` : isEvolution ? `Evolution - ${ch.instanceName || ''}` : (ch.phoneNumber || ch.phone_number || '')}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: ch.type === 'instagram' ? '#e1306c' : ch.type === 'messenger' ? '#0084ff' : isEvolution ? '#2563eb' : '#16a34a', background: ch.type === 'instagram' ? '#fdf2f8' : ch.type === 'messenger' ? '#eff6ff' : isEvolution ? '#eff6ff' : '#f0fdf4', border: `1px solid ${ch.type === 'instagram' ? '#fbcfe8' : ch.type === 'messenger' ? '#bfdbfe' : isEvolution ? '#bfdbfe' : '#bbf7d0'}`, padding: '3px 10px', borderRadius: '99px' }}>
                      <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: ch.type === 'instagram' ? '#e1306c' : ch.type === 'messenger' ? '#0084ff' : isEvolution ? '#3b82f6' : '#22c55e' }} />
                      {ch.type === 'instagram' ? 'Instagram' : ch.type === 'messenger' ? 'Messenger' : isEvolution ? 'Evolution' : t('channels.active')}
                    </div>
                    {ch.settings?.aiChatbotEnabled && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600, color: '#0284c7', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '3px 9px', borderRadius: '99px' }}>
                        <Bot size={11} /> IA
                      </div>
                    )}
                    {isEvolution && canEdit('/dashboard/channels') && (
                      <>
                        <button onClick={() => fetchQrCode(ch.id)} title="QR Code"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faintest)', padding: '5px', display: 'flex', borderRadius: '6px', transition: 'all 0.12s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#2563eb'; (e.currentTarget as HTMLButtonElement).style.background = '#eff6ff' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faintest)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}>
                          <QrCode size={13} />
                        </button>
                        <button onClick={() => fetchEvoStatus(ch.id)} title="Status da conexao"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faintest)', padding: '5px', display: 'flex', borderRadius: '6px', transition: 'all 0.12s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#16a34a'; (e.currentTarget as HTMLButtonElement).style.background = '#f0fdf4' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faintest)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}>
                          {evoSt?.loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : evoSt?.state === 'open' ? <Wifi size={13} /> : <WifiOff size={13} />}
                        </button>
                      </>
                    )}
                    {canEdit('/dashboard/channels') && (
                    <button onClick={() => openEdit(ch)} title={t('channels.editChannel')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faintest)', padding: '5px', display: 'flex', borderRadius: '6px', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6366f1'; (e.currentTarget as HTMLButtonElement).style.background = '#eef2ff' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faintest)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}>
                      <Pencil size={13} />
                    </button>
                    )}
                    {canEdit('/dashboard/channels') && (
                    <button onClick={() => { if (confirm(t('channels.confirmDelete'))) deleteMutation.mutate(ch.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faintest)', padding: '5px', display: 'flex', borderRadius: '6px', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faintest)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}>
                      <Trash2 size={13} />
                    </button>
                    )}
                  </div>
                </div>

                <div style={{ height: '1px', background: 'var(--bg)', marginBottom: '14px' }} />

                {/* Evolution: QR Code panel */}
                {isEvolution && qr && (
                  <div style={{ marginBottom: '14px', padding: '16px', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--border)', textAlign: 'center' }}>
                    {qr.loading ? (
                      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faintest)' }} />
                    ) : qr.connected ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#16a34a' }}>
                        <Wifi size={18} />
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>Conectado ao WhatsApp</span>
                      </div>
                    ) : qr.base64 ? (
                      <div>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 500 }}>Escaneie o QR Code com o WhatsApp:</p>
                        <img src={qr.base64.startsWith('data:') ? qr.base64 : `data:image/png;base64,${qr.base64}`} alt="QR Code" style={{ maxWidth: '260px', margin: '0 auto', borderRadius: '8px' }} />
                        {qr.pairingCode && (
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px' }}>Codigo de pareamento: <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{qr.pairingCode}</strong></p>
                        )}
                      </div>
                    ) : (
                      <p style={{ fontSize: '12px', color: '#dc2626' }}>Nao foi possivel obter o QR Code. A instancia pode ja estar conectada.</p>
                    )}
                  </div>
                )}

                {/* Evolution: Connection status */}
                {isEvolution && evoSt && !evoSt.loading && (
                  <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 10px', background: evoSt.state === 'open' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${evoSt.state === 'open' ? '#bbf7d0' : '#fecaca'}`, borderRadius: '7px' }}>
                    {evoSt.state === 'open' ? <Wifi size={13} color="#16a34a" /> : <WifiOff size={13} color="#dc2626" />}
                    <p style={{ fontSize: '11.5px', color: evoSt.state === 'open' ? '#166534' : '#991b1b', margin: 0, fontWeight: 500 }}>
                      {evoSt.state === 'open' ? 'Instancia conectada ao WhatsApp' : `Status: ${evoSt.state || 'desconectado'}`}
                    </p>
                  </div>
                )}

                {/* API Key — só visível pra quem pode editar */}
                {canEdit('/dashboard/channels') && !isEvolution && !isMeta && <div style={{ marginBottom: '12px' }}>
                  <label style={lbl}>API Key</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input readOnly type={isVisible ? 'text' : 'password'} value={ch.webhookApiKey || ''}
                      style={{ ...inp, flex: 1, background: 'var(--bg-input)', color: '#52525b', fontSize: '12.5px', fontFamily: 'ui-monospace, monospace', cursor: 'default' }} />
                    <button onClick={() => toggleApiKey(ch.id)}
                      style={{ padding: '9px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', display: 'flex', color: 'var(--text-faint)', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLButtonElement).style.color = '#52525b' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}>
                      {isVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>}

                {/* Webhook URL — visível pra quem pode editar */}
                {canEdit('/dashboard/channels') && <div>
                  <label style={lbl}>{t('channels.webhookUrlLabel')}</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input readOnly value={webhookUrl}
                      style={{ ...inp, flex: 1, background: 'var(--bg-input)', color: '#52525b', fontSize: '11.5px', fontFamily: 'ui-monospace, monospace', cursor: 'default' }} />
                    <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success(t('channels.toast.webhookCopied')) }} title={t('channels.copy')}
                      style={{ padding: '9px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', display: 'flex', color: 'var(--text-faint)', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLButtonElement).style.color = '#52525b' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}>
                      <Copy size={13} />
                    </button>
                    {!isEvolution && (
                    <a href="https://app.gupshup.io" target="_blank" rel="noopener noreferrer" title={t('channels.openGupshup')}
                      style={{ padding: '9px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', display: 'flex', color: 'var(--text-faint)', textDecoration: 'none', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLAnchorElement).style.color = '#52525b' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-input)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-faint)' }}>
                      <ExternalLink size={13} />
                    </a>
                    )}
                  </div>
                  {!isEvolution && !ch.hasMetaToken && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', padding: '7px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '7px' }}>
                      <span style={{ fontSize: '13px' }}>⚠️</span>
                      <p style={{ fontSize: '11.5px', color: '#92400e', margin: 0, fontWeight: 500 }}>{t('channels.metaTokenWarning')}</p>
                    </div>
                  )}
                </div>}
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus, textarea:focus, select:focus { border-color: #22c55e !important; box-shadow: 0 0 0 3px rgba(34,197,94,0.1) !important; outline: none; }
      `}</style>
    </div>
  )
}
