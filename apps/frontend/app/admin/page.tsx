'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tenantApi, authApi, channelApi, messageApi, contactApi, conversationApi, campaignApi } from '@/lib/api'
import { toast } from 'sonner'
import { AutoZapLogo } from '@/components/ui/AutoZapLogo'
import {
  Users, DollarSign, TrendingUp, MessageSquare, Shield, Ban, Play,
  RefreshCw, Loader2, LogIn, Clock, ChevronDown, ChevronUp, Search,
  AlertTriangle, X, Hash, Zap, BarChart3, Bot, Copy, Check,
  FileText, UserCheck, Radio, Workflow, LogOut, Activity, Database,
  ExternalLink, Trash2, Settings, Server, Globe, CreditCard,
  ArrowUpRight, ArrowDownRight, Minus, Eye, Calendar, LayoutDashboard,
} from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

/* ══════════════════════════════════════════════════════════════════════════════
   CONSTANTS — LIGHT THEME
   ══════════════════════════════════════════════════════════════════════════════ */

const PAGE_BG = '#f5f7fa'
const SIDEBAR_BG = '#161b27'
const SIDEBAR_TEXT = '#94a3b8'
const SIDEBAR_TEXT_ACTIVE = '#ffffff'
const CARD_BG = '#ffffff'
const CARD_SHADOW = '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)'
const CARD_SHADOW_HOVER = '0 4px 12px rgba(0,0,0,0.08)'
const BORDER = '#e2e8f0'
const BORDER_LIGHT = '#f1f5f9'
const TEXT = '#1e293b'
const TEXT_MUTED = '#64748b'
const TEXT_DIM = '#94a3b8'
const GREEN = '#4ADE80'
const GREEN_DARK = '#16A34A'
const GREEN_BG = 'rgba(74, 222, 128, 0.10)'
const GREEN_BORDER = 'rgba(22, 163, 74, 0.20)'
const RED = '#ef4444'
const RED_BG = 'rgba(239, 68, 68, 0.08)'
const RED_BORDER = 'rgba(239, 68, 68, 0.20)'
const YELLOW = '#f59e0b'
const YELLOW_BG = 'rgba(245, 158, 11, 0.08)'
const YELLOW_BORDER = 'rgba(245, 158, 11, 0.20)'
const BLUE = '#3b82f6'
const BLUE_BG = 'rgba(59, 130, 246, 0.08)'
const BLUE_BORDER = 'rgba(59, 130, 246, 0.20)'
const PURPLE = '#8b5cf6'
const PURPLE_BG = 'rgba(139, 92, 246, 0.08)'
const PURPLE_BORDER = 'rgba(139, 92, 246, 0.20)'
const ORANGE = '#f97316'
const ORANGE_BG = 'rgba(249, 115, 22, 0.08)'
const ORANGE_BORDER = 'rgba(249, 115, 22, 0.20)'
const CYAN = '#06b6d4'

const PLAN_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  pending:    { color: YELLOW, bg: YELLOW_BG, border: YELLOW_BORDER },
  starter:    { color: BLUE, bg: BLUE_BG, border: BLUE_BORDER },
  pro:        { color: PURPLE, bg: PURPLE_BG, border: PURPLE_BORDER },
  enterprise: { color: GREEN_DARK, bg: GREEN_BG, border: GREEN_BORDER },
  unlimited:  { color: RED, bg: RED_BG, border: RED_BORDER },
}

const PLAN_PRICES: Record<string, number> = { starter: 97, pro: 197, enterprise: 397, unlimited: 697 }

const PLAN_LIMITS: Record<string, { messages: number; contacts: number; channels: number; campaigns: number; ai: number; flows: number }> = {
  pending:    { messages: 0, contacts: 0, channels: 0, campaigns: 999999, ai: 0, flows: 0 },
  starter:    { messages: 10000, contacts: 10000, channels: 3, campaigns: 999999, ai: 5000, flows: 5 },
  pro:        { messages: 50000, contacts: 50000, channels: 10, campaigns: 999999, ai: 30000, flows: 20 },
  enterprise: { messages: 200000, contacts: 100000, channels: 30, campaigns: 999999, ai: 100000, flows: 999 },
  unlimited:  { messages: 999999, contacts: 999999, channels: 999, campaigns: 999999, ai: 999999, flows: 999 },
}

const TABS = ['Dashboard', 'Tenants', 'Receita', 'Auditoria', 'Sistema'] as const
type Tab = typeof TABS[number]

const TAB_ICONS: Record<Tab, any> = {
  Dashboard: LayoutDashboard,
  Tenants: Users,
  Receita: DollarSign,
  Auditoria: FileText,
  Sistema: Server,
}

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
    delete: (url: string) => tenantApi.delete(url, { headers: { 'x-admin-secret': secret } }),
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   UTILITY COMPONENTS
   ══════════════════════════════════════════════════════════════════════════════ */

function Skeleton({ width, height = 20 }: { width: string | number; height?: number }) {
  return (
    <div style={{
      width, height, borderRadius: 6,
      background: `linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)`,
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease-in-out infinite',
    }} />
  )
}

