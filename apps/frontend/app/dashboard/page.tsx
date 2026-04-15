'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { campaignApi, conversationApi, contactApi, tenantApi, channelApi, authApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n'
import {
  Megaphone, Users, MessageSquare, Send, ArrowUpRight, TrendingUp,
  CheckCheck, Eye, Radio, FileText, Zap, ChevronRight, Check,
  Clock, UserCheck, Workflow, X, Trophy, Printer,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth.store'
import { GridSkeleton } from '@/components/ui/skeleton'

function getGreeting(t: (key: string) => string) {
  const h = new Date().getHours()
  if (h < 12) return t('dashboard.goodMorning')
  if (h < 18) return t('dashboard.goodAfternoon')
  return t('dashboard.goodEvening')
}

function formatResponseTime(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function OnboardingBanner({ channels, templates, campaigns }: { channels: any[]; templates: any[]; campaigns: any[] }) {
  const router = useRouter()
  const t = useT()
  const steps = [
    { id: 'channel',  label: t('dashboard.onboarding.connectChannel'), desc: t('dashboard.onboarding.connectChannelDesc'), icon: Radio,    done: channels.length > 0,  href: '/dashboard/channels',  btnLabel: t('dashboard.onboarding.configureChannel') },
    { id: 'template', label: t('dashboard.onboarding.registerTemplate'),       desc: t('dashboard.onboarding.registerTemplateDesc'),        icon: FileText, done: templates.length > 0, href: '/dashboard/templates', btnLabel: t('dashboard.onboarding.registerTemplate') },
    { id: 'campaign', label: t('dashboard.onboarding.createFirstCampaign'), desc: t('dashboard.onboarding.createFirstCampaignDesc'), icon: Megaphone, done: campaigns.length > 0, href: '/dashboard/campaigns', btnLabel: t('dashboard.onboarding.createCampaign') },
  ]
  const completedCount = steps.filter(s => s.done).length
  if (completedCount === steps.length) return null
  const pct = Math.round((completedCount / steps.length) * 100)

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Zap size={15} color="#22c55e" fill="#22c55e" />
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>{t('dashboard.onboarding.title')}</h3>
            <span style={{ fontSize: '11px', fontWeight: 600, background: '#f0fdf4', color: '#15803d', padding: '2px 8px', borderRadius: '99px', border: '1px solid #bbf7d0' }}>{completedCount}/{steps.length} {t('dashboard.onboarding.completed')}</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-faint)' }}>{t('dashboard.onboarding.subtitle')}</p>
        </div>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#22c55e' }}>{pct}%</span>
      </div>
      <div style={{ height: '4px', background: 'var(--bg)', borderRadius: '99px', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#22c55e', borderRadius: '99px', transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
        {steps.map((step, idx) => {
          const Icon = step.icon
          const isNext = !step.done && steps.slice(0, idx).every(s => s.done)
          return (
            <div key={step.id} style={{ border: `1px solid ${step.done ? '#bbf7d0' : isNext ? '#22c55e' : 'var(--border)'}`, borderRadius: '10px', padding: '14px', background: step.done ? '#f0fdf4' : 'var(--bg-card)', opacity: !step.done && !isNext ? 0.55 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: step.done ? '#dcfce7' : isNext ? '#f0fdf4' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {step.done ? <Check size={15} color="#22c55e" /> : <Icon size={15} color={isNext ? '#22c55e' : 'var(--text-faint)'} />}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: step.done ? '#15803d' : 'var(--text)', margin: '0 0 2px', letterSpacing: '-0.01em' }}>{step.label}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '0 0 10px', lineHeight: 1.5 }}>{step.desc}</p>
                  {!step.done && (
                    <button onClick={() => router.push(step.href)} disabled={!isNext}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', background: isNext ? '#22c55e' : 'var(--bg)', color: isNext ? '#fff' : 'var(--text-faint)', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: isNext ? 'pointer' : 'not-allowed' }}>
                      {step.btnLabel} {isNext && <ChevronRight size={12} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function hexToRgba(hex: string, alpha: number) {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function MetricCard({ label, value, sub, icon: Icon, color, bg, href, onClick }: any) {
  const softShadow = `0 1px 3px ${hexToRgba(color, 0.06)}, 0 1px 2px rgba(0,0,0,.03)`
  const hoverShadow = `0 10px 24px ${hexToRgba(color, 0.12)}, 0 2px 4px ${hexToRgba(color, 0.06)}`
  return (
    <div onClick={onClick}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', cursor: 'pointer', transition: 'all 0.2s cubic-bezier(.4,0,.2,1)', boxShadow: softShadow, position: 'relative', overflow: 'hidden' }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = hoverShadow; el.style.transform = 'translateY(-2px)'; el.style.borderColor = hexToRgba(color, 0.3) }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = softShadow; el.style.transform = 'translateY(0)'; el.style.borderColor = 'var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div style={{
          width: '38px', height: '38px', borderRadius: '10px',
          background: `linear-gradient(135deg, ${hexToRgba(color, 0.12)}, ${hexToRgba(color, 0.22)})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `inset 0 0 0 1px ${hexToRgba(color, 0.15)}`,
        }}>
          <Icon size={18} color={color} strokeWidth={2.2} />
        </div>
        <ArrowUpRight size={13} color="var(--text-faintest)" />
      </div>
      <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: '4px', fontVariantNumeric: 'tabular-nums' }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{sub}</div>
    </div>
  )
}

function DonutChart({ segments, size = 160, thickness = 22, centerLabel, centerValue }: {
  segments: { label: string; value: number; color: string }[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string | number
}) {
  const nonZero = segments.filter(s => s.value > 0)
  const total = nonZero.reduce((s, seg) => s + seg.value, 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  // Gap pequeno entre fatias (só se tiver mais de 1 segmento)
  const gap = nonZero.length > 1 ? 3 : 0
  const totalGap = gap * nonZero.length
  const usable = circumference - totalGap
  let offset = 0

  if (total === 0) {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: `${thickness}px solid var(--bg-input)`, boxSizing: 'border-box', color: 'var(--text-faintest)', fontSize: '12px' }}>
        Sem dados
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--bg-input)" strokeWidth={thickness} />
        {nonZero.map((seg, i) => {
          const length = (seg.value / total) * usable
          const el = (
            <circle key={i}
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={seg.color} strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(.4,0,.2,1)' }}
            />
          )
          offset += length + gap
          return el
        })}
      </svg>
      {(centerValue !== undefined || centerLabel) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          {centerValue !== undefined && <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{centerValue}</div>}
          {centerLabel && <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: '5px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{centerLabel}</div>}
        </div>
      )}
    </div>
  )
}

function PieCard({ title, subtitle, segments, centerValue, centerLabel }: {
  title: string
  subtitle?: string
  segments: { label: string; value: number; color: string }[]
  centerValue?: string | number
  centerLabel?: string
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)' }}>
      <div style={{ marginBottom: '14px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>{title}</h3>
        {subtitle && <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '2px 0 0' }}>{subtitle}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <DonutChart segments={segments} centerValue={centerValue} centerLabel={centerLabel} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
          {segments.map(seg => {
            const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0
            return (
              <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: seg.color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seg.label}</span>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{seg.value}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-faint)', width: '32px', textAlign: 'right' }}>{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color, bg, onClick, delta }: any) {
  const softShadow = `0 1px 3px ${hexToRgba(color, 0.05)}, 0 1px 2px rgba(0,0,0,.03)`
  const hoverShadow = `0 8px 20px ${hexToRgba(color, 0.1)}, 0 2px 4px ${hexToRgba(color, 0.05)}`
  return (
    <div onClick={onClick} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: softShadow, cursor: onClick ? 'pointer' : 'default', transition: 'all 0.2s cubic-bezier(.4,0,.2,1)' }}
      onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLDivElement).style.boxShadow = hoverShadow; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)' } }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = softShadow; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}>
      <div style={{
        width: '42px', height: '42px', borderRadius: '11px',
        background: `linear-gradient(135deg, ${hexToRgba(color, 0.12)}, ${hexToRgba(color, 0.22)})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        boxShadow: `inset 0 0 0 1px ${hexToRgba(color, 0.15)}`,
      }}>
        <Icon size={19} color={color} strokeWidth={2.2} />
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
          {delta != null && delta !== 0 && <span style={{ fontSize: '11px', fontWeight: 700, color: delta > 0 ? '#16a34a' : '#dc2626', background: delta > 0 ? '#f0fdf4' : '#fef2f2', padding: '1px 6px', borderRadius: '99px' }}>{delta > 0 ? '+' : ''}{delta}%</span>}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '1px' }}>{label}</div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const t = useT()
  const { user } = useAuthStore()
  const role = (user as any)?.role || 'agent'

  const { data: campaigns, isLoading: loadingCampaigns } = useQuery({ queryKey: ['campaigns'], queryFn: async () => { const { data } = await campaignApi.get('/campaigns'); return data.data }, refetchInterval: 15000 })
  const { data: channels } = useQuery({ queryKey: ['channels'], queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data }, refetchInterval: 30000 })
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: async () => { const { data } = await campaignApi.get('/templates'); return data.data }, refetchInterval: 30000 })
  const { data: conversations } = useQuery({ queryKey: ['conversations', 'open'], queryFn: async () => { const { data } = await conversationApi.get('/conversations?status=open'); return data.data }, refetchInterval: 15000 })
  const { data: conversationsWaiting } = useQuery({ queryKey: ['conversations', 'waiting'], queryFn: async () => { const { data } = await conversationApi.get('/conversations?status=waiting&limit=1'); return data.meta }, refetchInterval: 30000 })
  const { data: conversationsClosed } = useQuery({ queryKey: ['conversations', 'closed'], queryFn: async () => { const { data } = await conversationApi.get('/conversations?status=closed&limit=1'); return data.meta }, refetchInterval: 60000 })
  const { data: contactsMeta, isLoading: loadingContacts } = useQuery({ queryKey: ['contacts-count'], queryFn: async () => { const { data } = await contactApi.get('/contacts?limit=1'); return data.meta }, refetchInterval: 15000 })
  const { data: usage } = useQuery({ queryKey: ['usage'], queryFn: async () => { const { data } = await tenantApi.get('/tenant/usage'); return data.data }, refetchInterval: 15000 })
  const { data: teamMembers } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => { const { data } = await authApi.get('/auth/team'); return data.data || [] },
  })

  // Pipeline funnel data
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('')

  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines-dash'],
    queryFn: async () => { const { data } = await conversationApi.get('/pipelines'); return data.data || [] },
    staleTime: 60000,
  })

  const { data: pipelineBoard } = useQuery({
    queryKey: ['pipeline-board-funnel', selectedPipelineId],
    queryFn: async () => {
      const params = selectedPipelineId ? `?pipelineId=${selectedPipelineId}` : ''
      const { data } = await conversationApi.get(`/conversations/pipeline${params}`)
      return data.data as Record<string, any[]>
    },
    staleTime: 30000, refetchInterval: 30000,
  })
  const { data: pipelineColumns } = useQuery({
    queryKey: ['pipeline-columns-funnel', selectedPipelineId],
    queryFn: async () => {
      const params = selectedPipelineId ? `?pipelineId=${selectedPipelineId}` : ''
      const { data } = await conversationApi.get(`/pipeline-columns${params}`)
      return data.data as any[]
    },
    staleTime: 60000,
  })

  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const [analyticsDays, setAnalyticsDays] = useState(30)

  const { data: activity = [] } = useQuery({
    queryKey: ['pipeline-activity'],
    queryFn: async () => {
      const { data } = await conversationApi.get('/pipeline/activity?limit=12')
      return data.data || []
    },
    refetchInterval: 30000,
  })

  const { data: analytics } = useQuery({
    queryKey: ['analytics', selectedAgent, analyticsDays],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedAgent) params.set('userId', selectedAgent)
      params.set('days', String(analyticsDays))
      const { data } = await tenantApi.get(`/tenant/analytics?${params}`)
      return data.data
    },
    refetchInterval: 10000,
  })

  const totalSent = analytics?.totalSent ?? 0
  const deliveryRate = analytics?.deliveryRate ?? 0
  const readRate = analytics?.readRate ?? 0
  const prev = analytics?.previous || {}
  const deltaFn = (curr: number, prevVal: number | undefined) => (!prevVal || prevVal === 0) ? null : Math.round(((curr - prevVal) / prevVal) * 100)
  const byDay = analytics?.byDay || {}
  const byAgent: { name: string; count: number }[] = analytics?.byAgent || []
  const agentRanking: { name: string; messagesResponded: number; avgResponseMinutes: number | null; conversationsClosed: number; openConversations: number }[] = analytics?.agentRanking || []
  const avgResponseMinutes: number | null = analytics?.avgResponseMinutes ?? null
  const activeFlowsToday: number = analytics?.activeFlowsToday ?? 0
  const flowExecutionsToday: number = analytics?.flowExecutionsToday ?? 0
  const agentConversations: number | null = analytics?.agentConversations ?? null
  const agentClosedLast7d: number | null = analytics?.agentClosedLast7d ?? null
  const days = Object.keys(byDay).sort()
  const maxVal = Math.max(...days.map(d => byDay[d]?.sent || 0), 1)

  function generateReport() {
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) { toast.error('Permita pop-ups para gerar o relatório'); return }

    const html = `
      <html>
      <head><title>Relatório AutoZap</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #18181b; }
        h1 { font-size: 24px; color: #22c55e; }
        .metric { display: inline-block; margin: 10px 20px 10px 0; }
        .metric-value { font-size: 28px; font-weight: 700; }
        .metric-label { font-size: 12px; color: #71717a; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e4e4e7; }
        th { font-size: 12px; color: #71717a; }
      </style>
      </head>
      <body>
        <h1>AutoZap — Relatório</h1>
        <p>Período: últimos ${analyticsDays} dias</p>
        <div>
          <div class="metric"><div class="metric-value">${totalSent}</div><div class="metric-label">Mensagens enviadas</div></div>
          <div class="metric"><div class="metric-value">${deliveryRate}%</div><div class="metric-label">Taxa de entrega</div></div>
          <div class="metric"><div class="metric-value">${readRate}%</div><div class="metric-label">Taxa de leitura</div></div>
          <div class="metric"><div class="metric-value">${conversations?.length || 0}</div><div class="metric-label">Conversas abertas</div></div>
          <div class="metric"><div class="metric-value">${contactsMeta?.total || 0}</div><div class="metric-label">Contatos</div></div>
        </div>
        ${agentRanking.length > 0 ? `
          <h2 style="margin-top:30px;font-size:18px;">Ranking de atendentes</h2>
          <table>
            <thead><tr><th>#</th><th>Agente</th><th>Mensagens</th><th>Tempo médio</th><th>Fechadas</th></tr></thead>
            <tbody>${agentRanking.map((a, i) => `<tr><td>${i+1}</td><td>${a.name}</td><td>${a.messagesResponded}</td><td>${a.avgResponseMinutes ? a.avgResponseMinutes + 'min' : '—'}</td><td>${a.conversationsClosed}</td></tr>`).join('')}</tbody>
          </table>
        ` : ''}
        <p style="margin-top:40px;font-size:11px;color:#a1a1aa;">Gerado em ${new Date().toLocaleString('pt-BR')} — AutoZap CRM</p>
      </body></html>
    `
    reportWindow.document.write(html)
    reportWindow.document.close()
    setTimeout(() => reportWindow.print(), 500)
  }

  const metricCards = [
    { label: t('dashboard.campaigns'),         value: campaigns?.length ?? 0,     sub: `${campaigns?.filter((c: any) => c.status === 'running').length || 0} ${t('dashboard.inProgress')}`, icon: Megaphone,    color: '#2563eb', bg: '#eff6ff', href: '/dashboard/campaigns' },
    { label: t('dashboard.contacts'),          value: contactsMeta?.total ?? 0,   sub: t('dashboard.inYourBase'),                                                                         icon: Users,        color: '#7c3aed', bg: '#f5f3ff', href: '/dashboard/contacts' },
    { label: t('dashboard.openConversations'), value: conversations?.length ?? 0, sub: `${conversations?.filter((c: any) => c.unread_count > 0).length || 0} ${t('dashboard.unread')}`,      icon: MessageSquare, color: '#22c55e', bg: '#f0fdf4', href: '/dashboard/inbox' },
    { label: t('dashboard.messagesThisMonth'), value: usage?.sent ?? 0,          sub: `${t('dashboard.of')} ${usage?.limit === null ? '∞' : (usage?.limit ?? 0).toLocaleString()} ${t('dashboard.available')}`, icon: Send,        color: '#ea580c', bg: '#fff7ed', href: '/dashboard/campaigns' },
  ]

  return (
    <div className="mobile-page" style={{ padding: '32px', maxWidth: '1200px' }}>

      {/* Saudação + filtros compactos no header */}
      <div className="mobile-header" style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>{getGreeting(t)}! 👋</h1>
          <p style={{ color: 'var(--text-faint)', fontSize: '14px', marginTop: '4px' }}>{t('dashboard.summaryToday')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {(role === 'owner' || role === 'admin') && (teamMembers || []).length > 1 && (
            <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}
              style={{ padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', outline: 'none', cursor: 'pointer', boxShadow: 'var(--shadow)' }}>
              <option value="">Toda a equipe</option>
              {(teamMembers || []).map((m: any) => (
                <option key={m.id} value={m.id}>{m.name || m.email}</option>
              ))}
            </select>
          )}
          {(role === 'owner' || role === 'admin') && (
            <button onClick={generateReport}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', boxShadow: 'var(--shadow)', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#22c55e'; (e.currentTarget as HTMLButtonElement).style.color = '#22c55e' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}>
              <Printer size={14} />
              Gerar relatório
            </button>
          )}
        </div>
      </div>

      {/* Barra "Hoje" */}
      {(() => {
        const todayKey = new Date().toISOString().split('T')[0]
        const msgsToday = byDay[todayKey]?.sent || 0
        const waiting = analytics?.sla?.currentlyWaiting || 0
        const breached = analytics?.sla?.currentlyBreached || 0
        const items = [
          { icon: Send, color: '#22c55e', bg: '#f0fdf4', value: msgsToday, label: 'mensagens enviadas' },
          { icon: MessageSquare, color: '#2563eb', bg: '#eff6ff', value: waiting, label: 'aguardando resposta' },
          { icon: Clock, color: breached > 0 ? '#dc2626' : '#94a3b8', bg: breached > 0 ? '#fef2f2' : '#f4f4f5', value: breached, label: 'estouradas agora' },
        ]
        return (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 20px', marginBottom: '20px', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>Hoje</div>
            {items.map((it, i) => {
              const I = it.icon
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: it.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <I size={14} color={it.color} />
                  </div>
                  <div>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{it.value}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-faint)', marginLeft: '6px' }}>{it.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}


      {/* Cards principais */}
      {(loadingCampaigns && loadingContacts) ? (
        <div style={{ marginBottom: '20px' }}><GridSkeleton cols={4} /></div>
      ) : (
        <div className="mobile-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {metricCards.map(({ label, value, sub, icon, color, bg, href }) => (
            <MetricCard key={label} label={label} value={value} sub={sub} icon={icon} color={color} bg={bg} href={href} onClick={() => router.push(href)} />
          ))}
        </div>
      )}

      {/* VOLUME section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Volume</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {[7, 14, 30, 90].map(d => (
            <button key={d} onClick={() => setAnalyticsDays(d)}
              style={{ padding: '4px 10px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, border: `1px solid ${analyticsDays === d ? '#22c55e' : 'var(--border)'}`, cursor: 'pointer', background: analyticsDays === d ? '#f0fdf4' : 'transparent', color: analyticsDays === d ? '#16a34a' : 'var(--text-muted)', transition: 'all 0.1s' }}>
              {d}d
            </button>
          ))}
        </div>
      </div>
      <div className="mobile-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '18px' }}>
        <StatCard label={`Mensagens (${analyticsDays}d)`} value={totalSent.toLocaleString()} icon={Send} color="#2563eb" bg="#eff6ff" delta={deltaFn(totalSent, prev.totalSent)} />
        <StatCard label={t('dashboard.deliveryRate')} value={totalSent > 0 ? `${deliveryRate}%` : '—'} icon={CheckCheck} color="#22c55e" bg="#f0fdf4" delta={totalSent > 0 && prev.deliveryRate != null ? deliveryRate - prev.deliveryRate : null} />
        <StatCard label={t('dashboard.readRate')} value={totalSent > 0 ? `${readRate}%` : '—'} icon={Eye} color="#7c3aed" bg="#f5f3ff" delta={totalSent > 0 && prev.readRate != null ? readRate - prev.readRate : null} />
      </div>

      {selectedAgent && (
        <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserCheck size={12} />
          Filtrando desempenho por agente selecionado
          <button onClick={() => setSelectedAgent('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: 0 }}>
            <X size={11} /> limpar
          </button>
        </div>
      )}

      {/* Métricas do atendente selecionado */}
      {selectedAgent && (
        <div className="mobile-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
          <StatCard label={t('dashboard.assignedOpenConvs')}  value={agentConversations ?? '—'}              icon={MessageSquare} color="#22c55e" bg="#f0fdf4" />
          <StatCard label={t('dashboard.closedConvs7d')}   value={agentClosedLast7d ?? '—'}               icon={CheckCheck}    color="#2563eb" bg="#eff6ff" />
          <StatCard label={t('dashboard.avgResponseTime7d')}  value={formatResponseTime(avgResponseMinutes)} icon={Clock}         color="#ea580c" bg="#fff7ed" />
        </div>
      )}

      {/* DISTRIBUIÇÃO section */}
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Distribuição</div>
      <div className="mobile-grid-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '18px' }}>
        <PieCard
          title="Conversas por status"
          subtitle="Distribuição atual"
          centerValue={(conversations?.length || 0) + (conversationsWaiting?.total || 0)}
          centerLabel="abertas"
          segments={[
            { label: 'Em aberto', value: conversations?.length || 0, color: '#22c55e' },
            { label: 'Aguardando', value: conversationsWaiting?.total || 0, color: '#d97706' },
            { label: 'Fechadas', value: conversationsClosed?.total || 0, color: '#94a3b8' },
          ]}
        />
        {(() => {
          const cardCount = pipelineBoard ? Object.values(pipelineBoard).reduce((a: number, arr: any) => a + arr.length, 0) : 0
          const hasColumns = (pipelineColumns || []).length > 0
          if (!hasColumns || cardCount === 0) {
            return (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>Pipeline por etapa</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '2px 0 0' }}>Cards em cada coluna</p>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 10px', textAlign: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                    <Workflow size={22} color="#7c3aed" />
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px', maxWidth: '260px' }}>
                    {hasColumns ? 'Nenhum card em seu pipeline ainda' : 'Configure seu primeiro pipeline pra acompanhar seus negócios'}
                  </p>
                  <button onClick={() => router.push('/dashboard/pipeline')}
                    style={{ padding: '7px 14px', background: '#22c55e', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {hasColumns ? 'Abrir pipeline' : 'Configurar pipeline'} <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )
          }
          return (
            <PieCard
              title="Pipeline por etapa"
              subtitle="Cards em cada coluna"
              centerValue={cardCount}
              centerLabel="cards"
              segments={(pipelineColumns || []).map((col: any, i: number) => ({
                label: col.label,
                value: pipelineBoard?.[col.key]?.length || 0,
                color: col.color || ['#22c55e', '#2563eb', '#7c3aed', '#db2777', '#d97706', '#dc2626'][i % 6],
              }))}
            />
          )
        })()}
      </div>

      {/* SLA bloco com pizza + métricas */}
      {analytics?.sla && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)', marginBottom: '18px' }}>
          <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>SLA — Tempo de resposta</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '2px 0 0' }}>Meta: {analytics.sla.targetMinutes} minutos · últimos {analyticsDays} dias</p>
            </div>
            <button onClick={() => router.push('/dashboard/settings')}
              style={{ fontSize: '11px', color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Configurar
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <DonutChart
              size={140} thickness={22}
              segments={[
                { label: 'Dentro', value: analytics.sla.withinCount || 0, color: '#16a34a' },
                { label: 'Fora', value: analytics.sla.breachedCount || 0, color: '#dc2626' },
              ]}
              centerValue={analytics.sla.withinPct !== null ? `${analytics.sla.withinPct}%` : '—'}
              centerLabel="no SLA"
            />
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#16a34a', letterSpacing: '-0.02em' }}>{analytics.sla.withinCount || 0}</div>
                <div style={{ fontSize: '11px', color: '#15803d', marginTop: '2px' }}>Respondidas no prazo</div>
              </div>
              <div style={{ padding: '12px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', cursor: 'pointer' }} onClick={() => router.push('/dashboard/inbox')}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#2563eb', letterSpacing: '-0.02em' }}>{analytics.sla.currentlyWaiting || 0}</div>
                <div style={{ fontSize: '11px', color: '#1d4ed8', marginTop: '2px' }}>Aguardando agora</div>
              </div>
              <div style={{ padding: '12px 14px', background: (analytics.sla.currentlyBreached || 0) > 0 ? '#fef2f2' : '#f4f4f5', border: `1px solid ${(analytics.sla.currentlyBreached || 0) > 0 ? '#fecaca' : 'var(--border)'}`, borderRadius: '10px', cursor: 'pointer' }} onClick={() => router.push('/dashboard/inbox')}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: (analytics.sla.currentlyBreached || 0) > 0 ? '#dc2626' : 'var(--text-faint)', letterSpacing: '-0.02em' }}>{analytics.sla.currentlyBreached || 0}</div>
                <div style={{ fontSize: '11px', color: (analytics.sla.currentlyBreached || 0) > 0 ? '#991b1b' : 'var(--text-faint)', marginTop: '2px' }}>Estouradas agora</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gráfico mensagens — largura total */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', boxShadow: 'var(--shadow)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>Mensagens enviadas</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '2px 0 0' }}>Últimos {analyticsDays} dias</p>
          </div>
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', fontSize: '12px', color: 'var(--text-faint)' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#22c55e' }} /> Enviadas
          </div>
        </div>
        {totalSent === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-faint)', fontSize: '13px' }}>
            Nenhuma mensagem enviada nos últimos {analyticsDays} dias.
          </div>
        ) : (() => {
          const W = 1000, H = 180, P = 16
          const n = days.length
          const stepX = n > 1 ? (W - P * 2) / (n - 1) : 0
          const scaleY = (v: number) => H - P - (v / maxVal) * (H - P * 2)
          const points = days.map((day, i) => ({
            x: P + i * stepX,
            y: scaleY(byDay[day]?.sent || 0),
            v: byDay[day]?.sent || 0,
            label: day,
          }))
          // Smooth path using bezier cubics
          const buildSmoothPath = () => {
            if (points.length === 0) return ''
            let d = `M ${points[0].x},${points[0].y}`
            for (let i = 0; i < points.length - 1; i++) {
              const p0 = points[i], p1 = points[i + 1]
              const cpX = (p0.x + p1.x) / 2
              d += ` C ${cpX},${p0.y} ${cpX},${p1.y} ${p1.x},${p1.y}`
            }
            return d
          }
          const linePath = buildSmoothPath()
          const areaPath = `${linePath} L ${points[points.length - 1].x},${H - P} L ${points[0].x},${H - P} Z`
          return (
            <div style={{ position: 'relative' }}>
              <svg viewBox={`0 0 ${W} ${H + 20}`} preserveAspectRatio="none" style={{ width: '100%', height: '200px', display: 'block' }}>
                <defs>
                  <linearGradient id="msgAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* grid lines */}
                {[0.25, 0.5, 0.75].map(p => (
                  <line key={p} x1={P} x2={W - P} y1={P + p * (H - P * 2)} y2={P + p * (H - P * 2)} stroke="var(--divider)" strokeDasharray="4 4" />
                ))}
                <path d={areaPath} fill="url(#msgAreaGradient)" />
                <path d={linePath} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {points.map((p, i) => (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r={3} fill="#fff" stroke="#22c55e" strokeWidth="2" />
                    <title>{`${p.label}: ${p.v} enviadas`}</title>
                  </g>
                ))}
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: `0 ${P}px`, fontSize: '10px', color: 'var(--text-faintest)', marginTop: '-8px' }}>
                {(() => {
                  const labels: { idx: number; text: string }[] = []
                  const maxLabels = 8
                  const step = Math.max(1, Math.ceil(n / maxLabels))
                  for (let i = 0; i < n; i += step) labels.push({ idx: i, text: days[i].slice(5) })
                  return labels.map(l => <span key={l.idx}>{l.text}</span>)
                })()}
              </div>
            </div>
          )
        })()}
      </div>

      {/* Conversas por atendente */}
      {byAgent.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)', marginBottom: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>Conversas por atendente</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '2px 0 0' }}>Distribuição de conversas abertas</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {byAgent.map((agent, i) => {
              const maxCount = byAgent[0].count
              const pct = Math.round((agent.count / maxCount) * 100)
              const colors = ['#22c55e', '#2563eb', '#7c3aed', '#db2777', '#d97706']
              const color = colors[i % colors.length]
              return (
                <div key={agent.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>{agent.name}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color }}>{agent.count}</span>
                  </div>
                  <div style={{ height: '5px', background: 'var(--bg)', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* EQUIPE section */}
      {(role === 'owner' || role === 'admin') && (agentRanking.length > 0 || activity.length > 0) && (
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Atividade</div>
      )}

      {/* Atividade recente */}
      {activity.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '14px', boxShadow: 'var(--shadow)' }}>
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>Atividade recente</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '2px 0 0' }}>Últimos eventos no pipeline</p>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activity.slice(0, 8).map((ev: any) => {
              const contact = ev.card?.contacts || ev.conversation?.contacts
              const contactName = contact?.name || contact?.phone || 'Contato'
              const actor = ev.actor?.name || 'Sistema'
              const when = (() => {
                const diff = Date.now() - new Date(ev.created_at).getTime()
                const mins = Math.floor(diff / 60000)
                if (mins < 1) return 'agora'
                if (mins < 60) return `há ${mins}min`
                const hrs = Math.floor(mins / 60)
                if (hrs < 24) return `há ${hrs}h`
                return `há ${Math.floor(hrs / 24)}d`
              })()
              let text = ''
              let color = '#64748b'
              let bg = '#f1f5f9'
              switch (ev.event_type) {
                case 'created':
                  text = `${contactName} entrou no pipeline em ${ev.to_column || '—'}`
                  color = '#7c3aed'; bg = '#f5f3ff'
                  break
                case 'moved':
                  text = `${contactName} movido de ${ev.from_column || '—'} → ${ev.to_column || '—'}`
                  color = '#d97706'; bg = '#fffbeb'
                  break
                case 'value_changed':
                  text = `${contactName} · valor alterado: R$ ${Number(ev.from_value || 0).toFixed(0)} → R$ ${Number(ev.to_value || 0).toFixed(0)}`
                  color = '#059669'; bg = '#ecfdf5'
                  break
                case 'assigned':
                  text = `${contactName} · responsável alterado`
                  color = '#0891b2'; bg = '#ecfeff'
                  break
                default:
                  text = `${contactName} · ${ev.event_type}`
              }
              return (
                <li key={ev.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px', borderRadius: '8px', background: bg, border: `1px solid ${color}20` }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, marginTop: '7px', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{text}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' }}>{actor} · {when}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Ranking de atendentes */}
      {(role === 'owner' || role === 'admin') && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '18px', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Trophy size={15} color="#d97706" />
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>{t('dashboard.agentRanking')}</h3>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '0 0 16px' }}>{t('dashboard.agentRankingDesc')}</p>

          {agentRanking.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-faint)', fontSize: '13px' }}>{t('dashboard.noAgentRanking')}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-faint)', fontWeight: 600, fontSize: '12px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-faint)', fontWeight: 600, fontSize: '12px' }}>{t('dashboard.byAgent')}</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-faint)', fontWeight: 600, fontSize: '12px' }}>{t('dashboard.messagesResponded')}</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-faint)', fontWeight: 600, fontSize: '12px' }}>{t('dashboard.avgTime')}</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-faint)', fontWeight: 600, fontSize: '12px' }}>{t('dashboard.closed')}</th>
                  </tr>
                </thead>
                <tbody>
                  {agentRanking.map((agent, i) => {
                    const medalColors = ['#d97706', '#9ca3af', '#b45309']
                    const avatarColors = [
                      { bg: '#dbeafe', fg: '#1d4ed8' }, { bg: '#dcfce7', fg: '#15803d' },
                      { bg: '#fce7f3', fg: '#be185d' }, { bg: '#ede9fe', fg: '#6d28d9' },
                      { bg: '#ffedd5', fg: '#c2410c' }, { bg: '#e0f2fe', fg: '#0369a1' },
                      { bg: '#fef3c7', fg: '#b45309' }, { bg: '#ccfbf1', fg: '#0f766e' },
                    ]
                    const hash = (agent.name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
                    const av = avatarColors[hash % avatarColors.length]
                    const initials = (agent.name || '??').trim().slice(0, 2).toUpperCase()
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--divider)', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg)'}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: i < 3 ? medalColors[i] : 'var(--text-faint)', width: '36px', fontVariantNumeric: 'tabular-nums' }}>
                          {i < 3 ? '🏆' : i + 1}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: av.bg, color: av.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                              {initials}
                            </div>
                            <span>{agent.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>{agent.messagesResponded}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{formatResponseTime(agent.avgResponseMinutes)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#2563eb', fontVariantNumeric: 'tabular-nums' }}>{agent.conversationsClosed}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Acesso rápido */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
          <TrendingUp size={14} color="#22c55e" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>{t('dashboard.quickAccess')}</span>
        </div>
        <div className="mobile-header-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { label: t('dashboard.newCampaign'),     href: '/dashboard/campaigns', primary: true,  roles: ['owner', 'admin'] },
            { label: t('dashboard.importContacts'), href: '/dashboard/contacts',  primary: false, roles: ['owner', 'admin', 'supervisor'] },
            { label: t('dashboard.openInbox'),       href: '/dashboard/inbox',     primary: false, roles: ['owner', 'admin', 'supervisor', 'agent'] },
            { label: t('dashboard.viewPlan'),         href: '/dashboard/settings',  primary: false, roles: ['owner', 'admin'] },
          ].filter(item => item.roles.includes(role)).map(({ label, href, primary }) => (
            <button key={href} onClick={() => router.push(href)}
              style={{ padding: '8px 16px', background: primary ? '#22c55e' : 'var(--bg-input)', border: primary ? 'none' : '1px solid var(--border)', borderRadius: '8px', color: primary ? '#fff' : 'var(--text-muted)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = primary ? '#16a34a' : 'var(--bg)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = primary ? '#22c55e' : 'var(--bg-input)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
// deploy 1775501739
