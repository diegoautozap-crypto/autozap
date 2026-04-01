'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, X, Check, Loader2, Pencil, Trash2, FileText, ChevronDown } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { usePermissions } from '@/store/permissions.store'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '6px', fontSize: '14px', outline: 'none', color: 'var(--text)',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600,
  color: 'var(--text-muted)', marginBottom: '5px',
  textTransform: 'uppercase', letterSpacing: '0.04em',
}

const CATEGORIES = [
  { value: 'marketing', labelKey: 'Marketing', color: '#16a34a', bg: '#f0fdf4' },
  { value: 'utility', labelKey: 'templates.categoryUtility', color: '#2563eb', bg: '#eff6ff' },
  { value: 'authentication', labelKey: 'templates.categoryAuth', color: '#7c3aed', bg: '#f5f3ff' },
]

const emptyForm = { name: '', templateId: '', body: '', category: 'marketing', variables: '' }

export default function TemplatesPage() {
  const t = useT()
  const { canEdit } = usePermissions()
  const canEditTemplates = canEdit('/dashboard/templates')
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedChannel, setSelectedChannel] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data },
  })

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates', selectedChannel],
    queryFn: async () => {
      const url = selectedChannel ? `/templates?channelId=${selectedChannel}` : '/templates'
      const { data } = await campaignApi.get(url)
      return data.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      await campaignApi.post('/templates', {
        channelId: selectedChannel,
        name: form.name,
        templateId: form.templateId,
        body: form.body,
        category: form.category,
        variables: form.variables ? form.variables.split(',').map(v => v.trim()).filter(Boolean) : [],
      })
    },
    onSuccess: () => {
      toast.success(t('templates.successCreated'))
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setShowForm(false)
      setForm(emptyForm)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || t('templates.errorCreate')),
  })

  const editMutation = useMutation({
    mutationFn: async () => {
      await campaignApi.patch(`/templates/${editingId}`, {
        name: form.name,
        templateId: form.templateId,
        body: form.body,
        category: form.category,
        variables: form.variables ? form.variables.split(',').map(v => v.trim()).filter(Boolean) : [],
      })
    },
    onSuccess: () => {
      toast.success(t('templates.successUpdated'))
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || t('templates.errorUpdate')),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await campaignApi.delete(`/templates/${id}`) },
    onSuccess: () => {
      toast.success(t('templates.successDeleted'))
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
    onError: () => toast.error(t('templates.errorDelete')),
  })

  const openEdit = (t: any) => {
    setForm({
      name: t.name || '',
      templateId: t.template_id || '',
      body: t.body || '',
      category: t.category || 'marketing',
      variables: (t.variables || []).join(', '),
    })
    setEditingId(t.id)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const handleSubmit = () => {
    if (!selectedChannel && !editingId) { toast.error(t('templates.selectChannelError')); return }
    if (editingId) editMutation.mutate()
    else createMutation.mutate()
  }

  const isPending = createMutation.isPending || editMutation.isPending
  const canSave = form.name && form.templateId && form.body && (editingId || selectedChannel)

  return (
    <div className="mobile-page" style={{ padding: '32px', maxWidth: '900px' }}>
      {/* Header */}
      <div className="mobile-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>{t('nav.templates')}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '3px' }}>{t('templates.subtitle')}</p>
        </div>
        {canEditTemplates && (
        <button
          className="mobile-header-actions"
          onClick={() => { closeForm(); setShowForm(true) }}
          style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={14} /> {t('templates.new')}
        </button>
        )}
      </div>

      {/* Info box */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#1d4ed8', marginBottom: '6px' }}>📋 {t('templates.howTo')}</p>
        <ol style={{ fontSize: '13px', color: '#374151', lineHeight: 1.8, paddingLeft: '18px', margin: 0 }}>
          <li>{t('templates.howToStep1')} <a href="https://app.gupshup.io" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>app.gupshup.io</a> {t('templates.howToStep1Suffix')}</li>
          <li>{t('templates.howToStep2')}</li>
          <li>{t('templates.howToStep3')}</li>
          <li>{t('templates.howToStep4')}</li>
        </ol>
      </div>

      {/* Filtro por canal */}
      {channels && channels.length > 1 && (
        <div style={{ marginBottom: '16px' }}>
          <select
            value={selectedChannel}
            onChange={e => setSelectedChannel(e.target.value)}
            style={{ ...inputStyle, width: '280px' }}>
            <option value="">{t('templates.allChannels')}</option>
            {channels?.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
          </select>
        </div>
      )}

      {/* Form criar/editar */}
      {canEditTemplates && showForm && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '22px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h3 style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text)' }}>
              {editingId ? `✏️ ${t('templates.editTemplate')}` : t('templates.new')}
            </h3>
            <button onClick={closeForm} style={{ background: 'var(--bg)', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex' }}>
              <X size={16} />
            </button>
          </div>

          {!editingId && (
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>{t('templates.channel')} *</label>
              <select style={{ ...inputStyle, appearance: 'none' } as any} value={selectedChannel} onChange={e => setSelectedChannel(e.target.value)}>
                <option value="">{t('templates.selectChannel')}</option>
                {channels?.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>{t('templates.templateName')} *</label>
              <input style={inputStyle} placeholder={t('templates.namePlaceholder')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>{t('templates.templateId')} *</label>
              <input style={inputStyle} placeholder={t('templates.idPlaceholder')} value={form.templateId} onChange={e => setForm({ ...form, templateId: e.target.value })} />
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>{t('templates.category')}</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {CATEGORIES.map(c => (
                <button key={c.value} onClick={() => setForm({ ...form, category: c.value })}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: `1px solid ${form.category === c.value ? c.color : 'var(--border)'}`, background: form.category === c.value ? c.bg : 'var(--bg-card)', color: form.category === c.value ? c.color : 'var(--text-muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  {t(c.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>{t('templates.messageBody')} *</label>
            <textarea
              style={{ ...inputStyle, minHeight: '100px', resize: 'vertical', lineHeight: 1.6 } as any}
              placeholder={t('templates.bodyPlaceholder')}
              value={form.body}
              onChange={e => setForm({ ...form, body: e.target.value })}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>{t('templates.variablesHint')}</p>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>{t('templates.variableNames')}</label>
            <input
              style={inputStyle}
              placeholder={t('templates.variablesPlaceholder')}
              value={form.variables}
              onChange={e => setForm({ ...form, variables: e.target.value })}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>
              {t('templates.variablesHelp')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSubmit}
              disabled={isPending || !canSave}
              style={{ padding: '9px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !canSave ? 0.5 : 1 }}>
              {isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
              {editingId ? t('templates.saveChanges') : t('templates.createTemplate')}
            </button>
            <button onClick={closeForm} style={{ padding: '9px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Lista de templates */}
      {isLoading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faintest)' }} />
        </div>
      ) : templates?.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '60px', textAlign: 'center' }}>
          <FileText size={32} color="var(--border)" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-faint)', fontSize: '14px', marginBottom: '14px' }}>{t('templates.noTemplates')}</p>
          {canEditTemplates && (
          <button onClick={() => setShowForm(true)} style={{ padding: '8px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            + {t('templates.new')}
          </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {templates?.map((tpl: any) => {
            const cat = CATEGORIES.find(c => c.value === tpl.category) || CATEGORIES[0]
            const channelName = channels?.find((c: any) => c.id === tpl.channel_id)?.name
            const isExpanded = expandedId === tpl.id
            return (
              <div key={tpl.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}
                  onClick={() => setExpandedId(isExpanded ? null : tpl.id)}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={16} color={cat.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)', margin: 0 }}>{tpl.name}</p>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: cat.color, background: cat.bg, padding: '1px 6px', borderRadius: '4px' }}>{t(cat.labelKey)}</span>
                      {channelName && <span style={{ fontSize: '10px', color: 'var(--text-faint)', background: 'var(--bg)', padding: '1px 6px', borderRadius: '4px' }}>{channelName}</span>}
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      ID: {tpl.template_id}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {canEditTemplates && (
                    <button
                      onClick={e => { e.stopPropagation(); openEdit(tpl) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '4px', display: 'flex', borderRadius: '4px' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6366f1'; (e.currentTarget as HTMLButtonElement).style.background = '#eef2ff' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}>
                      <Pencil size={14} />
                    </button>
                    )}
                    {canEditTemplates && (
                    <button
                      onClick={e => { e.stopPropagation(); if (confirm(t('templates.confirmDelete'))) deleteMutation.mutate(tpl.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '4px', display: 'flex', borderRadius: '4px' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}>
                      <Trash2 size={14} />
                    </button>
                    )}
                    <ChevronDown size={14} color="var(--text-faint)" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--divider)' }}>
                    <div style={{ paddingTop: '12px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{t('templates.messageLabel')}</p>
                      <div style={{ background: 'var(--bg-input)', borderRadius: '8px', padding: '12px 14px' }}>
                        <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{tpl.body}</p>
                      </div>
                      {tpl.variables?.length > 0 && (
                        <div style={{ marginTop: '12px' }}>
                          <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{t('templates.variables')}</p>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {tpl.variables.map((v: string, i: number) => (
                              <span key={i} style={{ fontSize: '12px', background: '#eff6ff', color: '#1d4ed8', padding: '2px 10px', borderRadius: '4px', fontWeight: 500 }}>
                                {`{{${i + 1}}}`} = {v}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus, textarea:focus, select:focus { border-color: #16a34a !important; box-shadow: 0 0 0 3px rgba(22,163,74,0.1) !important; outline: none; }
      `}</style>
    </div>
  )
}
