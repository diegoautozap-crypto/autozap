'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactApi } from '@/lib/api'
import { toast } from 'sonner'
import { Download, Plus, Search, Loader2, User, Trash2 } from 'lucide-react'

export default function ContactsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
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

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const toggleAll = () => {
    if (selected.size === contacts.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(contacts.map((c: any) => c.id)))
    }
  }

  const contacts = data?.data || []
  const meta = data?.meta
  const allSelected = contacts.length > 0 && selected.size === contacts.length

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    background: '#f9fafb', border: '1px solid #e5e7eb',
    borderRadius: '6px', fontSize: '14px', outline: 'none', color: '#1a1f2e',
  }

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>CRM de Contatos</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            {meta?.total ? `${meta.total} contatos na sua base` : '0 contatos na sua base'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {selected.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={deleteMutation.isPending}
              style={{ padding: '9px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#ef4444', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Trash2 size={14} /> Excluir {selected.size} selecionado(s)
            </button>
          )}
          <button onClick={handleExport} style={{ padding: '9px 14px', background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download size={14} /> Exportar CSV
          </button>
          <button onClick={() => setShowCreate(!showCreate)} style={{ padding: '9px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> Novo contato
          </button>
        </div>
      </div>

      {showCreate && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px', marginBottom: '20px', boxShadow: 'var(--shadow)' }}>
          <h3 style={{ fontWeight: 600, marginBottom: '16px', fontSize: '15px' }}>Novo contato</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div><label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '5px' }}>Telefone *</label><input style={inputStyle} placeholder="+5547999990001" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '5px' }}>Nome</label><input style={inputStyle} placeholder="João Silva" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '5px' }}>Email</label><input style={inputStyle} type="email" placeholder="joao@empresa.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><label style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '5px' }}>Empresa</label><input style={inputStyle} placeholder="Minha Empresa" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => createMutation.mutate()} disabled={!form.phone || createMutation.isPending} style={{ padding: '9px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {createMutation.isPending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null} Criar
            </button>
            <button onClick={() => setShowCreate(false)} style={{ padding: '9px 16px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            style={{ ...inputStyle, paddingLeft: '36px', background: '#fff' }}
            placeholder="Buscar por nome ou número..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: 'var(--shadow)' }}>
        {isLoading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#9ca3af' }} /></div>
        ) : contacts.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <User size={32} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Nenhum contato encontrado</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '40px 2fr 1.5fr 1.5fr 1fr 40px', gap: '16px', padding: '12px 20px', borderBottom: '1px solid var(--border)', color: '#9ca3af', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#25d366' }}
              />
              <span>Nome</span><span>Telefone</span><span>Email</span><span>Última interação</span><span></span>
            </div>
            {contacts.map((c: any) => (
              <div
                key={c.id}
                style={{
                  display: 'grid', gridTemplateColumns: '40px 2fr 1.5fr 1.5fr 1fr 40px',
                  gap: '16px', padding: '14px 20px', borderBottom: '1px solid #f3f4f6',
                  alignItems: 'center',
                  background: selected.has(c.id) ? '#f0fdf4' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggleSelect(c.id)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#25d366' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#25d36620', color: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                    {c.name?.slice(0, 2).toUpperCase() || '??'}
                  </div>
                  <span style={{ fontWeight: 500, fontSize: '14px', color: '#1a1f2e' }}>{c.name || '—'}</span>
                </div>
                <span style={{ color: '#374151', fontSize: '14px' }}>{c.phone}</span>
                <span style={{ color: '#6b7280', fontSize: '14px' }}>{c.email || '—'}</span>
                <span style={{ color: '#9ca3af', fontSize: '13px' }}>
                  {c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleDateString('pt-BR') : '—'}
                </span>
                <button
                  onClick={() => handleDelete(c.id, c.name || c.phone)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {meta && meta.total > 20 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
          <span style={{ color: '#6b7280', fontSize: '13px' }}>Página {meta.page} de {Math.ceil(meta.total / meta.limit)}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ padding: '7px 14px', background: '#fff', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>Anterior</button>
            <button disabled={!meta.hasMore} onClick={() => setPage(p => p + 1)} style={{ padding: '7px 14px', background: '#fff', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', cursor: !meta.hasMore ? 'not-allowed' : 'pointer', opacity: !meta.hasMore ? 0.5 : 1 }}>Próxima</button>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
