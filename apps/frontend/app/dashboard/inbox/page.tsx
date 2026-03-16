'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { conversationApi, messageApi } from '@/lib/api'
import { toast } from 'sonner'
import { Search, Send, Loader2, MessageSquare } from 'lucide-react'

const statusFilters = [
  { key: 'all', label: 'Todas' },
  { key: 'open', label: 'Abertas' },
  { key: 'waiting', label: 'Aguardando' },
  { key: 'closed', label: 'Fechadas' },
]

function cleanText(text: string) {
  return (text || '').replace(/\\r\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\n/g, '\n')
}

export default function InboxPage() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [messageText, setMessageText] = useState('')
  const [statusFilter, setStatusFilter] = useState('open')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data: convData, isLoading: loadingConvs } = useQuery({
    queryKey: ['conversations', statusFilter],
    queryFn: async () => {
      const url = statusFilter === 'all' ? '/conversations?limit=50' : `/conversations?status=${statusFilter}&limit=50`
      const { data } = await conversationApi.get(url)
      return data.data
    },
    refetchInterval: 8000,
  })

  const { data: selectedConv } = useQuery({
    queryKey: ['conversation', selectedConvId],
    queryFn: async () => {
      const { data } = await conversationApi.get(`/conversations/${selectedConvId}`)
      return data.data
    },
    enabled: !!selectedConvId,
  })

  const { data: messages, isLoading: loadingMessages } = useQuery({
    queryKey: ['messages', selectedConvId],
    queryFn: async () => {
      const { data } = await conversationApi.get(`/conversations/${selectedConvId}/messages`)
      return data.data
    },
    enabled: !!selectedConvId,
    refetchInterval: 5000,
  })

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConv) return
      await messageApi.post('/messages/send', {
        channelId: selectedConv.channel_id,
        contactId: selectedConv.contact_id,
        conversationId: selectedConvId,
        to: selectedConv.contacts?.phone,
        contentType: 'text',
        body: messageText,
      })
    },
    onSuccess: () => {
      setMessageText('')
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConvId] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao enviar'),
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSelectConv = async (convId: string) => {
    setSelectedConvId(convId)
    await conversationApi.post(`/conversations/${convId}/read`)
    queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageText.trim()) return
    sendMutation.mutate()
  }

  const conversations = (convData || []).filter((c: any) => {
    if (!search) return true
    return c.contacts?.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.contacts?.phone?.includes(search)
  })

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text)',
    fontSize: '14px',
    outline: 'none',
    padding: '10px 14px',
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>

      {/* Left column */}
      <div style={{ width: '320px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, background: 'var(--bg)' }}>

        {/* Search */}
        <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              style={{ ...inputStyle, width: '100%', paddingLeft: '32px', padding: '8px 10px 8px 32px' }}
              placeholder="Buscar contato..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Status filters */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '6px' }}>
          {statusFilters.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              style={{
                padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                border: 'none', cursor: 'pointer',
                background: statusFilter === f.key ? '#25d366' : 'var(--bg-secondary)',
                color: statusFilter === f.key ? '#fff' : 'var(--text-muted)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingConvs ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#9ca3af' }} />
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <MessageSquare size={28} color="#d1d5db" style={{ margin: '0 auto 8px' }} />
              <p style={{ color: '#9ca3af', fontSize: '13px' }}>Nenhuma conversa</p>
            </div>
          ) : (
            conversations.map((conv: any) => (
              <div
                key={conv.id}
                onClick={() => handleSelectConv(conv.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px 14px', borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: selectedConvId === conv.id ? '#25d36615' : 'transparent',
                  borderLeft: selectedConvId === conv.id ? '3px solid #25d366' : '3px solid transparent',
                }}
                onMouseEnter={e => { if (selectedConvId !== conv.id) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-secondary)' }}
                onMouseLeave={e => { if (selectedConvId !== conv.id) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  background: '#25d36620', color: '#25d366',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 700, flexShrink: 0,
                }}>
                  {conv.contacts?.name?.slice(0, 2).toUpperCase() || '??'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.contacts?.name || conv.contacts?.phone}
                    </span>
                    {conv.last_message_at && (
                      <span style={{ color: '#9ca3af', fontSize: '11px', flexShrink: 0, marginLeft: '6px' }}>
                        {new Date(conv.last_message_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                    {cleanText(conv.last_message || 'Sem mensagens').split('\n')[0]}
                  </div>
                </div>
                {conv.unread_count > 0 && (
                  <div style={{ background: '#25d366', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px', flexShrink: 0 }}>
                    {conv.unread_count}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Center: chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        {!selectedConvId ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
            <MessageSquare size={40} color="#d1d5db" />
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Selecione uma conversa</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#25d36620', color: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>
                  {selectedConv?.contacts?.name?.slice(0, 2).toUpperCase() || '??'}
                </div>
                <div>
                  <p style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 600 }}>{selectedConv?.contacts?.name || selectedConv?.contacts?.phone}</p>
                  <p style={{ color: '#9ca3af', fontSize: '12px' }}>{selectedConv?.contacts?.phone}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {selectedConv?.status !== 'closed' ? (
                  <button
                    onClick={async () => {
                      await conversationApi.patch(`/conversations/${selectedConvId}/status`, { status: 'closed' })
                      queryClient.invalidateQueries({ queryKey: ['conversations'] })
                      queryClient.invalidateQueries({ queryKey: ['conversation', selectedConvId] })
                    }}
                    style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    Fechar
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      await conversationApi.patch(`/conversations/${selectedConvId}/status`, { status: 'open' })
                      queryClient.invalidateQueries({ queryKey: ['conversations'] })
                      queryClient.invalidateQueries({ queryKey: ['conversation', selectedConvId] })
                    }}
                    style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    Reabrir
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#f8f9fb' }}>
              {loadingMessages ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#9ca3af' }} />
                </div>
              ) : messages?.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '13px', padding: '40px' }}>Nenhuma mensagem ainda</p>
              ) : (
                messages?.map((msg: any) => (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%', padding: '10px 14px', borderRadius: '12px',
                      background: msg.direction === 'outbound' ? '#25d366' : '#fff',
                      color: msg.direction === 'outbound' ? '#fff' : '#1a1f2e',
                      boxShadow: '0 1px 2px rgba(0,0,0,.1)',
                      borderBottomRightRadius: msg.direction === 'outbound' ? '2px' : '12px',
                      borderBottomLeftRadius: msg.direction === 'inbound' ? '2px' : '12px',
                    }}>
                      <p style={{ fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                        {cleanText(msg.body || '')}
                      </p>
                      <p style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7, textAlign: 'right' }}>
                        {msg.sent_at ? new Date(msg.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            {selectedConv?.status !== 'closed' && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                <form onSubmit={handleSend} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="Digite uma mensagem..."
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={sendMutation.isPending || !messageText.trim()}
                    style={{
                      width: '40px', height: '40px', borderRadius: '8px',
                      background: '#25d366', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: sendMutation.isPending || !messageText.trim() ? 0.6 : 1,
                    }}
                  >
                    {sendMutation.isPending ? <Loader2 size={16} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} color="#fff" />}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
