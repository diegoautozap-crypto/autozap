'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactApi } from '@/lib/api'
import { toast } from 'sonner'
import { Download, Plus, Search, Loader2, User, Trash2, Pencil, X, Check, ChevronLeft, ChevronRight } from 'lucide-react'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: '#fff', border: '1px solid #e5e7eb',
  borderRadius: '6px', fontSize: '14px', outline: 'none', color: '#111827',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 500,
  color: '#6b7280', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em',
}

function getInitials(name: string | undefined | null) {
  return ((name || '??').trim().slice(0, 2)).toUpperCase()
}

function getAvatarColor(name: string | undefined | null) {
  const colors = [
    { bg: '#dbeafe', color: '#1d4ed8' },
    { bg: '#dcfce7', color: '#15803d' },
    { bg: '#fce7f3', color: '#be185d' },
    { bg: '#ede9fe', color: '#6d28d9' },
    { bg: '#ffedd5', color: '#c2410c' },
    { bg: '#e0f2fe', color: '#0369a1' },
  ]
  const idx = ((name || '').charCodeAt(0) || 0) % colors.length
  return colors[idx]
}

export default function ContactsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', company: '' })
  const [form, setForm] = useState({ phone: '', name: '', email: '', company: '' })
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) params.set('search', search)
      const { data } = await contactApi.get(`/contacts?${params}`)
      return data
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => { const { data } = await contactApi.post('/contacts', form); return data },
    onSuccess: () => {
      toast.success('Contato criado!')
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setShowCreate(false)
      setForm({ phone: '', name: '', email: '', company: '' })
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await contactApi.patch(`/contacts/${id}`, data)
    },
    onSuccess: () => {
      toast.success('Contato atualizado!')
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      setEditingId(null)
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao atualizar'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => contactApi.delete(`/contacts/${id}`)))
    },
    onSuccess: () => {
      toast.success('Contato(s) excluído(s)!')
      setSelected(new Set())
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
    onError: () => toast.error('Erro ao excluir'),
  })

  // ✅ Excluir TODOS os contatos de uma vez
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      await contactApi.delete('/contacts/all')
    },
    onSuccess: () => {
      toast.success('Todos os contatos foram excluídos!')
      setSelected(new Set())
      setPage(1)
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
    onError: () => toast.error('Erro ao excluir todos os contatos'),
  })

  const handleExport = async () => {
    const { data } = await contactApi.get('/contacts/export', { responseType: 'blob' })
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url; a.download = 'contatos.csv'; a.click()
    toast.success('CSV exportado!')
  }

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Excluir contato "${name}"?`)) deleteMutation.mutate([id])
  }

  const handleDeleteSelected = () => {
    if (confirm(`Excluir ${selected.size} contato(s)?`)) deleteMutation.mutate(Array.from(selected))
  }

  const handleDeleteAll = () => {
    if (confirm(`⚠️ Tem certeza que deseja excluir TODOS os ${meta?.total?.toLocaleString()} contatos? Essa ação não pode ser desfeita.`)) {
      deleteAllMutation.mutate()
    }
  }

  const startEdit = (c: any) => {
    setEditingId(c.id)
    setEditForm({ name: c.name || '', email: c.email || '', company: c.company || '' })
  }

  const saveEdit = () => {
    if (!editingId) return
    updateMutation.mutate({ id: editingId, data: editForm })
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const toggleAll = () => {
    if (selected.size === contacts.length) setSelected(new Set())
    else setSelected(new Set(contacts.map((c: any) => c.id)))
  }

  const contacts = data?.data || []
  const meta = data?.meta
  const allSelected = contacts.length > 0 && selected.size === contacts.length
  const totalPages = meta ? Math.ceil(meta.total / meta.limit) : 1

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>CRM de Contatos</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '3px' }}>
            {meta?.total ? `${meta.total.toLocaleString()} contatos na sua base` : '0 contatos'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {selected.size > 0 && (
            <button onClick={handleDeleteSelected} disabled={deleteMutation.isPending}
              style={{ padding: '8px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#ef4444', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Trash2 size={13} /> Excluir {selected.size}
            </button>
          )}
          {/* ✅ Botão excluir todos */}
          {meta?.total > 0 && (
            <button onClick={handleDeleteAll} disabled={deleteAllMutation.isPending}
              style={{ padding: '8px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#ef4444', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {deleteAllMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
              Excluir todos
            </button>
          )}
          <button onClick={handleExport}
            style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', color: '#6b7280', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff' }}>
            <Download size={13} /> Exportar CSV
          </button>
          <button onClick={() => setShowCreate(!showCreate)}
            style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#15803d' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#16a34a' }}>
            <Plus size={13} /> Novo contato
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontWeight: 600, fontSize: '15px', color: '#111827' }}>Novo contato</h3>
            <button onClick={() => setShowCreate(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#6b7280', padding: '4px', display: 'flex' }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Telefone *</label>
              <input style={inputStyle} placeholder="+5547999990001" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Nome</label>
              <input style={inputStyle} placeholder="João Silva" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" placeholder="joao@empresa.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Empresa</label>
              <input style={inputStyle} placeholder="Minha Empresa" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => createMutation.mutate()} disabled={!form.phone || createMutation.isPending}
              style={{ padding: '8px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !form.phone ? 0.5 : 1 }}>
              {createMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
              Criar contato
            </button>
            <button onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: '14px', position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
        <input style={{ ...inputStyle, paddingLeft: '36px', background: '#fff' }}
          placeholder="Buscar por nome ou número..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} />
          </div>
        ) : contacts.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <User size={28} color="#e5e7eb" style={{ margin: '0 auto 10px' }} />
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Nenhum contato encontrado</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '40px 2fr 1.5fr 1.5fr 1fr 80px', gap: '12px', padding: '11px 20px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', alignItems: 'center' }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#16a34a' }} />
              {['Nome', 'Telefone', 'Email', 'Última interação', ''].map(h => (
                <span key={h} style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
              ))}
            </div>

            {contacts.map((c: any) => {
              const isEditing = editingId === c.id
              const av = getAvatarColor(c.name)
              return (
                <div key={c.id}
                  style={{ display: 'grid', gridTemplateColumns: '40px 2fr 1.5fr 1.5fr 1fr 80px', gap: '12px', padding: isEditing ? '10px 20px' : '13px 20px', borderBottom: '1px solid #f9fafb', alignItems: 'center', background: selected.has(c.id) ? '#f0fdf4' : isEditing ? '#fafff6' : '#fff', transition: 'background 0.1s' }}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#16a34a' }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                      {getInitials(c.name)}
                    </div>
                    {isEditing ? (
                      <input style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: '13px' }} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} autoFocus />
                    ) : (
                      <span style={{ fontWeight: 500, fontSize: '14px', color: '#111827' }}>{c.name || '—'}</span>
                    )}
                  </div>

                  <span style={{ color: '#374151', fontSize: '13px' }}>{c.phone}</span>

                  {isEditing ? (
                    <input style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px' }} placeholder="email@exemplo.com" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                  ) : (
                    <span style={{ color: '#6b7280', fontSize: '13px' }}>{c.email || '—'}</span>
                  )}

                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>
                    {c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleDateString('pt-BR') : '—'}
                  </span>

                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                    {isEditing ? (
                      <>
                        <button onClick={saveEdit} disabled={updateMutation.isPending}
                          style={{ background: '#16a34a', border: 'none', borderRadius: '5px', cursor: 'pointer', color: '#fff', padding: '5px', display: 'flex' }}>
                          {updateMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                        </button>
                        <button onClick={() => setEditingId(null)}
                          style={{ background: '#f3f4f6', border: 'none', borderRadius: '5px', cursor: 'pointer', color: '#6b7280', padding: '5px', display: 'flex' }}>
                          <X size={13} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(c)}
                          style={{ background: 'none', border: 'none', borderRadius: '5px', cursor: 'pointer', color: '#9ca3af', padding: '5px', display: 'flex' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; (e.currentTarget as HTMLButtonElement).style.color = '#374151' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(c.id, c.name || c.phone)}
                          style={{ background: 'none', border: 'none', borderRadius: '5px', cursor: 'pointer', color: '#9ca3af', padding: '5px', display: 'flex' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}>
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* ✅ Paginação melhorada */}
      {meta && meta.total > 20 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
          <span style={{ color: '#6b7280', fontSize: '13px' }}>
            {((page - 1) * 20) + 1}–{Math.min(page * 20, meta.total)} de {meta.total.toLocaleString()} contatos
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              style={{ padding: '6px 10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#d1d5db' : '#374151', display: 'flex', alignItems: 'center' }}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ padding: '6px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', color: '#374151' }}>
              {page} / {totalPages}
            </span>
            <button disabled={!meta.hasMore} onClick={() => setPage(p => p + 1)}
              style={{ padding: '6px 10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: !meta.hasMore ? 'not-allowed' : 'pointer', color: !meta.hasMore ? '#d1d5db' : '#374151', display: 'flex', alignItems: 'center' }}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus { border-color: #16a34a !important; box-shadow: 0 0 0 3px rgba(22,163,74,0.1) !important; }
      `}</style>
    </div>
  )
}
