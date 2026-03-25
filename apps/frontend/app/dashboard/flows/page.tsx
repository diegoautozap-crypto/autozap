'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { messageApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Workflow, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, ChevronRight, X, Check, Clock } from 'lucide-react'

const COOLDOWN_OPTIONS = [
  { value: '24h',    label: '24 horas',    desc: 'Dispara no máximo 1x por dia por conversa' },
  { value: 'once',   label: 'Uma vez só',  desc: 'Dispara apenas 1 vez por conversa, nunca mais' },
  { value: 'always', label: 'Sempre',      desc: 'Dispara toda vez que o gatilho for acionado' },
]

export default function FlowsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newChannelId, setNewChannelId] = useState('')
  const [newCooldown, setNewCooldown] = useState('24h')

  const [editingFlow, setEditingFlow] = useState<any | null>(null)
  const [editName, setEditName] = useState('')
  const [editChannelId, setEditChannelId] = useState('')
  const [editCooldown, setEditCooldown] = useState('24h')

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['flows'],
    queryFn: async () => {
      const { data } = await messageApi.get('/flows')
      return data.data || []
    },
  })

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const { data } = await channelApi.get('/channels')
      return data.data || []
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await messageApi.post('/flows', {
        name: newName,
        channelId: newChannelId || null,
        cooldown_type: newCooldown,
      })
      return data.data
    },
    onSuccess: (flow) => {
      toast.success('Flow criado!')
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      setShowNew(false)
      setNewName('')
      setNewChannelId('')
      setNewCooldown('24h')
      router.push(`/dashboard/flows/${flow.id}`)
    },
    onError: () => toast.error('Erro ao criar flow'),
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      await messageApi.patch(`/flows/${editingFlow.id}`, {
        name: editName,
        channelId: editChannelId || null,
        cooldown_type: editCooldown,
      })
    },
    onSuccess: () => {
      toast.success('Flow atualizado!')
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      setEditingFlow(null)
    },
    onError: () => toast.error('Erro ao atualizar'),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await messageApi.patch(`/flows/${id}`, { is_active: !isActive })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows'] }),
    onError: () => toast.error('Erro ao atualizar'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await messageApi.delete(`/flows/${id}`)
    },
    onSuccess: () => {
      toast.success('Flow excluído!')
      queryClient.invalidateQueries({ queryKey: ['flows'] })
    },
    onError: () => toast.error('Erro ao excluir'),
  })

  const openEdit = (f: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingFlow(f)
    setEditName(f.name)
    setEditChannelId(f.channel_id || '')
    setEditCooldown(f.cooldown_type || '24h')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    background: '#f9fafb', border: '1px solid #e5e7eb',
    borderRadius: '8px', fontSize: '14px', outline: 'none', color: '#111827',
  }

  const channelName = (channelId: string) => {
    const ch = channels.find((c: any) => c.id === channelId)
    return ch?.name || 'Todos os canais'
  }

  const cooldownLabel = (type: string) => {
    return COOLDOWN_OPTIONS.find(o => o.value === type)?.label || '24 horas'
  }

  function CooldownSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {COOLDOWN_OPTIONS.map(opt => (
          <div key={opt.value} onClick={() => onChange(opt.value)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
              borderRadius: '8px', cursor: 'pointer',
              border: `2px solid ${value === opt.value ? '#16a34a' : '#e5e7eb'}`,
              background: value === opt.value ? '#f0fdf4' : '#f9fafb',
              transition: 'all 0.1s',
            }}>
            <div style={{
              width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
              border: `2px solid ${value === opt.value ? '#16a34a' : '#d1d5db'}`,
              background: value === opt.value ? '#16a34a' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {value === opt.value && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: value === opt.value ? '#15803d' : '#111827' }}>{opt.label}</div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '1px' }}>{opt.desc}</div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>Flows</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '3px' }}>Automações visuais com múltiplos passos</p>
        </div>
        <button onClick={() => setShowNew(true)}
          style={{ padding: '9px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={14} /> Novo flow
        </button>
      </div>

      {/* Form novo flow */}
      {showNew && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '14px' }}>Novo flow</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Nome *</label>
              <input style={inputStyle} placeholder="Ex: Boas-vindas com qualificação"
                value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Canal (opcional)</label>
              <select style={{ ...inputStyle, background: '#f9fafb' }} value={newChannelId} onChange={e => setNewChannelId(e.target.value)}>
                <option value="">Todos os canais</option>
                {channels.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
              <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
              Cooldown — com que frequência esse flow pode disparar?
            </label>
            <CooldownSelector value={newCooldown} onChange={setNewCooldown} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => createMutation.mutate()} disabled={!newName || createMutation.isPending}
              style={{ padding: '9px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !newName ? 0.5 : 1 }}>
              {createMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />}
              Criar e abrir editor
            </button>
            <button onClick={() => { setShowNew(false); setNewName('') }}
              style={{ padding: '9px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal de edição */}
      {editingFlow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setEditingFlow(null)}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', width: '480px', boxShadow: '0 20px 60px rgba(0,0,0,.2)', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>Editar flow</h3>
              <button onClick={() => setEditingFlow(null)}
                style={{ background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '6px', display: 'flex' }}>
                <X size={15} color="#6b7280" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Nome *</label>
                <input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '5px' }}>Canal</label>
                <select style={{ ...inputStyle, background: '#f9fafb' }} value={editChannelId} onChange={e => setEditChannelId(e.target.value)}>
                  <option value="">Todos os canais</option>
                  {channels.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                  <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  Cooldown — com que frequência esse flow pode disparar?
                </label>
                <CooldownSelector value={editCooldown} onChange={setEditCooldown} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => updateMutation.mutate()} disabled={!editName || updateMutation.isPending}
                style={{ padding: '10px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !editName ? 0.5 : 1 }}>
                {updateMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                Salvar
              </button>
              <button onClick={() => setEditingFlow(null)}
                style={{ padding: '10px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} />
        </div>
      ) : flows.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '80px', textAlign: 'center' }}>
          <Workflow size={36} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '6px' }}>Nenhum flow criado</p>
          <p style={{ color: '#d1d5db', fontSize: '12px' }}>Crie seu primeiro flow para montar automações visuais com múltiplos passos</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {flows.map((f: any) => (
            <div key={f.id}
              style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', transition: 'border-color 0.15s' }}
              onClick={() => router.push(`/dashboard/flows/${f.id}`)}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#16a34a'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#e5e7eb'}>

              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: f.is_active ? '#f0fdf4' : '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Workflow size={16} color={f.is_active ? '#16a34a' : '#d1d5db'} />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>{f.name}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 7px', borderRadius: '99px', background: f.is_active ? '#dcfce7' : '#f3f4f6', color: f.is_active ? '#15803d' : '#9ca3af' }}>
                    {f.is_active ? 'Ativo' : 'Pausado'}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#9ca3af' }}>
                  {f.node_count || 0} nós · {f.channel_id ? channelName(f.channel_id) : 'Todos os canais'} · {cooldownLabel(f.cooldown_type || '24h')}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                <button onClick={() => toggleMutation.mutate({ id: f.id, isActive: f.is_active })}
                  title={f.is_active ? 'Pausar' : 'Ativar'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', color: f.is_active ? '#16a34a' : '#d1d5db' }}>
                  {f.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                </button>
                <button onClick={(e) => openEdit(f, e)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: '#9ca3af', borderRadius: '6px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; (e.currentTarget as HTMLButtonElement).style.color = '#374151' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => { if (confirm(`Excluir "${f.name}"?`)) deleteMutation.mutate(f.id) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: '#9ca3af', borderRadius: '6px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}>
                  <Trash2 size={14} />
                </button>
                <ChevronRight size={16} color="#d1d5db" />
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
