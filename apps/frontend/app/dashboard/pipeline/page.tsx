'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { conversationApi, channelApi, campaignApi, contactApi, tenantApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import {
  Loader2, MessageSquare, RefreshCw, Settings2, Plus, Trash2,
  GripVertical, X, Check, Pencil, DollarSign, AlertTriangle,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n'
import { usePermissions } from '@/store/permissions.store'
import { subscribeTenant } from '@/lib/pusher'

function getDefaultColumns(t: (key: string) => string) {
  return [
    { key: 'lead',         label: t('pipeline.defaultLead'),          color: '#6b7280' },
    { key: 'qualificacao', label: t('pipeline.defaultQualification'), color: '#2563eb' },
    { key: 'proposta',     label: t('pipeline.defaultProposal'),      color: '#7c3aed' },
    { key: 'negociacao',   label: t('pipeline.defaultNegotiation'),   color: '#d97706' },
    { key: 'ganho',        label: t('pipeline.defaultWon'),           color: '#16a34a' },
    { key: 'perdido',      label: t('pipeline.defaultLost'),          color: '#dc2626' },
  ]
}

const COLOR_PRESETS = [
  '#6b7280', '#2563eb', '#7c3aed', '#d97706',
  '#16a34a', '#dc2626', '#0891b2', '#db2777',
  '#65a30d', '#ea580c', '#7e22ce', '#0f766e',
]

function hexToSoft(hex: string) { return { bg: hex + '12', border: hex + '30' } }
function getInitials(n: string | undefined | null) { return ((n || '??').trim().slice(0, 2)).toUpperCase() }
function getAvatarColor(n: string | undefined | null) {
  const colors = [
    { bg: '#dbeafe', color: '#1d4ed8' }, { bg: '#dcfce7', color: '#15803d' },
    { bg: '#fce7f3', color: '#be185d' }, { bg: '#ede9fe', color: '#6d28d9' },
    { bg: '#ffedd5', color: '#c2410c' }, { bg: '#e0f2fe', color: '#0369a1' },
  ]
  return colors[((n || '').charCodeAt(0) || 0) % colors.length]
}

function formatCurrency(val: number | null | undefined): string {
  if (!val) return ''
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val)
}