function UsageBar({ label, value, max, color = GREEN_DARK }: { label: string; value: number; max: number; color?: string }) {
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
      <div style={{ height: 6, borderRadius: 3, background: '#e2e8f0', overflow: 'hidden' }}>
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
      {copied ? <Check size={12} color={GREEN_DARK} /> : <Copy size={12} color={TEXT_DIM} />}
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
      background: CARD_BG, borderRadius: 12, padding: '22px 24px',
      boxShadow: CARD_SHADOW, transition: 'all 0.2s', position: 'relative',
      border: `1px solid ${BORDER_LIGHT}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: `${color}14`,
        }}>
          <Icon size={22} color={color} />
        </div>
        <div style={{ flex: 1 }}>
          {loading ? <Skeleton width="60%" height={28} /> : (
            <div style={{ fontSize: 28, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {value ?? '\u2014'}
            </div>
          )}
          <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 2, fontWeight: 500 }}>{label}</div>
          {subtitle && (
            <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: 16, fontWeight: 700, color: TEXT,
      margin: '0 0 16px', letterSpacing: '-0.01em',
    }}>
      {children}
    </h3>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════════════════════════════ */

export default function AdminPage() {
  const queryClient = useQueryClient()

  /* --- Auth state --- */
  const [secret, setSecret] = useState('')
  const [secretInput, setSecretInput] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  /* --- UI state --- */
  const [activeTab, setActiveTab] = useState<Tab>('Dashboard')
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterPlan, setFilterPlan] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sortBy, setSortBy] = useState('created_at')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [blockReasons, setBlockReasons] = useState<Record<string, string>>({})
  const [currentTime, setCurrentTime] = useState(new Date())

  /* --- Impersonation --- */
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

  /* --- Queries --- */
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

  /* --- Service health checks --- */
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

  /* --- Mutations --- */
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

  const activateMutation = useMutation({
    mutationFn: async ({ id, planSlug, sendEmail, notes }: { id: string; planSlug: string; sendEmail: boolean; notes?: string }) => {
      await adminApi().patch(`/admin/tenants/${id}/activate`, { planSlug, sendEmail, notes })
    },
    onSuccess: () => { toast.success('Plano ativado manualmente!'); invalidateAll() },
    onError: () => toast.error('Erro ao ativar plano'),
  })

  const resetUsageMutation = useMutation({
    mutationFn: async (id: string) => { await adminApi().post(`/admin/tenants/${id}/reset-usage`) },
    onSuccess: () => { toast.success('Contadores resetados'); invalidateAll() },
    onError: () => toast.error('Erro ao resetar'),
  })

  const deleteTenantMutation = useMutation({
    mutationFn: async (id: string) => { await adminApi().delete(`/admin/tenants/${id}`) },
    onSuccess: () => { toast.success('Tenant desativado'); invalidateAll() },
    onError: () => toast.error('Erro ao deletar'),
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

  /* --- Filtering + Sorting --- */
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

  /* --- Revenue computed --- */
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

  /* --- Helpers --- */
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
    background: CARD_BG, border: `1px solid ${BORDER}`,
    borderRadius: 8, fontSize: 13, outline: 'none',
    color: TEXT, fontFamily: 'inherit', transition: 'all 0.2s',
  }

  const btnPrimary: React.CSSProperties = {
    padding: '10px 20px', background: GREEN_DARK, color: '#fff',
    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
    transition: 'all 0.2s',
  }

  const btnGhost: React.CSSProperties = {
    padding: '8px 14px', background: CARD_BG,
    border: `1px solid ${BORDER}`, borderRadius: 8,
    color: TEXT_MUTED, fontSize: 13, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6,
    transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════════ */

  return (
    <div style={{ minHeight: '100vh', background: PAGE_BG, color: TEXT, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* --- Impersonation banner --- */}
      {isImpersonating && (
        <div
          onClick={returnFromImpersonation}
          style={{
            background: 'linear-gradient(90deg, #dc2626, #ef4444)', color: '#fff',
            padding: '10px 20px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, letterSpacing: '0.01em',
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          }}
        >
          <AlertTriangle size={15} />
          Logado como {impersonatingName} &mdash; Clique para voltar ao admin
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          LOGIN SCREEN — LIGHT THEME
          ═══════════════════════════════════════════════════════════════════ */}
      {!isAuthenticated && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: 20, background: PAGE_BG,
        }}>
          <div style={{
            width: '100%', maxWidth: 420, textAlign: 'center',
            background: CARD_BG, borderRadius: 16, padding: '48px 40px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            border: `1px solid ${BORDER_LIGHT}`,
          }}>
            <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'center' }}>
              <AutoZapLogo variant="white" size="lg" />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: TEXT }}>
              Painel Administrativo
            </h1>
            <p style={{ fontSize: 14, color: TEXT_MUTED, margin: '0 0 32px' }}>
              Insira o secret para acessar
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
                  background: '#f8f9fc',
                }}
              />
              <button type="submit" style={{
                ...btnPrimary, width: '100%', justifyContent: 'center',
                padding: '14px 20px', fontSize: 14, borderRadius: 10,
              }}>
                <Shield size={16} />
                Entrar
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          AUTHENTICATED — SIDEBAR + MAIN LAYOUT
          ═══════════════════════════════════════════════════════════════════ */}
      {isAuthenticated && (
        <div style={{ display: 'flex', minHeight: '100vh' }}>

          {/* ─── SIDEBAR (fixed, 240px) ─── */}
          <aside style={{
            width: 240, minWidth: 240, background: SIDEBAR_BG,
            display: 'flex', flexDirection: 'column',
            position: 'fixed', top: isImpersonating ? 40 : 0, left: 0,
            bottom: 0, zIndex: 60,
            padding: '0',
            overflowY: 'auto',
          }}>
            {/* Logo */}
            <div style={{
              padding: '24px 20px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <AutoZapLogo variant="dark" size="md" />
            </div>

            {/* Nav items */}
            <nav style={{ padding: '16px 12px', flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 12px 8px', marginBottom: 4 }}>
                Menu
              </div>
              {TABS.map(tab => {
                const active = activeTab === tab
                const Icon = TAB_ICONS[tab]
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      width: '100%', padding: '10px 14px',
                      background: active ? 'rgba(74, 222, 128, 0.12)' : 'transparent',
                      border: 'none', borderRadius: 8,
                      color: active ? SIDEBAR_TEXT_ACTIVE : SIDEBAR_TEXT,
                      fontSize: 14, fontWeight: active ? 600 : 400,
                      cursor: 'pointer', transition: 'all 0.15s',
                      fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10,
                      marginBottom: 2, textAlign: 'left',
                      borderLeft: active ? `3px solid ${GREEN}` : '3px solid transparent',
                    }}
                  >
                    <Icon size={18} color={active ? GREEN : SIDEBAR_TEXT} />
                    {tab}
                  </button>
                )
              })}
            </nav>

            {/* Admin badge + logout */}
            <div style={{
              padding: '16px 16px 20px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                marginBottom: 10,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'linear-gradient(135deg, #4ADE80, #16A34A)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Shield size={14} color="#fff" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Admin</div>
                  <div style={{ fontSize: 11, color: SIDEBAR_TEXT }}>Super acesso</div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%', padding: '8px 12px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                  borderRadius: 8, color: '#f87171', fontSize: 13,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  gap: 8, fontFamily: 'inherit', fontWeight: 500,
                  transition: 'all 0.15s',
                }}
              >
                <LogOut size={14} /> Sair do admin
              </button>
            </div>
          </aside>

          {/* ─── MAIN CONTENT (right of sidebar) ─── */}
          <main style={{
            flex: 1, marginLeft: 240,
            marginTop: isImpersonating ? 40 : 0,
            minHeight: '100vh',
          }}>
            {/* ═══ TOP HEADER BAR ═══ */}
            <header style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 32px',
              background: CARD_BG,
              borderBottom: `1px solid ${BORDER}`,
              position: 'sticky', top: isImpersonating ? 40 : 0, zIndex: 50,
            }}>
              <div>
                <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 2 }}>
                  Admin &gt; <span style={{ color: TEXT_MUTED, fontWeight: 500 }}>{activeTab}</span>
                </div>
                <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: TEXT, letterSpacing: '-0.02em' }}>
                  {activeTab}
                </h1>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: TEXT_DIM }} />
                  <input
                    placeholder="Buscar..."
                    value={activeTab === 'Tenants' ? search : ''}
                    onChange={e => { setSearch(e.target.value); if (activeTab !== 'Tenants') setActiveTab('Tenants') }}
                    style={{
                      ...inputStyle, width: 220, paddingLeft: 36, fontSize: 13,
                      background: '#f8f9fc', border: `1px solid ${BORDER}`,
                    }}
                  />
                </div>
                <button onClick={refreshAll} style={{
                  ...btnPrimary, padding: '9px 18px', borderRadius: 8,
                }}>
                  <RefreshCw size={14} /> Atualizar
                </button>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px', borderRadius: 8,
                  background: '#f8f9fc', border: `1px solid ${BORDER}`,
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #4ADE80, #16A34A)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>A</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>Admin</div>
                    <div style={{ fontSize: 10, color: TEXT_DIM, fontFamily: 'monospace' }}>
                      {currentTime.toLocaleTimeString('pt-BR')}
                    </div>
                  </div>
                </div>
              </div>
            </header>

            {/* ═══ PAGE CONTENT ═══ */}
            <div style={{ padding: '28px 32px 48px' }}>

              {/* ═══════════════════════════════════════════════════════════════════
                  TAB 1: DASHBOARD
                  ═══════════════════════════════════════════════════════════════════ */}
              {activeTab === 'Dashboard' && (
                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                  {/* Stat cards row (4) */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 20, marginBottom: 28,
                  }}>
                    <StatCard label="Total de Clientes" value={stats?.totalTenants} icon={Users} color={ORANGE} loading={statsLoading} />
                    <StatCard label="Pagantes Ativos" value={stats?.activePaying} icon={DollarSign} color={BLUE} loading={statsLoading} />
                    <StatCard label="Mensagens Hoje" value={stats?.messagesTODAY} icon={MessageSquare} color={GREEN_DARK} loading={statsLoading} />
                    <StatCard
                      label="MRR"
                      value={stats?.mrr != null ? `R$ ${stats.mrr.toLocaleString('pt-BR')}` : totalMRR > 0 ? `R$ ${totalMRR.toLocaleString('pt-BR')}` : undefined}
                      icon={CreditCard} color={PURPLE} loading={statsLoading}
                    />
                  </div>

                  {/* Second stat row */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 20, marginBottom: 28,
                  }}>
                    <StatCard label="Novos Hoje" value={stats?.newToday} icon={TrendingUp} color={GREEN_DARK} loading={statsLoading} />
                    <StatCard label="Novos esta Semana" value={stats?.newThisWeek} icon={Calendar} color={BLUE} loading={statsLoading} />
                    <StatCard label="Pendentes" value={stats?.pendingCount} icon={Clock} color={YELLOW} loading={statsLoading} />
                    <StatCard label="Cancelados no Mes" value={churnedThisMonth} icon={ArrowDownRight} color={RED} loading={statsLoading} subtitle="churn mensal" />
                  </div>

                  {/* Charts area - 2 side by side */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
                    {/* Clientes por Plano - Pizza */}
                    <div style={{
                      background: CARD_BG, borderRadius: 12, padding: 24,
                      boxShadow: CARD_SHADOW, border: `1px solid ${BORDER_LIGHT}`,
                    }}>
                      <SectionTitle>Clientes por Plano</SectionTitle>
                      <div style={{ width: '100%', height: 280 }}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie
                              data={['starter', 'pro', 'enterprise', 'unlimited', 'pending'].map(plan => ({
                                name: plan.charAt(0).toUpperCase() + plan.slice(1),
                                value: revenueByPlan[plan]?.count || 0,
                                color: PLAN_COLORS[plan]?.color || '#94a3b8',
                              })).filter(d => d.value > 0)}
                              cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                              paddingAngle={3} dataKey="value"
                              label={({ name, value, percent }: any) => `${name}: ${value} (${((percent || 0) * 100).toFixed(0)}%)`}
                              labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                            >
                              {['starter', 'pro', 'enterprise', 'unlimited', 'pending'].map(plan => (
                                <Cell key={plan} fill={PLAN_COLORS[plan]?.color || '#94a3b8'} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: any, name: any) => [`${value} clientes`, name]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Receita Mensal por Plano - Barras */}
                    <div style={{
                      background: CARD_BG, borderRadius: 12, padding: 24,
                      boxShadow: CARD_SHADOW, border: `1px solid ${BORDER_LIGHT}`,
                    }}>
                      <SectionTitle>Receita Mensal por Plano</SectionTitle>
                      <div style={{ width: '100%', height: 280 }}>
                        <ResponsiveContainer>
                          <BarChart data={['starter', 'pro', 'enterprise', 'unlimited'].map(plan => ({
                            plano: plan.charAt(0).toUpperCase() + plan.slice(1),
                            receita: revenueByPlan[plan]?.revenue || 0,
                            fill: PLAN_COLORS[plan]?.color || '#94a3b8',
                          }))} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="plano" tick={{ fontSize: 12, fill: TEXT_MUTED }} />
                            <YAxis tick={{ fontSize: 11, fill: TEXT_MUTED }} tickFormatter={(v: any) => `R$${v}`} />
                            <Tooltip formatter={(value: any) => [`R$ ${Number(value).toLocaleString('pt-BR')}`, 'Receita']} />
                            <Bar dataKey="receita" radius={[6, 6, 0, 0]}>
                              {['starter', 'pro', 'enterprise', 'unlimited'].map(plan => (
                                <Cell key={plan} fill={PLAN_COLORS[plan]?.color || '#94a3b8'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Clientes Recentes table */}
                  <div style={{
                    background: CARD_BG, borderRadius: 12,
                    boxShadow: CARD_SHADOW, border: `1px solid ${BORDER_LIGHT}`,
                    overflow: 'hidden',
                  }}>
                    <div style={{ padding: '20px 24px 0' }}>
                      <SectionTitle>Clientes Recentes</SectionTitle>
                    </div>
                    {/* Table header */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 2fr 100px 80px 80px 100px 120px',
                      gap: 8, padding: '12px 24px',
                      borderBottom: `1px solid ${BORDER}`,
                      background: '#f8f9fc',
                    }}>
                      {['Empresa', 'Email', 'Plano', 'Status', 'Mensagens', 'Cadastro', 'Acoes'].map(h => (
                        <span key={h} style={{
                          fontSize: 11, fontWeight: 700, color: TEXT_MUTED,
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>{h}</span>
                      ))}
                    </div>

                    {tenantsLoading ? (
                      <div style={{ padding: '16px 24px' }}>
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} style={{ padding: '14px 0', borderBottom: `1px solid ${BORDER_LIGHT}` }}>
                            <Skeleton width="100%" height={20} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      (tenants as any[] || [])
                        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .slice(0, 10)
                        .map((t: any, i: number) => {
                          const planStyle = PLAN_COLORS[t.plan_slug] || PLAN_COLORS.pending
                          return (
                            <div
                              key={t.id}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '2fr 2fr 100px 80px 80px 100px 120px',
                                gap: 8, padding: '14px 24px',
                                borderBottom: `1px solid ${BORDER_LIGHT}`,
                                alignItems: 'center',
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#f8f9fc' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                            >
                              <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{t.name}</span>
                              <span style={{ fontSize: 12, color: TEXT_MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.owner?.email || '\u2014'}
                              </span>
                              <Badge color={planStyle.color} bg={planStyle.bg} border={planStyle.border}>
                                {t.plan_slug}
                              </Badge>
                              <Badge
                                color={t.is_blocked ? RED : t.plan_slug === 'pending' ? YELLOW : GREEN_DARK}
                                bg={t.is_blocked ? RED_BG : t.plan_slug === 'pending' ? YELLOW_BG : GREEN_BG}
                                border={t.is_blocked ? RED_BORDER : t.plan_slug === 'pending' ? YELLOW_BORDER : GREEN_BORDER}
                              >
                                {t.is_blocked ? 'Bloq' : t.plan_slug === 'pending' ? 'Pend' : 'Ativo'}
                              </Badge>
                              <span style={{ fontSize: 13, color: TEXT, fontFamily: 'monospace' }}>
                                {(t.messages_sent_this_period ?? 0).toLocaleString()}
                              </span>
                              <span style={{ fontSize: 12, color: TEXT_MUTED }}>
                                {t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '\u2014'}
                              </span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  onClick={() => impersonateMutation.mutate({ id: t.id, name: t.name })}
                                  disabled={impersonateMutation.isPending}
                                  title="Impersonar"
                                  style={{
                                    padding: '5px 10px', background: GREEN_BG,
                                    border: `1px solid ${GREEN_BORDER}`, borderRadius: 6,
                                    color: GREEN_DARK, fontSize: 11, fontWeight: 600,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                    transition: 'all 0.15s',
                                  }}
                                >
                                  <Eye size={12} /> Entrar
                                </button>
                                <button
                                  onClick={() => {
                                    setActiveTab('Tenants')
                                    setSelectedTenantId(t.id)
                                  }}
                                  title="Ver detalhes"
                                  style={{
                                    padding: '5px 10px', background: BLUE_BG,
                                    border: `1px solid ${BLUE_BORDER}`, borderRadius: 6,
                                    color: BLUE, fontSize: 11, fontWeight: 600,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                    transition: 'all 0.15s',
                                  }}
                                >
                                  <ChevronDown size={12} />
                                </button>
                              </div>
                            </div>
                          )
                        })
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
                        style={{ ...inputStyle, paddingLeft: 38, background: CARD_BG }}
                      />
                    </div>
                    <select
                      value={filterPlan}
                      onChange={e => setFilterPlan(e.target.value)}
                      style={{ ...inputStyle, width: 'auto', minWidth: 150, cursor: 'pointer', background: CARD_BG }}
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
                      style={{ ...inputStyle, width: 'auto', minWidth: 140, cursor: 'pointer', background: CARD_BG }}
                    >
                      <option value="all">Todos status</option>
                      <option value="ativo">Ativo</option>
                      <option value="bloqueado">Bloqueado</option>
                      <option value="pendente">Pendente</option>
                    </select>
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value)}
                      style={{ ...inputStyle, width: 'auto', minWidth: 160, cursor: 'pointer', background: CARD_BG }}
                    >
                      <option value="created_at">Mais recentes</option>
                      <option value="oldest">Mais antigos</option>
                      <option value="msgs">Mais mensagens</option>
                      <option value="contatos">Mais contatos</option>
                    </select>
                    <span style={{
                      fontSize: 13, color: TEXT_MUTED, fontWeight: 500,
                      padding: '8px 14px', background: CARD_BG, borderRadius: 8,
                      border: `1px solid ${BORDER}`,
                    }}>
                      {filtered.length} tenant{filtered.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Tenant table */}
                  <div style={{
                    background: CARD_BG, borderRadius: 12,
                    boxShadow: CARD_SHADOW, border: `1px solid ${BORDER_LIGHT}`,
                    overflow: 'hidden',
                  }}>
                    {/* Header */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1.8fr 90px 70px 70px 80px 90px 70px 80px 140px',
                      gap: 8, padding: '14px 20px',
                      borderBottom: `1px solid ${BORDER}`,
                      background: '#f8f9fc',
                    }}>
                      {['Empresa', 'Responsavel', 'Plano', 'Status', 'Canais', 'Membros', 'Contatos', 'Mensagens', 'Cadastro', 'Acoes'].map(h => (
                        <span key={h} style={{
                          fontSize: 11, fontWeight: 700, color: TEXT_MUTED,
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
                            gap: 8, padding: '14px 0', borderBottom: `1px solid ${BORDER_LIGHT}`,
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
                              borderBottom: `1px solid ${BORDER_LIGHT}`,
                              cursor: 'pointer',
                              background: isSelected ? '#f0f9ff' : 'transparent',
                              alignItems: 'center',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#f8f9fc' }}
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
                              <div style={{ fontSize: 12, color: TEXT_MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {t.owner?.email || '\u2014'}
                              </div>
                            </div>

                            {/* Plan */}
                            <Badge color={planStyle.color} bg={planStyle.bg} border={planStyle.border}>
                              {t.plan_slug}
                            </Badge>

                            {/* Status */}
                            <Badge
                              color={t.is_blocked ? RED : t.plan_slug === 'pending' ? YELLOW : GREEN_DARK}
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
                                  color: GREEN_DARK, fontSize: 11, fontWeight: 600,
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
                                    color: GREEN_DARK, fontSize: 11, fontWeight: 600,
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

                          {/* --- Expanded detail panel --- */}
                          {isSelected && (
                            <div style={{
                              padding: '28px 24px',
                              background: '#f8f9fc',
                              borderBottom: `2px solid ${GREEN_DARK}`,
                              animation: 'fadeIn 0.2s ease',
                            }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>

                                {/* Col 1 - Info */}
                                <div>
                                  <SectionTitle>Informacoes</SectionTitle>
                                  <div style={{
                                    background: CARD_BG, border: `1px solid ${BORDER}`,
                                    borderRadius: 10, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                  }}>
                                    {[
                                      { label: 'ID', value: t.id, mono: true, copyable: true },
                                      { label: 'Slug', value: t.slug },
                                      { label: 'Subscription', value: t.subscription?.status || 'Nenhuma' },
                                      { label: 'MRR', value: `R$ ${(t.mrr ?? PLAN_PRICES[t.plan_slug] ?? 0).toLocaleString('pt-BR')}` },
                                      { label: 'Criado em', value: t.created_at ? new Date(t.created_at).toLocaleString('pt-BR') : '\u2014' },
                                      { label: 'Ultimo login', value: t.owner?.last_login_at ? new Date(t.owner.last_login_at).toLocaleString('pt-BR') : 'Nunca' },
                                      { label: 'Plano atual', value: t.plan_slug },
                                    ].map(({ label, value, mono, copyable }) => (
                                      <div key={label} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '8px 0', borderBottom: `1px solid ${BORDER_LIGHT}`,
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
                                          {t.blocked_reason || 'Nao informado'}
                                        </p>
                                      </div>
                                    )}
                                  </div>

                                  {t.planHistory && t.planHistory.length > 0 && (
                                    <div style={{ marginTop: 14 }}>
                                      <SectionTitle>Historico de planos</SectionTitle>
                                      <div style={{
                                        background: CARD_BG, border: `1px solid ${BORDER}`,
                                        borderRadius: 10, padding: 16,
                                      }}>
                                        {t.planHistory.map((h: any, idx: number) => (
                                          <div key={idx} style={{
                                            display: 'flex', justifyContent: 'space-between',
                                            padding: '6px 0', borderBottom: `1px solid ${BORDER_LIGHT}`,
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
                                  <SectionTitle>Uso este mes</SectionTitle>
                                  <div style={{
                                    background: CARD_BG, border: `1px solid ${BORDER}`,
                                    borderRadius: 10, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                  }}>
                                    <UsageBar label="Mensagens" value={t.messages_sent_this_period ?? 0} max={limits.messages} color={GREEN_DARK} />
                                    <UsageBar label="Contatos" value={t.contactCount ?? 0} max={limits.contacts} color={BLUE} />
                                    <UsageBar label="Canais" value={t.channelCount ?? 0} max={limits.channels} color={PURPLE} />
                                    <UsageBar label="Flows" value={t.activeFlowCount ?? 0} max={limits.flows} color={CYAN} />
                                    <UsageBar label="Campanhas" value={t.campaignCount ?? 0} max={limits.campaigns} color={YELLOW} />
                                    <UsageBar label="Respostas IA" value={t.aiResponseCount ?? 0} max={limits.ai} color={'#ec4899'} />
                                  </div>
                                </div>

                                {/* Col 3 - Actions */}
                                <div>
                                  <SectionTitle>Acoes</SectionTitle>
                                  <div style={{
                                    background: CARD_BG, border: `1px solid ${BORDER}`,
                                    borderRadius: 10, padding: 16, marginBottom: 14,
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
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
                                            padding: '10px 16px',
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
                                        background: PURPLE_BG, border: `1px solid ${PURPLE_BORDER}`,
                                        borderRadius: 8, color: PURPLE, fontSize: 13, fontWeight: 600,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                        marginBottom: 12,
                                      }}
                                    >
                                      <Eye size={14} /> Impersonar tenant
                                    </button>

                                    {/* Ativar Plano (bypass pagamento) */}
                                    <button
                                      onClick={() => {
                                        const plan = prompt('Plano para ativar (starter, pro, enterprise, unlimited):')
                                        if (!plan || !['starter', 'pro', 'enterprise', 'unlimited'].includes(plan)) return
                                        const sendEmail = confirm('Enviar email de confirmação ao cliente?')
                                        const notes = prompt('Notas (motivo da ativação manual):') || ''
                                        activateMutation.mutate({ id: t.id, planSlug: plan, sendEmail, notes })
                                      }}
                                      disabled={activateMutation.isPending}
                                      style={{
                                        width: '100%', padding: '10px 16px', justifyContent: 'center',
                                        background: GREEN_BG, border: `1px solid ${GREEN_BORDER}`,
                                        borderRadius: 8, color: GREEN_DARK, fontSize: 13, fontWeight: 600,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                        marginBottom: 12,
                                      }}
                                    >
                                      <Zap size={14} /> Ativar plano manualmente
                                    </button>

                                    {/* Resetar contadores */}
                                    <button
                                      onClick={() => { if (confirm('Resetar contadores de uso?')) resetUsageMutation.mutate(t.id) }}
                                      disabled={resetUsageMutation.isPending}
                                      style={{
                                        width: '100%', padding: '10px 16px', justifyContent: 'center',
                                        background: BLUE_BG, border: `1px solid ${BLUE_BORDER}`,
                                        borderRadius: 8, color: BLUE, fontSize: 13, fontWeight: 600,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                        marginBottom: 12,
                                      }}
                                    >
                                      <RefreshCw size={14} /> Resetar uso do mes
                                    </button>

                                    {/* Deletar tenant */}
                                    <button
                                      onClick={() => { if (confirm(`DELETAR ${t.name}? Essa ação desativa a conta e todos os usuários.`)) deleteTenantMutation.mutate(t.id) }}
                                      disabled={deleteTenantMutation.isPending}
                                      style={{
                                        width: '100%', padding: '10px 16px', justifyContent: 'center',
                                        background: RED_BG, border: `1px solid ${RED_BORDER}`,
                                        borderRadius: 8, color: RED, fontSize: 13, fontWeight: 600,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                        marginBottom: 12,
                                      }}
                                    >
                                      <Trash2 size={14} /> Deletar tenant
                                    </button>

                                    {/* Notes */}
                                    <div>
                                      <label style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 6, display: 'block' }}>
                                        Notas do admin
                                      </label>
                                      <textarea
                                        value={notes[t.id] ?? (t.admin_notes || '')}
                                        onChange={e => setNotes(prev => ({ ...prev, [t.id]: e.target.value }))}
                                        placeholder="Anotacoes internas..."
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
                                <SectionTitle>Membros</SectionTitle>
                                <div style={{
                                  background: CARD_BG, border: `1px solid ${BORDER}`,
                                  borderRadius: 10, overflow: 'hidden',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                }}>
                                  <div style={{
                                    display: 'grid', gridTemplateColumns: '2fr 2fr 100px 120px 80px',
                                    gap: 8, padding: '10px 16px', borderBottom: `1px solid ${BORDER}`,
                                    background: '#f8f9fc',
                                  }}>
                                    {['Nome', 'Email', 'Role', 'Ultimo login', 'Status'].map(h => (
                                      <span key={h} style={{ fontSize: 11, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        {h}
                                      </span>
                                    ))}
                                  </div>
                                  {(t.members && t.members.length > 0 ? t.members : t.owner ? [{ ...t.owner, role: 'owner' }] : []).map((m: any) => (
                                    <div key={m.id || m.email} style={{
                                      display: 'grid', gridTemplateColumns: '2fr 2fr 100px 120px 80px',
                                      gap: 8, padding: '10px 16px', borderBottom: `1px solid ${BORDER_LIGHT}`,
                                      alignItems: 'center',
                                    }}>
                                      <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{m.name || '\u2014'}</span>
                                      <span style={{ fontSize: 12, color: TEXT_MUTED }}>{m.email}</span>
                                      <Badge
                                        color={m.role === 'owner' ? GREEN_DARK : BLUE}
                                        bg={m.role === 'owner' ? GREEN_BG : BLUE_BG}
                                        border={m.role === 'owner' ? GREEN_BORDER : BLUE_BORDER}
                                      >
                                        {m.role}
                                      </Badge>
                                      <span style={{ fontSize: 12, color: TEXT_MUTED }}>
                                        {m.last_login_at ? new Date(m.last_login_at).toLocaleDateString('pt-BR') : 'Nunca'}
                                      </span>
                                      <Badge color={GREEN_DARK} bg={GREEN_BG} border={GREEN_BORDER}>Ativo</Badge>
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
                    gap: 20, marginBottom: 28,
                  }}>
                    <div style={{
                      background: CARD_BG, borderRadius: 12, padding: '24px 22px',
                      boxShadow: CARD_SHADOW, border: `1px solid ${BORDER_LIGHT}`,
                    }}>
                      <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>MRR total</div>
                      <div style={{ fontSize: 32, fontWeight: 700, color: GREEN_DARK, letterSpacing: '-0.02em' }}>
                        R$ {totalMRR.toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div style={{
                      background: CARD_BG, borderRadius: 12, padding: '24px 22px',
                      boxShadow: CARD_SHADOW, border: `1px solid ${BORDER_LIGHT}`,
                    }}>
                      <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>ARR (estimado)</div>
                      <div style={{ fontSize: 32, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>
                        R$ {(totalMRR * 12).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div style={{
                      background: CARD_BG, borderRadius: 12, padding: '24px 22px',
                      boxShadow: CARD_SHADOW, border: `1px solid ${BORDER_LIGHT}`,
                    }}>
                      <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>Novo MRR (mes)</div>
                      <div style={{ fontSize: 32, fontWeight: 700, color: GREEN_DARK, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ArrowUpRight size={20} />
                        R$ {((stats?.newThisMonth || 0) > 0 ? (stats.newThisMonth * (PLAN_PRICES.starter || 97)) : 0).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div style={{
                      background: CARD_BG, borderRadius: 12, padding: '24px 22px',
                      boxShadow: CARD_SHADOW, border: `1px solid ${BORDER_LIGHT}`,
                    }}>
                      <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>Churned MRR</div>
                      <div style={{ fontSize: 32, fontWeight: 700, color: RED, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ArrowDownRight size={20} />
                        R$ {(churnedThisMonth * (PLAN_PRICES.starter || 97)).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div style={{
                      background: CARD_BG, borderRadius: 12, padding: '24px 22px',
                      boxShadow: CARD_SHADOW, border: `1px solid ${BORDER_LIGHT}`,
                    }}>
                      <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 8 }}>Net MRR change</div>
                      {(() => {
                        const newMrr = (stats?.newThisMonth || 0) > 0 ? stats.newThisMonth * (PLAN_PRICES.starter || 97) : 0
                        const churnMrr = churnedThisMonth * (PLAN_PRICES.starter || 97)
                        const net = newMrr - churnMrr
                        return (
                          <div style={{
                            fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em',
                            color: net >= 0 ? GREEN_DARK : RED, display: 'flex', alignItems: 'center', gap: 6,
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
                    background: CARD_BG, borderRadius: 12,
                    boxShadow: CARD_SHADOW, border: `1px solid ${BORDER_LIGHT}`,
                    overflow: 'hidden', marginBottom: 28,
                  }}>
                    <div style={{ padding: '20px 24px 0' }}>
                      <SectionTitle>Receita por plano</SectionTitle>
                    </div>
                    <div style={{
                      display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr',
                      gap: 8, padding: '14px 24px',
                      borderBottom: `1px solid ${BORDER}`, background: '#f8f9fc',
                    }}>
                      {['Plano', '# Tenants', 'Preco unitario', 'Receita mensal'].map(h => (
                        <span key={h} style={{ fontSize: 11, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
                          borderBottom: `1px solid ${BORDER_LIGHT}`, alignItems: 'center',
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
                      background: '#f8f9fc', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>Total</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: 'monospace' }}>
                        {Object.values(revenueByPlan).reduce((sum, p) => sum + p.count, 0)}
                      </span>
                      <span style={{ fontSize: 14, color: TEXT_DIM }}>{'\u2014'}</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: GREEN_DARK, fontFamily: 'monospace' }}>
                        R$ {totalMRR.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {/* Recent payments */}
                  <div style={{
                    background: CARD_BG, borderRadius: 12,
                    boxShadow: CARD_SHADOW, border: `1px solid ${BORDER_LIGHT}`,
                    overflow: 'hidden',
                  }}>
                    <div style={{ padding: '20px 24px 0' }}>
                      <SectionTitle>Pagamentos recentes (tenants pagantes)</SectionTitle>
                    </div>
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1.5fr 2fr 1fr 1fr 1fr',
                      gap: 8, padding: '14px 24px',
                      borderBottom: `1px solid ${BORDER}`, background: '#f8f9fc',
                    }}>
                      {['Data', 'Tenant', 'Valor', 'Status', 'Plano'].map(h => (
                        <span key={h} style={{ fontSize: 11, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
                            borderBottom: `1px solid ${BORDER_LIGHT}`, alignItems: 'center',
                          }}>
                            <span style={{ fontSize: 12, color: TEXT_MUTED, fontFamily: 'monospace' }}>
                              {t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '\u2014'}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{t.name}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, fontFamily: 'monospace' }}>
                              R$ {(PLAN_PRICES[t.plan_slug] || 0).toLocaleString('pt-BR')}
                            </span>
                            <Badge
                              color={t.is_blocked ? RED : GREEN_DARK}
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
                  TAB: AUDITORIA
                  ═══════════════════════════════════════════════════════════════════ */}
              {activeTab === 'Auditoria' && <AuditLogTab adminApi={adminApi} />}

              {/* ═══════════════════════════════════════════════════════════════════
                  TAB 4: SISTEMA
                  ═══════════════════════════════════════════════════════════════════ */}
              {activeTab === 'Sistema' && (
                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                  {/* Services status */}
                  <SectionTitle>Status dos servicos</SectionTitle>
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
                          background: CARD_BG, borderRadius: 12, padding: 20,
                          boxShadow: CARD_SHADOW, border: `1px solid ${BORDER_LIGHT}`,
                          transition: 'all 0.2s',
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
                                background: isUp ? GREEN_DARK : RED,
                                boxShadow: isUp ? `0 0 8px ${GREEN}40` : `0 0 8px ${RED}40`,
                              }} />
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: TEXT_DIM, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {svc.url || 'N/A'}
                          </div>
                          {health && (
                            <div style={{ marginTop: 8, fontSize: 12, color: isUp ? GREEN_DARK : RED, fontWeight: 600 }}>
                              {isUp ? `Online \u00b7 ${health.latency}ms` : 'Offline'}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Database stats */}
                  <SectionTitle>Banco de dados</SectionTitle>
                  <div style={{
                    background: CARD_BG, borderRadius: 12, padding: 24, marginBottom: 32,
                    boxShadow: CARD_SHADOW, border: `1px solid ${BORDER_LIGHT}`,
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
                        <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 6 }}>Regiao</div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: TEXT }}>South America (sa-east-1)</div>
                      </div>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <SectionTitle>Acoes rapidas</SectionTitle>
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 16,
                  }}>
                    <button
                      onClick={() => { toast.success('Cache limpo (simulado)') }}
                      style={{
                        background: CARD_BG, border: `1px solid ${BORDER_LIGHT}`, borderRadius: 12,
                        padding: 20, cursor: 'pointer', textAlign: 'left',
                        boxShadow: CARD_SHADOW, transition: 'all 0.2s',
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: RED_BG, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 12,
                      }}>
                        <Trash2 size={18} color={RED} />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Limpar caches</div>
                      <div style={{ fontSize: 12, color: TEXT_DIM }}>Invalida todos os caches dos servicos</div>
                    </button>
                    <button
                      onClick={() => { refetchHealth(); toast.success('Configuracoes recarregadas') }}
                      style={{
                        background: CARD_BG, border: `1px solid ${BORDER_LIGHT}`, borderRadius: 12,
                        padding: 20, cursor: 'pointer', textAlign: 'left',
                        boxShadow: CARD_SHADOW, transition: 'all 0.2s',
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: BLUE_BG, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 12,
                      }}>
                        <RefreshCw size={18} color={BLUE} />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Recarregar configs</div>
                      <div style={{ fontSize: 12, color: TEXT_DIM }}>Recarrega configuracoes de todos os servicos</div>
                    </button>
                    <a
                      href="https://sentry.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: CARD_BG, border: `1px solid ${BORDER_LIGHT}`, borderRadius: 12,
                        padding: 20, cursor: 'pointer', textAlign: 'left',
                        boxShadow: CARD_SHADOW, transition: 'all 0.2s', textDecoration: 'none',
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: YELLOW_BG, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 12,
                      }}>
                        <ExternalLink size={18} color={YELLOW} />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Sentry errors</div>
                      <div style={{ fontSize: 12, color: TEXT_DIM }}>Ver erros e exceptions no Sentry</div>
                    </a>
                    <a
                      href="https://railway.app/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: CARD_BG, border: `1px solid ${BORDER_LIGHT}`, borderRadius: 12,
                        padding: 20, cursor: 'pointer', textAlign: 'left',
                        boxShadow: CARD_SHADOW, transition: 'all 0.2s', textDecoration: 'none',
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: PURPLE_BG, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 12,
                      }}>
                        <ExternalLink size={18} color={PURPLE} />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Railway dashboard</div>
                      <div style={{ fontSize: 12, color: TEXT_DIM }}>Gerenciar deployments e infraestrutura</div>
                    </a>
                  </div>
                </div>
              )}

            </div>
          </main>
        </div>
      )}

      {/* --- Animations --- */}
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
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          padding-right: 32px !important;
        }
        select option {
          background: ${CARD_BG};
          color: ${TEXT};
        }
        input::placeholder, textarea::placeholder {
          color: ${TEXT_DIM};
        }
        button:hover {
          opacity: 0.88;
        }
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: ${PAGE_BG};
        }
        ::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        @media (max-width: 1200px) {
          aside {
            width: 200px !important;
            min-width: 200px !important;
          }
          main {
            margin-left: 200px !important;
          }
        }
        @media (max-width: 1024px) {
          aside {
            display: none !important;
          }
          main {
            margin-left: 0 !important;
          }
        }
        @media (max-width: 768px) {
          [style*="gridTemplateColumns: repeat(4"] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          [style*="gridTemplateColumns: repeat(5"] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          [style*="gridTemplateColumns: 1fr 1fr 1fr"] {
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

// ─── Audit Log Tab ──────────────────────────────────────────────────────────
function AuditLogTab({ adminApi }: { adminApi: () => any }) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => {
      const { data } = await adminApi().get('/admin/audit-logs?limit=100')
      return data.data || []
    },
    refetchInterval: 30_000,
  })

  const actionColors: Record<string, { color: string; bg: string }> = {
    'tenant.block': { color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
    'tenant.unblock': { color: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
    'tenant.plan_change': { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
    'tenant.activate': { color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
    'tenant.impersonate': { color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
    'tenant.reset_usage': { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
    'tenant.delete': { color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
    'tenant.settings_update': { color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
  }

  const actionLabels: Record<string, string> = {
    'tenant.block': 'Bloqueou tenant',
    'tenant.unblock': 'Desbloqueou tenant',
    'tenant.plan_change': 'Mudou plano',
    'tenant.activate': 'Ativou plano manualmente',
    'tenant.impersonate': 'Impersonou tenant',
    'tenant.reset_usage': 'Resetou contadores',
    'tenant.delete': 'Deletou tenant',
    'tenant.settings_update': 'Editou configurações',
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>
        Log de auditoria
      </div>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 200px 1fr', gap: 8, padding: '10px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8f9fc' }}>
          {['Data/Hora', 'Ação', 'Alvo (ID)', 'Detalhes'].map(h => (
            <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Nenhum log encontrado</div>
        ) : logs.map((log: any) => {
          const ac = actionColors[log.action] || { color: '#64748b', bg: 'rgba(100,116,139,0.08)' }
          return (
            <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 200px 1fr', gap: 8, padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
              <span style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>
                {new Date(log.created_at).toLocaleString('pt-BR')}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ padding: '2px 8px', borderRadius: 4, background: ac.bg, color: ac.color, fontWeight: 600, fontSize: 11 }}>
                  {actionLabels[log.action] || log.action}
                </span>
              </span>
              <span style={{ color: '#1e293b', fontFamily: 'monospace', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                {log.target_id || '—'}
              </span>
              <span style={{ color: '#64748b', fontSize: 11 }}>
                {log.details ? (typeof log.details === 'string' ? log.details : JSON.stringify(log.details)) : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
