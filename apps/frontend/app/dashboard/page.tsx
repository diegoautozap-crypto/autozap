'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { campaignApi, conversationApi, contactApi, tenantApi, channelApi, authApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n'
import {
  Megaphone, Users, MessageSquare, Send, ArrowUpRight, TrendingUp,
  CheckCheck, Eye, Radio, FileText, Zap, ChevronRight, Check,
  Clock, UserCheck, Workflow, X,
} from 'lucide-react'
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

function MetricCard({ label, value, sub, icon: Icon, color, bg, href, onClick }: any) {
  return (
    <div onClick={onClick}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', cursor: 'pointer', transition: 'all 0.15s', boxShadow: 'var(--shadow)' }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'; el.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = 'var(--shadow)'; el.style.transform = 'translateY(0)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={17} color={color} strokeWidth={2} />
        </div>
        <ArrowUpRight size={13} color="var(--text-faintest)" />
      </div>
      <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: '4px' }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{sub}</div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color, bg, onClick }: any) {
  return (
    <div onClick={onClick} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: 'var(--shadow)', cursor: onClick ? 'pointer' : 'default', transition: 'all 0.15s' }}
      onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,.07)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' } }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}>
      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>{value}</div>
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
  const { data: contactsMeta, isLoading: loadingContacts } = useQuery({ queryKey: ['contacts-count'], queryFn: async () => { const { data } = await contactApi.get('/contacts?limit=1'); return data.meta }, refetchInterval: 15000 })
  const { data: usage } = useQuery({ queryKey: ['usage'], queryFn: async () => { const { data } = await tenantApi.get('/tenant/usage'); return data.data }, refetchInterval: 15000 })
  const { data: teamMembers } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => { const { data } = await authApi.get('/auth/team'); return data.data || [] },
  })

  // Pipeline funnel data
  const { data: pipelineBoard } = useQuery({
    queryKey: ['pipeline-board-funnel'],
    queryFn: async () => {
      const { data } = await conversationApi.get('/conversations/pipeline')
      return data.data as Record<string, any[]>
    },
    staleTime: 30000, refetchInterval: 30000,
  })
  const { data: pipelineColumns } = useQuery({
    queryKey: ['pipeline-columns-funnel'],
    queryFn: async () => {
      const { data } = await conversationApi.get('/pipeline-columns')
      return data.data as any[]
    },
    staleTime: 60000,
  })

  const [selectedAgent, setSelectedAgent] = useState<string>('')

  const { data: analytics } = useQuery({
    queryKey: ['analytics', selectedAgent],
    queryFn: async () => {
      const url = selectedAgent ? `/tenant/analytics?userId=${selectedAgent}` : '/tenant/analytics'
      const { data } = await tenantApi.get(url)
      return data.data
    },
    refetchInterval: 10000,
  })

  const totalSent = analytics?.totalSent ?? 0
  const deliveryRate = analytics?.deliveryRate ?? 0
  const readRate = analytics?.readRate ?? 0
  const byDay = analytics?.byDay || {}
  const byAgent: { name: string; count: number }[] = analytics?.byAgent || []
  const avgResponseMinutes: number | null = analytics?.avgResponseMinutes ?? null
  const activeFlowsToday: number = analytics?.activeFlowsToday ?? 0
  const flowExecutionsToday: number = analytics?.flowExecutionsToday ?? 0
  const agentConversations: number | null = analytics?.agentConversations ?? null
  const agentClosedLast7d: number | null = analytics?.agentClosedLast7d ?? null
  const days = Object.keys(byDay).sort()
  const maxVal = Math.max(...days.map(d => byDay[d]?.sent || 0), 1)

  const metricCards = [
    { label: t('dashboard.campaigns'),         value: campaigns?.length ?? 0,     sub: `${campaigns?.filter((c: any) => c.status === 'running').length || 0} ${t('dashboard.inProgress')}`, icon: Megaphone,    color: '#2563eb', bg: '#eff6ff', href: '/dashboard/campaigns' },
    { label: t('dashboard.contacts'),          value: contactsMeta?.total ?? 0,   sub: t('dashboard.inYourBase'),                                                                         icon: Users,        color: '#7c3aed', bg: '#f5f3ff', href: '/dashboard/contacts' },
    { label: t('dashboard.openConversations'), value: conversations?.length ?? 0, sub: `${conversations?.filter((c: any) => c.unread_count > 0).length || 0} ${t('dashboard.unread')}`,      icon: MessageSquare, color: '#22c55e', bg: '#f0fdf4', href: '/dashboard/inbox' },
    { label: t('dashboard.messagesThisMonth'), value: usage?.sent ?? 0,          sub: `${t('dashboard.of')} ${usage?.limit === null ? '∞' : (usage?.limit ?? 0).toLocaleString()} ${t('dashboard.available')}`, icon: Send,        color: '#ea580c', bg: '#fff7ed', href: '/dashboard/campaigns' },
  ]

  return (
    <div className="mobile-page" style={{ padding: '32px', maxWidth: '1200px' }}>

      {/* Saudação */}
      <div className="mobile-header" style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>{getGreeting(t)}! 👋</h1>
        <p style={{ color: 'var(--text-faint)', fontSize: '14px', marginTop: '4px' }}>{t('dashboard.summaryToday')}</p>
      </div>


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

      {/* Taxa cards */}
      <div className="mobile-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard label={t('dashboard.sent30days')} value={totalSent.toLocaleString()} icon={Send}       color="#2563eb" bg="#eff6ff" />
        <StatCard label={t('dashboard.deliveryRate')}    value={`${deliveryRate}%`}          icon={CheckCheck} color="#22c55e" bg="#f0fdf4" />
        <StatCard label={t('dashboard.readRate')}    value={`${readRate}%`}              icon={Eye}        color="#7c3aed" bg="#f5f3ff" />
      </div>

      {/* Seletor de atendente (só owner/admin) */}
      {(role === 'owner' || role === 'admin') && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: 'var(--shadow)' }}>
          <UserCheck size={15} color="var(--text-faint)" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>{t('dashboard.viewPerformanceOf')}</span>
          <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}
            style={{ padding: '6px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text)', outline: 'none', cursor: 'pointer', minWidth: '200px' }}>
            <option value="">{t('dashboard.wholeTeam')}</option>
            {(teamMembers || []).map((m: any) => (
              <option key={m.id} value={m.id}>{m.name || m.email}</option>
            ))}
          </select>
          {selectedAgent && (
            <button onClick={() => setSelectedAgent('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)'}>
              <X size={13} /> {t('dashboard.clear')}
            </button>
          )}
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

      {/* Métricas operacionais */}
      <div className="mobile-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <StatCard label={t('dashboard.avgResponseTime7d')}       value={formatResponseTime(avgResponseMinutes)} icon={Clock}      color="#ea580c" bg="#fff7ed" />
        <StatCard label={t('dashboard.flowsFiredToday')}               value={activeFlowsToday}                       icon={Workflow}   color="#22c55e" bg="#f0fdf4" onClick={() => router.push('/dashboard/flows')} />
        <StatCard label={t('dashboard.agentsWithOpen')}   value={byAgent.length}                          icon={UserCheck}  color="#2563eb" bg="#eff6ff" />
      </div>

      {/* Gráfico + Conversas por atendente */}
      <div className="mobile-grid-1" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '14px', marginBottom: '20px' }}>
        {/* Gráfico de barras */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>{t('dashboard.messagesSent')}</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '2px 0 0' }}>{t('dashboard.last30days')}</p>
            </div>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', fontSize: '12px', color: 'var(--text-faint)' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#22c55e' }} /> {t('dashboard.sent')}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '140px', paddingBottom: '24px', position: 'relative' }}>
            {[0.25, 0.5, 0.75, 1].map(p => (
              <div key={p} style={{ position: 'absolute', left: 0, right: 0, bottom: `${24 + p * 116}px`, borderTop: '1px dashed var(--divider)', zIndex: 0 }} />
            ))}
            {days.map((day, i) => {
              const sent = byDay[day]?.sent || 0
              return (
                <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                  <div title={`${day}: ${sent} ${t('dashboard.sent').toLowerCase()}`}
                    style={{ width: '100%', maxWidth: '18px', height: `${Math.max(sent / maxVal * 116, sent > 0 ? 3 : 0)}px`, background: '#22c55e', borderRadius: '2px 2px 0 0', transition: 'height 0.3s ease', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = '#16a34a'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = '#22c55e'} />
                  {i % 5 === 0 && <span style={{ position: 'absolute', bottom: '0', fontSize: '9px', color: 'var(--text-faintest)', whiteSpace: 'nowrap' }}>{day.slice(5)}</span>}
                </div>
              )
            })}
          </div>
          {totalSent === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-faint)', fontSize: '13px' }}>{t('dashboard.noMessagesSent30d')}</div>}
        </div>

        {/* Conversas por atendente */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', boxShadow: 'var(--shadow)' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>{t('dashboard.byAgent')}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '2px 0 0' }}>{t('dashboard.assignedOpenConvs')}</p>
          </div>
          {byAgent.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-faint)', fontSize: '13px' }}>{t('dashboard.noAssignedConvs')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {byAgent.map((agent, i) => {
                const maxCount = byAgent[0].count
                const pct = Math.round((agent.count / maxCount) * 100)
                const colors = ['#22c55e', '#2563eb', '#7c3aed', '#db2777', '#d97706']
                const color = colors[i % colors.length]
                return (
                  <div key={agent.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
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
          )}
        </div>
      </div>

      {/* Funil de conversão */}
      {pipelineBoard && (() => {
        const defaultCols = [
          { key: 'lead', label: 'Lead', color: '#6b7280' },
          { key: 'qualificacao', label: 'Qualificação', color: '#2563eb' },
          { key: 'proposta', label: 'Proposta', color: '#7c3aed' },
          { key: 'negociacao', label: 'Negociação', color: '#d97706' },
          { key: 'ganho', label: 'Ganho', color: '#16a34a' },
          { key: 'perdido', label: 'Perdido', color: '#dc2626' },
        ]
        const cols = (pipelineColumns && pipelineColumns.length > 0) ? pipelineColumns : defaultCols
        // Exclude "perdido" from funnel (it's not a conversion stage)
        const funnelCols = cols.filter((c: any) => c.key !== 'perdido')
        const funnelData = funnelCols.map((col: any) => ({
          label: col.label,
          color: col.color || '#6b7280',
          count: (pipelineBoard[col.key] || []).length,
        }))
        const maxCount = Math.max(...funnelData.map((d: any) => d.count), 1)
        const totalEntries = funnelData[0]?.count || 0

        if (totalEntries === 0 && funnelData.every((d: any) => d.count === 0)) return null

        return (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '20px', boxShadow: 'var(--shadow)', cursor: 'pointer' }}
            onClick={() => router.push('/dashboard/pipeline')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>Funil de Pipeline</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '2px 0 0' }}>Conversão entre etapas</p>
              </div>
              <Workflow size={16} color="var(--text-faintest)" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {funnelData.map((stage: any, i: number) => {
                const widthPct = Math.max((stage.count / maxCount) * 100, 8)
                const prevCount = i > 0 ? funnelData[i - 1].count : null
                const conversionPct = prevCount && prevCount > 0 ? Math.round((stage.count / prevCount) * 100) : null
                return (
                  <div key={stage.label}>
                    {i > 0 && conversionPct !== null && (
                      <div style={{ textAlign: 'center', fontSize: '10px', color: 'var(--text-faint)', padding: '2px 0', fontWeight: 600 }}>
                        {conversionPct}%
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', width: '100px', textAlign: 'right', flexShrink: 0 }}>{stage.label}</span>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <div style={{ width: `${widthPct}%`, height: '28px', background: stage.color, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width 0.4s ease', margin: '0 auto', minWidth: '40px', opacity: 0.85 }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{stage.count}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

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
