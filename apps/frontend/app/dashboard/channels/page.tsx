'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { channelApi, tenantApi } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Radio, Trash2, X, Check, Loader2, Copy, ExternalLink, Eye, EyeOff, Pencil } from 'lucide-react'
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
  trial: 1, starter: 1, pro: 5, enterprise: 10, unlimited: 999,
}

const emptyForm = { name: '', apiKey: '', source: '', srcName: '', metaToken: '' }

export default function ChannelsPage() {
  const t = useT()
  const { isAdmin } = usePermissions()
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
      await channelApi.post('/channels', { name: form.name, type: 'gupshup', phoneNumber: form.source, credentials: { apiKey: form.apiKey, source: form.source, srcName: form.srcName, metaToken: form.metaToken || undefined }, settings: {} })
    },
    onSuccess: () => { toast.success(t('channels.toast.created')); queryClient.invalidateQueries({ queryKey: ['channels'] }); setShowForm(false); setForm(emptyForm) },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || t('channels.toast.errorCreate')),
  })
  const editMutation = useMutation({
    mutationFn: async () => {
      await channelApi.patch(`/channels/${editingId}`, { name: form.name, phoneNumber: form.source, credentials: { apiKey: form.apiKey, source: form.source, srcName: form.srcName, metaToken: form.metaToken || undefined } })
    },
    onSuccess: () => { toast.success(t('channels.toast.updated')); queryClient.invalidateQueries({ queryKey: ['channels'] }); setShowForm(false); setEditingId(null); setForm(emptyForm) },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || t('channels.toast.errorUpdate')),
  })
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await channelApi.delete(`/channels/${id}`) },
    onSuccess: () => { toast.success(t('channels.toast.deleted')); queryClient.invalidateQueries({ queryKey: ['channels'] }) },
    onError: () => toast.error(t('channels.toast.errorDelete')),
  })

  const openEdit = (ch: any) => { setForm({ name: ch.name || '', apiKey: ch.webhookApiKey || '', source: ch.source || ch.phoneNumber || '', srcName: ch.srcName || '', metaToken: '' }); setEditingId(ch.id); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm) }
  const copyWebhook = (_: string, apiKey: string) => { navigator.clipboard.writeText(`${WEBHOOK_BASE}/webhook/gupshup/${apiKey}`); toast.success(t('channels.toast.webhookCopied')) }
  const toggleApiKey = (id: string) => setShowApiKey(prev => ({ ...prev, [id]: !prev[id] }))
  const handleSubmit = () => editingId ? editMutation.mutate() : createMutation.mutate()
  const isPending = createMutation.isPending || editMutation.isPending

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
          {isAdmin && (
          <button
            onClick={() => { if (atLimit) { toast.error(`${t('channels.toast.planLimit')} ${channelLimit} ${channelLimit > 1 ? t('channels.channelsPlural') : t('channels.channelSingular')}.`); return }; closeForm(); setShowForm(true) }}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            {[
              { label: t('channels.formName'),    key: 'name',    placeholder: t('channels.formNamePlaceholder') },
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

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleSubmit} disabled={isPending || !form.name || !form.apiKey || !form.source}
              style={{ padding: '9px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: !form.name || !form.apiKey || !form.source ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !form.name || !form.apiKey || !form.source ? 0.5 : 1 }}>
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
          {isAdmin && <button onClick={() => setShowForm(true)} style={{ padding: '9px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>+ {t('channels.new')}</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {channels?.map((ch: any) => {
            const webhookUrl = `${WEBHOOK_BASE}/webhook/gupshup/${ch.webhookApiKey}`
            const isVisible  = showApiKey[ch.id]
            return (
              <div key={ch.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,.04))', transition: 'box-shadow 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,.07)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,.04)' }}>

                {/* Header do canal */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Radio size={17} color="#16a34a" />
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)', margin: '0 0 2px', letterSpacing: '-0.01em' }}>{ch.name}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: 0, fontFamily: 'ui-monospace, monospace' }}>{ch.phoneNumber || ch.phone_number || ''}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '3px 10px', borderRadius: '99px' }}>
                      <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22c55e' }} />
                      {t('channels.active')}
                    </div>
                    {isAdmin && (
                    <button onClick={() => openEdit(ch)} title={t('channels.editChannel')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faintest)', padding: '5px', display: 'flex', borderRadius: '6px', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6366f1'; (e.currentTarget as HTMLButtonElement).style.background = '#eef2ff' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faintest)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}>
                      <Pencil size={13} />
                    </button>
                    )}
                    {isAdmin && (
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

                {/* API Key */}
                <div style={{ marginBottom: '12px' }}>
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
                </div>

                {/* Webhook URL */}
                <div>
                  <label style={lbl}>{t('channels.webhookUrlLabel')}</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input readOnly value={webhookUrl}
                      style={{ ...inp, flex: 1, background: 'var(--bg-input)', color: '#52525b', fontSize: '11.5px', fontFamily: 'ui-monospace, monospace', cursor: 'default' }} />
                    <button onClick={() => copyWebhook(ch.id, ch.webhookApiKey)} title={t('channels.copy')}
                      style={{ padding: '9px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', display: 'flex', color: 'var(--text-faint)', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLButtonElement).style.color = '#52525b' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}>
                      <Copy size={13} />
                    </button>
                    <a href="https://app.gupshup.io" target="_blank" rel="noopener noreferrer" title={t('channels.openGupshup')}
                      style={{ padding: '9px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', display: 'flex', color: 'var(--text-faint)', textDecoration: 'none', transition: 'all 0.12s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLAnchorElement).style.color = '#52525b' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-input)'; (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-faint)' }}>
                      <ExternalLink size={13} />
                    </a>
                  </div>
                  {!ch.hasMetaToken && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', padding: '7px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '7px' }}>
                      <span style={{ fontSize: '13px' }}>⚠️</span>
                      <p style={{ fontSize: '11.5px', color: '#92400e', margin: 0, fontWeight: 500 }}>{t('channels.metaTokenWarning')}</p>
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
        input:focus, textarea:focus, select:focus { border-color: #22c55e !important; box-shadow: 0 0 0 3px rgba(34,197,94,0.1) !important; outline: none; }
      `}</style>
    </div>
  )
}
