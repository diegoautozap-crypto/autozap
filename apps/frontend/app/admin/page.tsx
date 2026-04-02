'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tenantApi, authApi, channelApi, messageApi, contactApi, conversationApi, campaignApi } from '@/lib/api'
import { toast } from 'sonner'
import {
  Users, DollarSign, TrendingUp, MessageSquare, Shield, Ban, Play,
  RefreshCw, Loader2, LogIn, Clock, ChevronDown, ChevronUp, Search,
  AlertTriangle, X, Hash, Zap, BarChart3, Bot, Copy, Check,
  FileText, UserCheck, Radio, Workflow, LogOut, Activity, Database,
  ExternalLink, Trash2, Settings, Server, Globe, CreditCard,
  ArrowUpRight, ArrowDownRight, Minus, Eye, Calendar,
} from 'lucide-react'

/* ══════════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════════════ */

const BG = '#0D0D0D'
const BG_CARD = '#1A1A1A'
const BG_ELEVATED = '#222222'
const BG_HOVER = '#2A2A2A'
const BORDER = '#2A2A2A'
const BORDER_LIGHT = '#333333'
const TEXT = '#E5E5E5'
const TEXT_MUTED = '#888888'
const TEXT_DIM = '#666666'
const GREEN = '#4ADE80'
const GREEN_DIM = '#22c55e'
const GREEN_BG = 'rgba(74, 222, 128, 0.08)'
const GREEN_BORDER = 'rgba(74, 222, 128, 0.2)'
const RED = '#f87171'
const RED_BG = 'rgba(248, 113, 113, 0.08)'
const RED_BORDER = 'rgba(248, 113, 113, 0.2)'
const YELLOW = '#fbbf24'
const YELLOW_BG = 'rgba(251, 191, 36, 0.08)'
const YELLOW_BORDER = 'rgba(251, 191, 36, 0.2)'
const BLUE = '#60a5fa'
const BLUE_BG = 'rgba(96, 165, 250, 0.08)'
const PURPLE = '#a78bfa'
const PURPLE_BG = 'rgba(167, 139, 250, 0.08)'
const CYAN = '#22d3ee'

const PLAN_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  pending:    { color: YELLOW, bg: YELLOW_BG, border: YELLOW_BORDER },
  starter:    { color: BLUE, bg: BLUE_BG, border: 'rgba(96,165,250,0.2)' },
  pro:        { color: PURPLE, bg: PURPLE_BG, border: 'rgba(167,139,250,0.2)' },
  enterprise: { color: GREEN, bg: GREEN_BG, border: GREEN_BORDER },
  unlimited:  { color: RED, bg: RED_BG, border: RED_BORDER },
}

const PLAN_PRICES: Record<string, number> = { starter: 97, pro: 197, enterprise: 397, unlimited: 697 }

const PLAN_LIMITS: Record<string, { messages: number; contacts: number; channels: number; campaigns: number; ai: number; flows: number }> = {
  pending:    { messages: 100, contacts: 50, channels: 0, campaigns: 0, ai: 0, flows: 0 },
  starter:    { messages: 5000, contacts: 1000, channels: 5, campaigns: 10, ai: 500, flows: 5 },
  pro:        { messages: 20000, contacts: 5000, channels: 10, campaigns: 50, ai: 2000, flows: 20 },
  enterprise: { messages: 50000, contacts: 20000, channels: 30, campaigns: 200, ai: 10000, flows: 100 },
  unlimited:  { messages: 999999, contacts: 999999, channels: 999, campaigns: 999, ai: 999999, flows: 999 },
}

const TABS = ['Dashboard', 'Tenants', 'Receita', 'Sistema'] as const
type Tab = typeof TABS[number]

const SERVICES = [
  { name: 'auth-service', key: 'auth', url: process.env.NEXT_PUBLIC_API_URL },
  { name: 'tenant-service', key: 'tenant', url: process.env.NEXT_PUBLIC_TENANT_SERVICE_URL },
  { name: 'channel-service', key: 'channel', url: process.env.NEXT_PUBLIC_CHANNEL_SERVICE_URL },
  { name: 'message-service', key: 'message', url: process.env.NEXT_PUBLIC_MESSAGE_SERVICE_URL },
  { name: 'contact-service', key: 'contact', url: process.env.NEXT_PUBLIC_CONTACT_SERVICE_URL },
  { name: 'conversation-service', key: 'conversation', url: process.env.NEXT_PUBLIC_CONVERSATION_SERVICE_URL },
  { name: 'campaign-service', key: 'campaign', url: process.env.NEXT_PUBLIC_CAMPAIGN_SERVICE_URL },
]

const SERVICE_CLIENTS: Record<string, any> = {
  auth: authApi,
  tenant: tenantApi,
  channel: channelApi,
  message: messageApi,
  contact: contactApi,
  conversation: conversationApi,
  campaign: campaignApi,
}

/* ══════════════════════════════════════════════════════════════════════════════
   ADMIN API HELPER
   ══════════════════════════════════════════════════════════════════════════════ */

function adminApi() {
  const secret = typeof window !== 'undefined' ? sessionStorage.getItem('adminSecret') || '' : ''
  return {
    get: (url: string) => tenantApi.get(url, { headers: { 'x-admin-secret': secret } }),
    patch: (url: string, data?: any) => tenantApi.patch(url, data, { headers: { 'x-admin-secret': secret } }),
    post: (url: string, data?: any) => tenantApi.post(url, data, { headers: { 'x-admin-secret': secret } }),
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   UTILITY COMPONENTS
   ══════════════════════════════════════════════════════════════════════════════ */

function Skeleton({ width, height = 20 }: { width: string | number; height?: number }) {
  return (
    <div style={{
      width, height, borderRadius: 6,
      background: `linear-gradient(90deg, ${BORDER} 25%, ${BG_ELEVATED} 50%, ${BORDER} 75%)`,
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease-in-out infinite',
    }} />
  )
}

function UsageBar({ label, value, max, color = GREEN }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const overLimit = value > max && max > 0
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: TEXT_MUTED }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: overLimit ? RED : TEXT, fontFamily: 'monospace' }}>
          {value.toLocaleString()} / {max > 0 ? max.toLocaleString() : '\u221e'}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: BORDER, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 3,
          background: overLimit ? RED : color,
          transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
        }} />
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
    >
      {copied ? <Check size={12} color={GREEN} /> : <Copy size={12} color={TEXT_DIM} />}
    </button>
  )
}

