'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { conversationApi, messageApi, contactApi, channelApi, authApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import {
  Search, Send, Loader2, MessageSquare, Check, CheckCheck, Music, FileText,
  User, Phone, Clock, Tag, ChevronRight, Paperclip, X, Mic, Square, Bot,
  UserCheck, Zap, StickyNote, Plus, Trash2, GitBranch, ChevronLeft, ShoppingBag, History,
  Mail, Pin,
} from 'lucide-react'
import { subscribeTenant } from '@/lib/pusher'
import { createClient } from '@supabase/supabase-js'
import { useT } from '@/lib/i18n'
import { usePermissions } from '@/store/permissions.store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CONVERSATION_SERVICE_URL = process.env.NEXT_PUBLIC_CONVERSATION_SERVICE_URL || ''

// statusFilters moved inside InboxPage to use i18n

function cleanText(t: string) { return (t || '').replace(/\\r\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\n/g, '\n') }
function getInitials(n: string | undefined | null) { return ((n || '??').trim().slice(0, 2)).toUpperCase() }
function getAvatarColor(n: string | undefined | null) {
  const colors = [{ bg: '#dbeafe', color: '#1d4ed8' }, { bg: '#dcfce7', color: '#15803d' }, { bg: '#fce7f3', color: '#be185d' }, { bg: '#ede9fe', color: '#6d28d9' }, { bg: '#ffedd5', color: '#c2410c' }, { bg: '#e0f2fe', color: '#0369a1' }]
  return colors[((n || '').charCodeAt(0) || 0) % colors.length]
}
function getMediaUrl(mediaUrl: string | undefined, channelId: string | undefined, tenantId?: string): string | null {
  if (!mediaUrl) return null
  if (mediaUrl.startsWith('http')) return mediaUrl
  if (!channelId) return null
  const token = localStorage.getItem('accessToken') || ''
  return `${CONVERSATION_SERVICE_URL}/conversations/media/${mediaUrl}?channelId=${channelId}&token=${token}`
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
function MessageContent({ msg, isOut, channelId, tenantId, onImageClick }: { msg: any; isOut: boolean; channelId?: string; tenantId?: string; onImageClick?: (url: string) => void }) {
  const t = useT()
  const tc = isOut ? '#fff' : 'var(--text)'
  const sc = isOut ? 'rgba(255,255,255,0.65)' : 'var(--text-faint)'
  const type = msg.content_type || 'text'
  const url = getMediaUrl(msg.media_url, channelId, tenantId)
  if (type === 'image') return (
    <div>
      {url ? <img src={url} alt="img" style={{ maxWidth: '240px', borderRadius: '8px', display: 'block', cursor: 'pointer' }} onClick={() => onImageClick?.(url)} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} /> : <p style={{ fontSize: '13px', color: sc }}>{t('inbox.mediaUnavailable') || 'Mídia indisponível'}</p>}
      {msg.body && <p style={{ fontSize: '13px', marginTop: '6px', color: tc, whiteSpace: 'pre-line' }}>{cleanText(msg.body)}</p>}
    </div>
  )
  if (type === 'audio') return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}><Music size={13} color={tc} /><span style={{ fontSize: '12px', color: sc }}>{t('inbox.audio')}</span></div>
      {url ? <audio controls style={{ maxWidth: '220px', height: '34px' }}><source src={url} /></audio> : <p style={{ fontSize: '13px', color: sc }}>{t('inbox.audioUnavailable')}</p>}
    </div>
  )
  if (type === 'video') return (
    <div>
      {url ? <video controls style={{ maxWidth: '240px', borderRadius: '8px', display: 'block' }}><source src={url} /></video> : <p style={{ fontSize: '13px', color: sc }}>{t('inbox.videoUnavailable')}</p>}
      {msg.body && <p style={{ fontSize: '13px', marginTop: '6px', color: tc }}>{cleanText(msg.body)}</p>}
    </div>
  )
  if (type === 'document') {
    const fn = msg.body || msg.media_url?.split('/')?.pop() || 'documento'
    if (!url) return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: isOut ? 'rgba(255,255,255,0.15)' : 'var(--bg)', borderRadius: '8px' }}>
        <FileText size={20} color={isOut ? '#fff' : 'var(--text-muted)'} />
        <p style={{ fontSize: '13px', color: sc, margin: 0 }}>{t('inbox.mediaUnavailable') || 'Mídia indisponível'}</p>
      </div>
    )
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: isOut ? 'rgba(255,255,255,0.15)' : 'var(--bg)', borderRadius: '8px' }}>
          <FileText size={20} color={isOut ? '#fff' : 'var(--text-muted)'} />
          <div>
            <p style={{ fontSize: '13px', fontWeight: 500, color: tc, margin: 0 }}>{String(fn).slice(0, 30)}{String(fn).length > 30 ? '...' : ''}</p>
            <p style={{ fontSize: '11px', color: sc, margin: 0 }}>{t('inbox.clickToOpen')}</p>
          </div>
        </div>
      </a>
    )
  }
  return <p style={{ fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-line', color: tc }}>{cleanText(msg.body || '')}</p>
}

const CONVERSATION_LABELS = [
  { id: 'urgent', name: 'Urgente', color: '#ef4444' },
  { id: 'waiting', name: 'Aguardando', color: '#f59e0b' },
  { id: 'callback', name: 'Retornar', color: '#3b82f6' },
  { id: 'resolved', name: 'Resolvido', color: '#22c55e' },
  { id: 'in_progress', name: 'Em andamento', color: '#8b5cf6' },
  { id: 'new_contact', name: 'Novo', color: '#06b6d4' },
]

function ConversationLabelEditor({ conversationId, currentLabels, onChanged }: { conversationId: string; currentLabels: any[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const activeIds = new Set((currentLabels || []).map((l: any) => l.id))

  const toggle = async (label: typeof CONVERSATION_LABELS[0]) => {
    setSaving(true)
    try {
      let newLabels: typeof CONVERSATION_LABELS
      if (activeIds.has(label.id)) {
        newLabels = (currentLabels || []).filter((l: any) => l.id !== label.id)
      } else {
        newLabels = [...(currentLabels || []), { id: label.id, name: label.name, color: label.color }]
      }
      await conversationApi.patch(`/conversations/${conversationId}/labels`, { labels: newLabels })
      onChanged()
    } catch { toast.error('Erro ao atualizar etiqueta') }
    setSaving(false)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        style={{ width: '24px', height: '24px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: open ? '#ede9fe' : 'var(--bg-input)', color: open ? '#8b5cf6' : 'var(--text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0, transition: 'all 0.1s' }}
        title="Etiquetas">
        <Tag size={12} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 200, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'var(--shadow)', padding: '6px', minWidth: '180px', marginTop: '4px' }}
          onClick={e => e.stopPropagation()}
          onMouseLeave={() => setOpen(false)}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', padding: '4px 8px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Etiquetas</p>
          {CONVERSATION_LABELS.map(label => {
            const active = activeIds.has(label.id)
            return (
              <div key={label.id} onClick={() => toggle(label)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', background: active ? `${label.color}12` : 'transparent' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = active ? `${label.color}20` : 'var(--bg)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = active ? `${label.color}12` : 'transparent'}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: label.color, flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: 'var(--text)', flex: 1 }}>{label.name}</span>
                {saving ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faint)' }} /> : active && <Check size={11} color={label.color} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function QuickRepliesModal({ onSelect, onClose }: { onSelect: (body: string) => void; onClose: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [search, setSearch] = useState('')

  const { data: replies = [], isLoading } = useQuery({
    queryKey: ['quick-replies'],
    queryFn: async () => { const { data } = await conversationApi.get('/quick-replies'); return data.data || [] },
  })
  const createMutation = useMutation({
    mutationFn: async () => { await conversationApi.post('/quick-replies', { title: newTitle, body: newBody }) },
    onSuccess: () => { toast.success(t('inbox.quickReplySaved')); queryClient.invalidateQueries({ queryKey: ['quick-replies'] }); setNewTitle(''); setNewBody(''); setShowForm(false) },
    onError: () => toast.error(t('inbox.quickReplyError')),
  })
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await conversationApi.delete(`/quick-replies/${id}`) },
    onSuccess: () => { toast.success(t('inbox.quickReplyDeleted')); queryClient.invalidateQueries({ queryKey: ['quick-replies'] }) },
  })
  const filtered = replies.filter((r: any) => !search || r.title.toLowerCase().includes(search.toLowerCase()) || r.body.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ position: 'absolute', bottom: '60px', left: '14px', right: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: 'var(--shadow)', zIndex: 50, maxHeight: '360px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Zap size={14} color="#22c55e" /><span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{t('inbox.quickReplies')}</span></div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setShowForm(!showForm)} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#16a34a', fontWeight: 600 }}><Plus size={12} /> {t('inbox.new')}</button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-faint)', display: 'flex' }}><X size={16} /></button>
        </div>
      </div>
      {showForm && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--divider)', background: 'var(--bg-input)', flexShrink: 0 }}>
          <input style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', outline: 'none', marginBottom: '6px', boxSizing: 'border-box' as const, color: 'var(--text)' }} placeholder={t('inbox.quickReplyTitlePlaceholder')} value={newTitle} onChange={e => setNewTitle(e.target.value)} />
          <textarea style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', outline: 'none', resize: 'none' as const, height: '60px', boxSizing: 'border-box' as const, color: 'var(--text)' }} placeholder={t('inbox.quickReplyBodyPlaceholder')} value={newBody} onChange={e => setNewBody(e.target.value)} />
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <button onClick={() => createMutation.mutate()} disabled={!newTitle || !newBody || createMutation.isPending} style={{ padding: '5px 14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: (!newTitle || !newBody) ? 0.5 : 1 }}>{t('common.save')}</button>
            <button onClick={() => setShowForm(false)} style={{ padding: '5px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-muted)' }}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
        <input style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const, color: 'var(--text)' }} placeholder={t('inbox.searchShort')} value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? <div style={{ padding: '20px', textAlign: 'center' }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faintest)' }} /></div>
          : filtered.length === 0 ? <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px' }}>{(replies as any[]).length === 0 ? t('inbox.noQuickReplies') : t('inbox.noResults')}</div>
          : filtered.map((r: any) => (
            <div key={r.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--divider)', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: '8px' }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}>
              <div style={{ flex: 1 }} onClick={() => { onSelect(r.body); onClose() }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', margin: '0 0 2px' }}>{r.title}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.body}</p>
              </div>
              <button onClick={e => { e.stopPropagation(); deleteMutation.mutate(r.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-faintest)', flexShrink: 0, display: 'flex' }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faintest)'}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
      </div>
    </div>
  )
}

function InboxTagEditor({ contactId, contactTags, onChanged }: { contactId: string; contactTags: any[]; onChanged: () => void }) {
  const t = useT()
  const { user } = useAuthStore()
  const tenantId = (user as any)?.tenantId || (user as any)?.tid
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  const { data: allTags = [] } = useQuery({
    queryKey: ['tags-inbox', tenantId],
    queryFn: async () => { const { data } = await contactApi.get('/tags'); return data.data || [] },
    enabled: !!tenantId,
    staleTime: 5000,
  })
  const activeIds = new Set(contactTags.map((t: any) => t.id))
  const toggle = async (tag: any) => {
    setLoading(tag.id)
    try {
      if (activeIds.has(tag.id)) await contactApi.delete(`/contacts/${contactId}/tags`, { data: { tagIds: [tag.id] } })
      else await contactApi.post(`/contacts/${contactId}/tags`, { tagIds: [tag.id] })
      onChanged()
    } catch { toast.error(t('inbox.tagError')) }
    setLoading(null)
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
        {contactTags.map((tag: any) => (
          <span key={tag.id} style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: `${tag.color || '#6b7280'}18`, color: tag.color || '#6b7280', border: `1px solid ${tag.color || '#6b7280'}40`, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {tag.name}
            <span onClick={() => toggle(tag)} style={{ cursor: 'pointer', opacity: 0.6, lineHeight: 1, fontSize: '13px' }}>×</span>
          </span>
        ))}
        <span onClick={() => setOpen(o => !o)} style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          <Plus size={10} /> tag
        </span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'var(--shadow)', padding: '6px', minWidth: '160px', marginTop: '4px' }}
          onMouseLeave={() => setOpen(false)}>
          {(allTags as any[]).length === 0
            ? <p style={{ fontSize: '12px', color: 'var(--text-faint)', padding: '6px 8px', margin: 0 }}>{t('inbox.noTagsCreated')}</p>
            : (allTags as any[]).map((tag: any) => {
              const active = activeIds.has(tag.id)
              return (
                <div key={tag.id} onClick={() => toggle(tag)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', background: active ? `${tag.color}12` : 'transparent' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = active ? `${tag.color}20` : 'var(--bg)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = active ? `${tag.color}12` : 'transparent'}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: tag.color || '#6b7280', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--text)', flex: 1 }}>{tag.name}</span>
                  {loading === tag.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faint)' }} /> : active && <Check size={11} color={tag.color || '#22c55e'} />}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

export default function InboxPage() {
  const t = useT()
  const { canEdit } = usePermissions()
  const statusFilters = [
    { key: 'all',     label: t('inbox.all') },
    { key: 'open',    label: t('inbox.open') },
    { key: 'waiting', label: t('inbox.waiting') },
    { key: 'closed',  label: t('inbox.closed') },
  ]
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [mobileShowChat, setMobileShowChat] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [search, setSearch] = useState('')
  const [chatSearch, setChatSearch] = useState('')
  const [showChatSearch, setShowChatSearch] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [sendChannelId, setSendChannelId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [inputMode, setInputMode] = useState<'message' | 'note'>('message')
  const [statusFilter, setStatusFilter] = useState('open')
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkMode, setBulkMode] = useState(false)
  const [channelFilter, setChannelFilter] = useState('all')
  const [showProfile, setShowProfile] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<{ file: File; previewUrl: string; contentType: string } | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [convPage, setConvPage] = useState(1)
  const [allConvs, setAllConvs] = useState<any[]>([])
  const [hasMoreConvs, setHasMoreConvs] = useState(true)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [inboxFilter, setInboxFilter] = useState<'all' | 'unanswered' | 'mine' | 'waiting'>('all')
  const [labelFilter, setLabelFilter] = useState<string>('all')
  const [showLabelFilter, setShowLabelFilter] = useState(false)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('autozap-pinned') || '[]')) } catch { return new Set() }
  })
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)
  const dragCounterRef = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const tenantId = (user as any)?.tenantId || (user as any)?.tid
  const role = (user as any)?.role || 'agent'

  const { data: userPerms } = useQuery({
    queryKey: ['my-permissions'],
    queryFn: async () => { const { data } = await authApi.get('/auth/me'); return data?.data?.permissions || null },
    enabled: !!user && role !== 'admin' && role !== 'owner',
  })
  const allowedChannels: string[] = userPerms?.allowed_channels || []
  useEffect(() => { if (allowedChannels.length === 1 && channelFilter === 'all') setChannelFilter(allowedChannels[0]) }, [allowedChannels.join(',')])
  useEffect(() => { localStorage.setItem('autozap-pinned', JSON.stringify([...pinnedIds])) }, [pinnedIds])

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data },
  })
  const visibleChannels = (channels || []).filter((ch: any) => allowedChannels.length === 0 || allowedChannels.includes(ch.id))

  const { data: statusCounts } = useQuery({
    queryKey: ['conversations-counts', channelFilter],
    queryFn: async () => {
      const params = channelFilter !== 'all' ? `?channelId=${channelFilter}` : ''
      const { data } = await conversationApi.get(`/conversations/counts${params}`)
      return data.data as { all: number; open: number; waiting: number; closed: number }
    },
    staleTime: 10000,
    refetchInterval: 15000,
  })

  // ── Pusher WebSocket — substitui todo o polling ───────────────────────────
  useEffect(() => {
    if (!user || !tenantId) return
    const channel = subscribeTenant(tenantId)
    if (!channel) return
    const onInbound = (data: any) => {
      setConvPage(1); setAllConvs([]); setHasMoreConvs(true)
      queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['conversations-counts'] })
      if (data?.conversationId === selectedConvId) queryClient.invalidateQueries({ queryKey: ['messages', selectedConvId] })
      playNotificationSound()
    }
    const onConvUpdated = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['conversations-counts'] })
      queryClient.invalidateQueries({ queryKey: ['conv-pipeline'] })
      if (data?.conversationId === selectedConvId) queryClient.invalidateQueries({ queryKey: ['conversation', selectedConvId] })
    }
    const onStatus = (data: any) => {
      if (data?.conversationId === selectedConvId) queryClient.invalidateQueries({ queryKey: ['messages', selectedConvId] })
    }
    channel.bind('inbound.message', onInbound)
    channel.bind('conversation.updated', onConvUpdated)
    channel.bind('message.status', onStatus)
    return () => { channel.unbind('inbound.message', onInbound); channel.unbind('conversation.updated', onConvUpdated); channel.unbind('message.status', onStatus) }
  }, [user, selectedConvId, queryClient, tenantId])

  useEffect(() => { setAllConvs([]); setConvPage(1); setHasMoreConvs(true) }, [statusFilter, channelFilter])

  const { data: convData, isLoading: loadingConvs } = useQuery({
    queryKey: ['conversations', statusFilter, channelFilter, convPage],
    queryFn: async () => {
      let url = statusFilter === 'all' ? `/conversations?limit=50&page=${convPage}` : `/conversations?status=${statusFilter}&limit=50&page=${convPage}`
      if (channelFilter !== 'all') url += `&channelId=${channelFilter}`
      const { data } = await conversationApi.get(url)
      return data.data
    },
    // ✅ sem refetchInterval — Pusher cuida das atualizações
  })

  useEffect(() => {
    if (!convData) return
    if (convPage === 1) { setAllConvs(convData) } else {
      setAllConvs(prev => { const ids = new Set(prev.map((c: any) => c.id)); return [...prev, ...convData.filter((c: any) => !ids.has(c.id))] })
    }
    if (convData.length < 50) setHasMoreConvs(false)
  }, [convData, convPage])

  const handleConvScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (!hasMoreConvs || loadingConvs) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) setConvPage(p => p + 1)
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
    // ✅ sem refetchInterval — Pusher invalida via inbound.message e message.status
  })

  const { data: notes = [] } = useQuery({
    queryKey: ['notes', selectedConvId],
    queryFn: async () => { const { data } = await conversationApi.get(`/conversations/${selectedConvId}/notes`); return data.data || [] },
    enabled: !!selectedConvId,
  })
  const { data: convTasks = [] } = useQuery({
    queryKey: ['tasks', selectedConvId],
    queryFn: async () => { const { data } = await conversationApi.get(`/tasks?conversationId=${selectedConvId}`); return data.data || [] },
    enabled: !!selectedConvId,
  })
  // ── Purchases ──
  const [showAddPurchase, setShowAddPurchase] = useState(false)
  const [purchaseProductId, setPurchaseProductId] = useState('')
  const [purchaseQty, setPurchaseQty] = useState('1')
  const contactIdForPurchases = selectedConv?.contact_id
  const { data: contactPurchases = [] } = useQuery<any[]>({
    queryKey: ['purchases', contactIdForPurchases],
    queryFn: async () => { const { data } = await contactApi.get(`/contacts/${contactIdForPurchases}/purchases`); return data.data || [] },
    enabled: !!contactIdForPurchases,
  })
  const { data: allProducts = [] } = useQuery<any[]>({
    queryKey: ['products-list'],
    queryFn: async () => { const { data } = await contactApi.get('/products'); return data.data || [] },
    staleTime: 60000,
  })
  const addPurchaseMutation = useMutation({
    mutationFn: async () => {
      await contactApi.post('/purchases', {
        contactId: contactIdForPurchases, productId: purchaseProductId,
        quantity: parseInt(purchaseQty) || 1, conversationId: selectedConvId,
      })
    },
    onSuccess: () => {
      toast.success('Compra registrada!')
      setPurchaseProductId(''); setPurchaseQty('1'); setShowAddPurchase(false)
      queryClient.invalidateQueries({ queryKey: ['purchases', contactIdForPurchases] })
      queryClient.invalidateQueries({ queryKey: ['purchases-summary'] })
      queryClient.invalidateQueries({ queryKey: ['purchases-by-contact'] })
    },
    onError: () => toast.error('Erro ao registrar compra'),
  })
  const deletePurchaseMutation = useMutation({
    mutationFn: async (purchaseId: string) => { await contactApi.delete(`/purchases/${purchaseId}`) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases', contactIdForPurchases] })
      queryClient.invalidateQueries({ queryKey: ['purchases-summary'] })
    },
    onError: () => toast.error('Erro ao remover compra'),
  })
  const contactTotalSpent = contactPurchases.reduce((acc: number, p: any) => acc + Number(p.total_price || 0), 0)
  const saveNoteMutation = useMutation({
    mutationFn: async () => { await conversationApi.post(`/conversations/${selectedConvId}/notes`, { body: noteText }) },
    onSuccess: () => { toast.success('Nota salva!'); setNoteText(''); queryClient.invalidateQueries({ queryKey: ['notes', selectedConvId] }) },
    onError: () => toast.error('Erro ao salvar nota'),
  })
  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => { await conversationApi.delete(`/conversations/${selectedConvId}/notes/${noteId}`) },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes', selectedConvId] }),
    onError: () => toast.error('Erro ao deletar nota'),
  })

  const contactId = selectedConv?.contact_id
  const { data: contactDetail } = useQuery({
    queryKey: ['contact', contactId],
    queryFn: async () => { const { data } = await contactApi.get(`/contacts/${contactId}`); return data.data },
    enabled: !!contactId,
  })
  const contactTags = (contactDetail?.contact_tags || []).map((ct: any) => ct.tags).filter(Boolean)
  const botActive = selectedConv?.bot_active !== false

  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields-inbox'],
    queryFn: async () => { const { data } = await conversationApi.get('/custom-fields'); return data.data || [] },
    staleTime: 60000,
    enabled: !!contactId,
  })

  const { data: pipelineInfo } = useQuery({
    queryKey: ['conv-pipeline', selectedConvId, selectedConv?.pipeline_stage, selectedConv?.pipeline_id],
    queryFn: async () => {
      if (!selectedConv?.pipeline_stage) return null
      const params = new URLSearchParams()
      if (selectedConv.pipeline_id) params.set('pipelineId', selectedConv.pipeline_id)
      const { data } = await conversationApi.get(`/pipeline-columns?${params.toString()}`)
      const columns = data.data || []
      const col = columns.find((c: any) => c.key === selectedConv.pipeline_stage)
      let pipelineName = 'Principal'
      if (selectedConv.pipeline_id) {
        const { data: pipData } = await conversationApi.get('/pipelines')
        const pip = (pipData.data || []).find((p: any) => p.id === selectedConv.pipeline_id)
        if (pip?.name) pipelineName = pip.name
      }
      return { pipelineName, columnLabel: col?.label || selectedConv.pipeline_stage, columnColor: col?.color || '#6b7280' }
    },
    enabled: !!selectedConvId && !!selectedConv?.pipeline_stage,
  })

  const { data: teamMembers } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => { const { data } = await authApi.get('/auth/team'); return data.data || [] },
    enabled: !!selectedConvId || bulkMode,
  })
  const assignMutation = useMutation({
    mutationFn: async (userId: string | null) => { await conversationApi.patch(`/conversations/${selectedConvId}/assign`, { userId }) },
    onSuccess: () => { toast.success('Conversa atribuída!'); queryClient.invalidateQueries({ queryKey: ['conversation', selectedConvId] }); queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false }) },
    onError: () => toast.error('Erro ao atribuir'),
  })
  const takeOverMutation = useMutation({
    mutationFn: async () => { await messageApi.post(`/messages/conversations/${selectedConvId}/take-over`, {}) },
    onSuccess: () => { toast.success('Você assumiu a conversa — bot pausado'); queryClient.invalidateQueries({ queryKey: ['conversation', selectedConvId] }); queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false }) },
    onError: () => toast.error('Erro ao assumir conversa'),
  })
  const releaseBotMutation = useMutation({
    mutationFn: async () => { await messageApi.post(`/messages/conversations/${selectedConvId}/release-bot`, {}) },
    onSuccess: () => { toast.success('Bot reativado com sucesso'); queryClient.invalidateQueries({ queryKey: ['conversation', selectedConvId] }); queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false }) },
    onError: () => toast.error('Erro ao liberar bot'),
  })
  const sendMutation = useMutation({
    mutationFn: async (payload: { contentType: string; body?: string; mediaUrl?: string }) => {
      if (!selectedConv) return
      if (role !== 'admin' && role !== 'owner' && allowedChannels.length > 0) {
        if (!allowedChannels.includes(selectedConv.channel_id)) throw new Error('Sem permissão para enviar neste canal')
      }
      await messageApi.post('/messages/send', { channelId: sendChannelId || selectedConv.channel_id, contactId: selectedConv.contact_id, conversationId: selectedConvId, to: selectedConv.contacts?.phone, ...payload })
    },
    onSuccess: () => {
      setMessageText(''); setPendingFile(null)
      queryClient.setQueryData(['conversation', selectedConvId], (old: any) => { if (!old) return old; return { ...old, status: 'open' } })
      queryClient.setQueriesData({ queryKey: ['conversations'], exact: false }, (old: any) => { if (!Array.isArray(old)) return old; return old.map((c: any) => c.id === selectedConvId ? { ...c, status: 'open' } : c) })
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConvId] })
      queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false })
      queryClient.invalidateQueries({ queryKey: ['conversations-counts'] })
      if (botActive && selectedConvId) {
        messageApi.post(`/messages/conversations/${selectedConvId}/take-over`, {})
          .then(() => { queryClient.invalidateQueries({ queryKey: ['conversation', selectedConvId] }); queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false }) })
          .catch(() => {})
      }
    },
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
      mediaRecorderRef.current = mediaRecorder; audioChunksRef.current = []
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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (inputMode === 'message') handleSendText(); else if (noteText.trim()) saveNoteMutation.mutate() }
  }
  // Quick replies with "/" shortcut — fetch for inline dropdown
  const { data: quickRepliesData = [] } = useQuery({
    queryKey: ['quick-replies'],
    queryFn: async () => { const { data } = await conversationApi.get('/quick-replies'); return data.data || [] },
    staleTime: 30000,
  })
  const slashActive = inputMode === 'message' && messageText.startsWith('/')
  const filteredSlashReplies = slashActive
    ? quickRepliesData.filter((r: any) => {
        const q = messageText.slice(1).toLowerCase()
        return !q || r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q)
      })
    : []
  const handleSlashSelect = (body: string) => {
    const replaced = body.replace(/\{\{nome\}\}/gi, contactName || '')
    setMessageText(replaced)
  }
  // Drag-and-drop file handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) setIsDraggingFile(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setIsDraggingFile(false)
  }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current = 0; setIsDraggingFile(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.size > 15 * 1024 * 1024) { toast.error('Arquivo muito grande. Maximo 15MB'); return }
    setPendingFile({ file, previewUrl: URL.createObjectURL(file), contentType: getContentType(file) })
  }
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, notes])

  const handleSelectConv = async (convId: string) => {
    setSelectedConvId(convId); setMobileShowChat(true); setPendingFile(null); setShowQuickReplies(false); setSendChannelId(null); setShowChatSearch(false); setChatSearch('')
    await conversationApi.post(`/conversations/${convId}/read`)
    queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false })
  }

  const conversations = allConvs
    .filter((c: any) => !search || c.contacts?.name?.toLowerCase().includes(search.toLowerCase()) || c.contacts?.phone?.includes(search))
    .filter((c: any) => {
      if (inboxFilter === 'unanswered') return c.unread_count > 0
      if (inboxFilter === 'mine') return c.assigned_to === (user as any)?.id
      if (inboxFilter === 'waiting') return c.status === 'waiting'
      return true
    })
    .filter((c: any) => {
      if (labelFilter === 'all') return true
      if (labelFilter === 'none') return !c.labels || c.labels.length === 0
      return (c.labels || []).some((l: any) => l.id === labelFilter)
    })
    .sort((a: any, b: any) => {
      const aPinned = pinnedIds.has(a.id) ? 1 : 0
      const bPinned = pinnedIds.has(b.id) ? 1 : 0
      return bPinned - aPinned
    })
  const selectedChannelName = channels?.find((ch: any) => ch.id === selectedConv?.channel_id)?.name
  const contactName = selectedConv?.contacts?.name || selectedConv?.contacts?.phone || ''
  const avatarColor = getAvatarColor(contactName)
  const channelId = selectedConv?.channel_id
  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === 'Escape') { setLightboxUrl(null); if (isMobile) setMobileShowChat(false) }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchInputRef.current?.focus() }
      if (!isInput && !e.ctrlKey && !e.metaKey) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const idx = conversations.findIndex((c: any) => c.id === selectedConvId)
          const next = e.key === 'ArrowDown' ? Math.min(idx + 1, conversations.length - 1) : Math.max(idx - 1, 0)
          if (conversations[next]) handleSelectConv(conversations[next].id)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [conversations, selectedConvId, isMobile])

  const closeConv = async () => { await conversationApi.patch(`/conversations/${selectedConvId}/status`, { status: 'closed' }); queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false }); queryClient.invalidateQueries({ queryKey: ['conversation', selectedConvId] }); queryClient.invalidateQueries({ queryKey: ['conversations-counts'] }) }
  const openConv = async () => { await conversationApi.patch(`/conversations/${selectedConvId}/status`, { status: 'open' }); queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false }); queryClient.invalidateQueries({ queryKey: ['conversation', selectedConvId] }); queryClient.invalidateQueries({ queryKey: ['conversations-counts'] }) }

  const btnStyle: React.CSSProperties = { width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', transition: 'all 0.1s' }

  return (
    <div className="inbox-layout" style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg)', ...(isMobile ? { flexDirection: 'column', paddingTop: '48px' } : {}) }}>

      {/* ── Coluna esquerda ── */}
      <div className="inbox-list" style={{ width: isMobile ? '100%' : '300px', flexShrink: 0, background: 'var(--bg-card)', borderRight: isMobile ? 'none' : '1px solid var(--border)', display: isMobile && mobileShowChat ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
          <div className="mobile-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: 0 }}>{t('inbox.title')}</h2>
            {canEdit('/dashboard/inbox') && (
            <button onClick={() => { setBulkMode(p => !p); setBulkSelected(new Set()) }} title={t('inbox.selectConversations')}
              style={{ width: '28px', height: '28px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: bulkMode ? '#22c55e' : 'transparent', color: bulkMode ? '#fff' : 'var(--text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}
              onMouseEnter={e => { if (!bulkMode) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)' }}
              onMouseLeave={e => { if (!bulkMode) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
              <CheckCheck size={15} />
            </button>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
            <input ref={searchInputRef} style={{ width: '100%', padding: '7px 10px 7px 30px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text)', boxSizing: 'border-box' as const }} placeholder={`${t('inbox.searchContact')} (Ctrl+K)`} value={search} onChange={e => setSearch(e.target.value)}
              onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = 'var(--bg-card)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-input)' }} />
          </div>
        </div>
        {visibleChannels.length > 1 && (
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
            <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}>
              <option value="all">{t('inbox.allChannels')}</option>
              {visibleChannels.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--divider)', display: 'flex', gap: '3px', flexShrink: 0, alignItems: 'center' }}>
          {statusFilters.map(f => {
            const count = statusCounts?.[f.key as keyof typeof statusCounts]
            const isActive = statusFilter === f.key
            const showBadge = count != null && (f.key !== 'all' || count > 0)
            return (
              <button key={f.key} onClick={() => setStatusFilter(f.key)}
                style={{ flex: 1, padding: '5px 4px', borderRadius: '7px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer', background: isActive ? '#22c55e' : 'transparent', color: isActive ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', whiteSpace: 'nowrap', transition: 'all 0.1s' }}>
                {f.label}
                {showBadge && <span style={{ fontSize: '10px', fontWeight: 700, background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg)', color: isActive ? '#fff' : 'var(--text-muted)', padding: '0px 5px', borderRadius: '99px', lineHeight: '16px', flexShrink: 0 }}>{count > 99 ? '99+' : count}</span>}
              </button>
            )
          })}
        </div>
        {/* Barra de ações em massa */}
        {bulkMode && (
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #e0f2fe', background: '#f0f9ff', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: bulkSelected.size > 0 ? '6px' : 0 }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#0369a1' }}>
                {bulkSelected.size > 0 ? `${bulkSelected.size} ${bulkSelected.size > 1 ? t('inbox.selectedPlural') : t('inbox.selected')}` : t('inbox.selectConversations')}
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => { const all = conversations.map((c: any) => c.id); setBulkSelected(prev => prev.size === all.length ? new Set() : new Set(all)) }}
                  style={{ padding: '3px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 600, border: '1px solid #bae6fd', background: 'var(--bg-card)', color: '#0369a1', cursor: 'pointer' }}>
                  {bulkSelected.size === conversations.length ? t('inbox.noneSelected') : t('inbox.all')}
                </button>
                <button onClick={() => { setBulkMode(false); setBulkSelected(new Set()) }}
                  style={{ padding: '3px 6px', borderRadius: '5px', border: '1px solid #bae6fd', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                  <X size={12} />
                </button>
              </div>
            </div>
            {canEdit('/dashboard/inbox') && bulkSelected.size > 0 && (
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={async () => {
                  await conversationApi.post('/conversations/bulk/read', { ids: Array.from(bulkSelected) })
                  toast.success(`${bulkSelected.size} marcadas como lidas`)
                  setAllConvs(prev => prev.map(c => bulkSelected.has(c.id) ? { ...c, unread_count: 0 } : c))
                  setBulkSelected(new Set())
                  queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false })
                  queryClient.invalidateQueries({ queryKey: ['conversations-counts'] })
                }} style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: '1px solid #bae6fd', background: 'var(--bg-card)', color: '#0369a1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <Check size={11} /> Lidas
                </button>
                <div style={{ flex: 1, position: 'relative' }}>
                  <button onClick={() => setBulkAssignOpen(p => !p)}
                    style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: '1px solid #bae6fd', background: 'var(--bg-card)', color: '#0369a1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <UserCheck size={11} /> Atribuir
                  </button>
                  {bulkAssignOpen && (
                    <>
                      <div onClick={() => setBulkAssignOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                      <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '140px', marginTop: '4px' }}>
                        {(teamMembers || []).filter((m: any) => m.is_active).map((m: any) => (
                          <button key={m.id} onClick={async () => {
                            await conversationApi.post('/conversations/bulk/assign', { ids: Array.from(bulkSelected), userId: m.id })
                            toast.success(`${bulkSelected.size} atribuídas a ${m.name}`); setBulkSelected(new Set()); setBulkAssignOpen(false); queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false })
                          }} style={{ width: '100%', padding: '5px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 500, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--text)', textAlign: 'left' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            {m.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <button onClick={async () => {
                  await conversationApi.post('/conversations/bulk/close', { ids: Array.from(bulkSelected) })
                  toast.success(`${bulkSelected.size} fechadas`); setBulkSelected(new Set()); setBulkMode(false); queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false }); queryClient.invalidateQueries({ queryKey: ['conversations-counts'] })
                }} style={{ flex: 1, padding: '5px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: '1px solid #fecaca', background: 'var(--bg-card)', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  Fechar
                </button>
              </div>
            )}
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto' }} onScroll={handleConvScroll}>
          {loadingConvs && convPage === 1
            ? <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faintest)' }} /></div>
            : conversations.length === 0
            ? <div style={{ padding: '40px', textAlign: 'center' }}><div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}><MessageSquare size={18} color="var(--text-faintest)" /></div><p style={{ color: 'var(--text-faint)', fontSize: '13px' }}>{t('inbox.noConversations')}</p></div>
            : conversations.map((conv: any) => {
              const isSel = selectedConvId === conv.id
              const name = conv.contacts?.name || conv.contacts?.phone || undefined
              const av = getAvatarColor(name)
              const preview = (conv.last_message || t('inbox.noMessages')).startsWith('[') ? conv.last_message : cleanText(conv.last_message || '').split('\n')[0]
              const convChannelName = channels?.find((ch: any) => ch.id === conv.channel_id)?.name
              const convBotActive = conv.bot_active !== false
              return (
                <div key={conv.id} onClick={() => bulkMode ? setBulkSelected(prev => { const next = new Set(prev); next.has(conv.id) ? next.delete(conv.id) : next.add(conv.id); return next }) : handleSelectConv(conv.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', borderBottom: '1px solid var(--divider)', cursor: 'pointer', background: bulkSelected.has(conv.id) ? '#eff6ff' : isSel ? '#f0fdf4' : 'transparent', borderLeft: `3px solid ${isSel && !bulkMode ? '#22c55e' : 'transparent'}`, transition: 'background 0.1s', position: 'relative' }}
                  onMouseEnter={e => { setHoveredConvId(conv.id); if (!isSel && !bulkSelected.has(conv.id)) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card-hover)' }}
                  onMouseLeave={e => { setHoveredConvId(null); if (!isSel && !bulkSelected.has(conv.id)) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}>
                  {bulkMode && (
                    <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${bulkSelected.has(conv.id) ? '#22c55e' : 'var(--text-faintest)'}`, background: bulkSelected.has(conv.id) ? '#22c55e' : 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.1s' }}>
                      {bulkSelected.has(conv.id) && <Check size={11} color="#fff" strokeWidth={3} />}
                    </div>
                  )}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>{getInitials(name)}</div>
                    {!convBotActive && <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '14px', height: '14px', borderRadius: '50%', background: '#f97316', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={t('inbox.botPaused')}><UserCheck size={8} color="#fff" /></div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || '??'}</span>
                      {conv.last_message_at && <span style={{ color: 'var(--text-faint)', fontSize: '11px', flexShrink: 0, marginLeft: '4px' }}>{new Date(conv.last_message_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginBottom: '1px' }}>
                      {convChannelName && channelFilter === 'all' && <span style={{ fontSize: '10px', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', padding: '1px 5px', borderRadius: '4px', display: 'inline-block' }}>{convChannelName}</span>}
                      {(conv.labels || []).map((label: any) => (
                        <span key={label.id} style={{ fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px', background: `${label.color}18`, color: label.color, border: `1px solid ${label.color}30`, display: 'inline-flex', alignItems: 'center', gap: '3px', lineHeight: '14px' }}>
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: label.color, display: 'inline-block', flexShrink: 0 }} />
                          {label.name}
                        </span>
                      ))}
                    </div>
                    <div style={{ color: 'var(--text-faint)', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</div>
                  </div>
                  {pinnedIds.has(conv.id) && <span style={{ fontSize: '12px', flexShrink: 0, lineHeight: 1 }} title="Fixada">📌</span>}
                  {hoveredConvId === conv.id && !bulkMode && (
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <ConversationLabelEditor conversationId={conv.id} currentLabels={conv.labels || []} onChanged={() => { queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false }); queryClient.invalidateQueries({ queryKey: ['conversation', conv.id] }) }} />
                      <button onClick={(e) => { e.stopPropagation(); setPinnedIds(prev => { const next = new Set(prev); next.has(conv.id) ? next.delete(conv.id) : next.add(conv.id); return next }) }}
                        title={pinnedIds.has(conv.id) ? 'Desafixar' : 'Fixar'}
                        style={{ width: '24px', height: '24px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: pinnedIds.has(conv.id) ? '#fef3c7' : 'var(--bg-input)', color: pinnedIds.has(conv.id) ? '#d97706' : 'var(--text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0, transition: 'all 0.1s' }}>
                        <Pin size={12} />
                      </button>
                      <button onClick={async (e) => { e.stopPropagation(); await conversationApi.post(`/conversations/${conv.id}/unread`); queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false }) }}
                        title="Marcar como nao lida"
                        style={{ width: '24px', height: '24px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--bg-input)', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0, transition: 'all 0.1s' }}>
                        <Mail size={12} />
                      </button>
                    </div>
                  )}
                  {conv.unread_count > 0 && <div style={{ background: '#22c55e', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px', flexShrink: 0, minWidth: '18px', textAlign: 'center' }}>{conv.unread_count}</div>}
                </div>
              )
            })
          }
          {hasMoreConvs && loadingConvs && convPage > 1 && <div style={{ padding: '12px', textAlign: 'center' }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faintest)' }} /></div>}
        </div>
      </div>

      {/* ── Centro — chat ── */}
      <div className="inbox-chat" style={{ flex: 1, display: isMobile && !mobileShowChat ? 'none' : 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', width: isMobile ? '100%' : undefined, position: 'relative' }}
        onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
        {!selectedConvId ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', background: 'var(--bg)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)' }}><MessageSquare size={24} color="var(--text-faintest)" /></div>
            <p style={{ color: 'var(--text-faint)', fontSize: '14px', fontWeight: 500 }}>{t('inbox.selectConversation')}</p>
          </div>
        ) : (
          <>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-card)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {isMobile && <button onClick={() => setMobileShowChat(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', color: 'var(--text-muted)' }}><ChevronLeft size={20} /></button>}
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: avatarColor.bg, color: avatarColor.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>{getInitials(contactName)}</div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.2, margin: 0, letterSpacing: '-0.01em' }}>{contactName || '??'}</p>
                    {selectedChannelName && <span style={{ fontSize: '10px', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1px 7px', borderRadius: '99px' }}>{selectedChannelName}</span>}
                    {botActive
                      ? <span style={{ fontSize: '10px', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1px 7px', borderRadius: '99px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Bot size={9} /> {t('inbox.botActiveLabel')}</span>
                      : <span style={{ fontSize: '10px', fontWeight: 600, color: '#ea580c', background: '#fff7ed', border: '1px solid #fed7aa', padding: '1px 7px', borderRadius: '99px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><UserCheck size={9} /> {t('inbox.humanLabel')}</span>
                    }
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0, marginTop: '1px' }}>{selectedConv?.contacts?.phone}</p>
                </div>
              </div>
              <div className="mobile-header-actions" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {canEdit('/dashboard/inbox') && selectedConv?.status !== 'closed' && (
                  botActive
                    ? <button onClick={() => takeOverMutation.mutate()} disabled={takeOverMutation.isPending} style={{ padding: '5px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', color: '#ea580c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        {takeOverMutation.isPending ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <UserCheck size={12} />} {t('inbox.takeOver')}
                      </button>
                    : <button onClick={() => releaseBotMutation.mutate()} disabled={releaseBotMutation.isPending} style={{ padding: '5px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        {releaseBotMutation.isPending ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Bot size={12} />} {t('inbox.releaseBot')}
                      </button>
                )}
                {canEdit('/dashboard/inbox') && (selectedConv?.status !== 'closed'
                  ? <button onClick={closeConv} style={{ padding: '5px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 500 }}>{t('inbox.close')}</button>
                  : <button onClick={openConv} style={{ padding: '5px 12px', background: '#22c55e', border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', color: '#fff', fontWeight: 600 }}>{t('inbox.reopen')}</button>
                )}
                <button onClick={() => { setShowChatSearch(p => !p); setChatSearch('') }}
                  style={{ padding: '5px 10px', background: showChatSearch ? '#f0f9ff' : 'var(--bg-input)', border: `1px solid ${showChatSearch ? '#bae6fd' : 'var(--border)'}`, borderRadius: '7px', fontSize: '12px', cursor: 'pointer', color: showChatSearch ? '#0369a1' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                  <Search size={13} />
                </button>
                <button onClick={() => setShowProfile(p => !p)} style={{ padding: '5px 10px', background: showProfile ? '#f0fdf4' : 'var(--bg-input)', border: `1px solid ${showProfile ? '#bbf7d0' : 'var(--border)'}`, borderRadius: '7px', fontSize: '12px', cursor: 'pointer', color: showProfile ? '#16a34a' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                  <User size={13} /> {t('inbox.profile')}
                </button>
                <button onClick={async () => {
                  if (!messages || messages.length === 0) { toast.error('Nenhuma mensagem'); return }
                  const rows = messages.map((m: any) => ({
                    data: m.sent_at || m.created_at ? new Date(m.sent_at || m.created_at).toLocaleString('pt-BR') : '',
                    direcao: m.direction === 'inbound' ? 'Recebida' : 'Enviada',
                    tipo: m.content_type || 'text',
                    mensagem: m.body || '',
                    status: m.status || '',
                  }))
                  const { exportToExcel } = await import('@/lib/export')
                  exportToExcel(rows, `conversa_${contactName.replace(/\s+/g, '_')}`, 'Mensagens')
                  toast.success(`${rows.length} mensagens exportadas!`)
                }} style={{ padding: '5px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                  <FileText size={13} /> {t('inbox.export')}
                </button>
              </div>
            </div>


            {showChatSearch && (
              <div style={{ padding: '6px 16px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <Search size={13} color="#0369a1" />
                <input value={chatSearch} onChange={e => setChatSearch(e.target.value)} autoFocus
                  placeholder={t('inbox.searchThisChat')}
                  style={{ flex: 1, padding: '5px 8px', background: 'var(--bg-card)', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '12px', outline: 'none', color: 'var(--text)' }} />
                {chatSearch && (
                  <span style={{ fontSize: '11px', color: '#0369a1', fontWeight: 600, flexShrink: 0 }}>
                    {messages?.filter((m: any) => m.body?.toLowerCase().includes(chatSearch.toLowerCase())).length || 0} {t('inbox.results')}
                  </span>
                )}
                <button onClick={() => { setShowChatSearch(false); setChatSearch('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex' }}>
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Drag-and-drop overlay */}
            {isDraggingFile && canEdit('/dashboard/inbox') && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(34,197,94,0.08)', border: '3px dashed #22c55e', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ background: '#fff', padding: '20px 32px', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Paperclip size={24} color="#22c55e" />
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#15803d' }}>Solte o arquivo para enviar</span>
                </div>
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg)' }}>
              {loadingMessages
                ? <div style={{ textAlign: 'center', padding: '40px' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faintest)' }} /></div>
                : messages?.length === 0
                ? <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px', padding: '40px' }}>{t('inbox.noMessagesYet')}</p>
                : messages?.map((msg: any) => {
                  const isOut = msg.direction === 'outbound'
                  const isMedia = msg.content_type !== 'text'
                  const matchesSearch = chatSearch && msg.body?.toLowerCase().includes(chatSearch.toLowerCase())
                  // Se busca ativa, escurece mensagens que não batem
                  const dimmed = chatSearch && !matchesSearch
                  return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start', opacity: dimmed ? 0.3 : 1, transition: 'opacity 0.2s' }}>
                      <div style={{ maxWidth: isMedia ? '280px' : '65%', padding: '9px 13px', borderRadius: isOut ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: isOut ? '#22c55e' : 'var(--bg-card)', boxShadow: matchesSearch ? '0 0 0 2px #2563eb' : '0 1px 2px rgba(0,0,0,.06)' }}>
                        <MessageContent msg={msg} isOut={isOut} channelId={channelId} tenantId={tenantId} onImageClick={setLightboxUrl} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', marginTop: '3px' }}>
                          <span style={{ fontSize: '11px', opacity: 0.65, color: isOut ? '#fff' : 'var(--text-faint)' }}>{msg.sent_at ? new Date(msg.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          {isOut && <MessageStatusIcon status={msg.status} />}
                        </div>
                      </div>
                    </div>
                  )
                })
              }
              <div ref={messagesEndRef} />
            </div>

            {canEdit('/dashboard/inbox') && pendingFile && !isRecording && (
              <div style={{ padding: '8px 14px', background: '#f0fdf4', borderTop: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                {pendingFile.contentType === 'image'
                  ? <img src={pendingFile.previewUrl} alt="preview" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }} />
                  : <div style={{ width: '48px', height: '48px', background: '#dcfce7', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pendingFile.contentType === 'audio' ? <Music size={20} color="#16a34a" /> : <FileText size={20} color="#16a34a" />}</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.file.name}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>{(pendingFile.file.size / 1024).toFixed(0)} KB · {pendingFile.contentType}</p>
                </div>
                <button onClick={handleSendFile} disabled={uploading} style={{ padding: '6px 14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {uploading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}{uploading ? t('inbox.sending') : t('inbox.send')}
                </button>
                <button onClick={() => setPendingFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '4px', display: 'flex' }}><X size={16} /></button>
              </div>
            )}

            {canEdit('/dashboard/inbox') && showQuickReplies && <QuickRepliesModal onSelect={text => { const replaced = text.replace(/\{\{nome\}\}/gi, contactName || ''); setMessageText(replaced); setInputMode('message') }} onClose={() => setShowQuickReplies(false)} />}

            {/* Slash-command inline dropdown */}
            {canEdit('/dashboard/inbox') && slashActive && filteredSlashReplies.length > 0 && !showQuickReplies && (
              <div style={{ position: 'absolute', bottom: '60px', left: '14px', right: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: 'var(--shadow)', zIndex: 50, maxHeight: '220px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <Zap size={12} color="#22c55e" />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>Respostas rapidas — digite / para filtrar</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {filteredSlashReplies.map((r: any) => (
                    <div key={r.id} style={{ padding: '8px 14px', borderBottom: '1px solid var(--divider)', cursor: 'pointer' }}
                      onClick={() => handleSlashSelect(r.body)}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card-hover)'}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', margin: '0 0 1px' }}>{r.title}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!canEdit('/dashboard/inbox') ? (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', textAlign: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '13px', color: 'var(--text-faint)' }}>{t('inbox.conversationClosed')}</span>
              </div>
            ) : selectedConv?.status !== 'closed' ? (
              <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-card)', flexShrink: 0, position: 'relative' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--divider)' }}>
                  <button onClick={() => setInputMode('message')} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer', background: 'transparent', color: inputMode === 'message' ? '#22c55e' : 'var(--text-faint)', borderBottom: inputMode === 'message' ? '2px solid #22c55e' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '5px', transition: 'color 0.1s' }}>
                    <MessageSquare size={12} /> {t('inbox.message')}
                  </button>
                  <button onClick={() => setInputMode('note')} style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer', background: 'transparent', color: inputMode === 'note' ? '#d97706' : 'var(--text-faint)', borderBottom: inputMode === 'note' ? '2px solid #d97706' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: '5px', transition: 'color 0.1s' }}>
                    <StickyNote size={12} /> {t('inbox.internalNote')}
                  </button>
                </div>
                <div style={{ padding: '10px 12px' }}>
                  {visibleChannels.length > 1 && inputMode === 'message' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <Phone size={12} color="var(--text-faint)" />
                      <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{t('inbox.sendVia')}</span>
                      <select
                        value={sendChannelId || selectedConv?.channel_id || ''}
                        onChange={e => setSendChannelId(e.target.value)}
                        style={{ fontSize: '11px', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: '5px', background: 'var(--bg-input)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}>
                        {visibleChannels.map((ch: any) => (
                          <option key={ch.id} value={ch.id}>{ch.name}{ch.phone_number ? ` (${ch.phone_number})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {isRecording ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
                      <span style={{ fontSize: '14px', color: '#ef4444', fontWeight: 600 }}>{t('inbox.recording')} {formatTime(recordingSeconds)}</span>
                      <div style={{ flex: 1 }} />
                      <button onClick={cancelRecording} style={{ padding: '6px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-muted)' }}>{t('common.cancel')}</button>
                      <button onClick={stopRecording} disabled={uploading} style={{ padding: '6px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        {uploading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Square size={13} fill="#fff" />}{uploading ? t('inbox.sending') : t('inbox.stopAndSend')}
                      </button>
                    </div>
                  ) : inputMode === 'message' ? (
                    <div style={{ display: 'flex', gap: '7px', alignItems: 'flex-end' }}>
                      <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }} onChange={handleFileSelect} />
                      <button onClick={() => fileInputRef.current?.click()} style={btnStyle} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}><Paperclip size={15} /></button>
                      <button onClick={startRecording} style={btnStyle} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}><Mic size={15} /></button>
                      <button onClick={() => setShowQuickReplies(p => !p)} style={{ ...btnStyle, background: showQuickReplies ? '#f0fdf4' : 'var(--bg-input)', color: showQuickReplies ? '#22c55e' : 'var(--text-muted)', border: `1px solid ${showQuickReplies ? '#bbf7d0' : 'var(--border)'}` }}><Zap size={15} /></button>
                      <textarea style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', outline: 'none', color: 'var(--text)', resize: 'none', height: '40px', lineHeight: 1.5, fontFamily: 'inherit', overflowY: 'auto', transition: 'all 0.1s' }} placeholder={t('inbox.typePlaceholder')} value={messageText} onChange={e => setMessageText(e.target.value)} onKeyDown={handleKeyDown}
                        onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = 'var(--bg-card)' }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-input)' }} />
                      <button onClick={handleSendText} disabled={sendMutation.isPending || !messageText.trim()} style={{ width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0, background: messageText.trim() ? '#22c55e' : 'var(--border)', border: 'none', cursor: messageText.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s' }}>
                        {sendMutation.isPending ? <Loader2 size={15} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} color={messageText.trim() ? '#fff' : 'var(--text-faint)'} />}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '7px', alignItems: 'flex-end' }}>
                      <textarea style={{ flex: 1, padding: '9px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', fontSize: '14px', outline: 'none', color: 'var(--text)', resize: 'none', height: '40px', lineHeight: 1.5, fontFamily: 'inherit', overflowY: 'auto' }} placeholder={t('inbox.notePlaceholder')} value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={handleKeyDown}
                        onFocus={e => { e.currentTarget.style.borderColor = '#d97706' }} onBlur={e => { e.currentTarget.style.borderColor = '#fde68a' }} />
                      <button onClick={() => saveNoteMutation.mutate()} disabled={saveNoteMutation.isPending || !noteText.trim()} style={{ width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0, background: noteText.trim() ? '#d97706' : 'var(--border)', border: 'none', cursor: noteText.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {saveNoteMutation.isPending ? <Loader2 size={15} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <StickyNote size={15} color={noteText.trim() ? '#fff' : 'var(--text-faint)'} />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', textAlign: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '13px', color: 'var(--text-faint)' }}>{t('inbox.conversationClosed')}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Direita — perfil ── */}
      {selectedConvId && showProfile && !isMobile && (
        <div className="inbox-profile" style={{ width: '248px', flexShrink: 0, background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--divider)', textAlign: 'center', flexShrink: 0 }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: avatarColor.bg, color: avatarColor.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 700, margin: '0 auto 10px' }}>{getInitials(contactName)}</div>
            <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', marginBottom: '2px', letterSpacing: '-0.01em' }}>{contactName || '??'}</p>
            <p style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{selectedConv?.contacts?.phone}</p>
            {selectedChannelName && <span style={{ fontSize: '10px', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '99px', display: 'inline-block', marginTop: '6px' }}>{selectedChannelName}</span>}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>{t('inbox.info')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <Phone size={13} color="var(--text-faint)" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div><p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: '0 0 1px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('inbox.phone')}</p><p style={{ fontSize: '13px', color: 'var(--text)', margin: 0 }}>{selectedConv?.contacts?.phone || '—'}</p></div>
              </div>
              {contactDetail?.email && <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><User size={13} color="var(--text-faint)" style={{ marginTop: '2px', flexShrink: 0 }} /><div><p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: '0 0 1px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('inbox.email')}</p><p style={{ fontSize: '13px', color: 'var(--text)', margin: 0 }}>{contactDetail.email}</p></div></div>}
              {contactDetail?.company && <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><User size={13} color="var(--text-faint)" style={{ marginTop: '2px', flexShrink: 0 }} /><div><p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: '0 0 1px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('inbox.company')}</p><p style={{ fontSize: '13px', color: 'var(--text)', margin: 0 }}>{contactDetail.company}</p></div></div>}
              {(customFields as any[]).filter((cf: any) => contactDetail?.metadata?.[cf.name] != null && contactDetail?.metadata?.[cf.name] !== '').map((cf: any) => (
                <div key={cf.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><User size={13} color="var(--text-faint)" style={{ marginTop: '2px', flexShrink: 0 }} /><div><p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: '0 0 1px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cf.label}</p><p style={{ fontSize: '13px', color: 'var(--text)', margin: 0 }}>{String(contactDetail.metadata[cf.name])}</p></div></div>
              ))}
              {contactDetail?.metadata && (() => {
                const customFieldNames = new Set((customFields as any[]).map((cf: any) => cf.name))
                return Object.entries(contactDetail.metadata)
                  .filter(([key, val]) => !customFieldNames.has(key) && val != null && String(val) !== '')
                  .map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <User size={13} color="var(--text-faint)" style={{ marginTop: '2px', flexShrink: 0 }} />
                      <div>
                        <p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: '0 0 1px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{key}</p>
                        <p style={{ fontSize: '13px', color: 'var(--text)', margin: 0 }}>{String(val)}</p>
                      </div>
                    </div>
                  ))
              })()}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><Clock size={13} color="var(--text-faint)" style={{ marginTop: '2px', flexShrink: 0 }} /><div><p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: '0 0 1px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('inbox.lastInteraction')}</p><p style={{ fontSize: '13px', color: 'var(--text)', margin: 0 }}>{contactDetail?.last_interaction_at ? new Date(contactDetail.last_interaction_at).toLocaleDateString('pt-BR') : '—'}</p></div></div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <MessageSquare size={13} color="var(--text-faint)" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div><p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: '0 0 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('inbox.status')}</p>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: selectedConv?.status === 'open' ? '#16a34a' : selectedConv?.status === 'closed' ? 'var(--text-muted)' : '#d97706', background: selectedConv?.status === 'open' ? '#f0fdf4' : selectedConv?.status === 'closed' ? 'var(--bg)' : '#fffbeb', border: `1px solid ${selectedConv?.status === 'open' ? '#bbf7d0' : selectedConv?.status === 'closed' ? 'var(--border)' : '#fde68a'}`, padding: '2px 8px', borderRadius: '99px', display: 'inline-block' }}>
                    {selectedConv?.status === 'open' ? t('inbox.statusOpen') : selectedConv?.status === 'closed' ? t('inbox.statusClosed') : t('inbox.statusWaiting')}
                  </span>
                </div>
              </div>
              {pipelineInfo && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <GitBranch size={13} color="var(--text-faint)" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div><p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: '0 0 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('inbox.pipeline')}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 4px', fontWeight: 500 }}>{pipelineInfo.pipelineName}</p>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: `${pipelineInfo.columnColor}18`, color: pipelineInfo.columnColor, border: `1px solid ${pipelineInfo.columnColor}30`, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: pipelineInfo.columnColor, flexShrink: 0, display: 'inline-block' }} />
                      {pipelineInfo.columnLabel}
                    </span>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <Bot size={13} color="var(--text-faint)" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div><p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: '0 0 3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('inbox.bot')}</p>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: botActive ? '#16a34a' : '#ea580c', background: botActive ? '#f0fdf4' : '#fff7ed', border: `1px solid ${botActive ? '#bbf7d0' : '#fed7aa'}`, padding: '2px 8px', borderRadius: '99px', display: 'inline-block' }}>{botActive ? t('inbox.botActive') : t('inbox.botPaused')}</span>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}><UserCheck size={13} color="var(--text-faint)" /><p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('inbox.agent')}</p></div>
                <select value={selectedConv?.assigned_to || ''} onChange={e => assignMutation.mutate(e.target.value || null)} disabled={!canEdit('/dashboard/inbox') || assignMutation.isPending} style={{ width: '100%', padding: '6px 8px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', color: 'var(--text)', outline: 'none', cursor: canEdit('/dashboard/inbox') ? 'pointer' : 'not-allowed', opacity: canEdit('/dashboard/inbox') ? 1 : 0.5 }}>
                  <option value="">{t('inbox.noAgent')}</option>
                  {(teamMembers || []).map((m: any) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                </select>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}><Tag size={13} color="var(--text-faint)" /><p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('inbox.tags')}</p></div>
                {canEdit('/dashboard/inbox') ? <InboxTagEditor contactId={contactId!} contactTags={contactTags} onChanged={() => { queryClient.invalidateQueries({ queryKey: ['contact', contactId] }); queryClient.invalidateQueries({ queryKey: ['contacts'] }) }} /> : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>{contactTags.map((tag: any) => <span key={tag.id} style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: `${tag.color || '#6b7280'}18`, color: tag.color || '#6b7280', border: `1px solid ${tag.color || '#6b7280'}40` }}>{tag.name}</span>)}</div>}
              </div>
            </div>


            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--divider)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}><StickyNote size={13} color="#d97706" /><p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{t('inbox.notes')}</p></div>
              {(notes as any[]).length === 0
                ? <p style={{ fontSize: '12px', color: 'var(--text-faintest)', textAlign: 'center', padding: '8px 0' }}>{t('inbox.noNotes')}</p>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(notes as any[]).map((note: any) => (
                      <div key={note.id} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 10px' }}>
                        <p style={{ fontSize: '12px', color: '#92400e', margin: '0 0 6px', whiteSpace: 'pre-line', lineHeight: 1.5 }}>{note.body}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <p style={{ fontSize: '10px', color: '#d97706', margin: 0 }}>{new Date(note.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                          {canEdit('/dashboard/inbox') && <button onClick={() => deleteNoteMutation.mutate(note.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#fde68a', display: 'flex' }}
                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#fde68a'}>
                            <Trash2 size={12} />
                          </button>}
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>

            {/* Tarefas */}
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--divider)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Check size={13} color="#2563eb" /><p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{t('inbox.tasks')}</p></div>
                {canEdit('/dashboard/inbox') && <button onClick={async () => {
                  const title = prompt(t('inbox.taskTitlePrompt'))
                  if (!title) return
                  const dueDate = prompt(t('inbox.taskDueDatePrompt'))
                  let due = null
                  if (dueDate) { const [d, m, y] = dueDate.split('/'); due = new Date(Number(y), Number(m) - 1, Number(d), 23, 59).toISOString() }
                  try {
                    await conversationApi.post('/tasks', { title, conversationId: selectedConvId, contactId, dueDate: due })
                    toast.success(t('inbox.taskCreated')); queryClient.invalidateQueries({ queryKey: ['tasks', selectedConvId] }); queryClient.invalidateQueries({ queryKey: ['tasks-summary'] })
                  } catch { toast.error(t('inbox.taskCreateError')) }
                }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#2563eb', fontWeight: 600 }}>{t('inbox.create')}</button>}
              </div>
              {convTasks.length === 0
                  ? <p style={{ fontSize: '12px', color: 'var(--text-faintest)', textAlign: 'center', padding: '4px 0' }}>{t('inbox.noTasks')}</p>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {convTasks.map((t: any) => {
                        const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status === 'pending'
                        return (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', background: isOverdue ? '#fef2f2' : '#f0f9ff', border: `1px solid ${isOverdue ? '#fecaca' : '#bae6fd'}`, borderRadius: '7px' }}>
                            <button onClick={async () => {
                              await conversationApi.patch(`/tasks/${t.id}`, { status: t.status === 'pending' ? 'completed' : 'pending' })
                              queryClient.invalidateQueries({ queryKey: ['tasks', selectedConvId] }); queryClient.invalidateQueries({ queryKey: ['tasks-summary'] })
                            }} style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${t.status === 'completed' ? '#22c55e' : isOverdue ? '#ef4444' : '#93c5fd'}`, background: t.status === 'completed' ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, padding: 0 }}>
                              {t.status === 'completed' && <Check size={10} color="#fff" strokeWidth={3} />}
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: '11px', fontWeight: 600, color: t.status === 'completed' ? 'var(--text-faint)' : 'var(--text)', margin: 0, textDecoration: t.status === 'completed' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                              {t.due_date && <p style={{ fontSize: '10px', color: isOverdue ? '#dc2626' : 'var(--text-muted)', margin: 0 }}>{isOverdue ? '⚠ ' : ''}{new Date(t.due_date).toLocaleDateString('pt-BR')}</p>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
              }
            </div>

            {/* Compras */}
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--divider)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><ShoppingBag size={13} color="#22c55e" /><p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Compras</p></div>
                {canEdit('/dashboard/inbox') && <button onClick={() => setShowAddPurchase(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#22c55e', fontWeight: 600 }}>{showAddPurchase ? 'Fechar' : '+ Adicionar'}</button>}
              </div>
              {contactTotalSpent > 0 && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '7px', padding: '6px 10px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 600 }}>Total gasto</span>
                  <span style={{ fontSize: '13px', color: '#15803d', fontWeight: 700 }}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contactTotalSpent)}</span>
                </div>
              )}
              {showAddPurchase && (
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', marginBottom: '8px' }}>
                  <select value={purchaseProductId} onChange={e => setPurchaseProductId(e.target.value)} style={{ width: '100%', padding: '6px 8px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', color: 'var(--text)', outline: 'none', marginBottom: '6px', cursor: 'pointer' }}>
                    <option value="">Selecione um produto</option>
                    {allProducts.map((p: any) => <option key={p.id} value={p.id}>{p.name} — R$ {Number(p.price).toFixed(2)}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input type="number" min="1" value={purchaseQty} onChange={e => setPurchaseQty(e.target.value)} placeholder="Qtd" style={{ width: '60px', padding: '6px 8px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', color: 'var(--text)', outline: 'none' }} />
                    <button onClick={() => { if (!purchaseProductId) { toast.error('Selecione um produto'); return }; addPurchaseMutation.mutate() }} disabled={addPurchaseMutation.isPending} style={{ flex: 1, padding: '6px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      {addPurchaseMutation.isPending ? 'Salvando...' : 'Registrar'}
                    </button>
                  </div>
                </div>
              )}
              {contactPurchases.length === 0
                ? <p style={{ fontSize: '12px', color: 'var(--text-faintest)', textAlign: 'center', padding: '4px 0' }}>Nenhuma compra</p>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {contactPurchases.map((purchase: any) => (
                      <div key={purchase.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '7px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{purchase.products?.name || 'Produto'}</p>
                          <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>
                            {purchase.quantity}x R$ {Number(purchase.unit_price).toFixed(2)} = <strong>R$ {Number(purchase.total_price).toFixed(2)}</strong>
                          </p>
                        </div>
                        {canEdit('/dashboard/inbox') && <button onClick={() => deletePurchaseMutation.mutate(purchase.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#bbf7d0', display: 'flex' }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#bbf7d0'}>
                          <Trash2 size={12} />
                        </button>}
                      </div>
                    ))}
                  </div>
              }
            </div>

            {/* Timeline */}
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--divider)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <History size={13} color="#6366f1" />
                <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Timeline</p>
              </div>
              {(() => {
                const timelineItems: { type: string; date: string; label: string; detail?: string; color: string; icon: string }[] = []
                // Recent messages (last 5)
                if (messages && messages.length > 0) {
                  const recentMsgs = [...messages].sort((a: any, b: any) => new Date(b.sent_at || b.created_at).getTime() - new Date(a.sent_at || a.created_at).getTime()).slice(0, 5)
                  recentMsgs.forEach((m: any) => {
                    const dir = m.direction === 'inbound' ? 'Recebida' : 'Enviada'
                    const body = m.content_type === 'text' ? (m.body || '').slice(0, 40) : `[${m.content_type}]`
                    timelineItems.push({ type: 'message', date: m.sent_at || m.created_at, label: `${dir}: ${body}${(m.body || '').length > 40 ? '...' : ''}`, color: m.direction === 'inbound' ? '#2563eb' : '#22c55e', icon: 'msg' })
                  })
                }
                // Purchases
                if (contactPurchases && contactPurchases.length > 0) {
                  contactPurchases.slice(0, 5).forEach((p: any) => {
                    timelineItems.push({ type: 'purchase', date: p.created_at, label: `Compra: ${p.products?.name || 'Produto'}`, detail: `${p.quantity}x R$ ${Number(p.unit_price).toFixed(2)}`, color: '#16a34a', icon: 'shop' })
                  })
                }
                // Tasks
                if (convTasks && convTasks.length > 0) {
                  convTasks.slice(0, 5).forEach((tk: any) => {
                    timelineItems.push({ type: 'task', date: tk.created_at, label: `Tarefa: ${tk.title}`, detail: tk.status === 'completed' ? 'Concluida' : (tk.due_date ? `Vence ${new Date(tk.due_date).toLocaleDateString('pt-BR')}` : 'Pendente'), color: '#2563eb', icon: 'task' })
                  })
                }
                // Tags
                if (contactTags && contactTags.length > 0) {
                  contactTags.forEach((tag: any) => {
                    timelineItems.push({ type: 'tag', date: tag.created_at || new Date().toISOString(), label: `Tag: ${tag.name}`, color: tag.color || '#6b7280', icon: 'tag' })
                  })
                }
                // Sort chronologically descending
                timelineItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                const limited = timelineItems.slice(0, 12)
                if (limited.length === 0) return <p style={{ fontSize: '12px', color: 'var(--text-faintest)', textAlign: 'center', padding: '4px 0' }}>Nenhum evento</p>
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    {limited.map((item, idx) => (
                      <div key={`tl-${idx}`} style={{ display: 'flex', gap: '10px', paddingBottom: '8px', position: 'relative' }}>
                        {/* Timeline line */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '14px', flexShrink: 0 }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0, marginTop: '3px' }} />
                          {idx < limited.length - 1 && <div style={{ width: '1px', flex: 1, background: 'var(--divider)', marginTop: '2px' }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, paddingBottom: '4px' }}>
                          <p style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text)', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</p>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {item.detail && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.detail}</span>}
                            <span style={{ fontSize: '10px', color: 'var(--text-faintest)' }}>{item.date ? new Date(item.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + new Date(item.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--divider)' }}>
              <a href="/dashboard/contacts" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', textDecoration: 'none', color: 'var(--text)', fontSize: '13px', fontWeight: 500, transition: 'all 0.1s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = '#22c55e' }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-input)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)' }}>
                {t('inbox.viewInCRM')} <ChevronRight size={13} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
          <img src={lightboxUrl} alt="preview" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px', objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightboxUrl(null)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <X size={20} />
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}

