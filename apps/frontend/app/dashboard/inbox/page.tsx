'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { conversationApi, messageApi, contactApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import { Search, Send, Loader2, MessageSquare, Check, CheckCheck, Music, FileText, User, Phone, Clock, Tag, ChevronRight, Paperclip, X, Mic, Square } from 'lucide-react'
import Pusher from 'pusher-js'
import { createClient } from '@supabase/supabase-js'

const CONVERSATION_SERVICE_URL = process.env.NEXT_PUBLIC_CONVERSATION_SERVICE_URL || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const statusFilters = [
  { key: 'all', label: 'Todas' },
  { key: 'open', label: 'Abertas' },
  { key: 'waiting', label: 'Aguardando' },
  { key: 'closed', label: 'Fechadas' },
]

function cleanText(t: string) {
  return (t || '').replace(/\\r\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\n/g, '\n')
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
function getMediaUrl(mediaUrl: string | undefined, channelId: string | undefined): string | null {
  if (!mediaUrl) return null
  if (mediaUrl.startsWith('http')) return mediaUrl
  if (!channelId) return null
  return `${CONVERSATION_SERVICE_URL}/conversations/media/${mediaUrl}?channelId=${channelId}`
}
function getContentType(file: File): 'image' | 'audio' | 'video' | 'document' {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('video/')) return 'video'
  return 'document'
}
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(800, ctx.currentTime); osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.3, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3)
  } catch {}
}

function MessageStatusIcon({ status }: { status: string }) {
  if (status === 'read') return <CheckCheck size={11} color="#93c5fd" />
  if (status === 'delivered') return <CheckCheck size={11} color="#fff" style={{ opacity: 0.65 }} />
  if (status === 'sent') return <Check size={11} color="#fff" style={{ opacity: 0.65 }} />
  return <Check size={11} color="#fff" style={{ opacity: 0.3 }} />
}

