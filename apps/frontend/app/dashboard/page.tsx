'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { campaignApi, conversationApi, contactApi, tenantApi, channelApi, authApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import {
  Megaphone, Users, MessageSquare, Send, ArrowUpRight, TrendingUp,
  CheckCheck, Eye, Radio, FileText, Zap, ChevronRight, Check,
  Clock, UserCheck, Workflow, X,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
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
  const steps = [
    { id: 'channel', label: 'Conectar canal WhatsApp', desc: 'Configure seu número no Gupshup e cole o webhook', icon: Radio, done: channels.length > 0, href: '/dashboard/channels', btnLabel: 'Configurar canal' },
    { id: 'template', label: 'Cadastrar template', desc: 'Adicione um template aprovado no Gupshup', icon: FileText, done: templates.length > 0, href: '/dashboard/templates', btnLabel: 'Cadastrar template' },
    { id: 'campaign', label: 'Criar sua primeira campanha', desc: 'Importe contatos e dispare sua primeira mensagem', icon: Megaphone, done: campaigns.length > 0, href: '/dashboard/campaigns', btnLabel: 'Criar campanha' },
  ]
  const completedCount = steps.filter(s => s.done).length
  if (completedCount === steps.length) return null
  const pct = Math.round((completedCount / steps.length) * 100)

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Zap size={16} color="#16a34a" fill="#16a34a" />
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>Configure o AutoZap</h3>
            <span style={{ fontSize: '11px', fontWeight: 600, background: '#f0fdf4', color: '#15803d', padding: '2px 8px', borderRadius: '99px' }}>{completedCount}/{steps.length} concluídos</span>
          </div>
          <p style={{ fontSize: '13px', color: '#6b7280' }}>Siga os passos abaixo para começar a disparar campanhas</p>
        </div>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#16a34a' }}>{pct}%</span>
      </div>
      <div style={{ height: '4px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#16a34a', borderRadius: '99px', transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {steps.map((step, idx) => {
          const Icon = step.icon
          const isNext = !step.done && steps.slice(0, idx).every(s => s.done)
          return (
            <div key={step.id} style={{ border: `1px solid ${step.done ? '#bbf7d0' : isNext ? '#16a34a' : '#e5e7eb'}`, borderRadius: '10px', padding: '14px', background: step.done ? '#f0fdf4' : isNext ? '#fff' : '#fafafa', opacity: !step.done && !isNext ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: step.done ? '#dcfce7' : isNext ? '#f0fdf4' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {step.done ? <Check size={16} color="#16a34a" /> : <Icon size={16} color={isNext ? '#16a34a' : '#9ca3af'} />}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: step.done ? '#15803d' : '#111827', margin: '0 0 2px' }}>{step.label}</p>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 10px', lineHeight: 1.5 }}>{step.desc}</p>
                  {!step.done && (
                    <button onClick={() => router.push(step.href)} disabled={!isNext}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', background: isNext ? '#16a34a' : '#f3f4f6', color: isNext ? '#fff' : '#9ca3af', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: isNext ? 'pointer' : 'not-allowed' }}>
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

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const role = (user as any)?.role || 'agent'

  const { data: campaigns } = useQuery({ queryKey: ['campaigns'], queryFn: async () => { const { data } = await campaignApi.get('/campaigns'); return data.data }, refetchInterval: 15000 })
  const { data: channels } = useQuery({ queryKey: ['channels'], queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data }, refetchInterval: 30000 })
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: async () => { const { data } = await campaignApi.get('/templates'); return data.data }, refetchInterval: 30000 })
  const { data: conversations } = useQuery({ queryKey: ['conversations', 'open'], queryFn: async () => { const { data } = await conversationApi.get('/conversations?status=open'); return data.data }, refetchInterval: 15000 })
  const { data: contactsMeta } = useQuery({ queryKey: ['contacts-count'], queryFn: async () => { const { data } = await contactApi.get('/contacts?limit=1'); return data.meta }, refetchInterval: 15000 })
  const { data: usage } = useQuery({ queryKey: ['usage'], queryFn: async () => { const { data } = await tenantApi.get('/tenant/usage'); return data.data }, refetchInterval: 15000 })
  const { data: teamMembers } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => { const { data } = await authApi.get('/auth/team'); return data.data || [] },
  })

  const [selectedAgent, setSelectedAgent] = useState<string>('')

  const { data: analytics } = useQuery({
    queryKey: ['analytics', selectedAgent],
    queryFn: async () => {
      const url = selectedAgent ? `/tenant/analytics?userId=${selectedAgent}` : '/tenant/analytics'
      const { data } = await tenantApi.get(url)
      return data.data
    },
    refetchInterval: 30000,
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
    { label: 'Campanhas', value: campaigns?.length ?? 0, sub: `${campaigns?.filter((c: any) => c.status === 'running').length || 0} em andamento`, icon: Megaphone, color: '#2563eb', bg: '#eff6ff', href: '/dashboard/campaigns' },
    { label: 'Contatos', value: contactsMeta?.total ?? 0, sub: 'na sua base', icon: Users, color: '#7c3aed', bg: '#f5f3ff', href: '/dashboard/contacts' },
    { label: 'Conversas abertas', value: conversations?.length ?? 0, sub: `${conversations?.filter((c: any) => c.unread_count > 0).length || 0} não lidas`, icon: MessageSquare, color: '#16a34a', bg: '#f0fdf4', href: '/dashboard/inbox' },
    { label: 'Mensagens este mês', value: usage?.sent ?? 0, sub: `de ${usage?.limit === null ? '∞' : (usage?.limit ?? 0).toLocaleString()} disponíveis`, icon: Send, color: '#ea580c', bg: '#fff7ed', href: '/dashboard/campaigns' },
  ]

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>{getGreeting()}! 👋</h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>Aqui está o resumo da sua conta hoje.</p>
      </div>

      <OnboardingBanner channels={channels || []} templates={templates || []} campaigns={campaigns || []} />

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {metricCards.map(({ label, value, sub, icon: Icon, color, bg, href }) => (
          <div key={label} onClick={() => router.push(href)}
            style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', cursor: 'pointer', transition: 'all 0.15s ease' }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'; el.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = 'none'; el.style.transform = 'translateY(0)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color={color} strokeWidth={2} />
              </div>
              <ArrowUpRight size={14} color="#d1d5db" />
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: '4px' }}>{value.toLocaleString()}</div>
            <div style={{ fontSize: '13px', color: '#374151', fontWeight: 500, marginBottom: '2px' }}>{label}</div>
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Taxas + novas métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Enviadas (30 dias)', value: totalSent.toLocaleString(), icon: Send, color: '#2563eb' },
          { label: 'Taxa de entrega', value: `${deliveryRate}%`, icon: CheckCheck, color: '#16a34a' },
          { label: 'Taxa de leitura', value: `${readRate}%`, icon: Eye, color: '#7c3aed' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={18} color={color} />
            </div>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>{value}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Seletor de atendente */}
      {role === 'owner' || role === 'admin' ? (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <UserCheck size={16} color="#6b7280" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Ver desempenho de:</span>
          <select
            value={selectedAgent}
            onChange={e => setSelectedAgent(e.target.value)}
            style={{ padding: '6px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#111827', outline: 'none', cursor: 'pointer', minWidth: '200px' }}>
            <option value="">Toda a equipe</option>
            {(teamMembers || []).map((m: any) => (
              <option key={m.id} value={m.id}>{m.name || m.email}</option>
            ))}
          </select>
          {selectedAgent && (
            <button onClick={() => setSelectedAgent('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <X size={13} /> Limpar filtro
            </button>
          )}
        </div>
      ) : null}

      {/* Métricas do atendente selecionado */}
      {selectedAgent && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MessageSquare size={18} color="#16a34a" />
            </div>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827' }}>{agentConversations ?? '—'}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Conversas abertas atribuídas</div>
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCheck size={18} color="#2563eb" />
            </div>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827' }}>{agentClosedLast7d ?? '—'}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Conversas fechadas (7 dias)</div>
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Clock size={18} color="#ea580c" />
            </div>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827' }}>{formatResponseTime(avgResponseMinutes)}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Tempo médio de resposta (7d)</div>
            </div>
          </div>
        </div>
      )}

      {/* Linha de métricas operacionais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {/* Tempo médio de resposta */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Clock size={18} color="#ea580c" />
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>{formatResponseTime(avgResponseMinutes)}</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Tempo médio de resposta (7d)</div>
          </div>
        </div>

        {/* Flows ativos hoje */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }} onClick={() => router.push('/dashboard/flows')} onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.cursor = 'pointer'}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Workflow size={18} color="#16a34a" />
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>{activeFlowsToday}</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Flows disparados hoje</div>
            {flowExecutionsToday > 0 && <div style={{ fontSize: '11px', color: '#9ca3af' }}>{flowExecutionsToday} execuções</div>}
          </div>
        </div>

        {/* Atendentes ativos */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <UserCheck size={18} color="#2563eb" />
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>{byAgent.length}</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Atendentes com conversas abertas</div>
          </div>
        </div>
      </div>

      {/* Gráfico + Conversas por atendente lado a lado */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px', marginBottom: '24px' }}>
        {/* Gráfico */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Mensagens enviadas</h3>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>Últimos 30 dias</p>
            </div>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', fontSize: '12px', color: '#6b7280' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#16a34a' }} /> Enviadas
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '140px', paddingBottom: '24px', position: 'relative' }}>
            {[0.25, 0.5, 0.75, 1].map(p => (
              <div key={p} style={{ position: 'absolute', left: 0, right: 0, bottom: `${24 + p * 116}px`, borderTop: '1px dashed #f3f4f6', zIndex: 0 }} />
            ))}
            {days.map((day, i) => {
              const sent = byDay[day]?.sent || 0
              return (
                <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                  <div title={`${day}: ${sent} enviadas`}
                    style={{ width: '100%', maxWidth: '20px', height: `${Math.max(sent / maxVal * 116, sent > 0 ? 3 : 0)}px`, background: '#16a34a', borderRadius: '2px 2px 0 0', transition: 'height 0.3s ease', cursor: 'pointer' }} />
                  {i % 5 === 0 && <span style={{ position: 'absolute', bottom: '0', fontSize: '9px', color: '#d1d5db', whiteSpace: 'nowrap' }}>{day.slice(5)}</span>}
                </div>
              )
            })}
          </div>
          {totalSent === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af', fontSize: '13px' }}>Nenhuma mensagem enviada nos últimos 30 dias</div>}
        </div>

        {/* Conversas por atendente */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>Conversas por atendente</h3>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>Conversas abertas atribuídas</p>
          </div>
          {byAgent.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#9ca3af', fontSize: '13px' }}>
              Nenhuma conversa atribuída
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {byAgent.map((agent, i) => {
                const maxCount = byAgent[0].count
                const pct = Math.round((agent.count / maxCount) * 100)
                const colors = ['#16a34a', '#2563eb', '#7c3aed', '#db2777', '#d97706']
                const color = colors[i % colors.length]
                return (
                  <div key={agent.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>{agent.name}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color }}>{agent.count}</span>
                    </div>
                    <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
          <TrendingUp size={14} color="#16a34a" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Acesso rápido</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { label: 'Nova campanha', href: '/dashboard/campaigns', primary: true, roles: ['owner', 'admin'] },
            { label: 'Importar contatos', href: '/dashboard/contacts', primary: false, roles: ['owner', 'admin', 'supervisor'] },
            { label: 'Abrir inbox', href: '/dashboard/inbox', primary: false, roles: ['owner', 'admin', 'supervisor', 'agent'] },
            { label: 'Ver plano', href: '/dashboard/settings', primary: false, roles: ['owner', 'admin'] },
          ].filter(item => item.roles.includes(role)).map(({ label, href, primary }) => (
            <button key={href} onClick={() => router.push(href)}
              style={{ padding: '8px 14px', background: primary ? '#16a34a' : '#f9fafb', border: primary ? 'none' : '1px solid #e5e7eb', borderRadius: '6px', color: primary ? '#fff' : '#374151', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = primary ? '#15803d' : '#f3f4f6' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = primary ? '#16a34a' : '#f9fafb' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
