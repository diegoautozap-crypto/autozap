'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { conversationApi, messageApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import { Search, Send, Loader2, MessageSquare, CheckCheck, Music, FileText } from 'lucide-react'
import Pusher from 'pusher-js'

const CONVERSATION_SERVICE_URL = process.env.NEXT_PUBLIC_CONVERSATION_SERVICE_URL || ''

const statusFilters = [
  { key: 'all',     label: 'Todas' },
  { key: 'open',    label: 'Abertas' },
  { key: 'waiting', label: 'Aguardando' },
  { key: 'closed',  label: 'Fechadas' },
]

function cleanText(text: string) {
  return (text || '').replace(/\\r\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\n/g, '\n')
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

// ─── Resolve URL de mídia via proxy ──────────────────────────────────────────
function getMediaUrl(mediaUrl: string | undefined, channelId: string | undefined): string | null {
  if (!mediaUrl || !channelId) return null

  // Se já for uma URL completa (Gupshup v2), usa direto via proxy
  // Se for um ID (Meta/Gupshup v3), monta a URL do proxy
  const isUrl = mediaUrl.startsWith('http')
  if (isUrl) {
    // Mesmo URLs diretas podem precisar de auth — usa proxy
    const encoded = encodeURIComponent(mediaUrl)
    return `${CONVERSATION_SERVICE_URL}/conversations/media/${encoded}?channelId=${channelId}`
  }
  // É um mediaId — monta URL do proxy
  return `${CONVERSATION_SERVICE_URL}/conversations/media/${mediaUrl}?channelId=${channelId}`
}

// ─── Renderiza conteúdo da mensagem ──────────────────────────────────────────
function MessageContent({ msg, isOut, channelId }: { msg: any; isOut: boolean; channelId?: string }) {
  const textColor = isOut ? '#fff' : '#111827'
  const subColor = isOut ? 'rgba(255,255,255,0.65)' : '#9ca3af'
  const type = msg.content_type || 'text'
  const proxyUrl = getMediaUrl(msg.media_url, channelId)

  if (type === 'image') {
    return (
      <div>
        {proxyUrl ? (
          <img
            src={proxyUrl}
            alt="imagem"
            style={{ maxWidth: '240px', borderRadius: '8px', display: 'block', cursor: 'pointer' }}
            onClick={() => window.open(proxyUrl, '_blank')}
            onError={e => {
              const el = e.currentTarget as HTMLImageElement
              el.style.display = 'none'
              const p = document.createElement('p')
              p.style.color = textColor
              p.style.fontSize = '13px'
              p.textContent = '[Imagem não disponível]'
              el.parentNode?.appendChild(p)
            }}
          />
        ) : (
          <p style={{ fontSize: '13px', color: subColor }}>[Imagem]</p>
        )}
        {msg.body && <p style={{ fontSize: '13px', marginTop: '6px', color: textColor, whiteSpace: 'pre-line' }}>{cleanText(msg.body)}</p>}
      </div>
    )
  }

  if (type === 'audio') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <Music size={13} color={textColor} />
          <span style={{ fontSize: '12px', color: subColor }}>Áudio</span>
        </div>
        {proxyUrl ? (
          <audio controls style={{ maxWidth: '220px', height: '34px' }}>
            <source src={proxyUrl} />
          </audio>
        ) : (
          <p style={{ fontSize: '13px', color: subColor }}>[Áudio não disponível]</p>
        )}
      </div>
    )
  }

  if (type === 'video') {
    return (
      <div>
        {proxyUrl ? (
          <video controls style={{ maxWidth: '240px', borderRadius: '8px', display: 'block' }}>
            <source src={proxyUrl} />
          </video>
        ) : (
          <p style={{ fontSize: '13px', color: subColor }}>[Vídeo não disponível]</p>
        )}
        {msg.body && <p style={{ fontSize: '13px', marginTop: '6px', color: textColor }}>{cleanText(msg.body)}</p>}
      </div>
    )
  }

  if (type === 'document') {
    const fileName = msg.body || msg.media_url?.split('/')?.pop() || 'documento'
    return (
      <a href={proxyUrl || '#'} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px 12px',
          background: isOut ? 'rgba(255,255,255,0.15)' : '#f3f4f6',
          borderRadius: '8px', cursor: proxyUrl ? 'pointer' : 'default',
        }}>
          <FileText size={20} color={isOut ? '#fff' : '#6b7280'} />
          <div>
            <p style={{ fontSize: '13px', fontWeight: 500, color: textColor, margin: 0 }}>
              {String(fileName).slice(0, 30)}{String(fileName).length > 30 ? '...' : ''}
            </p>
            <p style={{ fontSize: '11px', color: subColor, margin: 0 }}>
              {proxyUrl ? 'Clique para abrir' : 'Documento'}
            </p>
          </div>
        </div>
      </a>
    )
  }

  // Texto padrão
  return (
    <p style={{ fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-line', color: textColor }}>
      {cleanText(msg.body || '')}
    </p>
  )
}

export default function InboxPage() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [messageText, setMessageText] = useState('')
  const [statusFilter, setStatusFilter] = useState('open')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  // ── Pusher realtime ───────────────────────────────────────────────────────
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'sa1'
    if (!key || !user) return

    const pusher = new Pusher(key, { cluster })
    const tenantId = (user as any)?.tenantId || (user as any)?.tid
    if (!tenantId) return

    const channel = pusher.subscribe(`tenant-${tenantId}`)

    channel.bind('inbound.message', (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false })
      if (data?.conversationId === selectedConvId) {
        queryClient.invalidateQueries({ queryKey: ['messages', selectedConvId] })
      }
    })

    channel.bind('conversation.updated', () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false })
    })

    return () => {
      channel.unbind_all()
      pusher.unsubscribe(`tenant-${tenantId}`)
      pusher.disconnect()
    }
  }, [user, selectedConvId, queryClient])

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: convData, isLoading: loadingConvs } = useQuery({
    queryKey: ['conversations', statusFilter],
    queryFn: async () => {
      const url = statusFilter === 'all' ? '/conversations?limit=50' : `/conversations?status=${statusFilter}&limit=50`
      const { data } = await conversationApi.get(url)
      return data.data
    },
    refetchInterval: 5000,
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
    refetchInterval: 3000,
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
      queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false })
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao enviar'),
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSelectConv = async (convId: string) => {
    setSelectedConvId(convId)
    await conversationApi.post(`/conversations/${convId}/read`)
    queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false })
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

  const contactName = selectedConv?.contacts?.name || selectedConv?.contacts?.phone || ''
  const avatarColor = getAvatarColor(contactName)
  const channelId = selectedConv?.channel_id

  return (
    <div style={{ display: 'flex', height: '100%', background: '#f6f8fa' }}>

      {/* ── Left: conversation list ── */}
      <div style={{ width: '300px', flexShrink: 0, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', marginBottom: '10px' }}>Inbox</h2>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              style={{ width: '100%', padding: '7px 10px 7px 30px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', outline: 'none', color: '#111827' }}
              placeholder="Buscar contato..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '4px' }}>
          {statusFilters.map(f => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer', background: statusFilter === f.key ? '#16a34a' : 'transparent', color: statusFilter === f.key ? '#fff' : '#6b7280' }}>
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingConvs ? (
            <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} /></div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <MessageSquare size={24} color="#e5e7eb" style={{ margin: '0 auto 8px' }} />
              <p style={{ color: '#9ca3af', fontSize: '13px' }}>Nenhuma conversa</p>
            </div>
          ) : (
            conversations.map((conv: any) => {
              const isSelected = selectedConvId === conv.id
              const name = conv.contacts?.name || conv.contacts?.phone || undefined
              const av = getAvatarColor(name)
              const lastMsg = conv.last_message || 'Sem mensagens'
              const lastMsgPreview = lastMsg.startsWith('[') ? lastMsg : cleanText(lastMsg).split('\n')[0]
              return (
                <div key={conv.id} onClick={() => handleSelectConv(conv.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', borderBottom: '1px solid #f9fafb', cursor: 'pointer', background: isSelected ? '#f0fdf4' : 'transparent', borderLeft: isSelected ? '3px solid #16a34a' : '3px solid transparent', transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#fafafa' }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                >
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
                    {getInitials(name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || '??'}</span>
                      {conv.last_message_at && <span style={{ color: '#9ca3af', fontSize: '11px', flexShrink: 0, marginLeft: '6px' }}>{new Date(conv.last_message_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastMsgPreview}</div>
                  </div>
                  {conv.unread_count > 0 && <div style={{ background: '#16a34a', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px', flexShrink: 0, minWidth: '18px', textAlign: 'center' }}>{conv.unread_count}</div>}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Center: chat ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!selectedConvId ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', background: '#f6f8fa' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageSquare size={24} color="#d1d5db" />
            </div>
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Selecione uma conversa</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: avatarColor.bg, color: avatarColor.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>
                  {getInitials(contactName)}
                </div>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>{contactName || '??'}</p>
                  <p style={{ fontSize: '12px', color: '#9ca3af' }}>{selectedConv?.contacts?.phone}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {selectedConv?.status !== 'closed' ? (
                  <button onClick={async () => { await conversationApi.patch(`/conversations/${selectedConvId}/status`, { status: 'closed' }); queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false }); queryClient.invalidateQueries({ queryKey: ['conversation', selectedConvId] }) }} style={{ padding: '6px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#6b7280', fontWeight: 500 }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb' }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff' }}>
                    Fechar conversa
                  </button>
                ) : (
                  <button onClick={async () => { await conversationApi.patch(`/conversations/${selectedConvId}/status`, { status: 'open' }); queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false }); queryClient.invalidateQueries({ queryKey: ['conversation', selectedConvId] }) }} style={{ padding: '6px 14px', background: '#16a34a', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#fff', fontWeight: 600 }}>
                    Reabrir
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '6px', background: '#f6f8fa' }}>
              {loadingMessages ? (
                <div style={{ textAlign: 'center', padding: '40px' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} /></div>
              ) : messages?.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '13px', padding: '40px' }}>Nenhuma mensagem ainda</p>
              ) : (
                messages?.map((msg: any) => {
                  const isOut = msg.direction === 'outbound'
                  const isMedia = msg.content_type !== 'text'
                  return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: isMedia ? '280px' : '65%', padding: '10px 14px', borderRadius: isOut ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: isOut ? '#16a34a' : '#fff', color: isOut ? '#fff' : '#111827', boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
                        <MessageContent msg={msg} isOut={isOut} channelId={channelId} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '4px' }}>
                          <span style={{ fontSize: '11px', opacity: 0.65, color: isOut ? '#fff' : '#9ca3af' }}>
                            {msg.sent_at ? new Date(msg.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                          {isOut && <CheckCheck size={12} color={isOut ? '#fff' : '#9ca3af'} style={{ opacity: 0.65 }} />}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            {selectedConv?.status !== 'closed' ? (
              <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb', background: '#fff' }}>
                <form onSubmit={handleSend} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input style={{ flex: 1, padding: '10px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', outline: 'none', color: '#111827' }} placeholder="Digite uma mensagem..." value={messageText} onChange={e => setMessageText(e.target.value)} autoFocus
                    onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = '#16a34a'; (e.currentTarget as HTMLInputElement).style.background = '#fff' }}
                    onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLInputElement).style.background = '#f9fafb' }}
                  />
                  <button type="submit" disabled={sendMutation.isPending || !messageText.trim()} style={{ width: '40px', height: '40px', borderRadius: '8px', flexShrink: 0, background: messageText.trim() ? '#16a34a' : '#e5e7eb', border: 'none', cursor: messageText.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                    {sendMutation.isPending ? <Loader2 size={16} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} color={messageText.trim() ? '#fff' : '#9ca3af'} />}
                  </button>
                </form>
              </div>
            ) : (
              <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb', background: '#fff', textAlign: 'center' }}>
                <span style={{ fontSize: '13px', color: '#9ca3af' }}>Conversa fechada</span>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
