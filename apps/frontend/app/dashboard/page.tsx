'use client'
import { useQuery } from '@tanstack/react-query'
import { campaignApi, conversationApi, contactApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { Megaphone, Users, MessageSquare, Zap, TrendingUp, ArrowUpRight } from 'lucide-react'

const metrics = [
  {
    label: 'Campanhas',
    icon: Megaphone,
    neon: '#00c3ff',
    glow: 'rgba(0,195,255,0.3)',
    href: '/dashboard/campaigns',
    key: 'campaigns',
  },
  {
    label: 'Contatos',
    icon: Users,
    neon: '#bf5fff',
    glow: 'rgba(191,95,255,0.3)',
    href: '/dashboard/contacts',
    key: 'contacts',
  },
  {
    label: 'Conversas Abertas',
    icon: MessageSquare,
    neon: '#00ff88',
    glow: 'rgba(0,255,136,0.3)',
    href: '/dashboard/inbox',
    key: 'conversations',
  },
  {
    label: 'Automações',
    icon: Zap,
    neon: '#ff3cac',
    glow: 'rgba(255,60,172,0.3)',
    href: '/dashboard/automations',
    key: 'automations',
  },
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
    campaigns:     { value: campaigns?.length ?? 0,       sub: `${campaigns?.filter((c: any) => c.status === 'running').length || 0} em andamento` },
    contacts:      { value: contactsMeta?.total ?? 0,     sub: 'na sua base' },
    conversations: { value: conversations?.length ?? 0,   sub: `${conversations?.filter((c: any) => c.status === 'waiting').length || 0} aguardando` },
    automations:   { value: 0,                            sub: 'em execução' },
  }

  return (
    <div style={{ padding: '32px', position: 'relative', zIndex: 1 }}>

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <TrendingUp size={18} color="#00ff88" />
          <span style={{
            fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase',
            color: '#00ff88', fontWeight: 600,
            fontFamily: 'Syne, sans-serif',
            textShadow: '0 0 10px rgba(0,255,136,0.5)',
          }}>
            Visão geral
          </span>
        </div>
        <h1 style={{
          fontSize: '28px', fontWeight: 800,
          fontFamily: 'Syne, sans-serif',
          letterSpacing: '-0.03em',
          lineHeight: 1,
          color: '#fff',
        }}>
          Dashboard
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '14px', marginTop: '6px' }}>
          Monitore sua operação em tempo real
        </p>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        {metrics.map(({ label, icon: Icon, neon, glow, href, key }) => {
          const { value, sub } = values[key]
          return (
            <div
              key={key}
              onClick={() => router.push(href)}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${neon}20`,
                borderRadius: '16px',
                padding: '24px',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.25s ease',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.background = `${neon}08`
                el.style.borderColor = `${neon}40`
                el.style.transform = 'translateY(-2px)'
                el.style.boxShadow = `0 8px 32px ${neon}15`
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.background = 'rgba(255,255,255,0.03)'
                el.style.borderColor = `${neon}20`
                el.style.transform = 'translateY(0)'
                el.style.boxShadow = 'none'
              }}
            >
              {/* Top glow line */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
                background: `linear-gradient(90deg, transparent, ${neon}60, transparent)`,
              }} />

              {/* Background radial glow */}
              <div style={{
                position: 'absolute', top: '-30px', right: '-30px',
                width: '100px', height: '100px',
                borderRadius: '50%',
                background: `radial-gradient(circle, ${neon}15, transparent 70%)`,
                pointerEvents: 'none',
              }} />

              {/* Icon */}
              <div style={{
                width: '44px', height: '44px',
                borderRadius: '12px',
                background: `${neon}15`,
                border: `1px solid ${neon}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '16px',
                boxShadow: `0 0 16px ${glow}`,
              }}>
                <Icon size={20} color={neon} />
              </div>

              {/* Value */}
              <div style={{
                fontSize: '38px', fontWeight: 800,
                fontFamily: 'Syne, sans-serif',
                letterSpacing: '-0.03em',
                lineHeight: 1,
                marginBottom: '6px',
                color: '#fff',
                textShadow: `0 0 20px ${neon}30`,
              }}>
                {value.toLocaleString()}
              </div>

              {/* Label */}
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>
                {label}
              </div>

              {/* Sub */}
              <div style={{ color: neon, fontSize: '11px', fontWeight: 600, opacity: 0.8 }}>
                {sub}
              </div>

              {/* Arrow */}
              <div style={{
                position: 'absolute', top: '20px', right: '20px',
                color: `${neon}50`,
              }}>
                <ArrowUpRight size={16} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Quick actions */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(0,195,255,0.4), transparent)',
        }} />

        <h2 style={{
          fontSize: '14px', fontWeight: 700,
          fontFamily: 'Syne, sans-serif',
          color: 'rgba(255,255,255,0.7)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginBottom: '16px',
        }}>
          Acesso rápido
        </h2>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { label: '+ Nova campanha', href: '/dashboard/campaigns', neon: '#00c3ff' },
            { label: '+ Importar contatos', href: '/dashboard/contacts', neon: '#bf5fff' },
            { label: 'Abrir inbox', href: '/dashboard/inbox', neon: '#00ff88' },
          ].map(({ label, href, neon }) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              style={{
                padding: '10px 18px',
                background: `${neon}10`,
                border: `1px solid ${neon}30`,
                borderRadius: '10px',
                color: neon,
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = `${neon}20`
                el.style.boxShadow = `0 0 16px ${neon}30`
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = `${neon}10`
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