function ContactTagBadges({ contact }: { contact: any }) {
  const tags = (contact?.contact_tags || []).map((ct: any) => ct.tags).filter(Boolean)
  if (!tags.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '5px' }}>
      {tags.map((tag: any) => (
        <span key={tag.id} style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '99px', background: `${tag.color || '#6b7280'}18`, color: tag.color || '#6b7280', border: `1px solid ${tag.color || '#6b7280'}30` }}>
          {tag.name}
        </span>
      ))}
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '22px', height: '22px', borderRadius: '50%', background: value, border: '2px solid var(--bg-card)', boxShadow: '0 0 0 1px var(--border)', cursor: 'pointer', flexShrink: 0 }} />
      {open && (
        <div style={{ position: 'absolute', top: '28px', left: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px', boxShadow: '0 8px 24px rgba(0,0,0,.1)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
          {COLOR_PRESETS.map(c => (
            <button key={c} onClick={() => { onChange(c); setOpen(false) }} style={{ width: '24px', height: '24px', borderRadius: '50%', background: c, border: c === value ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />
          ))}
        </div>
      )}
    </div>
  )
}

function ManageColumnsModal({ columns, pipelineId, onClose, onSaved, board }: {
  columns: any[]; pipelineId: string | null
  onClose: () => void; onSaved: () => void; board: Record<string, any[]> | undefined
}) {
  const t = useT()
  const [localCols, setLocalCols] = useState(columns.map(c => ({ ...c })))
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
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
      label: newLabel.trim(), color: newColor, sort_order: c.length, _isNew: true,
    }])
    setNewLabel(''); setNewColor('#6b7280')
  }

  const tryRemoveColumn = (col: any) => {
    const count = board?.[col.key]?.length ?? 0
    if (count > 0) { setPendingDeleteId(col.id) } else { setLocalCols(c => c.filter(x => x.id !== col.id)) }
  }

  const confirmRemoveColumn = (id: string) => { setLocalCols(c => c.filter(x => x.id !== id)); setPendingDeleteId(null) }
  const updateColor = (id: string, color: string) => setLocalCols(c => c.map(x => x.id === id ? { ...x, color } : x))
  const startEdit = (col: any) => { setEditingId(col.id); setEditLabel(col.label) }
  const commitEdit = (id: string) => {
    if (editLabel.trim()) setLocalCols(c => c.map(x => x.id === id ? { ...x, label: editLabel.trim() } : x))
    setEditingId(null)
  }

  const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

  const handleSave = async () => {
    setSaving(true)
    try {
      const removedIds = columns.map(c => c.id).filter(id => isUUID(id) && !localCols.find(l => l.id === id))
      await conversationApi.put('/pipeline-columns', {
        columns: localCols.map((col, i) => ({ ...col, sort_order: i })),
        pipelineId: pipelineId,
        removedIds,
      })
      toast.success(t('pipeline.toastColumnsSaved'))
      onSaved(); onClose()
    } catch (e: any) {
      toast.error(t('pipeline.toastSaveError') + ' ' + (e?.response?.data?.error?.message || e.message || ''))
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '460px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.12)', border: '1px solid var(--border)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>{t('pipeline.manageColumns')}</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>{t('pipeline.manageColumnsSubtitle')}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '4px', display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
          {localCols.map((col, i) => {
            const cardCount = board?.[col.key]?.length ?? 0
            const isPendingDelete = pendingDeleteId === col.id
            return (
              <div key={col.id} style={{ marginBottom: '6px' }}>
                <div draggable={!isPendingDelete} onDragStart={() => handleDragStart(i)} onDragEnter={() => handleDragEnter(i)} onDragEnd={handleDragEnd} onDragOver={e => e.preventDefault()}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: isPendingDelete ? '8px 8px 0 0' : '8px', background: isPendingDelete ? '#fff5f5' : 'var(--bg-input)', border: `1px solid ${isPendingDelete ? '#fecaca' : 'var(--bg)'}`, cursor: 'grab' }}>
                  <GripVertical size={14} color="var(--text-faintest)" style={{ flexShrink: 0 }} />
                  <ColorPicker value={col.color} onChange={c => updateColor(col.id, c)} />
                  {editingId === col.id ? (
                    <input autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)} onBlur={() => commitEdit(col.id)} onKeyDown={e => { if (e.key === 'Enter') commitEdit(col.id); if (e.key === 'Escape') setEditingId(null) }}
                      style={{ flex: 1, border: 'none', borderBottom: '1.5px solid #22c55e', background: 'transparent', fontSize: '13px', fontWeight: 600, color: 'var(--text)', outline: 'none', padding: '1px 0' }} />
                  ) : (
                    <span onClick={() => !isPendingDelete && startEdit(col)} style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: isPendingDelete ? '#ef4444' : 'var(--text)', cursor: 'text' }}>{col.label}</span>
                  )}
                  {cardCount > 0 && !isPendingDelete && <span style={{ fontSize: '11px', color: 'var(--text-faint)', marginRight: '2px' }}>{cardCount} {t('pipeline.convAbbrev')}</span>}
                  <button onClick={() => tryRemoveColumn(col)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isPendingDelete ? '#ef4444' : 'var(--text-faintest)', padding: '2px', borderRadius: '4px', display: 'flex' }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = isPendingDelete ? '#ef4444' : 'var(--text-faintest)'}>
                    <Trash2 size={14} />
                  </button>
                </div>
                {isPendingDelete && (
                  <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '10px 12px' }}>
                    <p style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600, marginBottom: '4px' }}>⚠️ {t('pipeline.columnHasConvs').replace('{count}', String(cardCount)).replace('{plural}', cardCount !== 1 ? 's' : '')}</p>
                    <p style={{ fontSize: '11px', color: '#ef4444', marginBottom: '10px', lineHeight: '1.4' }}>{t('pipeline.columnDeleteWarning')}</p>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setPendingDeleteId(null)} style={{ flex: 1, padding: '6px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: '#52525b', cursor: 'pointer' }}>{t('common.cancel')}</button>
                      <button onClick={() => confirmRemoveColumn(col.id)} style={{ flex: 1, padding: '6px', background: '#dc2626', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}>{t('common.delete')}</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 10px', marginTop: '4px', borderRadius: '8px', border: '1.5px dashed var(--border)', background: 'var(--bg-input)' }}>
            <GripVertical size={14} color="var(--border)" style={{ flexShrink: 0 }} />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <input placeholder={t('pipeline.newColumnPlaceholder')} value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addColumn() }}
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '13px', color: 'var(--text)', outline: 'none' }} />
            <button onClick={addColumn} style={{ background: '#22c55e', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', padding: '4px 10px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Plus size={12} /> {t('pipeline.addColumn')}
            </button>
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--divider)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: '#52525b', cursor: 'pointer' }}>{t('common.cancel')}</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', background: '#22c55e', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ContactSearchResults({ search, stage, pipelineId, onDone }: { search: string; stage: string; pipelineId: string | null; onDone: () => void }) {
  const { data: contacts = [], isLoading, isError } = useQuery({
    queryKey: ['pipeline-contact-search', search],
    queryFn: async () => {
      if (search.length < 2) return []
      try {
        const { data } = await contactApi.get(`/contacts?search=${encodeURIComponent(search)}&limit=10`)
        return data.data || []
      } catch { return [] }
    },
    enabled: search.length >= 2,
    retry: false,
  })

  const addMutation = useMutation({
    mutationFn: async (contactId: string) => {
      await conversationApi.post('/pipeline-cards', { contactId, columnKey: stage, pipelineId })
    },
    onSuccess: () => { toast.success('Contato adicionado à pipeline!'); onDone() },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Erro ao adicionar contato'),
  })

  if (search.length < 2) return <p style={{ fontSize: '12px', color: 'var(--text-faint)', textAlign: 'center', padding: '16px 0' }}>Digite pelo menos 2 caracteres</p>
  if (isLoading) return <p style={{ fontSize: '12px', color: 'var(--text-faint)', textAlign: 'center', padding: '16px 0' }}>Buscando...</p>
  if (isError) return <p style={{ fontSize: '12px', color: '#ef4444', textAlign: 'center', padding: '16px 0' }}>Erro ao buscar contatos</p>
  if (contacts.length === 0) return <p style={{ fontSize: '12px', color: 'var(--text-faint)', textAlign: 'center', padding: '16px 0' }}>Nenhum contato encontrado</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {contacts.map((c: any) => (
        <div key={c.id} onClick={() => addMutation.mutate(c.id)}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border)', transition: 'all 0.1s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLDivElement).style.borderColor = '#22c55e' }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
            {(c.name || c.phone || '?').slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || c.phone}</p>
            <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0 }}>{c.phone}</p>
          </div>
          {addMutation.isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: '#22c55e' }} />}
        </div>
      ))}
    </div>
  )
}