function Badge({ children, color, bg, border: borderColor }: { children: React.ReactNode; color: string; bg: string; border: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color, background: bg,
      border: `1px solid ${borderColor}`, padding: '3px 10px',
      borderRadius: 99, display: 'inline-block', textTransform: 'capitalize',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

function StatCard({ label, value, icon: Icon, color, subtitle, loading }: {
  label: string; value: string | number | undefined; icon: any; color: string; subtitle?: string; loading?: boolean
}) {
  return (
    <div style={{
      background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: '20px 22px', transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -8, right: -8, width: 64, height: 64,
        borderRadius: '50%', background: color, opacity: 0.04,
      }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: `${color}12`, border: `1px solid ${color}20`,
        }}>
          <Icon size={15} color={color} />
        </div>
        <span style={{ fontSize: 12, color: TEXT_MUTED, fontWeight: 500 }}>{label}</span>
      </div>
      {loading ? <Skeleton width="50%" height={28} /> : (
        <div style={{ fontSize: 26, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>
          {value ?? '\u2014'}
        </div>
      )}
      {subtitle && (
        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 4 }}>{subtitle}</div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: TEXT_DIM,
      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12,
    }}>
      {children}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════════════════ */

export default function AdminPage() {
  const queryClient = useQueryClient()

  /* ─── Auth state ─── */
  const [secret, setSecret] = useState('')
  const [secretInput, setSecretInput] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  /* ─── UI state ─── */
  const [activeTab, setActiveTab] = useState<Tab>('Dashboard')
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterPlan, setFilterPlan] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sortBy, setSortBy] = useState('created_at')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [blockReasons, setBlockReasons] = useState<Record<string, string>>({})
  const [currentTime, setCurrentTime] = useState(new Date())

  /* ─── Impersonation ─── */
  const [isImpersonating, setIsImpersonating] = useState(false)
  const [impersonatingName, setImpersonatingName] = useState('')

  useEffect(() => {
    const stored = sessionStorage.getItem('adminSecret')
    if (stored) { setSecret(stored); setIsAuthenticated(true) }
    const orig = sessionStorage.getItem('originalTokens')
    if (orig) {
      setIsImpersonating(true)
      setImpersonatingName(sessionStorage.getItem('impersonatingTenantName') || 'tenant')
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  /* ─── Queries ─── */
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => { const { data } = await adminApi().get('/admin/stats'); return data.data },
    refetchInterval: 30000,
    enabled: isAuthenticated,
  })

  const { data: tenants, isLoading: tenantsLoading, refetch } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: async () => { const { data } = await adminApi().get('/admin/tenants'); return data.data },
    refetchInterval: 60000,
    enabled: isAuthenticated,
  })

  /* ─── Service health checks ─── */
  const { data: serviceHealth, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => {
      const results: Record<string, { status: 'up' | 'down'; latency: number }> = {}
      await Promise.all(SERVICES.map(async (svc) => {
        const start = Date.now()
        try {
          const client = SERVICE_CLIENTS[svc.key]
          if (client) {
            await client.get('/health', { timeout: 5000 })
            results[svc.key] = { status: 'up', latency: Date.now() - start }
          } else {
            results[svc.key] = { status: 'down', latency: 0 }
          }
        } catch {
          results[svc.key] = { status: 'down', latency: Date.now() - start }
        }
      }))
      return results
    },
    refetchInterval: 60000,
    enabled: isAuthenticated && activeTab === 'Sistema',
  })

  /* ─── Mutations ─── */
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-tenants'] })
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
  }

  const blockMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await adminApi().patch(`/admin/tenants/${id}/block`, { reason })
    },
    onSuccess: () => { toast.success('Tenant bloqueado'); invalidateAll() },
    onError: () => toast.error('Erro ao bloquear'),
  })

  const unblockMutation = useMutation({
    mutationFn: async (id: string) => { await adminApi().patch(`/admin/tenants/${id}/unblock`) },
    onSuccess: () => { toast.success('Tenant desbloqueado'); invalidateAll() },
    onError: () => toast.error('Erro ao desbloquear'),
  })

  const planMutation = useMutation({
    mutationFn: async ({ id, planSlug }: { id: string; planSlug: string }) => {
      await adminApi().patch(`/admin/tenants/${id}/plan`, { planSlug })
    },
    onSuccess: () => { toast.success('Plano atualizado'); invalidateAll() },
    onError: () => toast.error('Erro ao atualizar plano'),
  })

  const impersonateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data } = await adminApi().post(`/admin/tenants/${id}/impersonate`)
      return { ...data.data, tenantName: name }
    },
    onSuccess: (data) => {
      const original = { accessToken: localStorage.getItem('accessToken'), refreshToken: localStorage.getItem('refreshToken') }
      sessionStorage.setItem('originalTokens', JSON.stringify(original))
      sessionStorage.setItem('impersonatingTenantName', data.tenantName)
      localStorage.setItem('accessToken', data.accessToken)
      localStorage.removeItem('refreshToken')
      toast.success(`Logado como ${data.tenantName}`)
      window.location.href = '/dashboard'
    },
    onError: () => toast.error('Erro ao impersonar'),
  })

  /* ─── Filtering + Sorting ─── */
  const filtered = useMemo(() => {
    if (!tenants) return []
    let list = [...tenants]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((t: any) =>
        t.name?.toLowerCase().includes(q) || t.owner?.email?.toLowerCase().includes(q)
      )
    }
    if (filterPlan !== 'all') list = list.filter((t: any) => t.plan_slug === filterPlan)
    if (filterStatus === 'ativo') list = list.filter((t: any) => !t.is_blocked && t.plan_slug !== 'pending')
    if (filterStatus === 'bloqueado') list = list.filter((t: any) => t.is_blocked)
    if (filterStatus === 'pendente') list = list.filter((t: any) => t.plan_slug === 'pending')
    list.sort((a: any, b: any) => {
      if (sortBy === 'created_at') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sortBy === 'msgs') return (b.messages_sent_this_period || 0) - (a.messages_sent_this_period || 0)
      if (sortBy === 'contatos') return (b.contactCount || 0) - (a.contactCount || 0)
      return 0
    })
    return list
  }, [tenants, search, filterPlan, filterStatus, sortBy])

  /* ─── Revenue computed ─── */
  const revenueByPlan = useMemo(() => {
    if (!tenants) return {}
    const map: Record<string, { count: number; revenue: number }> = {}
    for (const t of tenants as any[]) {
      const p = t.plan_slug || 'pending'
      if (!map[p]) map[p] = { count: 0, revenue: 0 }
      map[p].count++
      map[p].revenue += PLAN_PRICES[p] || 0
    }
    return map
  }, [tenants])

  const totalMRR = useMemo(() => {
    return Object.values(revenueByPlan).reduce((sum, p) => sum + p.revenue, 0)
  }, [revenueByPlan])

  const churnedThisMonth = useMemo(() => {
    if (!tenants) return 0
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    return (tenants as any[]).filter((t: any) =>
      t.cancelled_at && new Date(t.cancelled_at) >= monthStart
    ).length
  }, [tenants])

  /* ─── Helpers ─── */
  function returnFromImpersonation() {
    const orig = sessionStorage.getItem('originalTokens')
    if (orig) {
      const { accessToken, refreshToken } = JSON.parse(orig)
      if (accessToken) localStorage.setItem('accessToken', accessToken)
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
      sessionStorage.removeItem('originalTokens')
      sessionStorage.removeItem('impersonatingTenantName')
      toast.success('Voltou ao admin')
      window.location.href = '/admin'
    }
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!secretInput.trim()) return
    sessionStorage.setItem('adminSecret', secretInput.trim())
    setSecret(secretInput.trim())
    setIsAuthenticated(true)
    toast.success('Conectado ao admin')
  }

  function handleLogout() {
    sessionStorage.removeItem('adminSecret')
    setSecret('')
    setIsAuthenticated(false)
    setSecretInput('')
    toast.success('Desconectado')
  }

  function refreshAll() {
    refetch()
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] })
    if (activeTab === 'Sistema') refetchHealth()
    toast.success('Dados atualizados')
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SHARED STYLES
     ═══════════════════════════════════════════════════════════════════════════ */

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: BG_ELEVATED, border: `1px solid ${BORDER}`,
    borderRadius: 8, fontSize: 13, outline: 'none',
    color: TEXT, fontFamily: 'inherit', transition: 'all 0.2s',
  }

  const btnPrimary: React.CSSProperties = {
    padding: '10px 20px', background: GREEN, color: '#000',
    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
    transition: 'all 0.2s',
  }

  const btnGhost: React.CSSProperties = {
    padding: '8px 14px', background: 'transparent',
    border: `1px solid ${BORDER}`, borderRadius: 8,
    color: TEXT_MUTED, fontSize: 13, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6,
    transition: 'all 0.2s',
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════════ */

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* ─── Impersonation banner ─── */}
      {isImpersonating && (
        <div
          onClick={returnFromImpersonation}
          style={{
            background: 'linear-gradient(90deg, #dc2626, #ef4444)', color: '#fff',
            padding: '10px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, letterSpacing: '0.01em',
          }}
        >
          <AlertTriangle size={15} />
          Logado como {impersonatingName} &mdash; Voltar ao admin
        </div>
      )}

      {/* ─── Login screen ─── */}
      {!isAuthenticated && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 400, textAlign: 'center',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: GREEN_BG, border: `1px solid ${GREEN_BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <Shield size={28} color={GREEN} />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', color: TEXT }}>
              AutoZap Admin
            </h1>
            <p style={{ fontSize: 14, color: TEXT_MUTED, margin: '0 0 32px' }}>
              Insira o secret para acessar o painel
            </p>
            <form onSubmit={handleLogin}>
              <input
                type="password"
                placeholder="Admin secret..."
                value={secretInput}
                onChange={e => setSecretInput(e.target.value)}
                autoFocus
                style={{
                  ...inputStyle, marginBottom: 16, textAlign: 'center',
                  fontSize: 15, padding: '14px 18px',
                  background: BG_CARD,
                }}
              />
              <button type="submit" style={{ ...btnPrimary, width: '100%', justifyContent: 'center', padding: '14px 20px', fontSize: 14 }}>
                <Shield size={15} />
                Entrar
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── Authenticated content ─── */}
      {isAuthenticated && (
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 32px 48px' }}>

          {/* ═══ HEADER ═══ */}
          <header style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '24px 0', borderBottom: `1px solid ${BORDER}`, marginBottom: 0,
            position: 'sticky', top: 0, background: BG, zIndex: 50,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: GREEN_BG, border: `1px solid ${GREEN_BORDER}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Shield size={18} color={GREEN} />
              </div>
              <div>
                <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: TEXT, letterSpacing: '-0.02em' }}>
                  AutoZap Admin
                </h1>
                <p style={{ fontSize: 12, color: TEXT_DIM, margin: 0, fontFamily: 'monospace' }}>
                  {currentTime.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  {' \u00b7 '}
                  {currentTime.toLocaleTimeString('pt-BR')}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={refreshAll} style={btnGhost}>
                <RefreshCw size={14} /> Atualizar
              </button>
              <button onClick={handleLogout} style={{ ...btnGhost, color: RED, borderColor: RED_BORDER }}>
                <LogOut size={14} /> Sair
              </button>
            </div>
          </header>

          {/* ═══ TABS ═══ */}
          <nav style={{
            display: 'flex', gap: 0, borderBottom: `1px solid ${BORDER}`,
            marginBottom: 32, position: 'sticky', top: 73, background: BG, zIndex: 49,
          }}>
            {TABS.map(tab => {
              const active = activeTab === tab
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '14px 24px', background: 'none', border: 'none',
                    borderBottom: active ? `2px solid ${GREEN}` : '2px solid transparent',
                    color: active ? TEXT : TEXT_DIM, fontSize: 14,
                    fontWeight: active ? 600 : 400, cursor: 'pointer',
                    transition: 'all 0.2s', fontFamily: 'inherit',
                  }}
                >
                  {tab}
                </button>
              )
            })}
          </nav>

          {/* ═══════════════════════════════════════════════════════════════════
              TAB 1: DASHBOARD
              ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'Dashboard' && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              {/* Stats Grid - 2 rows of 4 */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 16, marginBottom: 32,
              }}>
                <StatCard label="Total tenants" value={stats?.totalTenants} icon={Users} color={BLUE} loading={statsLoading} />
                <StatCard label="Novos hoje" value={stats?.newToday} icon={TrendingUp} color={GREEN} loading={statsLoading} />
                <StatCard label="Novos esta semana" value={stats?.newThisWeek} icon={TrendingUp} color={PURPLE} loading={statsLoading} />
                <StatCard label="Pagantes ativos" value={stats?.activePaying} icon={DollarSign} color={GREEN_DIM} loading={statsLoading} />
                <StatCard label="Pendentes" value={stats?.pendingCount} icon={Clock} color={YELLOW} loading={statsLoading} />
                <StatCard label="Msgs enviadas hoje" value={stats?.messagesTODAY} icon={MessageSquare} color={CYAN} loading={statsLoading} />
                <StatCard
                  label="MRR total"
                  value={stats?.mrr != null ? `R$ ${stats.mrr.toLocaleString('pt-BR')}` : totalMRR > 0 ? `R$ ${totalMRR.toLocaleString('pt-BR')}` : undefined}
                  icon={DollarSign} color={GREEN} loading={statsLoading}
                />
                <StatCard label="Churn rate" value={churnedThisMonth} icon={ArrowDownRight} color={RED} loading={statsLoading} subtitle="cancelados este m\u00eas" />
              </div>

              {/* Charts area - 2 side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
                {/* Tenants por plano */}
                <div style={{
                  background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                  padding: 24,
                }}>
                  <SectionLabel>Tenants por plano</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                    {['starter', 'pro', 'enterprise', 'unlimited', 'pending'].map(plan => {
                      const info = revenueByPlan[plan]
                      const count = info?.count || 0
                      const total = tenants?.length || 1
                      const pct = Math.round((count / total) * 100)
                      const pc = PLAN_COLORS[plan]
                      return (
                        <div key={plan}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: pc.color, textTransform: 'capitalize' }}>
                              {plan}
                            </span>
                            <span style={{ fontSize: 13, color: TEXT_MUTED }}>
                              {count} <span style={{ color: TEXT_DIM, fontSize: 11 }}>({pct}%)</span>
                            </span>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: BORDER, overflow: 'hidden' }}>
                            <div style={{
                              width: `${pct}%`, minWidth: count > 0 ? 4 : 0,
                              height: '100%', borderRadius: 4,
                              background: pc.color,
                              transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
                            }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Receita por plano */}
                <div style={{
                  background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                  padding: 24,
                }}>
                  <SectionLabel>Receita por plano</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                    {['starter', 'pro', 'enterprise', 'unlimited', 'pending'].map(plan => {
                      const info = revenueByPlan[plan]
                      const revenue = info?.revenue || 0
                      const maxRevenue = Math.max(...Object.values(revenueByPlan).map(r => r.revenue), 1)
                      const pct = Math.round((revenue / maxRevenue) * 100)
                      const pc = PLAN_COLORS[plan]
                      return (
                        <div key={plan}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: pc.color, textTransform: 'capitalize' }}>
                              {plan}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, fontFamily: 'monospace' }}>
                              R$ {revenue.toLocaleString('pt-BR')}
                            </span>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: BORDER, overflow: 'hidden' }}>
                            <div style={{
                              width: `${pct}%`, minWidth: revenue > 0 ? 4 : 0,
                              height: '100%', borderRadius: 4,
                              background: pc.color,
                              transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
                            }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Recent activity */}
              <div style={{
                background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                padding: 24,
              }}>
                <SectionLabel>Atividade recente</SectionLabel>
                {tenantsLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} width="100%" height={40} />)}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {(tenants as any[] || [])
                      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .slice(0, 10)
                      .map((t: any, i: number) => {
                        const isBlocked = t.is_blocked
                        const isPending = t.plan_slug === 'pending'
                        const eventType = isBlocked ? 'Bloqueado' : isPending ? 'Registro' : 'Ativo'
                        const eventColor = isBlocked ? RED : isPending ? YELLOW : GREEN
                        return (
                          <div key={t.id} style={{
                            display: 'flex', alignItems: 'center', gap: 16,
                            padding: '12px 0',
                            borderBottom: i < 9 ? `1px solid ${BORDER}` : 'none',
                          }}>
                            <span style={{ fontSize: 12, color: TEXT_DIM, fontFamily: 'monospace', minWidth: 130 }}>
                              {t.created_at ? new Date(t.created_at).toLocaleString('pt-BR') : '\u2014'}
                            </span>
                            <Badge color={eventColor} bg={`${eventColor}12`} border={`${eventColor}30`}>
                              {eventType}
                            </Badge>
                            <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, flex: 1 }}>
                              {t.name}
                            </span>
                            <span style={{ fontSize: 12, color: TEXT_MUTED }}>
                              {t.owner?.email || '\u2014'}
                            </span>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              TAB 2: TENANTS
              ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'Tenants' && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              {/* Filters */}
              <div style={{
                display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap',
                alignItems: 'center',
              }}>
                <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: TEXT_DIM }} />
                  <input
                    placeholder="Buscar por nome ou email..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: 38 }}
                  />
                </div>
                <select
                  value={filterPlan}
                  onChange={e => setFilterPlan(e.target.value)}
                  style={{ ...inputStyle, width: 'auto', minWidth: 150, cursor: 'pointer' }}
                >
                  <option value="all">Todos os planos</option>
                  <option value="pending">Pendente</option>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="unlimited">Unlimited</option>
                </select>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  style={{ ...inputStyle, width: 'auto', minWidth: 140, cursor: 'pointer' }}
                >
                  <option value="all">Todos status</option>
                  <option value="ativo">Ativo</option>
                  <option value="bloqueado">Bloqueado</option>
                  <option value="pendente">Pendente</option>
                </select>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  style={{ ...inputStyle, width: 'auto', minWidth: 160, cursor: 'pointer' }}
                >
                  <option value="created_at">Mais recentes</option>
                  <option value="oldest">Mais antigos</option>
                  <option value="msgs">Mais mensagens</option>
                  <option value="contatos">Mais contatos</option>
                </select>
                <span style={{
                  fontSize: 13, color: TEXT_MUTED, fontWeight: 500,
                  padding: '8px 14px', background: BG_CARD, borderRadius: 8,
                  border: `1px solid ${BORDER}`,
                }}>
                  {filtered.length} tenant{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Tenant table */}
              <div style={{
                background: BG_CARD, border: `1px solid ${BORDER}`,
                borderRadius: 12, overflow: 'hidden',
              }}>
                {/* Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.8fr 90px 70px 70px 80px 90px 70px 80px 140px',
                  gap: 8, padding: '14px 20px',
                  borderBottom: `1px solid ${BORDER}`,
                  background: BG_ELEVATED,
                }}>
                  {['Empresa', 'Owner', 'Plano', 'Status', 'Canais', 'Membros', 'Contatos', 'Msgs', 'Criado', 'A\u00e7\u00f5es'].map(h => (
                    <span key={h} style={{
                      fontSize: 11, fontWeight: 600, color: TEXT_DIM,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{h}</span>
                  ))}
                </div>

                {/* Loading */}
                {tenantsLoading ? (
                  <div style={{ padding: '16px 20px' }}>
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <div key={i} style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1.8fr 90px 70px 70px 80px 90px 70px 80px 140px',
                        gap: 8, padding: '14px 0', borderBottom: `1px solid ${BORDER}`,
                      }}>
                        <Skeleton width="70%" />
                        <Skeleton width="80%" />
                        <Skeleton width={50} />
                        <Skeleton width={50} />
                        <Skeleton width={30} />
                        <Skeleton width={30} />
                        <Skeleton width={50} />
                        <Skeleton width={40} />
                        <Skeleton width={60} />
                        <Skeleton width={100} />
                      </div>
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ padding: 64, textAlign: 'center', color: TEXT_DIM, fontSize: 14 }}>
                    Nenhum tenant encontrado
                  </div>
                ) : filtered.map((t: any) => {
                  const planStyle = PLAN_COLORS[t.plan_slug] || PLAN_COLORS.pending
                  const isSelected = selectedTenantId === t.id
                  const limits = PLAN_LIMITS[t.plan_slug] || PLAN_LIMITS.pending

                  return (
                    <div key={t.id}>
                      {/* Row */}
                      <div
                        onClick={() => setSelectedTenantId(isSelected ? null : t.id)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '2fr 1.8fr 90px 70px 70px 80px 90px 70px 80px 140px',
                          gap: 8, padding: '14px 20px',
                          borderBottom: `1px solid ${BORDER}`,
                          cursor: 'pointer',
                          background: isSelected ? BG_ELEVATED : 'transparent',
                          alignItems: 'center',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = BG_HOVER }}
                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                      >
                        {/* Empresa */}
                        <div>
                          <div style={{
                            fontWeight: 600, fontSize: 13, color: t.is_blocked ? RED : TEXT,
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}>
                            {t.is_blocked && <Ban size={12} color={RED} />}
                            {t.name}
                            {isSelected ? <ChevronUp size={12} color={TEXT_DIM} /> : <ChevronDown size={12} color={TEXT_DIM} />}
                          </div>
                        </div>

                        {/* Owner */}
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontSize: 12, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {t.owner?.email || '\u2014'}
                          </div>
                        </div>

                        {/* Plan */}
                        <Badge color={planStyle.color} bg={planStyle.bg} border={planStyle.border}>
                          {t.plan_slug}
                        </Badge>

                        {/* Status */}
                        <Badge
                          color={t.is_blocked ? RED : t.plan_slug === 'pending' ? YELLOW : GREEN}
                          bg={t.is_blocked ? RED_BG : t.plan_slug === 'pending' ? YELLOW_BG : GREEN_BG}
                          border={t.is_blocked ? RED_BORDER : t.plan_slug === 'pending' ? YELLOW_BORDER : GREEN_BORDER}
                        >
                          {t.is_blocked ? 'Bloq' : t.plan_slug === 'pending' ? 'Pend' : 'Ativo'}
                        </Badge>

                        {/* Channels */}
                        <span style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>{t.channelCount ?? 0}</span>

                        {/* Members */}
                        <span style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>{t.memberCount ?? (t.owner ? 1 : 0)}</span>

                        {/* Contacts */}
                        <span style={{ fontSize: 13, color: TEXT, fontWeight: 500, fontFamily: 'monospace' }}>
                          {(t.contactCount ?? 0).toLocaleString()}
                        </span>

                        {/* Messages */}
                        <span style={{ fontSize: 13, color: TEXT, fontWeight: 500, fontFamily: 'monospace' }}>
                          {(t.messages_sent_this_period ?? 0).toLocaleString()}
                        </span>

                        {/* Created */}
                        <span style={{ fontSize: 12, color: TEXT_MUTED }}>
                          {t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '\u2014'}
                        </span>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => impersonateMutation.mutate({ id: t.id, name: t.name })}
                            disabled={impersonateMutation.isPending}
                            title="Impersonar"
                            style={{
                              padding: '6px 10px', background: GREEN_BG,
                              border: `1px solid ${GREEN_BORDER}`, borderRadius: 6,
                              color: GREEN, fontSize: 11, fontWeight: 600,
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                              transition: 'all 0.15s',
                            }}
                          >
                            <Eye size={12} /> Entrar
                          </button>
                          {t.is_blocked ? (
                            <button
                              onClick={() => unblockMutation.mutate(t.id)}
                              disabled={unblockMutation.isPending}
                              title="Desbloquear"
                              style={{
                                padding: '6px 10px', background: GREEN_BG,
                                border: `1px solid ${GREEN_BORDER}`, borderRadius: 6,
                                color: GREEN, fontSize: 11, fontWeight: 600,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                transition: 'all 0.15s',
                              }}
                            >
                              <Play size={12} />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                const reason = blockReasons[t.id] || 'Bloqueado pelo admin'
                                if (confirm(`Bloquear ${t.name}?`)) blockMutation.mutate({ id: t.id, reason })
                              }}
                              disabled={blockMutation.isPending}
                              title="Bloquear"
                              style={{
                                padding: '6px 10px', background: RED_BG,
                                border: `1px solid ${RED_BORDER}`, borderRadius: 6,
                                color: RED, fontSize: 11, fontWeight: 600,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                transition: 'all 0.15s',
                              }}
                            >
                              <Ban size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* ─── Expanded detail panel ─── */}
                      {isSelected && (
                        <div style={{
                          padding: '28px 24px',
                          background: BG,
                          borderBottom: `2px solid ${GREEN_BORDER}`,
                          animation: 'fadeIn 0.2s ease',
                        }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>

                            {/* Col 1 - Info */}
                            <div>
                              <SectionLabel>Informa\u00e7\u00f5es</SectionLabel>
                              <div style={{
                                background: BG_CARD, border: `1px solid ${BORDER}`,
                                borderRadius: 10, padding: 16,
                              }}>
                                {[
                                  { label: 'ID', value: t.id, mono: true, copyable: true },
                                  { label: 'Slug', value: t.slug },
                                  { label: 'Subscription', value: t.subscription?.status || 'Nenhuma' },
                                  { label: 'MRR', value: `R$ ${(t.mrr ?? PLAN_PRICES[t.plan_slug] ?? 0).toLocaleString('pt-BR')}` },
                                  { label: 'Criado em', value: t.created_at ? new Date(t.created_at).toLocaleString('pt-BR') : '\u2014' },
                                  { label: '\u00daltimo login', value: t.owner?.last_login_at ? new Date(t.owner.last_login_at).toLocaleString('pt-BR') : 'Nunca' },
                                  { label: 'Plano atual', value: t.plan_slug },
                                ].map(({ label, value, mono, copyable }) => (
                                  <div key={label} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '8px 0', borderBottom: `1px solid ${BORDER}`,
                                  }}>
                                    <span style={{ fontSize: 12, color: TEXT_MUTED }}>{label}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <span style={{
                                        fontSize: 12, fontWeight: 600, color: TEXT,
                                        fontFamily: mono ? 'monospace' : 'inherit',
                                        maxWidth: 180, overflow: 'hidden',
                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                      }}>
                                        {value}
                                      </span>
                                      {copyable && <CopyButton text={String(value)} />}
                                    </div>
                                  </div>
                                ))}

                                {t.is_blocked && (
                                  <div style={{
                                    marginTop: 12, padding: '10px 14px',
                                    background: RED_BG, borderRadius: 8, border: `1px solid ${RED_BORDER}`,
                                  }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: RED }}>Motivo do bloqueio:</span>
                                    <p style={{ fontSize: 12, color: RED, margin: '4px 0 0', opacity: 0.8 }}>
                                      {t.blocked_reason || 'N\u00e3o informado'}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Plan change history placeholder */}
                              {t.planHistory && t.planHistory.length > 0 && (
                                <div style={{ marginTop: 14 }}>
                                  <SectionLabel>Hist\u00f3rico de planos</SectionLabel>
                                  <div style={{
                                    background: BG_CARD, border: `1px solid ${BORDER}`,
                                    borderRadius: 10, padding: 16,
                                  }}>
                                    {t.planHistory.map((h: any, idx: number) => (
                                      <div key={idx} style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        padding: '6px 0', borderBottom: `1px solid ${BORDER}`,
                                        fontSize: 12,
                                      }}>
                                        <span style={{ color: TEXT_MUTED }}>{new Date(h.date).toLocaleDateString('pt-BR')}</span>
                                        <span style={{ color: TEXT }}>{h.from} &rarr; {h.to}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Col 2 - Usage */}
                            <div>
                              <SectionLabel>Uso este m\u00eas</SectionLabel>
                              <div style={{
                                background: BG_CARD, border: `1px solid ${BORDER}`,
                                borderRadius: 10, padding: 16,
                              }}>
                                <UsageBar label="Mensagens" value={t.messages_sent_this_period ?? 0} max={limits.messages} color={GREEN} />
                                <UsageBar label="Contatos" value={t.contactCount ?? 0} max={limits.contacts} color={BLUE} />
                                <UsageBar label="Canais" value={t.channelCount ?? 0} max={limits.channels} color={PURPLE} />
                                <UsageBar label="Flows" value={t.activeFlowCount ?? 0} max={limits.flows} color={CYAN} />
                                <UsageBar label="Campanhas" value={t.campaignCount ?? 0} max={limits.campaigns} color={YELLOW} />
                                <UsageBar label="Respostas IA" value={t.aiResponseCount ?? 0} max={limits.ai} color={'#f472b6'} />
                              </div>
                            </div>

                            {/* Col 3 - Actions */}
                            <div>
                              <SectionLabel>A\u00e7\u00f5es</SectionLabel>
                              <div style={{
                                background: BG_CARD, border: `1px solid ${BORDER}`,
                                borderRadius: 10, padding: 16, marginBottom: 14,
                              }}>
                                {/* Change plan */}
                                <div style={{ marginBottom: 16 }}>
                                  <label style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 6, display: 'block' }}>
                                    Mudar plano
                                  </label>
                                  <select
                                    defaultValue={t.plan_slug}
                                    onChange={e => {
                                      if (confirm(`Mudar plano de ${t.name} para ${e.target.value}?`)) {
                                        planMutation.mutate({ id: t.id, planSlug: e.target.value })
                                      }
                                    }}
                                    style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
                                  >
                                    <option value="pending">Pendente (R$ 0)</option>
                                    <option value="starter">Starter (R$ 97)</option>
                                    <option value="pro">Pro (R$ 197)</option>
                                    <option value="enterprise">Enterprise (R$ 397)</option>
                                    <option value="unlimited">Unlimited (R$ 697)</option>
                                  </select>
                                </div>

                                {/* Block/Unblock */}
                                <div style={{ marginBottom: 16 }}>
                                  {t.is_blocked ? (
                                    <button
                                      onClick={() => unblockMutation.mutate(t.id)}
                                      disabled={unblockMutation.isPending}
                                      style={{
                                        ...btnPrimary, width: '100%', justifyContent: 'center',
                                        background: GREEN, padding: '10px 16px',
                                      }}
                                    >
                                      <Play size={14} /> Desbloquear tenant
                                    </button>
                                  ) : (
                                    <>
                                      <input
                                        placeholder="Motivo do bloqueio..."
                                        value={blockReasons[t.id] || ''}
                                        onChange={e => setBlockReasons(prev => ({ ...prev, [t.id]: e.target.value }))}
                                        style={{ ...inputStyle, marginBottom: 8 }}
                                      />
                                      <button
                                        onClick={() => {
                                          const reason = blockReasons[t.id] || 'Bloqueado pelo admin'
                                          if (confirm(`Bloquear ${t.name}?`)) blockMutation.mutate({ id: t.id, reason })
                                        }}
                                        disabled={blockMutation.isPending}
                                        style={{
                                          width: '100%', padding: '10px 16px', justifyContent: 'center',
                                          background: RED_BG, border: `1px solid ${RED_BORDER}`,
                                          borderRadius: 8, color: RED, fontSize: 13, fontWeight: 600,
                                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                        }}
                                      >
                                        <Ban size={14} /> Bloquear tenant
                                      </button>
                                    </>
                                  )}
                                </div>

                                {/* Impersonate */}
                                <button
                                  onClick={() => impersonateMutation.mutate({ id: t.id, name: t.name })}
                                  disabled={impersonateMutation.isPending}
                                  style={{
                                    width: '100%', padding: '10px 16px', justifyContent: 'center',
                                    background: PURPLE_BG, border: `1px solid rgba(167,139,250,0.2)`,
                                    borderRadius: 8, color: PURPLE, fontSize: 13, fontWeight: 600,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                    marginBottom: 12,
                                  }}
                                >
                                  <Eye size={14} /> Impersonar tenant
                                </button>

                                {/* Notes */}
                                <div>
                                  <label style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 6, display: 'block' }}>
                                    Notas do admin
                                  </label>
                                  <textarea
                                    value={notes[t.id] ?? (t.admin_notes || '')}
                                    onChange={e => setNotes(prev => ({ ...prev, [t.id]: e.target.value }))}
                                    placeholder="Anota\u00e7\u00f5es internas..."
                                    style={{
                                      ...inputStyle, minHeight: 80, resize: 'vertical',
                                      fontSize: 12, lineHeight: 1.6,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Members list */}
                          <div style={{ marginTop: 20 }}>
                            <SectionLabel>Membros</SectionLabel>
                            <div style={{
                              background: BG_CARD, border: `1px solid ${BORDER}`,
                              borderRadius: 10, overflow: 'hidden',
                            }}>
                              <div style={{
                                display: 'grid', gridTemplateColumns: '2fr 2fr 100px 120px 80px',
                                gap: 8, padding: '10px 16px', borderBottom: `1px solid ${BORDER}`,
                                background: BG_ELEVATED,
                              }}>
                                {['Nome', 'Email', 'Role', '\u00daltimo login', 'Status'].map(h => (
                                  <span key={h} style={{ fontSize: 11, fontWeight: 600, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    {h}
                                  </span>
                                ))}
                              </div>
                              {(t.members && t.members.length > 0 ? t.members : t.owner ? [{ ...t.owner, role: 'owner' }] : []).map((m: any) => (
                                <div key={m.id || m.email} style={{
                                  display: 'grid', gridTemplateColumns: '2fr 2fr 100px 120px 80px',
                                  gap: 8, padding: '10px 16px', borderBottom: `1px solid ${BORDER}`,
                                  alignItems: 'center',
                                }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{m.name || '\u2014'}</span>
                                  <span style={{ fontSize: 12, color: TEXT_MUTED }}>{m.email}</span>
                                  <Badge
                                    color={m.role === 'owner' ? GREEN : BLUE}
                                    bg={m.role === 'owner' ? GREEN_BG : BLUE_BG}
                                    border={m.role === 'owner' ? GREEN_BORDER : 'rgba(96,165,250,0.2)'}
                                  >
                                    {m.role}
                                  </Badge>
                                  <span style={{ fontSize: 12, color: TEXT_MUTED }}>
                                    {m.last_login_at ? new Date(m.last_login_at).toLocaleDateString('pt-BR') : 'Nunca'}
                                  </span>
                                  <Badge color={GREEN} bg={GREEN_BG} border={GREEN_BORDER}>Ativo</Badge>
                                </div>
                              ))}
                              {(!t.members || t.members.length === 0) && !t.owner && (
                                <div style={{ padding: 24, textAlign: 'center', color: TEXT_DIM, fontSize: 13 }}>
                                  Nenhum membro
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              TAB 3: RECEITA
              ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'Receita' && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              {/* Revenue stats */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 16, marginBottom: 32,
              }}>
                <div style={{
                  background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                  padding: '24px 22px',
                }}>
                  <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>MRR total</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: GREEN, letterSpacing: '-0.02em' }}>
                    R$ {totalMRR.toLocaleString('pt-BR')}
                  </div>
                </div>
                <div style={{
                  background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                  padding: '24px 22px',
                }}>
                  <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>ARR (estimado)</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>
                    R$ {(totalMRR * 12).toLocaleString('pt-BR')}
                  </div>
                </div>
                <div style={{
                  background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                  padding: '24px 22px',
                }}>
                  <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>Novo MRR (m\u00eas)</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: GREEN, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ArrowUpRight size={20} />
                    R$ {((stats?.newThisMonth || 0) > 0 ? (stats.newThisMonth * (PLAN_PRICES.starter || 97)) : 0).toLocaleString('pt-BR')}
                  </div>
                </div>
                <div style={{
                  background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                  padding: '24px 22px',
                }}>
                  <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>Churned MRR</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: RED, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ArrowDownRight size={20} />
                    R$ {(churnedThisMonth * (PLAN_PRICES.starter || 97)).toLocaleString('pt-BR')}
                  </div>
                </div>
                <div style={{
                  background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                  padding: '24px 22px',
                }}>
                  <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>Net MRR change</div>
                  {(() => {
                    const newMrr = (stats?.newThisMonth || 0) > 0 ? stats.newThisMonth * (PLAN_PRICES.starter || 97) : 0
                    const churnMrr = churnedThisMonth * (PLAN_PRICES.starter || 97)
                    const net = newMrr - churnMrr
                    return (
                      <div style={{
                        fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em',
                        color: net >= 0 ? GREEN : RED, display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        {net >= 0 ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                        R$ {Math.abs(net).toLocaleString('pt-BR')}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Revenue breakdown table */}
              <div style={{
                background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                overflow: 'hidden', marginBottom: 32,
              }}>
                <div style={{ padding: '20px 24px 0' }}>
                  <SectionLabel>Receita por plano</SectionLabel>
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr',
                  gap: 8, padding: '14px 24px',
                  borderBottom: `1px solid ${BORDER}`, background: BG_ELEVATED,
                }}>
                  {['Plano', '# Tenants', 'Pre\u00e7o unit\u00e1rio', 'Receita mensal'].map(h => (
                    <span key={h} style={{ fontSize: 11, fontWeight: 600, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {h}
                    </span>
                  ))}
                </div>
                {['starter', 'pro', 'enterprise', 'unlimited'].map(plan => {
                  const info = revenueByPlan[plan] || { count: 0, revenue: 0 }
                  const pc = PLAN_COLORS[plan]
                  return (
                    <div key={plan} style={{
                      display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr',
                      gap: 8, padding: '14px 24px',
                      borderBottom: `1px solid ${BORDER}`, alignItems: 'center',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: pc.color }} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: TEXT, textTransform: 'capitalize' }}>{plan}</span>
                      </div>
                      <span style={{ fontSize: 14, color: TEXT, fontFamily: 'monospace' }}>{info.count}</span>
                      <span style={{ fontSize: 14, color: TEXT_MUTED, fontFamily: 'monospace' }}>R$ {(PLAN_PRICES[plan] || 0).toLocaleString('pt-BR')}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: 'monospace' }}>R$ {info.revenue.toLocaleString('pt-BR')}</span>
                    </div>
                  )
                })}
                {/* Total row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr',
                  gap: 8, padding: '16px 24px',
                  background: BG_ELEVATED, alignItems: 'center',
                }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Total</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: 'monospace' }}>
                    {Object.values(revenueByPlan).reduce((sum, p) => sum + p.count, 0)}
                  </span>
                  <span style={{ fontSize: 14, color: TEXT_DIM }}>\u2014</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: GREEN, fontFamily: 'monospace' }}>
                    R$ {totalMRR.toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>

              {/* Recent payments (from tenants data) */}
              <div style={{
                background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                overflow: 'hidden',
              }}>
                <div style={{ padding: '20px 24px 0' }}>
                  <SectionLabel>Pagamentos recentes (tenants pagantes)</SectionLabel>
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1.5fr 2fr 1fr 1fr 1fr',
                  gap: 8, padding: '14px 24px',
                  borderBottom: `1px solid ${BORDER}`, background: BG_ELEVATED,
                }}>
                  {['Data', 'Tenant', 'Valor', 'Status', 'Plano'].map(h => (
                    <span key={h} style={{ fontSize: 11, fontWeight: 600, color: TEXT_DIM, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {h}
                    </span>
                  ))}
                </div>
                {(tenants as any[] || [])
                  .filter((t: any) => t.plan_slug && t.plan_slug !== 'pending' && PLAN_PRICES[t.plan_slug])
                  .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .slice(0, 15)
                  .map((t: any) => {
                    const pc = PLAN_COLORS[t.plan_slug] || PLAN_COLORS.pending
                    return (
                      <div key={t.id} style={{
                        display: 'grid', gridTemplateColumns: '1.5fr 2fr 1fr 1fr 1fr',
                        gap: 8, padding: '12px 24px',
                        borderBottom: `1px solid ${BORDER}`, alignItems: 'center',
                      }}>
                        <span style={{ fontSize: 12, color: TEXT_MUTED, fontFamily: 'monospace' }}>
                          {t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '\u2014'}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{t.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, fontFamily: 'monospace' }}>
                          R$ {(PLAN_PRICES[t.plan_slug] || 0).toLocaleString('pt-BR')}
                        </span>
                        <Badge
                          color={t.is_blocked ? RED : GREEN}
                          bg={t.is_blocked ? RED_BG : GREEN_BG}
                          border={t.is_blocked ? RED_BORDER : GREEN_BORDER}
                        >
                          {t.is_blocked ? 'Bloqueado' : 'Pago'}
                        </Badge>
                        <Badge color={pc.color} bg={pc.bg} border={pc.border}>
                          {t.plan_slug}
                        </Badge>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              TAB 4: SISTEMA
              ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'Sistema' && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              {/* Services status */}
              <SectionLabel>Status dos servi\u00e7os</SectionLabel>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 16, marginBottom: 32,
              }}>
                {SERVICES.map(svc => {
                  const health = serviceHealth?.[svc.key]
                  const isUp = health?.status === 'up'
                  const loading = healthLoading
                  return (
                    <div key={svc.key} style={{
                      background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                      padding: 20, transition: 'all 0.2s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Server size={16} color={TEXT_MUTED} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{svc.name}</span>
                        </div>
                        {loading ? (
                          <Loader2 size={14} color={TEXT_DIM} style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: isUp ? GREEN : RED,
                            boxShadow: isUp ? `0 0 8px ${GREEN}40` : `0 0 8px ${RED}40`,
                          }} />
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: TEXT_DIM, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {svc.url || 'N/A'}
                      </div>
                      {health && (
                        <div style={{ marginTop: 8, fontSize: 12, color: isUp ? GREEN : RED }}>
                          {isUp ? `Online \u00b7 ${health.latency}ms` : 'Offline'}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Database stats */}
              <SectionLabel>Banco de dados</SectionLabel>
              <div style={{
                background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                padding: 24, marginBottom: 32,
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 6 }}>Provider</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: TEXT }}>Supabase (PostgreSQL)</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 6 }}>Total de tenants</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: TEXT }}>{stats?.totalTenants ?? '\u2014'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 6 }}>Regi\u00e3o</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: TEXT }}>South America (sa-east-1)</div>
                  </div>
                </div>
              </div>

              {/* Quick actions */}
              <SectionLabel>A\u00e7\u00f5es r\u00e1pidas</SectionLabel>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 16,
              }}>
                <button
                  onClick={() => { toast.success('Cache limpo (simulado)') }}
                  style={{
                    background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                    padding: 20, cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                >
                  <Trash2 size={18} color={RED} style={{ marginBottom: 10 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Limpar caches</div>
                  <div style={{ fontSize: 12, color: TEXT_DIM }}>Invalida todos os caches dos servi\u00e7os</div>
                </button>
                <button
                  onClick={() => { refetchHealth(); toast.success('Configura\u00e7\u00f5es recarregadas') }}
                  style={{
                    background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                    padding: 20, cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                >
                  <RefreshCw size={18} color={BLUE} style={{ marginBottom: 10 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Recarregar configs</div>
                  <div style={{ fontSize: 12, color: TEXT_DIM }}>Recarrega configura\u00e7\u00f5es de todos os servi\u00e7os</div>
                </button>
                <a
                  href="https://sentry.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                    padding: 20, cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.2s', textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={18} color={YELLOW} style={{ marginBottom: 10 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Sentry errors</div>
                  <div style={{ fontSize: 12, color: TEXT_DIM }}>Ver erros e exceptions no Sentry</div>
                </a>
                <a
                  href="https://railway.app/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                    padding: 20, cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.2s', textDecoration: 'none',
                  }}
                >
                  <ExternalLink size={18} color={PURPLE} style={{ marginBottom: 10 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Railway dashboard</div>
                  <div style={{ fontSize: 12, color: TEXT_DIM }}>Gerenciar deployments e infraestrutura</div>
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Animations ─── */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        select {
          -webkit-appearance: none;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          padding-right: 32px !important;
        }
        select option {
          background: ${BG_CARD};
          color: ${TEXT};
        }
        input::placeholder, textarea::placeholder {
          color: ${TEXT_DIM};
        }
        button:hover {
          opacity: 0.85;
        }
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: ${BG};
        }
        ::-webkit-scrollbar-thumb {
          background: ${BORDER_LIGHT};
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: ${TEXT_DIM};
        }
        @media (max-width: 1024px) {
          [style*="gridTemplateColumns: repeat(4"] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          [style*="gridTemplateColumns: repeat(5"] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          [style*="gridTemplateColumns: 1fr 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 768px) {
          [style*="gridTemplateColumns: repeat(4"] {
            grid-template-columns: 1fr !important;
          }
          [style*="gridTemplateColumns: repeat(5"] {
            grid-template-columns: 1fr !important;
          }
          [style*="gridTemplateColumns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
