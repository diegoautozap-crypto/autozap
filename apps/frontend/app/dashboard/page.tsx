'use client'
import { useQuery } from '@tanstack/react-query'
import { campaignApi, conversationApi, contactApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { Megaphone, Users, MessageSquare, Zap, ArrowUpRight, TrendingUp } from 'lucide-react'

const metrics = [
  { key: 'campaigns',     label: 'Campanhas',        icon: Megaphone,     color: '#2563eb', bg: '#eff6ff' },
  { key: 'contacts',      label: 'Contatos',          icon: Users,         color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'conversations', label: 'Conversas Abertas', icon: MessageSquare, color: '#16a34a', bg: '#f0fdf4' },
  { key: 'automations',   label: 'Automações',        icon: Zap,           color: '#ea580c', bg: '#fff7ed' },
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
    contacts:      { value: contactsMeta?.total ?? 0,   sub: 'na sua base' },
    conversations: { value: conversations?.length ?? 0, sub: `${conversations?.filter((c: any) => c.status === 'waiting').length || 0} aguardando` },
    automations:   { value: 0,                          sub: 'configuradas' },
  }

  const hrefs: Record<string, string> = {
    campaigns: '/dashboard/campaigns',
    contacts: '/dashboard/contacts',
    conversations: '/dashboard/inbox',
    automations: '/dashboard/automations',
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>
          Bom dia! 👋
        </h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
          Aqui está o resumo da sua conta hoje.
        </p>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '28px' }}>
        {metrics.map(({ key, label, icon: Icon, color, bg }) => {
          const { value, sub } = values[key]
          return (
            <div
              key={key}
              onClick={() => router.push(hrefs[key])}
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'
                el.style.borderColor = '#d1d5db'
                el.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.boxShadow = 'none'
                el.style.borderColor = '#e5e7eb'
                el.style.transform = 'translateY(0)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} color={color} strokeWidth={2} />
                </div>
                <ArrowUpRight size={14} color="#d1d5db" />
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: '4px' }}>
                {value.toLocaleString()}
              </div>
              <div style={{ fontSize: '13px', color: '#374151', fontWeight: 500, marginBottom: '2px' }}>{label}</div>
              <div style={{ fontSize: '12px', color: '#9ca3af' }}>{sub}</div>
            </div>
          )
        })}
      </div>

      {/* Quick actions */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
          <TrendingUp size={14} color="#16a34a" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Acesso rápido</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { label: 'Nova campanha',    href: '/dashboard/campaigns', primary: true },
            { label: 'Importar contatos', href: '/dashboard/contacts', primary: false },
            { label: 'Abrir inbox',      href: '/dashboard/inbox',     primary: false },
          ].map(({ label, href, primary }) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              style={{
                padding: '8px 14px',
                background: primary ? '#16a34a' : '#f9fafb',
                border: primary ? 'none' : '1px solid #e5e7eb',
                borderRadius: '6px',
                color: primary ? '#fff' : '#374151',
                fontSize: '13px', fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.1s ease',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = primary ? '#15803d' : '#f3f4f6'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = primary ? '#16a34a' : '#f9fafb'
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
