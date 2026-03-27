'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { conversationApi, channelApi, campaignApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import {
  Loader2, MessageSquare, RefreshCw, Settings2, Plus, Trash2,
  GripVertical, X, Check, Palette,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import Pusher from 'pusher-js'
import { createClient } from '@supabase/supabase-js'

// ─── Supabase client (same pattern as contacts/custom_fields) ───────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Default columns (fallback if DB is empty) ──────────────────────────────
const DEFAULT_COLUMNS = [
  { key: 'lead',         label: 'Lead',        color: '#6b7280' },
  { key: 'qualificacao', label: 'Qualificação', color: '#2563eb' },
  { key: 'proposta',     label: 'Proposta',     color: '#7c3aed' },
  { key: 'negociacao',   label: 'Negociação',   color: '#d97706' },
  { key: 'ganho',        label: 'Ganho',        color: '#16a34a' },
  { key: 'perdido',      label: 'Perdido',      color: '#dc2626' },
]

const COLOR_PRESETS = [
  '#6b7280', '#2563eb', '#7c3aed', '#d97706',
  '#16a34a', '#dc2626', '#0891b2', '#db2777',
  '#65a30d', '#ea580c', '#7e22ce', '#0f766e',
]

function hexToSoft(hex: string) {
  return { bg: hex + '12', border: hex + '30' }
}

function getInitials(n: string | undefined | null) {
  return ((n || '??').trim().slice(0, 2)).toUpperCase()
}

function getAvatarColor(n: string | undefined | null) {
  const colors = [
    { bg: '#dbeafe', color: '#1d4ed8' }, { bg: '#dcfce7', color: '#15803d' },
    { bg: '#fce7f3', color: '#be185d' }, { bg: '#ede9fe', color: '#6d28d9' },
    { bg: '#ffedd5', color: '#c2410c' }, { bg: '#e0f2fe', color: '#0369a1' },
  ]
  return colors[((n || '').charCodeAt(0) || 0) % colors.length]
}

function ContactTagBadges({ contact }: { contact: any }) {
  const tags = (contact?.contact_tags || []).map((ct: any) => ct.tags).filter(Boolean)
  if (!tags.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '5px' }}>
      {tags.map((tag: any) => (
        <span key={tag.id} style={{
          fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '99px',
          background: `${tag.color || '#6b7280'}18`,
          color: tag.color || '#6b7280',
          border: `1px solid ${tag.color || '#6b7280'}30`,
        }}>
          {tag.name}
        </span>
      ))}
    </div>
  )
}

