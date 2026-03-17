'use client'

import { useQuery } from '@tanstack/react-query'
import { campaignApi, conversationApi, contactApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { Megaphone, Users, MessageSquare, Zap } from 'lucide-react'

const card = (style?: object) => ({
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: '10px',
  padding: '24px',
  boxShadow: 'var(--shadow)',
  ...style,
})

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

  const metrics = [
    {
      label: 'Campanhas',
      sub: `${campaigns?.filter((c: any) => c.status === 'running').length || 0} em andamento`,
      value: campaigns?.length ?? 0,
      icon: Megaphone,
      iconBg: '#4f87ff',
      href: '/dashboard/campaigns',
    },
    {
      label: 'Contatos',
      sub: 'na sua base',
      value: contactsMeta?.total ?? 0,
      icon: Users,
      iconBg: '#a855f7',
      href: '/dashboard/contacts',
    },
    {
      label: 'Conversas abertas',
      sub: `${conversations?.filter((c: any) => c.status === 'waiting').length || 0} aguardando`,
      value: conversations?.length ?? 0,
      icon: MessageSquare,
      iconBg: '#25d366',
      href: '/dashboard/inbox',
    },
    {
      label: 'Automacoes ativas',
      sub: 'em execucao',
      value: 0,
      icon: Zap,
      iconBg: '#f97316',
      href: '/dashboard/automations',
    },
  ]

  return (
    <div style={{ padding: '32px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Dashboard</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '28px' }}>Visao geral da sua conta</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {metrics.map(({ label, sub, value, icon: Icon, iconBg, href }) => (
          <div
            key={label}
            onClick={() => router.push(href)}
            style={{ ...card(), cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0' }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow)'}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{label}</span>
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={20} color="#fff" />
              </div>
            </div>
            <div style={{ fontSize: '36px', fontWeight: 700, color: 'var(--text)', lineHeight: 1, marginBottom: '6px' }}>
              {value.toLocaleString()}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}