'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { contactApi } from '@/lib/api'
import {
  ArrowLeft, Loader2, MessageCircle, Phone, Mail, Building2,
  MessageSquare, Send, Move, DollarSign, UserPlus, CheckSquare,
  Square, Megaphone, Tag, Clock,
} from 'lucide-react'

function getInitials(n: string | undefined | null) { return ((n || '??').trim().slice(0, 2)).toUpperCase() }

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `há ${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `há ${days}d`
  const months = Math.floor(days / 30)
  return `há ${months}mes${months > 1 ? 'es' : ''}`
}

function formatAbsolute(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const EVENT_STYLES: Record<string, { icon: any; color: string; bg: string }> = {
  message_in:          { icon: MessageSquare, color: '#2563eb', bg: '#eff6ff' },
  message_out:         { icon: Send,          color: '#16a34a', bg: '#f0fdf4' },
  pipeline_created:    { icon: UserPlus,      color: '#7c3aed', bg: '#f5f3ff' },
  pipeline_moved:      { icon: Move,          color: '#d97706', bg: '#fffbeb' },
  pipeline_value_changed: { icon: DollarSign, color: '#059669', bg: '#ecfdf5' },
  pipeline_assigned:   { icon: UserPlus,      color: '#0891b2', bg: '#ecfeff' },
  pipeline_deleted:    { icon: Move,          color: '#dc2626', bg: '#fef2f2' },
  task_created:        { icon: Square,        color: '#64748b', bg: '#f1f5f9' },
  task_completed:      { icon: CheckSquare,   color: '#16a34a', bg: '#f0fdf4' },
  campaign_sent:       { icon: Megaphone,     color: '#db2777', bg: '#fdf2f8' },
  tag_added:           { icon: Tag,           color: '#7c3aed', bg: '#f5f3ff' },
}

function eventSubtitle(ev: any) {
  const m = ev.metadata || {}
  if (ev.type === 'pipeline_moved') return `${m.fromColumn || '—'} → ${m.toColumn || '—'}${m.actor ? ` · por ${m.actor}` : ''}`
  if (ev.type === 'pipeline_value_changed') return `R$ ${Number(m.fromValue || 0).toFixed(2)} → R$ ${Number(m.toValue || 0).toFixed(2)}${m.actor ? ` · por ${m.actor}` : ''}`
  if (ev.type === 'pipeline_assigned') return `Responsável: ${m.toUser || '—'}${m.actor ? ` · por ${m.actor}` : ''}`
  if (ev.type === 'task_created') return m.assignee ? `Atribuída a ${m.assignee}` : ''
  if (ev.type === 'campaign_sent') return m.status ? `Status: ${m.status}` : ''
  if (ev.body) return ev.body
  return ''
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ['contact', id],
    queryFn: async () => {
      const { data } = await contactApi.get(`/contacts/${id}`)
      return data.data
    },
    enabled: !!id,
  })

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['contact-timeline', id],
    queryFn: async () => {
      const { data } = await contactApi.get(`/contacts/${id}/timeline?limit=150`)
      return data.data || []
    },
    enabled: !!id,
  })

  if (contactLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faint)' }} />
      </div>
    )
  }

  if (!contact) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-faint)' }}>
        Contato não encontrado.
      </div>
    )
  }

  const tags = (contact.contact_tags || []).map((ct: any) => ct.tags).filter(Boolean)

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 20px 60px' }}>
      <button onClick={() => router.back()}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: '13px', padding: '4px 0', marginBottom: '16px' }}>
        <ArrowLeft size={14} /> Voltar
      </button>

      {/* Header */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px 22px', display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '18px' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#ede9fe', color: '#6d28d9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '18px', flexShrink: 0 }}>
          {getInitials(contact.name || contact.phone)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>
            {contact.name || contact.phone}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '8px', fontSize: '13px', color: 'var(--text-faint)' }}>
            {contact.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Phone size={12} /> {contact.phone}</span>}
            {contact.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Mail size={12} /> {contact.email}</span>}
            {contact.company && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Building2 size={12} /> {contact.company}</span>}
          </div>
          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
              {tags.map((t: any) => (
                <span key={t.id} style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: (t.color || '#6b7280') + '15', color: t.color || '#6b7280', border: `1px solid ${(t.color || '#6b7280')}30` }}>
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => router.push(`/dashboard/inbox?contactId=${contact.id}&phone=${encodeURIComponent(contact.phone || '')}`)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#16a34a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          <MessageCircle size={14} /> Conversar
        </button>
      </div>

      {/* Timeline */}
      <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', margin: '0 0 12px', letterSpacing: '-0.01em' }}>
        Linha do tempo
      </h2>

      {eventsLoading && (
        <div style={{ padding: '30px 0', display: 'flex', justifyContent: 'center' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faint)' }} />
        </div>
      )}

      {!eventsLoading && events.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-faint)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '13px' }}>
          Nenhum evento registrado ainda para esse contato.
        </div>
      )}

      {!eventsLoading && events.length > 0 && (
        <div style={{ position: 'relative', paddingLeft: '30px' }}>
          <div style={{ position: 'absolute', left: '13px', top: '8px', bottom: '8px', width: '2px', background: 'var(--border)' }} />
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {events.map((ev: any) => {
              const style = EVENT_STYLES[ev.type] || { icon: Clock, color: '#6b7280', bg: '#f1f5f9' }
              const Icon = style.icon
              const subtitle = eventSubtitle(ev)
              return (
                <li key={ev.id} style={{ position: 'relative', padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                  <div style={{ position: 'absolute', left: '-30px', top: '10px', width: '26px', height: '26px', borderRadius: '50%', background: style.bg, color: style.color, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-card, #fff)' }}>
                    <Icon size={12} />
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{ev.title}</div>
                  {subtitle && <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '2px' }}>{subtitle}</div>}
                  <div style={{ fontSize: '11px', color: 'var(--text-faintest)', marginTop: '4px' }} title={formatAbsolute(ev.at)}>
                    {formatRelativeTime(ev.at)} · {formatAbsolute(ev.at)}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
