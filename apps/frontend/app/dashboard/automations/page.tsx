'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { messageApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Zap, Plus, Pencil, Trash2, X, Check, Loader2, ToggleLeft, ToggleRight, ChevronDown } from 'lucide-react'

const TRIGGER_TYPES = [
  { value: 'keyword', label: 'Palavra-chave recebida', desc: 'Dispara quando a mensagem contém uma palavra específica' },
  { value: 'first_message', label: 'Primeira mensagem', desc: 'Dispara quando um contato novo manda a primeira mensagem' },
  { value: 'outside_hours', label: 'Fora do horário', desc: 'Dispara quando a mensagem chega fora do expediente' },
]

const ACTION_TYPES = [
  { value: 'send_message', label: 'Enviar mensagem automática' },
  { value: 'assign_agent', label: 'Atribuir a um agente' },
  { value: 'move_pipeline', label: 'Mover no funil' },
]

const PIPELINE_STAGES = [
  { value: 'lead', label: 'Lead' },
  { value: 'qualificacao', label: 'Qualificação' },
  { value: 'proposta', label: 'Proposta' },
  { value: 'negociacao', label: 'Negociação' },
  { value: 'ganho', label: 'Ganho' },
  { value: 'perdido', label: 'Perdido' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: '#f9fafb', border: '1px solid #e5e7eb',
  borderRadius: '8px', fontSize: '14px', outline: 'none', color: '#111827',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600,
  color: '#374151', marginBottom: '5px',
}

function emptyForm() {
  return {
    name: '',
    channelId: '',
    trigger_type: 'keyword',
    trigger_value: { keywords: '', start: 9, end: 18, days: [1,2,3,4,5] },
    action_type: 'send_message',
    action_value: { message: '', delay: 0, stage: 'lead' },
  }
}

export default function AutomationsPage() {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const queryClient = useQueryClient()

  const { data: automations, isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: async () => {
      const { data } = await messageApi.get('/automations')
      return data.data || []
    },
  })

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const { data } = await channelApi.get('/channels')
      return data.data || []
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        channelId: form.channelId || null,
        trigger_type: form.trigger_type,
        trigger_value: form.trigger_type === 'keyword'
          ? { keywords: form.trigger_value.keywords.split(',').map((k: string) => k.trim()).filter(Boolean) }
          : form.trigger_type === 'outside_hours'
          ? { start: form.trigger_value.start, end: form.trigger_value.end, days: form.trigger_value.days }
          : {},
        action_type: form.action_type,
        action_value: form.action_type === 'send_message'
          ? { message: form.action_value.message, delay: form.action_value.delay }
          : form.action_type === 'assign_agent'
          ? { message: form.action_value.message, delay: form.action_value.delay }
          : form.action_type === 'move_pipeline'
          ? { stage: form.action_value.stage }
          : {},
      }
      if (editingId) {
        await messageApi.patch(`/automations/${editingId}`, payload)
      } else {
        await messageApi.post('/automations', payload)
      }
    },
    onSuccess: () => {
      toast.success(editingId ? 'Automação atualizada!' : 'Automação criada!')
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao salvar'),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await messageApi.patch(`/automations/${id}`, { is_active: !isActive })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations'] }),
    onError: () => toast.error('Erro ao atualizar'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await messageApi.delete(`/automations/${id}`)
    },
    onSuccess: () => {
      toast.success('Automação excluída!')
      queryClient.invalidateQueries({ queryKey: ['automations'] })
    },
    onError: () => toast.error('Erro ao excluir'),
  })

  const startEdit = (a: any) => {
    setEditingId(a.id)
    setForm({
      name: a.name,
      channelId: a.channel_id || '',
      trigger_type: a.trigger_type,
      trigger_value: {
        keywords: (a.trigger_value?.keywords || []).join(', '),
        start: a.trigger_value?.start ?? 9,
        end: a.trigger_value?.end ?? 18,
        days: a.trigger_value?.days ?? [1,2,3,4,5],
      },
      action_type: a.action_type,
      action_value: {
        message: a.action_value?.message || '',
        delay: a.action_value?.delay || 0,
        stage: a.action_value?.stage || 'lead',
      },
    })
    setShowForm(true)
  }

  const triggerLabel = (a: any) => {
    if (a.trigger_type === 'keyword') return `Palavra-chave: ${(a.trigger_value?.keywords || []).join(', ')}`
    if (a.trigger_type === 'first_message') return 'Primeira mensagem'
    if (a.trigger_type === 'outside_hours') return `Fora do horário (${a.trigger_value?.start}h–${a.trigger_value?.end}h)`
    return a.trigger_type
  }

  const actionLabel = (a: any) => {
    if (a.action_type === 'send_message') return `Responder: "${(a.action_value?.message || '').slice(0, 40)}${a.action_value?.message?.length > 40 ? '...' : ''}"`
    if (a.action_type === 'move_pipeline') return `Mover para: ${a.action_value?.stage}`
    if (a.action_type === 'assign_agent') return 'Atribuir agente'
    return a.action_type
  }

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>Automações</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '3px' }}>Respostas automáticas baseadas em gatilhos</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()) }}
          style={{ padding: '9px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={14} /> Nova automação
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>
              {editingId ? 'Editar automação' : 'Nova automação'}
            </h3>
            <button onClick={() => { setShowForm(false); setEditingId(null) }}
              style={{ background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '5px', display: 'flex' }}>
              <X size={16} color="#6b7280" />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
            <div>
              <label style={labelStyle}>Nome da automação *</label>
              <input style={inputStyle} placeholder="Ex: Resposta fora do horário" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Canal (opcional)</label>
              <select style={{ ...inputStyle, background: '#f9fafb' }} value={form.channelId} onChange={e => setForm({ ...form, channelId: e.target.value })}>
                <option value="">Todos os canais</option>
                {(channels || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Trigger */}
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>🎯 Gatilho — quando disparar</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
              {TRIGGER_TYPES.map(t => (
                <div key={t.value} onClick={() => setForm({ ...form, trigger_type: t.value })}
                  style={{ border: `2px solid ${form.trigger_type === t.value ? '#16a34a' : '#e5e7eb'}`, borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', background: form.trigger_type === t.value ? '#f0fdf4' : '#fff' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: form.trigger_type === t.value ? '#15803d' : '#111827', marginBottom: '3px' }}>{t.label}</p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: 1.4 }}>{t.desc}</p>
                </div>
              ))}
            </div>

            {form.trigger_type === 'keyword' && (
              <div>
                <label style={labelStyle}>Palavras-chave (separadas por vírgula)</label>
                <input style={inputStyle} placeholder="preço, valor, quanto custa, info" value={form.trigger_value.keywords}
                  onChange={e => setForm({ ...form, trigger_value: { ...form.trigger_value, keywords: e.target.value } })} />
                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>A automação dispara se a mensagem contiver qualquer uma das palavras</p>
              </div>
            )}

            {form.trigger_type === 'outside_hours' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Início do expediente (hora)</label>
                  <input type="number" min="0" max="23" style={inputStyle} value={form.trigger_value.start}
                    onChange={e => setForm({ ...form, trigger_value: { ...form.trigger_value, start: Number(e.target.value) } })} />
                </div>
                <div>
                  <label style={labelStyle}>Fim do expediente (hora)</label>
                  <input type="number" min="0" max="23" style={inputStyle} value={form.trigger_value.end}
                    onChange={e => setForm({ ...form, trigger_value: { ...form.trigger_value, end: Number(e.target.value) } })} />
                </div>
              </div>
            )}
          </div>

          {/* Action */}
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>⚡ Ação — o que fazer</p>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Tipo de ação</label>
              <select style={{ ...inputStyle, background: '#fff' }} value={form.action_type} onChange={e => setForm({ ...form, action_type: e.target.value })}>
                {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>

            {form.action_type === 'send_message' && (
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Mensagem automática</label>
                  <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as any }}
                    placeholder="Olá! Estamos fora do horário. Retornaremos em breve. Use {{phone}} para o número do contato."
                    value={form.action_value.message}
                    onChange={e => setForm({ ...form, action_value: { ...form.action_value, message: e.target.value } })} />
                </div>
                <div>
                  <label style={labelStyle}>Delay antes de enviar (segundos)</label>
                  <input type="number" min="0" max="60" style={{ ...inputStyle, maxWidth: '150px' }} value={form.action_value.delay}
                    onChange={e => setForm({ ...form, action_value: { ...form.action_value, delay: Number(e.target.value) } })} />
                  <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>0 = envio imediato. Máx 60 segundos.</p>
                </div>
              </div>
            )}

            {form.action_type === 'assign_agent' && (
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Mensagem para o cliente (opcional)</label>
                  <textarea style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' as any }}
                    placeholder="Ex: Aguarde, um de nossos atendentes irá te responder em breve."
                    value={form.action_value.message}
                    onChange={e => setForm({ ...form, action_value: { ...form.action_value, message: e.target.value } })} />
                  <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Se preenchida, essa mensagem será enviada automaticamente ao cliente quando a automação for ativada.</p>
                </div>
                <div>
                  <label style={labelStyle}>Delay antes de enviar (segundos)</label>
                  <input type="number" min="0" max="60" style={{ ...inputStyle, maxWidth: '150px' }} value={form.action_value.delay}
                    onChange={e => setForm({ ...form, action_value: { ...form.action_value, delay: Number(e.target.value) } })} />
                </div>
              </div>
            )}

            {form.action_type === 'move_pipeline' && (
              <div>
                <label style={labelStyle}>Etapa do funil</label>
                <select style={{ ...inputStyle, background: '#fff' }} value={form.action_value.stage}
                  onChange={e => setForm({ ...form, action_value: { ...form.action_value, stage: e.target.value } })}>
                  {PIPELINE_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending}
              style={{ padding: '10px 24px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !form.name ? 0.5 : 1 }}>
              {saveMutation.isPending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
              {editingId ? 'Salvar alterações' : 'Criar automação'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null) }}
              style={{ padding: '10px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', color: '#374151' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} />
        </div>
      ) : !automations?.length ? (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '80px', textAlign: 'center' }}>
          <Zap size={36} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '6px' }}>Nenhuma automação criada</p>
          <p style={{ color: '#d1d5db', fontSize: '12px' }}>Crie sua primeira automação para responder mensagens automaticamente</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {automations.map((a: any) => (
            <div key={a.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: a.is_active ? '#f0fdf4' : '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Zap size={16} color={a.is_active ? '#16a34a' : '#d1d5db'} fill={a.is_active ? '#16a34a' : 'none'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>{a.name}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 7px', borderRadius: '99px', background: a.is_active ? '#dcfce7' : '#f3f4f6', color: a.is_active ? '#15803d' : '#9ca3af' }}>
                    {a.is_active ? 'Ativa' : 'Pausada'}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#6b7280' }}>
                  <span style={{ color: '#374151', fontWeight: 500 }}>Se: </span>{triggerLabel(a)}
                  <span style={{ color: '#d1d5db', margin: '0 6px' }}>→</span>
                  <span style={{ color: '#374151', fontWeight: 500 }}>Então: </span>{actionLabel(a)}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button onClick={() => toggleMutation.mutate({ id: a.id, isActive: a.is_active })}
                  title={a.is_active ? 'Pausar' : 'Ativar'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', color: a.is_active ? '#16a34a' : '#d1d5db' }}>
                  {a.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                </button>
                <button onClick={() => startEdit(a)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: '#9ca3af', borderRadius: '6px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; (e.currentTarget as HTMLButtonElement).style.color = '#374151' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => { if (confirm(`Excluir "${a.name}"?`)) deleteMutation.mutate(a.id) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: '#9ca3af', borderRadius: '6px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
