'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { campaignApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, X, Check, Loader2, Pencil, Trash2, FileText, ChevronDown } from 'lucide-react'

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

const CATEGORIES = [
  { value: 'marketing', label: 'Marketing', color: '#16a34a', bg: '#f0fdf4' },
  { value: 'utility', label: 'Utilidade', color: '#2563eb', bg: '#eff6ff' },
  { value: 'authentication', label: 'Autenticação', color: '#7c3aed', bg: '#f5f3ff' },
]

const emptyForm = { name: '', templateId: '', body: '', category: 'marketing', variables: '' }

export default function TemplatesPage() {
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
      toast.success('Template criado!')
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setShowForm(false)
      setForm(emptyForm)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao criar template'),
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
      toast.success('Template atualizado!')
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao atualizar'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await campaignApi.delete(`/templates/${id}`) },
    onSuccess: () => {
      toast.success('Template removido!')
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
    onError: () => toast.error('Erro ao remover template'),
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
    if (!selectedChannel && !editingId) { toast.error('Selecione um canal'); return }
    if (editingId) editMutation.mutate()
    else createMutation.mutate()
  }

  const isPending = createMutation.isPending || editMutation.isPending
  const canSave = form.name && form.templateId && form.body && (editingId || selectedChannel)

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>Templates</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '3px' }}>Gerencie seus templates aprovados do WhatsApp</p>
        </div>
        <button
          onClick={() => { closeForm(); setShowForm(true) }}
          style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={14} /> Novo template
        </button>
      </div>

      {/* Info box */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#1d4ed8', marginBottom: '6px' }}>📋 Como cadastrar um template</p>
        <ol style={{ fontSize: '13px', color: '#374151', lineHeight: 1.8, paddingLeft: '18px', margin: 0 }}>
          <li>Crie e aprove o template em <a href="https://app.gupshup.io" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>app.gupshup.io</a> → Modelos</li>
          <li>Copie o <strong>ID do template</strong> (UUID) no painel do Gupshup</li>
          <li>Cadastre aqui com o nome, corpo da mensagem e variáveis (ex: nome, cidade)</li>
          <li>Pronto — na criação de campanha basta selecionar o template</li>
        </ol>
      </div>

      {/* Filtro por canal */}
      {channels && channels.length > 1 && (
        <div style={{ marginBottom: '16px' }}>
          <select
            value={selectedChannel}
            onChange={e => setSelectedChannel(e.target.value)}
            style={{ ...inputStyle, width: '280px' }}>
            <option value="">Todos os canais</option>
            {channels?.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
          </select>
        </div>
      )}

      {/* Form criar/editar */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '22px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h3 style={{ fontWeight: 600, fontSize: '15px', color: '#111827' }}>
              {editingId ? '✏️ Editar template' : 'Novo template'}
            </h3>
            <button onClick={closeForm} style={{ background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#6b7280', padding: '4px', display: 'flex' }}>
              <X size={16} />
            </button>
          </div>

          {!editingId && (
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Canal *</label>
              <select style={{ ...inputStyle, appearance: 'none' } as any} value={selectedChannel} onChange={e => setSelectedChannel(e.target.value)}>
                <option value="">Selecionar canal...</option>
                {channels?.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Nome do template *</label>
              <input style={inputStyle} placeholder="Ex: Boas-vindas clientes" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>ID do template (Gupshup) *</label>
              <input style={inputStyle} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={form.templateId} onChange={e => setForm({ ...form, templateId: e.target.value })} />
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Categoria</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {CATEGORIES.map(c => (
                <button key={c.value} onClick={() => setForm({ ...form, category: c.value })}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: `1px solid ${form.category === c.value ? c.color : '#e5e7eb'}`, background: form.category === c.value ? c.bg : '#fff', color: form.category === c.value ? c.color : '#6b7280', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Corpo da mensagem *</label>
            <textarea
              style={{ ...inputStyle, minHeight: '100px', resize: 'vertical', lineHeight: 1.6 } as any}
              placeholder="Olá {{1}}, temos uma oferta especial para você em {{2}}!"
              value={form.body}
              onChange={e => setForm({ ...form, body: e.target.value })}
            />
            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Use {'{{1}}'}, {'{{2}}'}, etc. para marcar as variáveis</p>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Nomes das variáveis (separados por vírgula)</label>
            <input
              style={inputStyle}
              placeholder="Ex: nome, cidade, desconto"
              value={form.variables}
              onChange={e => setForm({ ...form, variables: e.target.value })}
            />
            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
              Esses nomes ajudam a identificar o que colocar em cada coluna do CSV
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSubmit}
              disabled={isPending || !canSave}
              style={{ padding: '9px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !canSave ? 0.5 : 1 }}>
              {isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
              {editingId ? 'Salvar alterações' : 'Criar template'}
            </button>
            <button onClick={closeForm} style={{ padding: '9px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de templates */}
      {isLoading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} />
        </div>
      ) : templates?.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '60px', textAlign: 'center' }}>
          <FileText size={32} color="#e5e7eb" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '14px' }}>Nenhum template cadastrado ainda</p>
          <button onClick={() => setShowForm(true)} style={{ padding: '8px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            + Novo template
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {templates?.map((t: any) => {
            const cat = CATEGORIES.find(c => c.value === t.category) || CATEGORIES[0]
            const channelName = channels?.find((c: any) => c.id === t.channel_id)?.name
            const isExpanded = expandedId === t.id
            return (
              <div key={t.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}
                  onClick={() => setExpandedId(isExpanded ? null : t.id)}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={16} color={cat.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <p style={{ fontWeight: 600, fontSize: '14px', color: '#111827', margin: 0 }}>{t.name}</p>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: cat.color, background: cat.bg, padding: '1px 6px', borderRadius: '4px' }}>{cat.label}</span>
                      {channelName && <span style={{ fontSize: '10px', color: '#9ca3af', background: '#f3f4f6', padding: '1px 6px', borderRadius: '4px' }}>{channelName}</span>}
                    </div>
                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      ID: {t.template_id}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={e => { e.stopPropagation(); openEdit(t) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px', display: 'flex', borderRadius: '4px' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6366f1'; (e.currentTarget as HTMLButtonElement).style.background = '#eef2ff' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}>
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); if (confirm('Remover template?')) deleteMutation.mutate(t.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px', display: 'flex', borderRadius: '4px' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}>
                      <Trash2 size={14} />
                    </button>
                    <ChevronDown size={14} color="#9ca3af" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid #f3f4f6' }}>
                    <div style={{ paddingTop: '12px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Mensagem</p>
                      <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '12px 14px' }}>
                        <p style={{ fontSize: '13px', color: '#111827', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{t.body}</p>
                      </div>
                      {t.variables?.length > 0 && (
                        <div style={{ marginTop: '12px' }}>
                          <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Variáveis</p>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {t.variables.map((v: string, i: number) => (
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