export default function PipelinePage() {
  const t = useT()
  const { isAdmin, canEdit, canDelete } = usePermissions()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const tenantId = (user as any)?.tenantId || (user as any)?.tid || ''

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [channelFilter, setChannelFilter] = useState('all')
  const [campaignFilter, setCampaignFilter] = useState('all')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)
  const [draggingColKey, setDraggingColKey] = useState<string | null>(null)
  const [overColKey, setOverColKey] = useState<string | null>(null)
  const [localStages, setLocalStages] = useState<any[] | null>(null)
  const [showManage, setShowManage] = useState(false)
  const [showNewPipeline, setShowNewPipeline] = useState(false)
  const [addToStage, setAddToStage] = useState<string | null>(null)
  const [addSearch, setAddSearch] = useState('')
  const [newPipelineName, setNewPipelineName] = useState('')
  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(null)
  const [editingPipelineName, setEditingPipelineName] = useState('')
  const [purchaseConvId, setPurchaseConvId] = useState<string | null>(null)
  const [purchaseContactId, setPurchaseContactId] = useState<string | null>(null)
  const [purchaseProductId, setPurchaseProductId] = useState('')
  const [purchaseQty, setPurchaseQty] = useState(1)
  const [newDiscount, setNewDiscount] = useState(0)
  const [newSurcharge, setNewSurcharge] = useState(0)
  const [newShipping, setNewShipping] = useState(0)
  const [newCoupon, setNewCoupon] = useState('')
  const [cart, setCart] = useState<{ productId: string; name: string; price: number; qty: number }[]>([])
  const [expandedPurchase, setExpandedPurchase] = useState<string | null>(null)
  const localBoardRef = useRef<Record<string, any[]> | null>(null)
  const [, forceRender] = useState(0)
  const DEFAULT_COLUMNS = getDefaultColumns(t)

  const { data: pipelines = [], refetch: refetchPipelines } = useQuery({
    queryKey: ['pipelines', tenantId],
    queryFn: async () => {
      if (!tenantId) return []
      const { data } = await conversationApi.get('/pipelines')
      return data.data || []
    },
    staleTime: 30000,
  })

  const { data: dbColumns, isLoading: colsLoading, refetch: refetchCols } = useQuery({
    queryKey: ['pipeline-columns', tenantId, selectedPipelineId],
    queryFn: async () => {
      const params = selectedPipelineId ? `?pipelineId=${selectedPipelineId}` : ''
      const { data } = await conversationApi.get(`/pipeline-columns${params}`)
      return data.data as any[]
    },
    staleTime: 30000,
  })

  const baseStages = dbColumns && dbColumns.length > 0 ? dbColumns : DEFAULT_COLUMNS
  const stages = (localStages ?? baseStages).map((c: any) => ({
    ...c, key: c.key, label: c.label, color: c.color || '#6b7280', ...hexToSoft(c.color || '#6b7280'),
  }))

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data || [] },
  })

  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns-list'],
    queryFn: async () => { const { data } = await campaignApi.get('/campaigns?limit=100'); return data.data || [] },
  })

  const { data: limitsData } = useQuery({
    queryKey: ['limits'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant/limits'); return data.data },
    staleTime: 60000,
  })
  const reportsAllowed = limitsData?.limits?.reports !== false

  const { data: products = [] } = useQuery({
    queryKey: ['products-pipeline'],
    queryFn: async () => { const { data } = await contactApi.get('/products'); return data.data || [] },
  })

  // Compras agrupadas por contact_id para exibir nos cards
  const { data: purchasesByContact = {} } = useQuery<Record<string, any[]>>({
    queryKey: ['purchases-by-contact'],
    queryFn: async () => { const { data } = await contactApi.get('/purchases/by-contact'); return data.data || {} },
    staleTime: 10000, refetchInterval: 30000,
  })

  const { data: board, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pipeline-board', channelFilter, campaignFilter, selectedPipelineId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (channelFilter !== 'all') params.set('channelId', channelFilter)
      if (campaignFilter !== 'all') params.set('campaignId', campaignFilter)
      if (selectedPipelineId) params.set('pipelineId', selectedPipelineId)
      const url = `/conversations/pipeline${params.toString() ? '?' + params.toString() : ''}`
      const { data } = await conversationApi.get(url)
      const boardData = data.data as Record<string, any[]>

      // Carrega pipeline cards (negócios manuais) e adiciona ao board
      try {
        const cardsParams = selectedPipelineId ? `?pipelineId=${selectedPipelineId}` : ''
        const { data: cardsRes } = await conversationApi.get(`/pipeline-cards${cardsParams}`)
        const cards = cardsRes.data || []
        for (const card of cards) {
          const col = card.column_key || 'lead'
          if (!boardData[col]) boardData[col] = []
          boardData[col].push({
            id: `card_${card.id}`,
            _cardId: card.id,
            contacts: card.contacts,
            deal_value: card.deal_value,
            last_message: card.title || 'Negócio manual',
            last_message_at: card.created_at,
            status: 'open',
            pipeline_stage: col,
          })
        }
      } catch {}

      localBoardRef.current = null
      return boardData
    },
    staleTime: 8000, refetchInterval: 10000, refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  })

  // Tarefas pendentes para indicar no card
  const { data: pendingTasks = [] } = useQuery({
    queryKey: ['pipeline-tasks'],
    queryFn: async () => { const { data } = await conversationApi.get('/tasks?status=pending'); return data.data || [] },
    staleTime: 15000, refetchInterval: 30000,
  })
  const tasksByConv = (pendingTasks as any[]).reduce((acc: Record<string, any[]>, t: any) => {
    if (t.conversation_id) { acc[t.conversation_id] = acc[t.conversation_id] || []; acc[t.conversation_id].push(t) }
    return acc
  }, {} as Record<string, any[]>)

  useEffect(() => {
    if (!user || !tenantId) return
    const channel = subscribeTenant(tenantId)
    if (!channel) return
    const onInbound = () => { localBoardRef.current = null; queryClient.refetchQueries({ queryKey: ['pipeline-board'] }) }
    const onConvUpdated = () => { localBoardRef.current = null; queryClient.refetchQueries({ queryKey: ['pipeline-board'] }) }
    channel.bind('inbound.message', onInbound)
    channel.bind('conversation.updated', onConvUpdated)
    return () => { channel.unbind('inbound.message', onInbound); channel.unbind('conversation.updated', onConvUpdated) }
  }, [user, queryClient, tenantId])

  const displayBoard = localBoardRef.current ?? board

  // Calcula total por contato — total_price de cada purchase já inclui ajustes
  const getContactPurchaseTotal = (contactId: string): number => {
    const purchases = (purchasesByContact as any)[contactId]
    if (!purchases || !Array.isArray(purchases)) return 0
    return purchases.reduce((s: number, p: any) => s + Number(p.total_price || 0), 0)
  }
  const getColumnTotal = (stageKey: string): number => {
    const cards = displayBoard?.[stageKey] || []
    return cards.reduce((sum: number, conv: any) => {
      const cId = conv.contacts?.id || conv.contact_id
      return sum + (cId ? getContactPurchaseTotal(cId) : 0)
    }, 0)
  }

  // Total geral do pipeline
  const totalValue = stages.reduce((sum, s) => sum + getColumnTotal(s.key), 0)
  const totalConvs = displayBoard ? Object.values(displayBoard).reduce((acc, arr) => acc + arr.length, 0) : 0

  const moveMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      await conversationApi.patch(`/conversations/${id}/pipeline`, { stage, pipelineId: selectedPipelineId })
    },
    onSuccess: () => { localBoardRef.current = null; queryClient.refetchQueries({ queryKey: ['pipeline-board'] }) },
    onError: () => { localBoardRef.current = null; forceRender(n => n + 1); toast.error(t('pipeline.toastMoveError')) },
  })

  const createPipelineMutation = useMutation({
    mutationFn: async (name: string) => { const { data } = await conversationApi.post('/pipelines', { name }); return data.data },
    onSuccess: (pipeline) => { toast.success(t('pipeline.toastPipelineCreated')); refetchPipelines(); setSelectedPipelineId(pipeline.id); setShowNewPipeline(false); setNewPipelineName('') },
    onError: () => toast.error(t('pipeline.toastPipelineCreateError')),
  })

  const deletePipelineMutation = useMutation({
    mutationFn: async (id: string) => { await conversationApi.delete(`/pipelines/${id}`) },
    onSuccess: () => { toast.success(t('pipeline.toastPipelineRemoved')); setSelectedPipelineId(null); setLocalStages(null); refetchPipelines(); queryClient.refetchQueries({ queryKey: ['pipeline-board'] }) },
    onError: () => toast.error(t('pipeline.toastPipelineRemoveError')),
  })

  const renamePipelineMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => { await conversationApi.patch(`/pipelines/${id}`, { name }) },
    onSuccess: () => { refetchPipelines(); setEditingPipelineId(null) },
    onError: () => toast.error(t('pipeline.toastPipelineRenameError')),
  })

  const { data: contactPurchases = [], refetch: refetchPurchases } = useQuery({
    queryKey: ['contact-purchases', purchaseContactId],
    queryFn: async () => {
      if (!purchaseContactId) return []
      const { data } = await contactApi.get(`/contacts/${purchaseContactId}/purchases`)
      return data.data || []
    },
    enabled: !!purchaseContactId,
  })

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      await contactApi.post('/purchases/batch', {
        contactId: purchaseContactId,
        conversationId: purchaseConvId,
        items: cart,
        discount: newDiscount,
        surcharge: newSurcharge,
        shipping: newShipping,
        coupon: newCoupon || null,
      })
    },
    onSuccess: () => {
      toast.success('Pedido registrado!');
      setCart([]); setPurchaseProductId(''); setPurchaseQty(1)
      setNewDiscount(0); setNewSurcharge(0); setNewShipping(0); setNewCoupon('')
      refetchPurchases()
      queryClient.invalidateQueries({ queryKey: ['purchases-by-contact'] })
    },
    onError: () => toast.error('Erro ao registrar pedido'),
  })

  const deletePurchaseMutation = useMutation({
    mutationFn: async (id: string) => { await contactApi.delete(`/purchases/${id}`) },
    onSuccess: () => { toast.success('Compra removida'); refetchPurchases(); queryClient.invalidateQueries({ queryKey: ['purchases-by-contact'] }) },
    onError: () => toast.error('Erro ao remover compra'),
  })

  const updatePurchaseMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; [key: string]: any }) => {
      await contactApi.patch(`/purchases/${id}`, body)
    },
    onSuccess: () => { toast.success('Pedido atualizado'); refetchPurchases(); queryClient.invalidateQueries({ queryKey: ['purchases-by-contact'] }) },
    onError: () => toast.error('Erro ao atualizar'),
  })

  const handleDragStart = (e: React.DragEvent, convId: string) => { setDraggingId(convId); e.dataTransfer.effectAllowed = 'move' }
  const handleDragOver = (e: React.DragEvent, stageKey: string) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverStage(stageKey) }
  const handleDrop = (e: React.DragEvent, targetStage: string) => {
    e.preventDefault()
    if (!draggingId || !displayBoard) return
    let sourceStage = ''; let movedConv: any = null
    for (const [stage, cards] of Object.entries(displayBoard)) {
      const found = cards.find((c: any) => c.id === draggingId)
      if (found) { sourceStage = stage; movedConv = found; break }
    }
    if (!movedConv || sourceStage === targetStage) { setDraggingId(null); setOverStage(null); return }
    const newBoard: Record<string, any[]> = {}
    for (const [s, cards] of Object.entries(displayBoard)) {
      newBoard[s] = s === sourceStage ? cards.filter((c: any) => c.id !== draggingId) : s === targetStage ? [{ ...movedConv, pipeline_stage: targetStage }, ...cards] : [...cards]
    }
    localBoardRef.current = newBoard
    forceRender(n => n + 1)
    moveMutation.mutate({ id: draggingId, stage: targetStage })
    setDraggingId(null); setOverStage(null)
  }
  const handleDragEnd = () => { setDraggingId(null); setOverStage(null) }

  const handleColDragStart = (e: React.DragEvent, key: string) => { e.dataTransfer.setData('dragType', 'column'); e.dataTransfer.effectAllowed = 'move'; setDraggingColKey(key) }
  const handleColDragOver = (e: React.DragEvent, key: string) => { e.preventDefault(); e.stopPropagation(); if (draggingColKey && draggingColKey !== key) setOverColKey(key) }
  const handleColDrop = async (e: React.DragEvent, targetKey: string) => {
    e.preventDefault(); e.stopPropagation()
    if (!draggingColKey || draggingColKey === targetKey) { setDraggingColKey(null); setOverColKey(null); return }
    const arr = [...stages]
    const fromIdx = arr.findIndex(s => s.key === draggingColKey)
    const toIdx = arr.findIndex(s => s.key === targetKey)
    if (fromIdx === -1 || toIdx === -1) return
    const [moved] = arr.splice(fromIdx, 1)
    arr.splice(toIdx, 0, moved)
    setLocalStages(arr); setDraggingColKey(null); setOverColKey(null)
    const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    const colsToUpdate = arr.filter(c => isUUID(c.id)).map((c, i) => ({ ...c, sort_order: i }))
    if (colsToUpdate.length > 0) {
      await conversationApi.put('/pipeline-columns', { columns: colsToUpdate, pipelineId: selectedPipelineId, removedIds: [] })
      refetchCols()
    }
  }
  const handleColDragEnd = () => { setDraggingColKey(null); setOverColKey(null) }

  const boardScrollRef = useRef<HTMLDivElement>(null)
  const boardDragStart = useRef<{ x: number; scrollLeft: number } | null>(null)
  const [isDraggingBoard, setIsDraggingBoard] = useState(false)
  const handleBoardMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-card]') || target.closest('[data-col-header]') || target.closest('button') || target.closest('select') || target.closest('input')) return
    if (!boardScrollRef.current) return
    boardDragStart.current = { x: e.clientX, scrollLeft: boardScrollRef.current.scrollLeft }
    setIsDraggingBoard(true)
    const onMove = (ev: MouseEvent) => { if (!boardDragStart.current || !boardScrollRef.current) return; boardScrollRef.current.scrollLeft = boardDragStart.current.scrollLeft - (ev.clientX - boardDragStart.current.x) }
    const onUp = () => { boardDragStart.current = null; setIsDraggingBoard(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }

  const handleColumnsSaved = () => {
    refetchCols(); setLocalStages(null); localBoardRef.current = null
    queryClient.refetchQueries({ queryKey: ['pipeline-board'] })
  }

  return (
    <div className="mobile-page" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', flexShrink: 0 }}>
        <div className="mobile-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>{t('pipeline.title')}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '3px' }}>
              <p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>{totalConvs} {t('pipeline.conversations')}</p>
              {totalValue > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--text-faintest)' }} />
                  <p style={{ color: '#16a34a', fontSize: '13px', fontWeight: 700 }}>{formatCurrency(totalValue)} {t('pipeline.inNegotiation')}</p>
                </div>
              )}
            </div>
          </div>
          <div className="mobile-header-actions mobile-wrap" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {(channels as any[]).length > 1 && (
              <select value={channelFilter} onChange={e => { setChannelFilter(e.target.value); localBoardRef.current = null }} style={{ padding: '7px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}>
                <option value="all">{t('pipeline.allChannels')}</option>
                {(channels as any[]).map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              </select>
            )}
            {(campaigns as any[]).length > 0 && (
              <select value={campaignFilter} onChange={e => { setCampaignFilter(e.target.value); localBoardRef.current = null }} style={{ padding: '7px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}>
                <option value="all">{t('pipeline.allCampaigns')}</option>
                {(campaigns as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {canEdit('/dashboard/pipeline') && (
            <button onClick={() => setShowManage(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: '#52525b', cursor: 'pointer', fontWeight: 500 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#22c55e'; (e.currentTarget as HTMLButtonElement).style.color = '#16a34a' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = '#52525b' }}>
              <Settings2 size={13} /> {t('pipeline.columns')}
            </button>
            )}
            <button onClick={() => { localBoardRef.current = null; refetch() }} disabled={isFetching} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: '#52525b', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)'}>
              <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} /> {t('pipeline.refresh')}
            </button>
            {canEdit('/dashboard/pipeline') && reportsAllowed && <button onClick={async () => {
              if (!board) { toast.error(t('pipeline.noData')); return }
              const rows: any[] = []
              for (const [stage, convs] of Object.entries(board as Record<string, any[]>)) {
                const cols = dbColumns && dbColumns.length > 0 ? dbColumns : DEFAULT_COLUMNS
                const colLabel = cols.find((c: any) => c.key === stage)?.label || stage
                for (const conv of convs) {
                  rows.push({
                    etapa: colLabel,
                    contato: conv.contacts?.name || conv.contacts?.phone || '',
                    telefone: conv.contacts?.phone || '',
                    ultima_mensagem: conv.last_message || '',
                    ultima_interacao: conv.last_message_at ? new Date(conv.last_message_at).toLocaleString('pt-BR') : '',
                    status: conv.status || '',
                  })
                }
              }
              if (rows.length === 0) { toast.error(t('pipeline.pipelineEmpty')); return }
              const { exportToExcel } = await import('@/lib/export')
              exportToExcel(rows, 'pipeline_funil', 'Pipeline')
              toast.success(`${rows.length} ${t('pipeline.recordsExported')}`)
            }} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: '#52525b', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)'}>
              <DollarSign size={13} /> {t('pipeline.exportExcel')}
            </button>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => { setSelectedPipelineId(null); setLocalStages(null); localBoardRef.current = null }}
            style={{ padding: '5px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: selectedPipelineId === null ? 700 : 500, cursor: 'pointer', border: 'none', background: selectedPipelineId === null ? 'var(--text)' : 'var(--bg)', color: selectedPipelineId === null ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s' }}>
            {t('pipeline.main')}
          </button>
          {(pipelines as any[]).map((p: any) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px', borderRadius: '99px', background: selectedPipelineId === p.id ? 'var(--text)' : 'var(--bg)', cursor: 'pointer', transition: 'all 0.15s' }}
              onClick={() => { setSelectedPipelineId(p.id); setLocalStages(null); localBoardRef.current = null }}>
              {editingPipelineId === p.id ? (
                <input autoFocus value={editingPipelineName} onChange={e => setEditingPipelineName(e.target.value)}
                  onBlur={() => { if (editingPipelineName.trim()) renamePipelineMutation.mutate({ id: p.id, name: editingPipelineName }); else setEditingPipelineId(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') { if (editingPipelineName.trim()) renamePipelineMutation.mutate({ id: p.id, name: editingPipelineName }); else setEditingPipelineId(null) } if (e.key === 'Escape') setEditingPipelineId(null) }}
                  onClick={e => e.stopPropagation()}
                  style={{ border: 'none', background: 'transparent', fontSize: '13px', fontWeight: 700, color: '#fff', outline: 'none', width: '100px' }} />
              ) : (
                <span style={{ fontSize: '13px', fontWeight: selectedPipelineId === p.id ? 700 : 500, color: selectedPipelineId === p.id ? '#fff' : 'var(--text-muted)' }}>{p.name}</span>
              )}
              {canEdit('/dashboard/pipeline') && selectedPipelineId === p.id && !editingPipelineId && (
                <>
                  <button onClick={e => { e.stopPropagation(); setEditingPipelineId(p.id); setEditingPipelineName(p.name) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--text-faint)', display: 'flex' }} onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#fff'} onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'}><Pencil size={11} /></button>
                  <button onClick={e => { e.stopPropagation(); if (confirm(t('pipeline.confirmRemovePipeline').replace('{name}', p.name))) deletePipelineMutation.mutate(p.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--text-faint)', display: 'flex' }} onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'} onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'}><X size={11} /></button>
                </>
              )}
            </div>
          ))}
          {canEdit('/dashboard/pipeline') && (showNewPipeline ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '99px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <input autoFocus placeholder={t('pipeline.pipelineNamePlaceholder')} value={newPipelineName} onChange={e => setNewPipelineName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newPipelineName.trim()) createPipelineMutation.mutate(newPipelineName.trim()); if (e.key === 'Escape') { setShowNewPipeline(false); setNewPipelineName('') } }}
                style={{ border: 'none', background: 'transparent', fontSize: '13px', color: 'var(--text)', outline: 'none', width: '130px' }} />
              <button onClick={() => { if (newPipelineName.trim()) createPipelineMutation.mutate(newPipelineName.trim()) }} style={{ background: '#22c55e', border: 'none', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Check size={10} color="#fff" strokeWidth={3} /></button>
              <button onClick={() => { setShowNewPipeline(false); setNewPipelineName('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--text-faint)', display: 'flex' }}><X size={12} /></button>
            </div>
          ) : (
            <button onClick={() => setShowNewPipeline(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '99px', background: 'none', border: '1.5px dashed var(--border)', fontSize: '12px', color: 'var(--text-faint)', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#22c55e'; (e.currentTarget as HTMLButtonElement).style.color = '#16a34a' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}>
              <Plus size={12} /> {t('pipeline.newPipeline').replace('+ ', '')}
            </button>
          ))}
        </div>
      </div>

      {(isLoading || colsLoading) ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faintest)' }} />
        </div>
      ) : (
        <div className="pipeline-board" ref={boardScrollRef} onMouseDown={handleBoardMouseDown}
          style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '20px 24px', cursor: isDraggingBoard ? 'grabbing' : 'grab', userSelect: 'none' }}>
          <div style={{ display: 'flex', gap: '12px', height: '100%', minWidth: 'max-content' }}>
            {stages.map(stage => {
              const cards = displayBoard?.[stage.key] || []
              const isOver = overStage === stage.key
              const colTotal = getColumnTotal(stage.key)
              return (
                <div key={stage.key}
                  className="pipeline-column"
                  onDragOver={e => { if (draggingColKey) handleColDragOver(e, stage.key); else handleDragOver(e, stage.key) }}
                  onDrop={e => { if (draggingColKey) handleColDrop(e, stage.key); else handleDrop(e, stage.key) }}
                  onDragLeave={() => { setOverStage(null); setOverColKey(null) }}
                  style={{ width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: isOver ? stage.bg : 'var(--bg-card)', border: `1px solid ${overColKey === stage.key ? stage.color : isOver ? stage.color : 'var(--border)'}`, borderRadius: '12px', overflow: 'hidden', transition: 'border-color 0.15s, background 0.15s, opacity 0.15s', opacity: draggingColKey === stage.key ? 0.4 : 1, boxShadow: 'var(--shadow)' }}>

                  {/* ── Header da coluna com total monetário ── */}
                  <div data-col-header draggable={canEdit('/dashboard/pipeline')} onDragStart={e => { if (canEdit('/dashboard/pipeline')) handleColDragStart(e, stage.key) }} onDragEnd={handleColDragEnd}
                    style={{ padding: '12px 14px', borderBottom: `1px solid ${stage.border}`, background: stage.bg, flexShrink: 0, cursor: 'grab', userSelect: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stage.color }} />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: stage.color, letterSpacing: '-0.01em' }}>{stage.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: stage.color, background: `${stage.color}18`, border: `1px solid ${stage.color}25`, padding: '1px 8px', borderRadius: '99px' }}>{cards.length}</span>
                        {canEdit('/dashboard/pipeline') && <button onClick={() => { setAddToStage(stage.key); setAddSearch('') }}
                          style={{ width: '20px', height: '20px', borderRadius: '5px', border: `1px solid ${stage.color}30`, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: stage.color, fontSize: '14px', fontWeight: 700, lineHeight: 1 }}
                          title="Adicionar contato">+</button>}
                      </div>
                    </div>
                    {/* Total monetário da coluna */}
                    {colTotal > 0 && (
                      <div style={{ marginTop: '6px', fontSize: '12px', fontWeight: 700, color: stage.color, opacity: 0.8 }}>
                        {formatCurrency(colTotal)}
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {cards.length === 0 ? (
                      <div style={{ padding: '24px 10px', textAlign: 'center' }}>
                        <MessageSquare size={18} color="var(--text-faintest)" style={{ margin: '0 auto 6px' }} />
                        <p style={{ fontSize: '12px', color: 'var(--text-faintest)' }}>{t('pipeline.noConversations')}</p>
                      </div>
                    ) : cards.map((conv: any) => {
                      const name = conv.contacts?.name || conv.contacts?.phone || '??'
                      const av = getAvatarColor(name)
                      const isDragging = draggingId === conv.id

                      return (
                        <div key={conv.id} draggable={canEdit('/dashboard/pipeline')} data-card onDragStart={e => { if (canEdit('/dashboard/pipeline')) handleDragStart(e, conv.id) }} onDragEnd={handleDragEnd} onClick={() => router.push('/dashboard/inbox')}
                          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '11px 12px', cursor: 'grab', opacity: isDragging ? 0.4 : 1, boxShadow: isDragging ? 'none' : 'var(--shadow)', transition: 'opacity 0.15s, box-shadow 0.15s, transform 0.1s', userSelect: 'none' }}
                          onMouseEnter={e => { if (!isDragging) { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,.08)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' } }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            {canEdit('/dashboard/pipeline') && <button onClick={async (e) => {
                              e.stopPropagation()
                              if (!confirm(`Remover "${name}" da pipeline?`)) return
                              try {
                                if (conv._cardId) {
                                  await conversationApi.delete(`/pipeline-cards/${conv._cardId}`)
                                } else {
                                  await conversationApi.patch(`/conversations/${conv.id}/status`, { status: 'closed' })
                                }
                                refetch()
                                toast.success('Removido da pipeline')
                              } catch { toast.error('Erro ao remover') }
                            }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-faintest)', display: 'flex', flexShrink: 0, borderRadius: '4px' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faintest)'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}>
                              <X size={12} />
                            </button>}
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>{getInitials(name)}</div>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{name}</span>
                          </div>
                          <ContactTagBadges contact={conv.contacts} />
                          {conv.last_message && <p style={{ fontSize: '11px', color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '4px' }}>{conv.last_message}</p>}

                          {/* ── Compras resumo + tarefas ── */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                            {/* Compras */}
                            {(() => {
                              const cId = conv.contacts?.id || conv.contact_id
                              const cPurchases = cId ? (purchasesByContact as any)[cId] : null
                              const total = cId ? getContactPurchaseTotal(cId) : 0
                              if (!cPurchases || !Array.isArray(cPurchases) || cPurchases.length === 0) {
                                if (!canEdit('/dashboard/pipeline')) return null
                                return (
                                  <button onClick={(e) => { e.stopPropagation(); setPurchaseConvId(conv.id); setPurchaseContactId(cId) }}
                                    style={{ fontSize: '10px', color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '2px 8px', borderRadius: '99px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    + Compra
                                  </button>
                                )
                              }
                              // Nomes dos produtos (únicos), max 2 visíveis
                              const names = [...new Set(cPurchases.map((p: any) => p.products?.name || 'Produto'))]
                              const visible = names.slice(0, 2).join(', ')
                              const extra = names.length > 2 ? ` +${names.length - 2}` : ''
                              return (
                                <button onClick={(e) => { e.stopPropagation(); setPurchaseConvId(conv.id); setPurchaseContactId(cId) }}
                                  style={{ fontSize: '10px', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '99px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {visible}{extra} · R$ {total.toFixed(2)}
                                </button>
                              )
                            })()}
                            {/* Tarefas */}
                            {tasksByConv[conv.id] && (() => {
                              const tasks = tasksByConv[conv.id]
                              const overdue = tasks.filter((t: any) => t.due_date && new Date(t.due_date) < new Date())
                              return <>
                                {overdue.length > 0 && (
                                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: '99px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <AlertTriangle size={9} /> {overdue.length}
                                  </span>
                                )}
                                {tasks.length > overdue.length && (
                                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: '99px' }}>
                                    {tasks.length - overdue.length} {(tasks.length - overdue.length) > 1 ? t('pipeline.taskCountPlural') : t('pipeline.taskCount')}
                                  </span>
                                )}
                              </>
                            })()}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                            {conv.channels?.name && <span style={{ fontSize: '10px', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1px 6px', borderRadius: '99px' }}>{conv.channels.name}</span>}
                            {conv.unread_count > 0 && <span style={{ background: '#22c55e', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px', marginLeft: 'auto' }}>{conv.unread_count}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {stages.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <div style={{ textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '40px 48px', boxShadow: 'var(--shadow)' }}>
                  <Settings2 size={28} color="var(--text-faintest)" style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '4px' }}>{t('pipeline.noColumns')}</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-faint)', marginBottom: '16px' }}>{t('pipeline.createColumnsSubtitle')}</p>
                  <button onClick={() => setShowManage(true)} style={{ padding: '8px 16px', background: '#22c55e', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>{t('pipeline.createColumns')}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showManage && (
        <ManageColumnsModal
          columns={dbColumns && dbColumns.length > 0 ? dbColumns : DEFAULT_COLUMNS.map((c, i) => ({ ...c, id: c.key, sort_order: i }))}
          pipelineId={selectedPipelineId}
          onClose={() => setShowManage(false)}
          onSaved={handleColumnsSaved}
          board={displayBoard ?? undefined}
        />
      )}

      {/* Modal: Adicionar contato à pipeline */}
      {addToStage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '100%', maxWidth: '440px', maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Adicionar contato</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>Busque um contato pra adicionar à coluna</p>
              </div>
              <button onClick={() => setAddToStage(null)} style={{ background: 'var(--bg)', border: 'none', borderRadius: '7px', cursor: 'pointer', padding: '6px', display: 'flex' }}>✕</button>
            </div>
            <div style={{ padding: '12px 20px' }}>
              <input autoFocus style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'var(--bg-input)', color: 'var(--text)' }}
                placeholder="Buscar por nome ou telefone..." value={addSearch} onChange={e => setAddSearch(e.target.value)} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }}>
              <ContactSearchResults search={addSearch} stage={addToStage} pipelineId={selectedPipelineId} onDone={() => { setAddToStage(null); refetch() }} />
            </div>
          </div>
        </div>
      )}

      {purchaseConvId && (() => {
        const grandTotal = contactPurchases.reduce((s: number, p: any) => s + Number(p.total_price || 0), 0)
        const smallInput = { padding: '4px 6px', border: '1px solid var(--border)', borderRadius: '5px', fontSize: '12px', width: '70px', textAlign: 'right' as const, background: 'var(--bg-input)', color: 'var(--text)' }

        return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '24px', width: '440px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Pedidos</h3>
              <button onClick={() => { setPurchaseConvId(null); setExpandedPurchase(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-faint)' }}>
                <X size={16} />
              </button>
            </div>

            {/* ── Lista de pedidos ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {contactPurchases.map((p: any) => {
                const subtotal = Number(p.unit_price || 0) * (p.quantity || 1)
                const disc = Number(p.discount || 0)
                const sur = Number(p.surcharge || 0)
                const ship = Number(p.shipping || 0)
                const hasAdjustments = disc > 0 || sur > 0 || ship > 0 || p.coupon
                const isExpanded = expandedPurchase === p.id

                return (
                  <div key={p.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                    {/* Linha principal */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', cursor: 'pointer' }}
                      onClick={() => setExpandedPurchase(isExpanded ? null : p.id)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.products?.name || 'Produto'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <span>{p.quantity}x R$ {Number(p.unit_price || 0).toFixed(2)}</span>
                          {hasAdjustments && (
                            <span style={{ color: disc > 0 ? '#dc2626' : '#7c3aed', fontSize: '10px' }}>
                              {disc > 0 && `−R$${disc.toFixed(2)} `}{sur > 0 && `+R$${sur.toFixed(2)} `}{ship > 0 && `frete R$${ship.toFixed(2)}`}
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>
                        R$ {Number(p.total_price).toFixed(2)}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); deletePurchaseMutation.mutate(p.id) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-faintest)', borderRadius: '4px', flexShrink: 0 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faintest)' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Ajustes expandidos */}
                    {isExpanded && (
                      <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                          <div>
                            <label style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginBottom: '2px' }}>Cupom</label>
                            <input defaultValue={p.coupon || ''} onBlur={e => updatePurchaseMutation.mutate({ id: p.id, coupon: e.target.value })}
                              placeholder="—" style={{ ...smallInput, width: '100%' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginBottom: '2px' }}>Qtd</label>
                            <input type="number" min="1" defaultValue={p.quantity} onBlur={e => updatePurchaseMutation.mutate({ id: p.id, quantity: Number(e.target.value) || 1 })}
                              style={{ ...smallInput, width: '100%' }} />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                          <div>
                            <label style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginBottom: '2px' }}>Desconto (−)</label>
                            <input type="number" min="0" step="0.01" defaultValue={disc || ''} placeholder="0"
                              onBlur={e => updatePurchaseMutation.mutate({ id: p.id, discount: Number(e.target.value) || 0 })}
                              style={{ ...smallInput, width: '100%' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginBottom: '2px' }}>Acréscimo (+)</label>
                            <input type="number" min="0" step="0.01" defaultValue={sur || ''} placeholder="0"
                              onBlur={e => updatePurchaseMutation.mutate({ id: p.id, surcharge: Number(e.target.value) || 0 })}
                              style={{ ...smallInput, width: '100%' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginBottom: '2px' }}>Frete (+)</label>
                            <input type="number" min="0" step="0.01" defaultValue={ship || ''} placeholder="0"
                              onBlur={e => updatePurchaseMutation.mutate({ id: p.id, shipping: Number(e.target.value) || 0 })}
                              style={{ ...smallInput, width: '100%' }} />
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', marginTop: '8px', fontSize: '11px', color: 'var(--text-faint)' }}>
                          Subtotal: R$ {subtotal.toFixed(2)} → <strong style={{ color: '#16a34a' }}>R$ {Number(p.total_price).toFixed(2)}</strong>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {contactPurchases.length === 0 && (
                <p style={{ fontSize: '13px', color: 'var(--text-faint)', textAlign: 'center', padding: '16px 0' }}>Nenhum pedido registrado</p>
              )}
            </div>

            {/* ── Novo pedido ── */}
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>Novo pedido</div>

              {/* Itens no carrinho */}
              {cart.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
                  {cart.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                      <span style={{ flex: 1, fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{item.qty}x R$ {item.price.toFixed(2)}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>R$ {(item.price * item.qty).toFixed(2)}</span>
                      <button onClick={() => setCart(c => c.filter((_, i) => i !== idx))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-faintest)', display: 'flex' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faintest)' }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Adicionar item ao carrinho */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: cart.length > 0 ? '10px' : '10px' }}>
                <select value={purchaseProductId} onChange={e => setPurchaseProductId(e.target.value)}
                  style={{ flex: 1, padding: '7px 8px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', background: 'var(--bg-input)', color: 'var(--text)' }}>
                  <option value="">Adicionar produto...</option>
                  {products.map((p: any) => <option key={p.id} value={p.id}>{p.name} — R$ {Number(p.price).toFixed(2)}</option>)}
                </select>
                <input type="number" min="1" value={purchaseQty} onChange={e => setPurchaseQty(Number(e.target.value))}
                  style={{ width: '48px', padding: '7px 4px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', textAlign: 'center', background: 'var(--bg-input)', color: 'var(--text)' }} />
                <button onClick={() => {
                  if (!purchaseProductId) return
                  const prod = products.find((p: any) => p.id === purchaseProductId)
                  if (!prod) return
                  setCart(c => [...c, { productId: purchaseProductId, name: (prod as any).name, price: Number((prod as any).price), qty: purchaseQty }])
                  setPurchaseProductId(''); setPurchaseQty(1)
                }} disabled={!purchaseProductId}
                  style={{ padding: '7px 10px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: !purchaseProductId ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                  +
                </button>
              </div>

              {/* Ajustes do pedido */}
              {cart.length > 0 && (<>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginBottom: '2px' }}>Cupom</label>
                    <input value={newCoupon} onChange={e => setNewCoupon(e.target.value)} placeholder="—"
                      style={{ ...smallInput, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginBottom: '2px' }}>Desconto (−)</label>
                    <input type="number" min="0" step="0.01" value={newDiscount || ''} onChange={e => setNewDiscount(Number(e.target.value) || 0)} placeholder="0"
                      style={{ ...smallInput, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginBottom: '2px' }}>Acréscimo (+)</label>
                    <input type="number" min="0" step="0.01" value={newSurcharge || ''} onChange={e => setNewSurcharge(Number(e.target.value) || 0)} placeholder="0"
                      style={{ ...smallInput, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', color: 'var(--text-faint)', display: 'block', marginBottom: '2px' }}>Frete (+)</label>
                    <input type="number" min="0" step="0.01" value={newShipping || ''} onChange={e => setNewShipping(Number(e.target.value) || 0)} placeholder="0"
                      style={{ ...smallInput, width: '100%' }} />
                  </div>
                </div>

                {/* Resumo */}
                {(() => {
                  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0)
                  const total = Math.max(0, sub - newDiscount + newSurcharge + newShipping)
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '6px 0', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{cart.length} {cart.length === 1 ? 'produto' : 'produtos'} · Subtotal R$ {sub.toFixed(2)}</span>
                      <strong style={{ fontSize: '14px', color: '#16a34a' }}>R$ {total.toFixed(2)}</strong>
                    </div>
                  )
                })()}

                <button onClick={() => purchaseMutation.mutate()} disabled={purchaseMutation.isPending}
                  style={{ width: '100%', padding: '9px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  {purchaseMutation.isPending ? 'Registrando...' : 'Confirmar pedido'}
                </button>
              </>)}
            </div>

            {/* ── Total geral ── */}
            {contactPurchases.length > 0 && (
              <div style={{ borderTop: '2px solid var(--border)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Total</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#16a34a' }}>R$ {grandTotal.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
        )
      })()}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
