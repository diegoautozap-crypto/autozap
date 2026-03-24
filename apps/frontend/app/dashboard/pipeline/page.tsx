'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { conversationApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Loader2, MessageSquare } from 'lucide-react'
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

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => {
      const { data } = await channelApi.get('/channels')
      return data.data || []
    },
  })

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['pipeline-conversations', channelFilter],
    queryFn: async () => {
      let url = '/conversations?status=open&limit=200'
      if (channelFilter !== 'all') url += `&channelId=${channelFilter}`
      const { data } = await conversationApi.get(url)
      return data.data || []
    },
    refetchInterval: 10000,
  })

  const moveMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      await conversationApi.patch(`/conversations/${id}/pipeline`, { stage })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-conversations'] })
    },
    onError: () => toast.error('Erro ao mover conversa'),
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

  const handleDrop = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault()
    if (!draggingId) return
    const conv = conversations.find((c: any) => c.id === draggingId)
    if (conv && conv.pipeline_stage !== stageKey) {
      moveMutation.mutate({ id: draggingId, stage: stageKey })
    }
    setDraggingId(null)
    setOverStage(null)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setOverStage(null)
  }

  const convsByStage = (stageKey: string) =>
    conversations.filter((c: any) => (c.pipeline_stage || 'lead') === stageKey)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>Pipeline</h1>
            <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '2px' }}>
              {conversations.length} conversas abertas
            </p>
          </div>
          {channels.length > 1 && (
            <select
              value={channelFilter}
              onChange={e => setChannelFilter(e.target.value)}
              style={{ padding: '7px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', color: '#374151', outline: 'none', cursor: 'pointer' }}>
              <option value="all">Todos os canais</option>
              {channels.map((ch: any) => (
                <option key={ch.id} value={ch.id}>{ch.name}</option>
              ))}
            </select>
          )}
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
              const cards = convsByStage(stage.key)
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

                  {/* Coluna header */}
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

                  {/* Cards */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                            onClick={() => router.push(`/dashboard/inbox?conv=${conv.id}`)}
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
