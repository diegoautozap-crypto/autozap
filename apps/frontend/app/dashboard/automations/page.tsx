'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { messageApi, channelApi, contactApi } from '@/lib/api'
import { toast } from 'sonner'
import {
  Zap, Plus, Pencil, Trash2, X, Check, Loader2,
  ToggleLeft, ToggleRight, GripVertical, Tag, ChevronDown, ChevronUp,
} from 'lucide-react'

const TRIGGER_TYPES = [
  { value: 'keyword', label: 'Palavra-chave', desc: 'Mensagem contém uma palavra específica' },
  { value: 'first_message', label: 'Primeira mensagem', desc: 'Primeiro contato do cliente' },
  { value: 'outside_hours', label: 'Fora do horário', desc: 'Mensagem fora do expediente' },
]

const ACTION_TYPES = [
  { value: 'send_message', label: 'Enviar mensagem' },
  { value: 'assign_agent', label: 'Atribuir agente' },
  { value: 'move_pipeline', label: 'Mover no funil' },
  { value: 'add_tag', label: 'Adicionar tag' },
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

function emptyAction() {
  return { type: 'send_message', value: { message: '', delay: 0, stage: 'lead', tagId: '' }, delay: 0 }
}

function emptyForm() {
  return {
    name: '',
    channelId: '',
    trigger_type: 'keyword',
    trigger_value: { keywords: '', start: 9, end: 18, days: [1,2,3,4,5] },
    actions: [emptyAction()],
    cooldown_minutes: null as number | null,
  }
}

// ─── Editor de uma ação ───────────────────────────────────────────────────────
function ActionEditor({ action, index, total, tags, onChange, onRemove, onMoveUp, onMoveDown }: {
  action: any; index: number; total: number; tags: any[]
  onChange: (a: any) => void; onRemove: () => void
  onMoveUp: () => void; onMoveDown: () => void
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', marginBottom: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        {/* Número da ação */}
        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#16a34a', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {index + 1}
        </div>

        {/* Tipo da ação */}
        <select
          style={{ ...inputStyle, flex: 1, background: '#fff' }}
          value={action.type}
          onChange={e => onChange({ ...action, type: e.target.value, value: { message: '', delay: 0, stage: 'lead', tagId: '' } })}>
          {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>

        {/* Delay desta ação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{ fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap' }}>Delay:</span>
          <input
            type="number" min="0" max="86400"
            style={{ ...inputStyle, width: '70px', textAlign: 'center' }}
            value={action.delay || 0}
            onChange={e => onChange({ ...action, delay: Number(e.target.value) })}
          />
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>s</span>
        </div>

        {/* Botões mover */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
          <button onClick={onMoveUp} disabled={index === 0}
            style={{ background: 'none', border: 'none', cursor: index === 0 ? 'not-allowed' : 'pointer', padding: '2px', color: index === 0 ? '#e5e7eb' : '#9ca3af', display: 'flex' }}>
            <ChevronUp size={14} />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1}
            style={{ background: 'none', border: 'none', cursor: index === total - 1 ? 'not-allowed' : 'pointer', padding: '2px', color: index === total - 1 ? '#e5e7eb' : '#9ca3af', display: 'flex' }}>
            <ChevronDown size={14} />
          </button>
        </div>

        {/* Remover */}
        {total > 1 && (
          <button onClick={onRemove}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#9ca3af', display: 'flex', flexShrink: 0, borderRadius: '4px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Campos específicos por tipo */}
      {action.type === 'send_message' && (
        <div>
          <label style={labelStyle}>Mensagem</label>
          <textarea
            style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' as any }}
            placeholder="Olá! Recebemos sua mensagem. Use {{phone}} para o número do contato."
            value={action.value?.message || ''}
            onChange={e => onChange({ ...action, value: { ...action.value, message: e.target.value } })}
          />
        </div>
      )}

      {action.type === 'assign_agent' && (
        <div>
          <label style={labelStyle}>Mensagem para o cliente (opcional)</label>
          <textarea
            style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' as any }}
            placeholder="Aguarde, um atendente irá te responder em breve."
            value={action.value?.message || ''}
            onChange={e => onChange({ ...action, value: { ...action.value, message: e.target.value } })}
          />
          <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>O bot será pausado automaticamente ao atribuir agente.</p>
        </div>
      )}

      {action.type === 'move_pipeline' && (
        <div>
          <label style={labelStyle}>Etapa do funil</label>
          <select
            style={{ ...inputStyle, background: '#fff' }}
            value={action.value?.stage || 'lead'}
            onChange={e => onChange({ ...action, value: { ...action.value, stage: e.target.value } })}>
            {PIPELINE_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      )}

      {action.type === 'add_tag' && (
        <div>
          <label style={labelStyle}>Tag a adicionar</label>
          {tags.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#9ca3af' }}>Nenhuma tag cadastrada. Crie tags na página de Contatos.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {tags.map((tag: any) => (
                <div key={tag.id}
                  onClick={() => onChange({ ...action, value: { ...action.value, tagId: tag.id } })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '5px 10px', borderRadius: '99px', cursor: 'pointer',
                    border: `2px solid ${action.value?.tagId === tag.id ? (tag.color || '#16a34a') : '#e5e7eb'}`,
                    background: action.value?.tagId === tag.id ? `${tag.color || '#16a34a'}18` : '#fff',
                    fontSize: '12px', fontWeight: 500,
                  }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: tag.color || '#6b7280' }} />
                  <span style={{ color: action.value?.tagId === tag.id ? (tag.color || '#15803d') : '#374151' }}>{tag.name}</span>
                  {action.value?.tagId === tag.id && <Check size={11} color={tag.color || '#15803d'} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

function SortableAutomationCard({ automation, index, onToggle, onEdit, onDelete, isDimmed, tags }: {
  automation: any; index: number
  onToggle: () => void; onEdit: () => void; onDelete: () => void
  isDimmed: boolean; tags: any[]
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: automation.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform), transition,
    background: '#fff', border: `1px solid ${isDragging ? '#16a34a' : '#e5e7eb'}`,
    borderRadius: '12px', padding: '16px 20px',
    display: 'flex', alignItems: 'center', gap: '12px',
    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,.12)' : 'none',
    opacity: isDimmed ? 0.6 : 1, zIndex: isDragging ? 999 : 'auto', position: 'relative',
  }

  // Resolve actions para exibição
  const actions: any[] = automation.actions?.length
    ? automation.actions
    : automation.action_type
    ? [{ type: automation.action_type, value: automation.action_value }]
    : []

  const triggerLabel = (a: any) => {
    if (a.trigger_type === 'keyword') return `Palavra-chave: ${(a.trigger_value?.keywords || []).join(', ')}`
    if (a.trigger_type === 'first_message') return 'Primeira mensagem'
    if (a.trigger_type === 'outside_hours') return `Fora do horário (${a.trigger_value?.start}h–${a.trigger_value?.end}h)`
    return a.trigger_type
  }

  const actionLabel = (action: any) => {
    const type = action.type || action.action_type
    const value = action.value || action.action_value || {}
    if (type === 'send_message') return `Enviar: "${(value.message || '').slice(0, 35)}${(value.message || '').length > 35 ? '...' : ''}"`
    if (type === 'move_pipeline') return `Mover para: ${value.stage}`
    if (type === 'assign_agent') return 'Atribuir agente'
    if (type === 'add_tag') {
      const tag = tags.find((t: any) => t.id === value.tagId)
      return tag ? `Adicionar tag: ${tag.name}` : 'Adicionar tag'
    }
    return type
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div {...attributes} {...listeners}
        style={{ cursor: isDragging ? 'grabbing' : 'grab', color: isDragging ? '#16a34a' : '#d1d5db', display: 'flex', alignItems: 'center', flexShrink: 0, padding: '2px', borderRadius: '4px', touchAction: 'none' }}>
        <GripVertical size={16} />
      </div>

      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#6b7280', flexShrink: 0 }}>
        {index + 1}
      </div>

      <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: automation.is_active ? '#f0fdf4' : '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Zap size={16} color={automation.is_active ? '#16a34a' : '#d1d5db'} fill={automation.is_active ? '#16a34a' : 'none'} />
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>{automation.name}</span>
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 7px', borderRadius: '99px', background: automation.is_active ? '#dcfce7' : '#f3f4f6', color: automation.is_active ? '#15803d' : '#9ca3af' }}>
            {automation.is_active ? 'Ativa' : 'Pausada'}
          </span>
          {actions.length > 1 && (
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 7px', borderRadius: '99px', background: '#eff6ff', color: '#2563eb' }}>
              {actions.length} ações
            </span>
          )}
        </div>
        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: actions.length > 1 ? '4px' : '0' }}>
          <span style={{ color: '#374151', fontWeight: 500 }}>Se: </span>{triggerLabel(automation)}
        </p>
        {actions.length === 1 ? (
          <p style={{ fontSize: '12px', color: '#6b7280' }}>
            <span style={{ color: '#374151', fontWeight: 500 }}>Então: </span>{actionLabel(actions[0])}
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
            {actions.map((a: any, i: number) => (
              <span key={i} style={{ fontSize: '11px', background: '#f3f4f6', color: '#374151', padding: '1px 7px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ color: '#16a34a', fontWeight: 700 }}>{i + 1}.</span> {actionLabel(a)}
                {a.delay > 0 && <span style={{ color: '#9ca3af' }}>+{a.delay}s</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <button onClick={onToggle} title={automation.is_active ? 'Pausar' : 'Ativar'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', color: automation.is_active ? '#16a34a' : '#d1d5db' }}>
          {automation.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
        </button>
        <button onClick={onEdit}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: '#9ca3af', borderRadius: '6px' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; (e.currentTarget as HTMLButtonElement).style.color = '#374151' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}>
          <Pencil size={14} />
        </button>
        <button onClick={onDelete}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: '#9ca3af', borderRadius: '6px' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

export default function AutomationsPage() {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [localList, setLocalList] = useState<any[] | null>(null)
  const queryClient = useQueryClient()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const { data: automations, isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: async () => { const { data } = await messageApi.get('/automations'); return data.data || [] },
  })
  const displayList: any[] = localList ?? automations ?? []

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data || [] },
  })

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => { const { data } = await contactApi.get('/tags'); return data.data || [] },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        channelId: form.channelId || null,
        trigger_type: form.trigger_type,
        trigger_value: form.trigger_type === 'keyword'
          ? { keywords: form.trigger_value.keywords.split(',').map((k: string) => k.trim()).filter(Boolean) }
          : form.trigger_type === 'first_message'
          ? { keywords: form.trigger_value.keywords ? form.trigger_value.keywords.split(',').map((k: string) => k.trim()).filter(Boolean) : [] }
          : { start: form.trigger_value.start, end: form.trigger_value.end, days: form.trigger_value.days },
        actions: form.actions.map(a => ({
          type: a.type,
          value: a.value,
          delay: a.delay || 0,
        })),
        // legado — primeira ação
        action_type: form.actions[0]?.type,
        action_value: form.actions[0]?.value,
        cooldown_minutes: form.cooldown_minutes,
      }
      if (editingId) await messageApi.patch(`/automations/${editingId}`, payload)
      else await messageApi.post('/automations', payload)
    },
    onSuccess: () => {
      toast.success(editingId ? 'Automação atualizada!' : 'Automação criada!')
      setLocalList(null)
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      setShowForm(false); setEditingId(null); setForm(emptyForm())
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
    mutationFn: async (id: string) => { await messageApi.delete(`/automations/${id}`) },
    onSuccess: () => { toast.success('Automação excluída!'); setLocalList(null); queryClient.invalidateQueries({ queryKey: ['automations'] }) },
    onError: () => toast.error('Erro ao excluir'),
  })

  const reorderMutation = useMutation({
    mutationFn: async (order: { id: string; sort_order: number }[]) => {
      await messageApi.patch('/automations/reorder', { order })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations'] }),
    onError: () => { setLocalList(null); toast.error('Erro ao salvar nova ordem.') },
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = displayList.findIndex(a => a.id === active.id)
    const newIndex = displayList.findIndex(a => a.id === over.id)
    const reordered = arrayMove(displayList, oldIndex, newIndex)
    setLocalList(reordered)
    reorderMutation.mutate(reordered.map((a, i) => ({ id: a.id, sort_order: i })))
  }

  const startEdit = (a: any) => {
    setEditingId(a.id)
    const actions = a.actions?.length
      ? a.actions.map((ac: any) => ({ type: ac.type, value: ac.value || {}, delay: ac.delay || 0 }))
      : [{ type: a.action_type, value: a.action_value || {}, delay: a.action_value?.delay || 0 }]
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
      actions,
      cooldown_minutes: a.cooldown_minutes ?? null,
    })
    setShowForm(true)
  }

  const updateAction = (index: number, updated: any) => {
    const actions = [...form.actions]
    actions[index] = updated
    setForm({ ...form, actions })
  }

  const removeAction = (index: number) => {
    setForm({ ...form, actions: form.actions.filter((_, i) => i !== index) })
  }

  const moveAction = (index: number, direction: 'up' | 'down') => {
    const actions = [...form.actions]
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= actions.length) return;
    [actions[index], actions[target]] = [actions[target], actions[index]]
    setForm({ ...form, actions })
  }

  const isFormValid = form.name && form.actions.length > 0 &&
    form.actions.every(a =>
      (a.type !== 'send_message' || a.value?.message) &&
      (a.type !== 'add_tag' || a.value?.tagId)
    )

  return (
    <div className="mobile-page" style={{ padding: '32px', maxWidth: '900px' }}>
      <div className="mobile-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>Automações</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '3px' }}>Respostas automáticas baseadas em gatilhos</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()) }}
          style={{ padding: '9px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={14} /> Nova automação
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>{editingId ? 'Editar automação' : 'Nova automação'}</h3>
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

          {/* Gatilho */}
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>🎯 Gatilho — quando disparar</p>
            <div className="mobile-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
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
                <input style={inputStyle} placeholder="preço, valor, quanto custa" value={form.trigger_value.keywords}
                  onChange={e => setForm({ ...form, trigger_value: { ...form.trigger_value, keywords: e.target.value } })} />
              </div>
            )}
            {form.trigger_type === 'first_message' && (
              <div>
                <label style={labelStyle}>Filtrar por palavra-chave (opcional)</label>
                <input style={inputStyle} placeholder="deixe vazio para qualquer mensagem"
                  value={form.trigger_value.keywords}
                  onChange={e => setForm({ ...form, trigger_value: { ...form.trigger_value, keywords: e.target.value } })} />
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

          {/* Ações */}
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ⚡ Ações — o que fazer ({form.actions.length})
              </p>
              <button
                onClick={() => setForm({ ...form, actions: [...form.actions, emptyAction()] })}
                style={{ padding: '5px 10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Plus size={12} /> Adicionar ação
              </button>
            </div>

            {form.actions.length > 1 && (
              <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '10px' }}>
                As ações são executadas em sequência de cima para baixo. Use o delay para aguardar entre elas.
              </p>
            )}

            {form.actions.map((action, index) => (
              <ActionEditor
                key={index}
                action={action}
                index={index}
                total={form.actions.length}
                tags={tags}
                onChange={updated => updateAction(index, updated)}
                onRemove={() => removeAction(index)}
                onMoveUp={() => moveAction(index, 'up')}
                onMoveDown={() => moveAction(index, 'down')}
              />
            ))}
          </div>

          {/* Cooldown */}
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>⏱ Frequência — quantas vezes disparar</p>
            <div className="mobile-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                { label: 'Sempre', desc: 'Toda vez que a condição for atendida', value: null },
                { label: '24 horas', desc: 'Máx 1x por dia por contato', value: 1440 },
                { label: '7 dias', desc: 'Máx 1x por semana por contato', value: 10080 },
                { label: '15 dias', desc: 'Máx 1x a cada 15 dias', value: 21600 },
                { label: '30 dias', desc: 'Máx 1x por mês por contato', value: 43200 },
                { label: 'Nunca mais', desc: 'Dispara apenas 1 vez por contato', value: 0 },
              ].map(opt => (
                <div key={String(opt.value)} onClick={() => setForm({ ...form, cooldown_minutes: opt.value })}
                  style={{ border: `2px solid ${form.cooldown_minutes === opt.value ? '#16a34a' : '#e5e7eb'}`, borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', background: form.cooldown_minutes === opt.value ? '#f0fdf4' : '#fff' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: form.cooldown_minutes === opt.value ? '#15803d' : '#111827', marginBottom: '3px' }}>{opt.label}</p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: 1.4 }}>{opt.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => saveMutation.mutate()} disabled={!isFormValid || saveMutation.isPending}
              style={{ padding: '10px 24px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !isFormValid ? 0.5 : 1 }}>
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

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} />
        </div>
      ) : !displayList.length ? (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '80px', textAlign: 'center' }}>
          <Zap size={36} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '6px' }}>Nenhuma automação criada</p>
          <p style={{ color: '#d1d5db', fontSize: '12px' }}>Crie sua primeira automação para responder mensagens automaticamente</p>
        </div>
      ) : (
        <>
          {displayList.length > 1 && (
            <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <GripVertical size={12} /> Arraste para definir a ordem de execução.
            </p>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={displayList.map(a => a.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {displayList.map((a: any, index: number) => (
                  <SortableAutomationCard
                    key={a.id} automation={a} index={index}
                    isDimmed={reorderMutation.isPending} tags={tags}
                    onToggle={() => toggleMutation.mutate({ id: a.id, isActive: a.is_active })}
                    onEdit={() => startEdit(a)}
                    onDelete={() => { if (confirm(`Excluir "${a.name}"?`)) deleteMutation.mutate(a.id) }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
