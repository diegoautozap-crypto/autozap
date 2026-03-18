'use client'
import { useQuery } from '@tanstack/react-query'
import { campaignApi, conversationApi, contactApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { Megaphone, Users, MessageSquare, Zap, ArrowUpRight } from 'lucide-react'

const metrics = [
  { key: 'campaigns',     label: 'Campanhas',        icon: Megaphone,      accent: '#a3e635' },
  { key: 'contacts',      label: 'Contatos',          icon: Users,          accent: '#34d399' },
  { key: 'conversations', label: 'Conversas Abertas', icon: MessageSquare,  accent: '#a3e635' },
  { key: 'automations',   label: 'Automações',        icon: Zap,            accent: '#86efac' },
]

export default function DashboardPage() {
  const router = useRouter()

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => { const { data } = await campaignApi.get('/campaigns'); return data.data },
  })
  const { data: conversations } = useQuery({
    queryKey: ['conversations', 'open'],
    queryFn: async () => { const { data } = await conversationApi.get('/conversations?status=open'); return data.data },
  })
  const { data: contactsMeta } = useQuery({
    queryKey: ['contacts-count'],
    queryFn: async () => { const { data } = await contactApi.get('/contacts?limit=1'); return data.meta },
  })

  const values: Record<string, { value: number; sub: string }> = {
    campaigns:     { value: campaigns?.length ?? 0,     sub: `${campaigns?.filter((c: any) => c.status === 'running').length || 0} em andamento` },
    contacts:      { value: contactsMeta?.total ?? 0,   sub: 'na base' },
    conversations: { value: conversations?.length ?? 0, sub: `${conversations?.filter((c: any) => c.status === 'waiting').length || 0} aguardando` },
    automations:   { value: 0,                          sub: 'em execução' },
  }

  const hrefs: Record<string, string> = {
    campaigns: '/dashboard/campaigns',
    contacts: '/dashboard/contacts',
    conversations: '/dashboard/inbox',
    automations: '/dashboard/automations',
  }

  return (
    <div style={{ padding: '32px', position: 'relative', zIndex: 1 }}>

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <div style={{ width: '3px', height: '16px', background: '#a3e635', borderRadius: '2px', boxShadow: '0 0 8px rgba(163,230,53,0.8)' }} />
          <span style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase',
            color: '#a3e635', fontWeight: 700,
          }}>
            Visão Geral
          </span>
        </div>
        <h1 style={{
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: '32px', fontWeight: 700,
          letterSpacing: '0.05em', textTransform: 'uppercase',
          color: '#e8ffe0', lineHeight: 1,
        }}>
          Dashboard
        </h1>
        <p style={{ color: 'rgba(232,255,224,0.4)', fontSize: '13px', marginTop: '6px' }}>
          Monitore sua operação em tempo real
        </p>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '28px' }}>
        {metrics.map(({ key, label, icon: Icon, accent }) => {
          const { value, sub } = values[key]
          return (
            <div
              key={key}
              onClick={() => router.push(hrefs[key])}
              style={{
                background: 'rgba(10,30,18,0.8)',
                border: `1px solid rgba(163,230,53,0.15)`,
                borderRadius: '12px',
                padding: '20px',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                backdropFilter: 'blur(20px)',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.borderColor = 'rgba(163,230,53,0.4)'
                el.style.background = 'rgba(15,40,24,0.9)'
                el.style.transform = 'translateY(-2px)'
                el.style.boxShadow = '0 8px 32px rgba(163,230,53,0.1)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.borderColor = 'rgba(163,230,53,0.15)'
                el.style.background = 'rgba(10,30,18,0.8)'
                el.style.transform = 'translateY(0)'
                el.style.boxShadow = 'none'
              }}
            >
              {/* Top glow line */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                background: `linear-gradient(90deg, transparent, ${accent}80, transparent)`,
              }} />

              {/* BG glow */}
              <div style={{
                position: 'absolute', top: '-20px', right: '-20px',
                width: '80px', height: '80px', borderRadius: '50%',
                background: `radial-gradient(circle, ${accent}12, transparent 70%)`,
                pointerEvents: 'none',
              }} />

              {/* Icon */}
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: `rgba(163,230,53,0.1)`,
                border: `1px solid rgba(163,230,53,0.2)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '14px',
                boxShadow: `0 0 12px rgba(163,230,53,0.15)`,
              }}>
                <Icon size={18} color={accent} />
              </div>

              {/* Value */}
              <div style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '36px', fontWeight: 700,
                letterSpacing: '0.02em',
                color: '#e8ffe0',
                lineHeight: 1, marginBottom: '4px',
              }}>
                {value.toLocaleString()}
              </div>

              <div style={{ color: 'rgba(232,255,224,0.6)', fontSize: '13px', fontWeight: 500, marginBottom: '3px' }}>
                {label}
              </div>
              <div style={{ color: accent, fontSize: '11px', fontWeight: 600, opacity: 0.8 }}>
                {sub}
              </div>

              <ArrowUpRight size={14} style={{ position: 'absolute', top: '18px', right: '18px', color: 'rgba(163,230,53,0.3)' }} />
            </div>
          )
        })}
      </div>

      {/* Quick actions */}
      <div style={{
        background: 'rgba(10,30,18,0.8)',
        border: '1px solid rgba(163,230,53,0.12)',
        borderRadius: '12px',
        padding: '22px',
        position: 'relative',
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(163,230,53,0.5), transparent)',
        }} />

        <h2 style={{
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: '12px', fontWeight: 700,
          letterSpacing: '0.15em', textTransform: 'uppercase',
          color: 'rgba(232,255,224,0.5)',
          marginBottom: '14px',
        }}>
          Acesso rápido
        </h2>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {[
            { label: '+ Nova campanha',    href: '/dashboard/campaigns' },
            { label: '+ Importar contatos', href: '/dashboard/contacts' },
            { label: 'Abrir inbox',         href: '/dashboard/inbox' },
          ].map(({ label, href }) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              style={{
                padding: '9px 16px',
                background: 'rgba(163,230,53,0.08)',
                border: '1px solid rgba(163,230,53,0.2)',
                borderRadius: '8px',
                color: '#a3e635',
                fontSize: '13px', fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                fontFamily: 'Inter, sans-serif',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = 'rgba(163,230,53,0.15)'
                el.style.boxShadow = '0 0 12px rgba(163,230,53,0.2)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = 'rgba(163,230,53,0.08)'
                el.style.boxShadow = 'none'
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
