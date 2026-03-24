'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { conversationApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Loader2, MessageSquare, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

const STAGES = [
  { key: 'lead',         label: 'Lead',         color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  { key: 'qualificacao', label: 'Qualificação',  color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  { key: 'proposta',     label: 'Proposta',      color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  { key: 'negociacao',   label: 'Negociação',    color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  { key: 'ganho',        label: 'Ganho',         color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  { key: 'perdido',      label: 'Perdido',       color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
]

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

export default function PipelinePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [channelFilter, setChannelFilter] = useState('all')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)
  const [localBoard, setLocalBoard] = useState<Record<string, any[]> | null>(null)

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const { data } = await channelApi.get('/channels')
      return data.data || []
    },
  })

  const { data: board, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pipeline-board', channelFilter],
    queryFn: async () => {
      let url = '/conversations/pipeline'
      if (channelFilter !== 'all') url += `?channelId=${channelFilter}`
      const { data } = await conversationApi.get(url)
      return data.data as Record<string, any[]>
    },
    staleTime: 30000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  })

  const displayBoard = localBoard ?? board

  const totalConvs = displayBoard
    ? Object.values(displayBoard).reduce((acc, arr) => acc + arr.length, 0)
    : 0

  const moveMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      await conversationApi.patch(`/conversations/${id}/pipeline`, { stage })
    },
    onSuccess: () => {
      setLocalBoard(null)
      queryClient.invalidateQueries({ queryKey: ['pipeline-board'] })
    },
    onError: () => {
      setLocalBoard(null)
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

    // Atualização otimista
    const newBoard = { ...displayBoard }
    newBoard[sourceStage] = newBoard[sourceStage].filter((c: any) => c.id !== draggingId)
    newBoard[targetStage] = [{ ...movedConv, pipeline_stage: targetStage }, ...newBoard[targetStage]]
    setLocalBoard(newBoard)

    moveMutation.mutate({ id: draggingId, stage: targetStage })
    setDraggingId(null)
    setOverStage(null)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setOverStage(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>Pipeline</h1>
            <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '2px' }}>
              {totalConvs} conversas abertas
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {(channels as any[]).length > 1 && (
              <select
                value={channelFilter}
                onChange={e => { setChannelFilter(e.target.value); setLocalBoard(null) }}
                style={{ padding: '7px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', color: '#374151', outline: 'none', cursor: 'pointer' }}>
                <option value="all">Todos os canais</option>
                {(channels as any[]).map((ch: any) => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => { setLocalBoard(null); refetch() }}
              disabled={isFetching}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', color: '#6b7280', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'}>
              <RefreshCw size={13} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Kanban */}
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} />
        </div>
      ) : (
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: '14px', height: '100%', minWidth: 'max-content' }}>
            {STAGES.map(stage => {
              const cards = displayBoard?.[stage.key] || []
              const isOver = overStage === stage.key
              return (
                <div
                  key={stage.key}
                  onDragOver={e => handleDragOver(e, stage.key)}
                  onDrop={e => handleDrop(e, stage.key)}
                  onDragLeave={() => setOverStage(null)}
                  style={{
                    width: '240px',
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    background: isOver ? stage.bg : '#f6f8fa',
                    border: `2px solid ${isOver ? stage.color : '#e5e7eb'}`,
                    borderRadius: '12px',
                    overflow: 'hidden',
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
                    ) : (
                      cards.map((conv: any) => {
                        const name = conv.contacts?.name || conv.contacts?.phone || '??'
                        const av = getAvatarColor(name)
                        const isDragging = draggingId === conv.id
                        return (
                          <div
                            key={conv.id}
                            draggable
                            onDragStart={e => handleDragStart(e, conv.id)}
                            onDragEnd={handleDragEnd}
                            onClick={() => router.push('/dashboard/inbox')}
                            style={{
                              background: '#fff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '9px',
                              padding: '11px 12px',
                              cursor: 'grab',
                              opacity: isDragging ? 0.4 : 1,
                              boxShadow: isDragging ? 'none' : '0 1px 3px rgba(0,0,0,.06)',
                              transition: 'opacity 0.15s, box-shadow 0.15s',
                              userSelect: 'none',
                            }}
                            onMouseEnter={e => { if (!isDragging) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 3px 10px rgba(0,0,0,.1)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,.06)' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                                {getInitials(name)}
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {name}
                              </span>
                            </div>
                            {conv.last_message && (
                              <p style={{ fontSize: '11px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '7px' }}>
                                {conv.last_message}
                              </p>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              {conv.last_message_at && (
                                <span style={{ fontSize: '10px', color: '#d1d5db' }}>
                                  {new Date(conv.last_message_at).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                              {conv.unread_count > 0 && (
                                <span style={{ background: '#16a34a', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px' }}>
                                  {conv.unread_count}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
