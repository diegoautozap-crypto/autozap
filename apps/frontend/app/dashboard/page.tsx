'use client'
import { useQuery } from '@tanstack/react-query'
import { campaignApi, conversationApi, contactApi, tenantApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { useRouter } from 'next/navigation'
import { Megaphone, Users, MessageSquare, Zap, ArrowUpRight, TrendingUp, Send, CheckCheck, Eye } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function getLast30Days() {
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const tenantId = (user as any)?.tenantId || (user as any)?.tid

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

  const { data: usage } = useQuery({
    queryKey: ['usage'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant/usage'); return data.data },
  })

  // ✅ Busca mensagens dos últimos 30 dias para o gráfico
  const { data: messageStats } = useQuery({
    queryKey: ['message-stats', tenantId],
    queryFn: async () => {
      if (!tenantId) return []
      const since = new Date()
      since.setDate(since.getDate() - 29)
      since.setHours(0, 0, 0, 0)

      const { data } = await supabase
        .from('messages')
        .select('created_at, status, direction')
        .eq('tenant_id', tenantId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })

      return data || []
    },
    enabled: !!tenantId,
    refetchInterval: 60000,
  })

  // Agrupa mensagens por dia
  const days = getLast30Days()
  const chartData = days.map(day => {
    const dayMsgs = (messageStats || []).filter((m: any) => m.created_at?.startsWith(day))
    const sent = dayMsgs.filter((m: any) => m.direction === 'outbound').length
    const delivered = dayMsgs.filter((m: any) => m.status === 'delivered' || m.status === 'read').length
    const read = dayMsgs.filter((m: any) => m.status === 'read').length
    return { day, sent, delivered, read, label: day.slice(5) }
  })

  const maxVal = Math.max(...chartData.map(d => d.sent), 1)
  const totalSent = (messageStats || []).filter((m: any) => m.direction === 'outbound').length
  const totalDelivered = (messageStats || []).filter((m: any) => m.status === 'delivered' || m.status === 'read').length
  const totalRead = (messageStats || []).filter((m: any) => m.status === 'read').length
  const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0
  const readRate = totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : 0

  const metricCards = [
    { label: 'Campanhas', value: campaigns?.length ?? 0, sub: `${campaigns?.filter((c: any) => c.status === 'running').length || 0} em andamento`, icon: Megaphone, color: '#2563eb', bg: '#eff6ff', href: '/dashboard/campaigns' },
    { label: 'Contatos', value: contactsMeta?.total ?? 0, sub: 'na sua base', icon: Users, color: '#7c3aed', bg: '#f5f3ff', href: '/dashboard/contacts' },
    { label: 'Conversas abertas', value: conversations?.length ?? 0, sub: `${conversations?.filter((c: any) => c.unread_count > 0).length || 0} não lidas`, icon: MessageSquare, color: '#16a34a', bg: '#f0fdf4', href: '/dashboard/inbox' },
    { label: 'Mensagens este mês', value: usage?.sent ?? 0, sub: `de ${usage?.limit === null ? '∞' : (usage?.limit ?? 0).toLocaleString()} disponíveis`, icon: Send, color: '#ea580c', bg: '#fff7ed', href: '/dashboard/campaigns' },
  ]

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>
          {getGreeting()}! 👋
        </h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
          Aqui está o resumo da sua conta hoje.
        </p>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {metricCards.map(({ label, value, sub, icon: Icon, color, bg, href }) => (
          <div key={label} onClick={() => router.push(href)}
            style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', cursor: 'pointer', transition: 'all 0.15s ease' }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'; el.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = 'none'; el.style.transform = 'translateY(0)' }}
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
        ))}
      </div>

      {/* ✅ Cards de taxa */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Enviadas (30 dias)', value: totalSent, icon: Send, color: '#2563eb' },
          { label: 'Taxa de entrega', value: `${deliveryRate}%`, icon: CheckCheck, color: '#16a34a' },
          { label: 'Taxa de leitura', value: `${readRate}%`, icon: Eye, color: '#7c3aed' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={18} color={color} />
            </div>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ✅ Gráfico de mensagens dos últimos 30 dias */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Mensagens enviadas</h3>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>Últimos 30 dias</p>
          </div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#6b7280' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#16a34a' }} /> Enviadas</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#93c5fd' }} /> Entregues</div>
          </div>
        </div>

        {/* Barras */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '140px', paddingBottom: '24px', position: 'relative' }}>
          {/* Linhas de grade */}
          {[0.25, 0.5, 0.75, 1].map(p => (
            <div key={p} style={{ position: 'absolute', left: 0, right: 0, bottom: `${24 + p * 116}px`, borderTop: '1px dashed #f3f4f6', zIndex: 0 }} />
          ))}

          {chartData.map((d, i) => (
            <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', position: 'relative', zIndex: 1 }}>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                {/* Barra enviadas */}
                <div
                  title={`${d.day}: ${d.sent} enviadas, ${d.delivered} entregues`}
                  style={{
                    width: '100%', maxWidth: '20px',
                    height: `${Math.max(d.sent / maxVal * 116, d.sent > 0 ? 3 : 0)}px`,
                    background: '#16a34a', borderRadius: '2px 2px 0 0',
                    transition: 'height 0.3s ease',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                />
              </div>
              {/* Label dia — mostra a cada 5 dias */}
              {i % 5 === 0 && (
                <span style={{ position: 'absolute', bottom: '0', fontSize: '9px', color: '#d1d5db', whiteSpace: 'nowrap' }}>
                  {d.label}
                </span>
              )}
            </div>
          ))}
        </div>

        {totalSent === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af', fontSize: '13px' }}>
            Nenhuma mensagem enviada nos últimos 30 dias
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
          <TrendingUp size={14} color="#16a34a" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Acesso rápido</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { label: 'Nova campanha', href: '/dashboard/campaigns', primary: true },
            { label: 'Importar contatos', href: '/dashboard/contacts', primary: false },
            { label: 'Abrir inbox', href: '/dashboard/inbox', primary: false },
            { label: 'Ver plano', href: '/dashboard/settings', primary: false },
          ].map(({ label, href, primary }) => (
            <button key={href} onClick={() => router.push(href)}
              style={{ padding: '8px 14px', background: primary ? '#16a34a' : '#f9fafb', border: primary ? 'none' : '1px solid #e5e7eb', borderRadius: '6px', color: primary ? '#fff' : '#374151', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = primary ? '#15803d' : '#f3f4f6' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = primary ? '#16a34a' : '#f9fafb' }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