function MessageContent({ msg, isOut, channelId }: { msg: any; isOut: boolean; channelId?: string }) {
  const tc = isOut ? '#fff' : '#111827'
  const sc = isOut ? 'rgba(255,255,255,0.65)' : '#9ca3af'
  const type = msg.content_type || 'text'
  const url = getMediaUrl(msg.media_url, channelId)
  if (type === 'image') return (
    <div>
      {url ? <img src={url} alt="img" style={{ maxWidth: '240px', borderRadius: '8px', display: 'block', cursor: 'pointer' }} onClick={() => window.open(url, '_blank')} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : <p style={{ fontSize: '13px', color: sc }}>[Imagem]</p>}
      {msg.body && <p style={{ fontSize: '13px', marginTop: '6px', color: tc, whiteSpace: 'pre-line' }}>{cleanText(msg.body)}</p>}
    </div>
  )
  if (type === 'audio') return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}><Music size={13} color={tc} /><span style={{ fontSize: '12px', color: sc }}>Áudio</span></div>
      {url ? <audio controls style={{ maxWidth: '220px', height: '34px' }}><source src={url} /></audio> : <p style={{ fontSize: '13px', color: sc }}>[Áudio não disponível]</p>}
    </div>
  )
  if (type === 'video') return (
    <div>
      {url ? <video controls style={{ maxWidth: '240px', borderRadius: '8px', display: 'block' }}><source src={url} /></video> : <p style={{ fontSize: '13px', color: sc }}>[Vídeo não disponível]</p>}
      {msg.body && <p style={{ fontSize: '13px', marginTop: '6px', color: tc }}>{cleanText(msg.body)}</p>}
    </div>
  )
  if (type === 'document') {
    const fn = msg.body || msg.media_url?.split('/')?.pop() || 'documento'
    return (
      <a href={url || '#'} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: isOut ? 'rgba(255,255,255,0.15)' : '#f3f4f6', borderRadius: '8px' }}>
          <FileText size={20} color={isOut ? '#fff' : '#6b7280'} />
          <div>
            <p style={{ fontSize: '13px', fontWeight: 500, color: tc, margin: 0 }}>{String(fn).slice(0, 30)}{String(fn).length > 30 ? '...' : ''}</p>
            <p style={{ fontSize: '11px', color: sc, margin: 0 }}>Clique para abrir</p>
          </div>
        </div>
      </a>
    )
  }
  return <p style={{ fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-line', color: tc }}>{cleanText(msg.body || '')}</p>
}

export default function InboxPage() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [messageText, setMessageText] = useState('')
  const [statusFilter, setStatusFilter] = useState('open')
  const [showProfile, setShowProfile] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<{ file: File; previewUrl: string; contentType: string } | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [convPage, setConvPage] = useState(1)
  const [allConvs, setAllConvs] = useState<any[]>([])
  const [hasMoreConvs, setHasMoreConvs] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'sa1'
    if (!key || !user) return
    const pusher = new Pusher(key, { cluster })
    const tenantId = (user as any)?.tenantId || (user as any)?.tid
    if (!tenantId) return
    const channel = pusher.subscribe(`tenant-${tenantId}`)
    channel.bind('inbound.message', (data: any) => {
      setConvPage(1)
      setAllConvs([])
      setHasMoreConvs(true)
      queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false })
      if (data?.conversationId === selectedConvId) queryClient.invalidateQueries({ queryKey: ['messages', selectedConvId] })
      playNotificationSound()
    })
    channel.bind('conversation.updated', () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false })
    })
    channel.bind('message.status', (data: any) => {
      if (data?.conversationId === selectedConvId) queryClient.invalidateQueries({ queryKey: ['messages', selectedConvId] })
    })
    return () => { channel.unbind_all(); pusher.unsubscribe(`tenant-${tenantId}`); pusher.disconnect() }
  }, [user, selectedConvId, queryClient])

  // Reset ao trocar filtro
  useEffect(() => {
    setAllConvs([])
    setConvPage(1)
    setHasMoreConvs(true)
  }, [statusFilter])

  const { data: convData, isLoading: loadingConvs } = useQuery({
    queryKey: ['conversations', statusFilter, convPage],
    queryFn: async () => {
      const url = statusFilter === 'all'
        ? `/conversations?limit=50&page=${convPage}`
        : `/conversations?status=${statusFilter}&limit=50&page=${convPage}`
      const { data } = await conversationApi.get(url)
      return data.data
    },
    refetchInterval: convPage === 1 ? 5000 : false,
  })

  useEffect(() => {
    if (!convData) return
    if (convPage === 1) {
      setAllConvs(convData)
    } else {
      setAllConvs(prev => {
        const ids = new Set(prev.map((c: any) => c.id))
        return [...prev, ...convData.filter((c: any) => !ids.has(c.id))]
      })
    }
    if (convData.length < 50) setHasMoreConvs(false)
  }, [convData, convPage])

  const handleConvScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (!hasMoreConvs || loadingConvs) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      setConvPage(p => p + 1)
    }
  }

  const { data: selectedConv } = useQuery({
    queryKey: ['conversation', selectedConvId],
    queryFn: async () => { const { data } = await conversationApi.get(`/conversations/${selectedConvId}`); return data.data },
    enabled: !!selectedConvId,
  })
  const { data: messages, isLoading: loadingMessages } = useQuery({
    queryKey: ['messages', selectedConvId],
    queryFn: async () => { const { data } = await conversationApi.get(`/conversations/${selectedConvId}/messages`); return data.data },
    enabled: !!selectedConvId,
    refetchInterval: 3000,
  })
  const contactId = selectedConv?.contact_id
  const { data: contactDetail } = useQuery({
    queryKey: ['contact', contactId],
    queryFn: async () => { const { data } = await contactApi.get(`/contacts/${contactId}`); return data.data },
    enabled: !!contactId,
  })

  const sendMutation = useMutation({
    mutationFn: async (payload: { contentType: string; body?: string; mediaUrl?: string }) => {
      if (!selectedConv) return
      await messageApi.post('/messages/send', { channelId: selectedConv.channel_id, contactId: selectedConv.contact_id, conversationId: selectedConvId, to: selectedConv.contacts?.phone, ...payload })
    },
    onSuccess: () => { setMessageText(''); setPendingFile(null); queryClient.invalidateQueries({ queryKey: ['messages', selectedConvId] }); queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false }) },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao enviar'),
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 15 * 1024 * 1024) { toast.error('Arquivo muito grande. Máximo 15MB'); return }
    setPendingFile({ file, previewUrl: URL.createObjectURL(file), contentType: getContentType(file) })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const uploadAndSend = async (file: File, contentType: string) => {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'bin'
      const path = `inbox/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' })
      if (error) throw error
      const { data: publicData } = supabase.storage.from('media').getPublicUrl(path)
      await sendMutation.mutateAsync({ contentType, mediaUrl: publicData.publicUrl })
      toast.success('Enviado!')
    } catch (err: any) {
      toast.error('Erro ao enviar: ' + (err.message || 'tente novamente'))
    } finally { setUploading(false) }
  }

  const handleSendFile = async () => { if (!pendingFile) return; await uploadAndSend(pendingFile.file, pendingFile.contentType); setPendingFile(null) }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        const file = new File([blob], `audio-${Date.now()}.ogg`, { type: 'audio/ogg' })
        stream.getTracks().forEach(t => t.stop())
        setIsRecording(false); setRecordingSeconds(0)
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
        await uploadAndSend(file, 'audio')
      }
      mediaRecorder.start(); setIsRecording(true); setRecordingSeconds(0)
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000)
    } catch { toast.error('Não foi possível acessar o microfone') }
  }

  const stopRecording = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); if (recordingTimerRef.current) clearInterval(recordingTimerRef.current) } }
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.ondataavailable = null; mediaRecorderRef.current.onstop = null; mediaRecorderRef.current.stop()
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      setIsRecording(false); setRecordingSeconds(0)
    }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  const handleSendText = () => { if (messageText.trim()) sendMutation.mutate({ contentType: 'text', body: messageText }) }
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText() } }
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSelectConv = async (convId: string) => {
    setSelectedConvId(convId); setPendingFile(null)
    await conversationApi.post(`/conversations/${convId}/read`)
    queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false })
  }

  const conversations = allConvs.filter((c: any) => !search || c.contacts?.name?.toLowerCase().includes(search.toLowerCase()) || c.contacts?.phone?.includes(search))
  const contactName = selectedConv?.contacts?.name || selectedConv?.contacts?.phone || ''
  const avatarColor = getAvatarColor(contactName)
  const channelId = selectedConv?.channel_id
  const closeConv = async () => { await conversationApi.patch(`/conversations/${selectedConvId}/status`, { status: 'closed' }); queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false }); queryClient.invalidateQueries({ queryKey: ['conversation', selectedConvId] }) }
  const openConv = async () => { await conversationApi.patch(`/conversations/${selectedConvId}/status`, { status: 'open' }); queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false }); queryClient.invalidateQueries({ queryKey: ['conversation', selectedConvId] }) }
  const btnStyle = { width: '40px', height: '40px', borderRadius: '8px', flexShrink: 0 as const, background: '#f9fafb', border: '1px solid #e5e7eb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#f6f8fa' }}>

      {/* ── Left ── */}
      <div style={{ width: '280px', flexShrink: 0, background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', marginBottom: '10px' }}>Inbox</h2>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input style={{ width: '100%', padding: '7px 10px 7px 30px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '13px', outline: 'none', color: '#111827' }} placeholder="Buscar contato..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '3px', flexShrink: 0 }}>
          {statusFilters.map(f => <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer', background: statusFilter === f.key ? '#16a34a' : 'transparent', color: statusFilter === f.key ? '#fff' : '#6b7280' }}>{f.label}</button>)}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }} onScroll={handleConvScroll}>
          {loadingConvs && convPage === 1
            ? <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} /></div>
            : conversations.length === 0
            ? <div style={{ padding: '40px', textAlign: 'center' }}><MessageSquare size={24} color="#e5e7eb" style={{ margin: '0 auto 8px' }} /><p style={{ color: '#9ca3af', fontSize: '13px' }}>Nenhuma conversa</p></div>
            : conversations.map((conv: any) => {
              const isSel = selectedConvId === conv.id
              const name = conv.contacts?.name || conv.contacts?.phone || undefined
              const av = getAvatarColor(name)
              const preview = (conv.last_message || 'Sem mensagens').startsWith('[') ? conv.last_message : cleanText(conv.last_message || '').split('\n')[0]
              return (
                <div key={conv.id} onClick={() => handleSelectConv(conv.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid #f9fafb', cursor: 'pointer', background: isSel ? '#f0fdf4' : 'transparent', borderLeft: isSel ? '3px solid #16a34a' : '3px solid transparent' }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = '#fafafa' }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                >
                  <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{getInitials(name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || '??'}</span>
                      {conv.last_message_at && <span style={{ color: '#9ca3af', fontSize: '11px', flexShrink: 0, marginLeft: '4px' }}>{new Date(conv.last_message_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</div>
                  </div>
                  {conv.unread_count > 0 && <div style={{ background: '#16a34a', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px', flexShrink: 0, minWidth: '18px', textAlign: 'center' }}>{conv.unread_count}</div>}
                </div>
              )
            })
          }
          {hasMoreConvs && loadingConvs && convPage > 1 && (
            <div style={{ padding: '12px', textAlign: 'center' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} />
            </div>
          )}
        </div>
      </div>

      {/* ── Center ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {!selectedConvId ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MessageSquare size={24} color="#d1d5db" /></div>
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Selecione uma conversa</p>
          </div>
        ) : (
          <>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: avatarColor.bg, color: avatarColor.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>{getInitials(contactName)}</div>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', lineHeight: 1.2, margin: 0 }}>{contactName || '??'}</p>
                  <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>{selectedConv?.contacts?.phone}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {selectedConv?.status !== 'closed'
                  ? <button onClick={closeConv} style={{ padding: '5px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#6b7280' }} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb' }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff' }}>Fechar</button>
                  : <button onClick={openConv} style={{ padding: '5px 12px', background: '#16a34a', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#fff', fontWeight: 600 }}>Reabrir</button>
                }
                <button onClick={() => setShowProfile(p => !p)} style={{ padding: '5px 8px', background: showProfile ? '#f0fdf4' : '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: showProfile ? '#16a34a' : '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <User size={13} /> Perfil
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px', background: '#f6f8fa' }}>
              {loadingMessages
                ? <div style={{ textAlign: 'center', padding: '40px' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} /></div>
                : messages?.length === 0
                ? <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '13px', padding: '40px' }}>Nenhuma mensagem ainda</p>
                : messages?.map((msg: any) => {
                  const isOut = msg.direction === 'outbound'
                  const isMedia = msg.content_type !== 'text'
                  return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: isMedia ? '280px' : '65%', padding: '9px 13px', borderRadius: isOut ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: isOut ? '#16a34a' : '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.06)' }}>
                        <MessageContent msg={msg} isOut={isOut} channelId={channelId} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', marginTop: '3px' }}>
                          <span style={{ fontSize: '11px', opacity: 0.65, color: isOut ? '#fff' : '#9ca3af' }}>{msg.sent_at ? new Date(msg.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          {isOut && <MessageStatusIcon status={msg.status} />}
                        </div>
                      </div>
                    </div>
                  )
                })
              }
              <div ref={messagesEndRef} />
            </div>

            {pendingFile && !isRecording && (
              <div style={{ padding: '8px 14px', background: '#f0fdf4', borderTop: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                {pendingFile.contentType === 'image'
                  ? <img src={pendingFile.previewUrl} alt="preview" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }} />
                  : <div style={{ width: '48px', height: '48px', background: '#dcfce7', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pendingFile.contentType === 'audio' ? <Music size={20} color="#16a34a" /> : <FileText size={20} color="#16a34a" />}</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.file.name}</p>
                  <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>{(pendingFile.file.size / 1024).toFixed(0)} KB • {pendingFile.contentType}</p>
                </div>
                <button onClick={handleSendFile} disabled={uploading} style={{ padding: '6px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {uploading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
                  {uploading ? 'Enviando...' : 'Enviar'}
                </button>
                <button onClick={() => setPendingFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px', display: 'flex' }}><X size={16} /></button>
              </div>
            )}

            {selectedConv?.status !== 'closed' ? (
              <div style={{ padding: '10px 14px', borderTop: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
                {isRecording ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
                    <span style={{ fontSize: '14px', color: '#ef4444', fontWeight: 600 }}>Gravando... {formatTime(recordingSeconds)}</span>
                    <div style={{ flex: 1 }} />
                    <button onClick={cancelRecording} style={{ padding: '6px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#6b7280' }}>Cancelar</button>
                    <button onClick={stopRecording} disabled={uploading} style={{ padding: '6px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {uploading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Square size={13} fill="#fff" />}
                      {uploading ? 'Enviando...' : 'Parar e enviar'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                    <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={handleFileSelect} />
                    <button onClick={() => fileInputRef.current?.click()} style={btnStyle} title="Anexar arquivo" onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6' }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb' }}><Paperclip size={16} /></button>
                    <button onClick={startRecording} style={btnStyle} title="Gravar áudio" onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; (e.currentTarget as HTMLButtonElement).style.color = '#6b7280' }}><Mic size={16} /></button>
                    <textarea
                      style={{ flex: 1, padding: '10px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', outline: 'none', color: '#111827', resize: 'none', height: '42px', lineHeight: 1.5, fontFamily: 'inherit', overflowY: 'auto' }}
                      placeholder="Digite uma mensagem... (Enter envia, Shift+Enter nova linha)"
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onFocus={e => { e.currentTarget.style.borderColor = '#16a34a'; e.currentTarget.style.background = '#fff' }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#f9fafb' }}
                    />
                    <button onClick={handleSendText} disabled={sendMutation.isPending || !messageText.trim()}
                      style={{ width: '40px', height: '40px', borderRadius: '8px', flexShrink: 0, background: messageText.trim() ? '#16a34a' : '#e5e7eb', border: 'none', cursor: messageText.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {sendMutation.isPending ? <Loader2 size={16} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} color={messageText.trim() ? '#fff' : '#9ca3af'} />}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb', background: '#fff', textAlign: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '13px', color: '#9ca3af' }}>Conversa fechada</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Right: perfil ── */}
      {selectedConvId && showProfile && (
        <div style={{ width: '240px', flexShrink: 0, background: '#fff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #f3f4f6', textAlign: 'center', flexShrink: 0 }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: avatarColor.bg, color: avatarColor.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, margin: '0 auto 10px' }}>{getInitials(contactName)}</div>
            <p style={{ fontWeight: 700, fontSize: '14px', color: '#111827', marginBottom: '2px' }}>{contactName || '??'}</p>
            <p style={{ fontSize: '12px', color: '#9ca3af' }}>{selectedConv?.contacts?.phone}</p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Informações</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Phone size={13} color="#9ca3af" />
                <div><p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Telefone</p><p style={{ fontSize: '13px', color: '#111827', margin: 0 }}>{selectedConv?.contacts?.phone || '—'}</p></div>
              </div>
              {contactDetail?.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={13} color="#9ca3af" />
                  <div><p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Email</p><p style={{ fontSize: '13px', color: '#111827', margin: 0 }}>{contactDetail.email}</p></div>
                </div>
              )}
              {contactDetail?.company && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Tag size={13} color="#9ca3af" />
                  <div><p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Empresa</p><p style={{ fontSize: '13px', color: '#111827', margin: 0 }}>{contactDetail.company}</p></div>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={13} color="#9ca3af" />
                <div><p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Última interação</p><p style={{ fontSize: '13px', color: '#111827', margin: 0 }}>{contactDetail?.last_interaction_at ? new Date(contactDetail.last_interaction_at).toLocaleDateString('pt-BR') : '—'}</p></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={13} color="#9ca3af" />
                <div>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>Status</p>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: selectedConv?.status === 'open' ? '#16a34a' : selectedConv?.status === 'closed' ? '#6b7280' : '#d97706', background: selectedConv?.status === 'open' ? '#f0fdf4' : selectedConv?.status === 'closed' ? '#f9fafb' : '#fffbeb', padding: '1px 8px', borderRadius: '99px', display: 'inline-block', marginTop: '2px' }}>
                    {selectedConv?.status === 'open' ? 'Aberta' : selectedConv?.status === 'closed' ? 'Fechada' : 'Aguardando'}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f3f4f6' }}>
              <a href="/dashboard/contacts" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#f9fafb', borderRadius: '6px', textDecoration: 'none', color: '#374151', fontSize: '13px', fontWeight: 500 }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#f3f4f6' }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = '#f9fafb' }}>
                Ver no CRM <ChevronRight size={13} />
              </a>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}