// ─── Color Picker Popover ────────────────────────────────────────────────────
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '22px', height: '22px', borderRadius: '50%', background: value,
        border: '2px solid #fff', boxShadow: '0 0 0 1px #e5e7eb',
        cursor: 'pointer', flexShrink: 0,
      }} />
      {open && (
        <div style={{
          position: 'absolute', top: '28px', left: 0, zIndex: 50,
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
          padding: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.12)',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px',
        }}>
          {COLOR_PRESETS.map(c => (
            <button key={c} onClick={() => { onChange(c); setOpen(false) }} style={{
              width: '24px', height: '24px', borderRadius: '50%', background: c,
              border: c === value ? '2px solid #111' : '2px solid transparent',
              cursor: 'pointer',
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Manage Columns Modal ────────────────────────────────────────────────────
function ManageColumnsModal({
  columns, tenantId, onClose, onSaved,
}: {
  columns: any[]
  tenantId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [localCols, setLocalCols] = useState(
    columns.map(c => ({ ...c }))
  )
  const [saving, setSaving] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState('#6b7280')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const dragItem = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)

  const handleDragStart = (i: number) => { dragItem.current = i }
  const handleDragEnter = (i: number) => { dragOver.current = i }
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null) return
    const arr = [...localCols]
    const [moved] = arr.splice(dragItem.current, 1)
    arr.splice(dragOver.current, 0, moved)
    dragItem.current = null; dragOver.current = null
    setLocalCols(arr)
  }

  const addColumn = () => {
    if (!newLabel.trim()) return
    setLocalCols(c => [...c, {
      id: `new_${Date.now()}`,
      key: newLabel.toLowerCase().replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
      label: newLabel.trim(),
      color: newColor,
      sort_order: c.length,
      tenant_id: tenantId,
      _isNew: true,
    }])
    setNewLabel(''); setNewColor('#6b7280')
  }

  const removeColumn = (id: string) => {
    setLocalCols(c => c.filter(x => x.id !== id))
  }

  const updateColor = (id: string, color: string) => {
    setLocalCols(c => c.map(x => x.id === id ? { ...x, color } : x))
  }

  const startEdit = (col: any) => {
    setEditingId(col.id); setEditLabel(col.label)
  }

  const commitEdit = (id: string) => {
    if (editLabel.trim()) {
      setLocalCols(c => c.map(x => x.id === id ? { ...x, label: editLabel.trim() } : x))
    }
    setEditingId(null)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Upsert all columns with new sort_order
      const upserts = localCols.map((col, i) => ({
        ...(col._isNew ? {} : { id: col.id }),
        tenant_id: tenantId,
        key: col.key,
        label: col.label,
        color: col.color,
        sort_order: i,
      }))

      // Delete removed columns
      const removedIds = columns
        .map(c => c.id)
        .filter(id => !localCols.find(l => l.id === id))

      if (removedIds.length > 0) {
        await supabase.from('pipeline_columns').delete().in('id', removedIds)
      }

      const { error } = await supabase
        .from('pipeline_columns')
        .upsert(upserts, { onConflict: 'id' })

      if (error) throw error

      toast.success('Colunas salvas!')
      onSaved()
      onClose()
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + (e.message || 'tente novamente'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#fff', borderRadius: '14px', width: '460px', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.18)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>Gerenciar Colunas</h2>
            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>Arraste para reordenar, clique no nome para renomear</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Column list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
          {localCols.map((col, i) => (
            <div
              key={col.id}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragEnter={() => handleDragEnter(i)}
              onDragEnd={handleDragEnd}
              onDragOver={e => e.preventDefault()}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 10px', marginBottom: '6px', borderRadius: '8px',
                background: '#f9fafb', border: '1px solid #f3f4f6',
                cursor: 'grab',
              }}
            >
              <GripVertical size={14} color="#d1d5db" style={{ flexShrink: 0 }} />
              <ColorPicker value={col.color} onChange={c => updateColor(col.id, c)} />

              {editingId === col.id ? (
                <input
                  autoFocus
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  onBlur={() => commitEdit(col.id)}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(col.id); if (e.key === 'Escape') setEditingId(null) }}
                  style={{
                    flex: 1, border: 'none', borderBottom: '1.5px solid #7c3aed',
                    background: 'transparent', fontSize: '13px', fontWeight: 600,
                    color: '#111827', outline: 'none', padding: '1px 0',
                  }}
                />
              ) : (
                <span
                  onDoubleClick={() => startEdit(col)}
                  onClick={() => startEdit(col)}
                  style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#374151', cursor: 'text' }}
                >
                  {col.label}
                </span>
              )}

              <button onClick={() => removeColumn(col.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db',
                padding: '2px', borderRadius: '4px', display: 'flex', alignItems: 'center',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#d1d5db'}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {/* Add new */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '9px 10px', marginTop: '4px', borderRadius: '8px',
            border: '1.5px dashed #e5e7eb', background: '#fafafa',
          }}>
            <GripVertical size={14} color="#e5e7eb" style={{ flexShrink: 0 }} />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <input
              placeholder="Nome da nova coluna…"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addColumn() }}
              style={{
                flex: 1, border: 'none', background: 'transparent',
                fontSize: '13px', color: '#374151', outline: 'none',
              }}
            />
            <button onClick={addColumn} style={{
              background: '#7c3aed', border: 'none', borderRadius: '6px',
              color: '#fff', cursor: 'pointer', padding: '4px 10px', fontSize: '12px', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <Plus size={12} /> Add
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', background: '#f9fafb', border: '1px solid #e5e7eb',
            borderRadius: '8px', fontSize: '13px', color: '#6b7280', cursor: 'pointer',
          }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '8px 20px', background: '#7c3aed', border: 'none',
            borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function PipelinePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const tenantId = (user as any)?.tenantId || (user as any)?.tid
    || process.env.NEXT_PUBLIC_TENANT_ID || ''

  const [channelFilter, setChannelFilter] = useState('all')
  const [campaignFilter, setCampaignFilter] = useState('all')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)
  const [showManage, setShowManage] = useState(false)
  const localBoardRef = useRef<Record<string, any[]> | null>(null)
  const [, forceRender] = useState(0)

  // ── Load pipeline_columns from Supabase ──
  const {
    data: dbColumns,
    isLoading: colsLoading,
    refetch: refetchCols,
  } = useQuery({
    queryKey: ['pipeline-columns', tenantId],
    queryFn: async () => {
      if (!tenantId) return null
      const { data, error } = await supabase
        .from('pipeline_columns')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data as any[]
    },
    staleTime: 30000,
  })

  // Resolve which columns to display
  const stages = (dbColumns && dbColumns.length > 0 ? dbColumns : DEFAULT_COLUMNS).map(c => ({
    key: c.key,
    label: c.label,
    color: c.color || '#6b7280',
    ...hexToSoft(c.color || '#6b7280'),
  }))

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const { data } = await channelApi.get('/channels')
      return data.data || []
    },
  })

  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns-list'],
    queryFn: async () => {
      const { data } = await campaignApi.get('/campaigns?limit=100')
      return data.data || []
    },
  })

  const { data: board, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pipeline-board', channelFilter, campaignFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (channelFilter !== 'all') params.set('channelId', channelFilter)
      if (campaignFilter !== 'all') params.set('campaignId', campaignFilter)
      const url = `/conversations/pipeline${params.toString() ? '?' + params.toString() : ''}`
      const { data } = await conversationApi.get(url)
      localBoardRef.current = null
      return data.data as Record<string, any[]>
    },
    staleTime: 8000,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  })

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'sa1'
    if (!key || !user) return
    const pusher = new Pusher(key, { cluster })
    if (!tenantId) return
    const channel = pusher.subscribe(`tenant-${tenantId}`)
    channel.bind('inbound.message', () => {
      localBoardRef.current = null
      queryClient.refetchQueries({ queryKey: ['pipeline-board'] })
    })
    channel.bind('conversation.updated', () => {
      localBoardRef.current = null
      queryClient.refetchQueries({ queryKey: ['pipeline-board'] })
    })
    return () => {
      channel.unbind_all()
      pusher.unsubscribe(`tenant-${tenantId}`)
      pusher.disconnect()
    }
  }, [user, queryClient, tenantId])

  const displayBoard = localBoardRef.current ?? board
  const totalConvs = displayBoard
    ? Object.values(displayBoard).reduce((acc, arr) => acc + arr.length, 0)
    : 0

  const moveMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      await conversationApi.patch(`/conversations/${id}/pipeline`, { stage })
    },
    onSuccess: () => {
      localBoardRef.current = null
      queryClient.refetchQueries({ queryKey: ['pipeline-board'] })
    },
    onError: () => {
      localBoardRef.current = null
      forceRender(n => n + 1)
      toast.error('Erro ao mover conversa')
    },
  })

  const handleDragStart = (e: React.DragEvent, convId: string) => {
    setDraggingId(convId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverStage(stageKey)
  }

  const handleDrop = (e: React.DragEvent, targetStage: string) => {
    e.preventDefault()
    if (!draggingId || !displayBoard) return

    let sourceStage = ''
    let movedConv: any = null
    for (const [stage, cards] of Object.entries(displayBoard)) {
      const found = cards.find((c: any) => c.id === draggingId)
      if (found) { sourceStage = stage; movedConv = found; break }
    }

    if (!movedConv || sourceStage === targetStage) {
      setDraggingId(null); setOverStage(null); return
    }

    const newBoard: Record<string, any[]> = {}
    for (const [s, cards] of Object.entries(displayBoard)) {
      newBoard[s] = s === sourceStage
        ? cards.filter((c: any) => c.id !== draggingId)
        : s === targetStage
        ? [{ ...movedConv, pipeline_stage: targetStage }, ...cards]
        : [...cards]
    }
    localBoardRef.current = newBoard
    forceRender(n => n + 1)

    moveMutation.mutate({ id: draggingId, stage: targetStage })
    setDraggingId(null)
    setOverStage(null)
  }

  const handleDragEnd = () => { setDraggingId(null); setOverStage(null) }

  const handleColumnsSaved = () => {
    refetchCols()
    localBoardRef.current = null
    queryClient.refetchQueries({ queryKey: ['pipeline-board'] })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>Pipeline</h1>
            <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '2px' }}>{totalConvs} conversas abertas</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {(channels as any[]).length > 1 && (
              <select value={channelFilter} onChange={e => { setChannelFilter(e.target.value); localBoardRef.current = null }}
                style={{ padding: '7px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', color: '#374151', outline: 'none', cursor: 'pointer' }}>
                <option value="all">Todos os canais</option>
                {(channels as any[]).map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              </select>
            )}
            {(campaigns as any[]).length > 0 && (
              <select value={campaignFilter} onChange={e => { setCampaignFilter(e.target.value); localBoardRef.current = null }}
                style={{ padding: '7px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', color: '#374151', outline: 'none', cursor: 'pointer' }}>
                <option value="all">Todas as campanhas</option>
                {(campaigns as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}

            {/* ── Manage Columns Button ── */}
            <button
              onClick={() => setShowManage(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
                background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '7px',
                fontSize: '13px', color: '#7c3aed', cursor: 'pointer', fontWeight: 600,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#ede9fe'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#f5f3ff'}
            >
              <Settings2 size={13} />
              Colunas
            </button>

            <button onClick={() => { localBoardRef.current = null; refetch() }} disabled={isFetching}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', color: '#6b7280', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'}>
              <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Board */}
      {(isLoading || colsLoading) ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} />
        </div>
      ) : (
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: '14px', height: '100%', minWidth: 'max-content' }}>
            {stages.map(stage => {
              const cards = displayBoard?.[stage.key] || []
              const isOver = overStage === stage.key
              return (
                <div key={stage.key}
                  onDragOver={e => handleDragOver(e, stage.key)}
                  onDrop={e => handleDrop(e, stage.key)}
                  onDragLeave={() => setOverStage(null)}
                  style={{
                    width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column',
                    background: isOver ? stage.bg : '#f6f8fa',
                    border: `2px solid ${isOver ? stage.color : '#e5e7eb'}`,
                    borderRadius: '12px', overflow: 'hidden',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}>

                  <div style={{ padding: '12px 14px', borderBottom: `1px solid ${stage.border}`, background: stage.bg, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: stage.color }} />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: stage.color }}>{stage.label}</span>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: stage.color, background: `${stage.color}18`, padding: '1px 8px', borderRadius: '99px' }}>
                        {cards.length}
                      </span>
                    </div>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {cards.length === 0 ? (
                      <div style={{ padding: '24px 10px', textAlign: 'center' }}>
                        <MessageSquare size={20} color="#d1d5db" style={{ margin: '0 auto 6px' }} />
                        <p style={{ fontSize: '12px', color: '#d1d5db' }}>Sem conversas</p>
                      </div>
                    ) : cards.map((conv: any) => {
                      const name = conv.contacts?.name || conv.contacts?.phone || '??'
                      const av = getAvatarColor(name)
                      const isDragging = draggingId === conv.id
                      return (
                        <div key={conv.id} draggable
                          onDragStart={e => handleDragStart(e, conv.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => router.push('/dashboard/inbox')}
                          style={{
                            background: '#fff', border: '1px solid #e5e7eb', borderRadius: '9px',
                            padding: '11px 12px', cursor: 'grab',
                            opacity: isDragging ? 0.4 : 1,
                            boxShadow: isDragging ? 'none' : '0 1px 3px rgba(0,0,0,.06)',
                            transition: 'opacity 0.15s, box-shadow 0.15s',
                            userSelect: 'none',
                          }}
                          onMouseEnter={e => { if (!isDragging) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 3px 10px rgba(0,0,0,.1)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,.06)' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                              {getInitials(name)}
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {name}
                            </span>
                          </div>

                          <ContactTagBadges contact={conv.contacts} />

                          {conv.last_message && (
                            <p style={{ fontSize: '11px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '6px' }}>
                              {conv.last_message}
                            </p>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                            {conv.channels?.name && (
                              <span style={{ fontSize: '10px', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', padding: '1px 5px', borderRadius: '4px' }}>
                                {conv.channels.name}
                              </span>
                            )}
                            {conv.unread_count > 0 && (
                              <span style={{ background: '#16a34a', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px', marginLeft: 'auto' }}>
                                {conv.unread_count}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Empty state when no columns configured */}
            {stages.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#9ca3af' }}>
                <div style={{ textAlign: 'center' }}>
                  <Settings2 size={32} color="#d1d5db" style={{ margin: '0 auto 10px' }} />
                  <p style={{ fontSize: '14px' }}>Nenhuma coluna configurada</p>
                  <button onClick={() => setShowManage(true)} style={{
                    marginTop: '10px', padding: '8px 16px', background: '#7c3aed', border: 'none',
                    borderRadius: '8px', color: '#fff', fontSize: '13px', cursor: 'pointer', fontWeight: 600,
                  }}>
                    Criar colunas
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manage Columns Modal */}
      {showManage && (
        <ManageColumnsModal
          columns={dbColumns && dbColumns.length > 0 ? dbColumns : DEFAULT_COLUMNS.map((c, i) => ({ ...c, id: c.key, sort_order: i, tenant_id: tenantId }))}
          tenantId={tenantId}
          onClose={() => setShowManage(false)}
          onSaved={handleColumnsSaved}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
