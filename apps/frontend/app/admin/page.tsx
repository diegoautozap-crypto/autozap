'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tenantApi } from '@/lib/api'
import { toast } from 'sonner'
import {
  Users, DollarSign, TrendingUp, MessageSquare, Shield, Ban, Play,
  RefreshCw, Loader2, LogIn, Clock, ChevronDown, ChevronUp, Search,
  ArrowLeft, AlertTriangle, X, Hash, Zap, BarChart3, Bot,
  FileText, UserCheck, Radio, Workflow,
} from 'lucide-react'

/* ───────── Plan colors ───────── */
const PLAN_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  pending:    { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  starter:    { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  pro:        { color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  enterprise: { color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  unlimited:  { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
}

const PLAN_PRICES: Record<string, number> = { starter: 97, pro: 197, enterprise: 397, unlimited: 697 }

/* ───────── Admin API helper ───────── */
function adminApi() {
  const secret = typeof window !== 'undefined' ? sessionStorage.getItem('adminSecret') || '' : ''
  return {
    get: (url: string) => tenantApi.get(url, { headers: { 'x-admin-secret': secret } }),
    patch: (url: string, data?: any) => tenantApi.patch(url, data, { headers: { 'x-admin-secret': secret } }),
    post: (url: string, data?: any) => tenantApi.post(url, data, { headers: { 'x-admin-secret': secret } }),
  }
}

/* ───────── Shared styles ───────── */
const GREEN = '#22c55e'
const GREEN_HOVER = '#16a34a'
const GREEN_LIGHT = '#f0fdf4'
const GREEN_BORDER = '#bbf7d0'

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '13.5px', outline: 'none',
  color: 'var(--text)', fontFamily: 'inherit', transition: 'all 0.15s',
}

const sectionTitle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px',
}

/* ───────── Skeleton ───────── */
function Skeleton({ width, height = 20 }: { width: string | number; height?: number }) {
  return (
    <div style={{
      width, height, borderRadius: '6px',
      background: 'linear-gradient(90deg, var(--border) 25%, var(--bg-card) 50%, var(--border) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease-in-out infinite',
    }} />
  )
}

/* ───────── Usage bar ───────── */
function UsageBar({ label, value, max, color = GREEN }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const overLimit = value > max && max > 0
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: overLimit ? '#ef4444' : 'var(--text)' }}>
          {value.toLocaleString()} / {max > 0 ? max.toLocaleString() : 'ilimitado'}
        </span>
      </div>
      <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: '3px',
          background: overLimit ? '#ef4444' : color, transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function AdminPage() {
  const queryClient = useQueryClient()

  /* Auth state */
  const [secret, setSecret] = useState('')
  const [secretInput, setSecretInput] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  /* UI state */
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterPlan, setFilterPlan] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sortBy, setSortBy] = useState('created_at')
  const [notes, setNotes] = useState<Record<string, string>>({})

  /* Impersonation detection */
  const [isImpersonating, setIsImpersonating] = useState(false)
  const [impersonatingName, setImpersonatingName] = useState('')

  useEffect(() => {
    const stored = sessionStorage.getItem('adminSecret')
    if (stored) { setSecret(stored); setIsAuthenticated(true) }
    const orig = sessionStorage.getItem('originalTokens')
    if (orig) {
      setIsImpersonating(true)
      const name = sessionStorage.getItem('impersonatingTenantName') || 'tenant'
      setImpersonatingName(name)
    }
  }, [])

  /* ───── Queries ───── */
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

  /* ───── Mutations ───── */
  const blockMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await adminApi().patch(`/admin/tenants/${id}/block`, { reason })
    },
    onSuccess: () => { toast.success('Tenant bloqueado'); queryClient.invalidateQueries({ queryKey: ['admin-tenants'] }); queryClient.invalidateQueries({ queryKey: ['admin-stats'] }) },
    onError: () => toast.error('Erro ao bloquear'),
  })

  const unblockMutation = useMutation({
    mutationFn: async (id: string) => { await adminApi().patch(`/admin/tenants/${id}/unblock`) },
    onSuccess: () => { toast.success('Tenant desbloqueado'); queryClient.invalidateQueries({ queryKey: ['admin-tenants'] }); queryClient.invalidateQueries({ queryKey: ['admin-stats'] }) },
    onError: () => toast.error('Erro ao desbloquear'),
  })

  const planMutation = useMutation({
    mutationFn: async ({ id, planSlug }: { id: string; planSlug: string }) => {
      await adminApi().patch(`/admin/tenants/${id}/plan`, { planSlug })
    },
    onSuccess: () => { toast.success('Plano atualizado'); queryClient.invalidateQueries({ queryKey: ['admin-tenants'] }); queryClient.invalidateQueries({ queryKey: ['admin-stats'] }) },
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

  /* ───── Filtering + Sorting ───── */
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
      if (sortBy === 'msgs') return (b.messages_sent_this_period || 0) - (a.messages_sent_this_period || 0)
      if (sortBy === 'contatos') return (b.contactCount || 0) - (a.contactCount || 0)
      return 0
    })

    return list
  }, [tenants, search, filterPlan, filterStatus, sortBy])

  /* Revenue by plan */
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

  /* ───── Return from impersonation ───── */
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

  /* ───── Login ───── */
  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!secretInput.trim()) return
    sessionStorage.setItem('adminSecret', secretInput.trim())
    setSecret(secretInput.trim())
    setIsAuthenticated(true)
    toast.success('Conectado ao admin')
  }

  /* ═══════════════════════════════════════════════ RENDER ═══════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ─── Impersonation banner ─── */}
      {isImpersonating && (
        <div
          onClick={returnFromImpersonation}
          style={{
            background: '#dc2626', color: '#fff', padding: '10px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
          }}
        >
          <AlertTriangle size={15} />
          Voce esta logado como {impersonatingName}. Clique aqui pra voltar.
        </div>
      )}

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '28px 32px' }}>

        {/* ─── Login form ─── */}
        {!isAuthenticated && (
          <div style={{ maxWidth: '400px', margin: '80px auto', textAlign: 'center' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '14px', background: GREEN_LIGHT,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', border: `1px solid ${GREEN_BORDER}`,
            }}>
              <Shield size={26} color={GREEN} />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px' }}>AutoZap Admin</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 28px' }}>Insira o secret para acessar o painel</p>
            <form onSubmit={handleLogin}>
              <input
                type="password"
                placeholder="Admin secret..."
                value={secretInput}
                onChange={e => setSecretInput(e.target.value)}
                style={{ ...inp, marginBottom: '12px', textAlign: 'center' }}
              />
              <button
                type="submit"
                style={{
                  width: '100%', padding: '10px', background: GREEN, color: '#fff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Entrar
              </button>
            </form>
          </div>
        )}

        {isAuthenticated && (
          <>
            {/* ─── Header ─── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '42px', height: '42px', borderRadius: '11px',
                  background: GREEN_LIGHT, border: `1px solid ${GREEN_BORDER}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Shield size={20} color={GREEN} />
                </div>
                <div>
                  <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>AutoZap Admin</h1>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Painel de controle interno</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <a
                  href="/dashboard"
                  style={{
                    padding: '8px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px',
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  <ArrowLeft size={13} /> Voltar ao dashboard
                </a>
                <button
                  onClick={() => { refetch(); queryClient.invalidateQueries({ queryKey: ['admin-stats'] }) }}
                  style={{
                    padding: '8px 14px', background: GREEN, border: 'none',
                    borderRadius: '8px', color: '#fff', fontSize: '13px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600,
                  }}
                >
                  <RefreshCw size={13} /> Atualizar
                </button>
              </div>
            </div>

            {/* ─── Stats row ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              {[
                { label: 'Total de tenants', value: stats?.totalTenants, icon: Users, color: '#2563eb' },
                { label: 'Novos hoje', value: stats?.newToday, icon: TrendingUp, color: GREEN },
                { label: 'Novos esta semana', value: stats?.newThisWeek, icon: TrendingUp, color: '#7c3aed' },
                { label: 'Pagantes ativos', value: stats?.activePaying, icon: DollarSign, color: '#059669' },
                { label: 'Pendentes', value: stats?.pendingCount, icon: Clock, color: '#d97706' },
                { label: 'Msgs enviadas hoje', value: stats?.messagesTODAY, icon: MessageSquare, color: '#0891b2' },
                { label: 'MRR', value: stats?.mrr != null ? `R$ ${stats.mrr.toLocaleString('pt-BR')}` : undefined, icon: DollarSign, color: GREEN },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '10px', padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Icon size={14} color={color} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
                  </div>
                  {statsLoading ? <Skeleton width="50%" height={24} /> : (
                    <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)' }}>{value ?? '—'}</div>
                  )}
                </div>
              ))}
            </div>

            {/* ─── Revenue by plan breakdown ─── */}
            {Object.keys(revenueByPlan).length > 0 && (
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '16px', marginBottom: '20px',
              }}>
                <div style={sectionTitle}>Receita por plano</div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {Object.entries(revenueByPlan).map(([plan, info]) => {
                    const pc = PLAN_COLORS[plan] || PLAN_COLORS.pending
                    return (
                      <div key={plan} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 14px', borderRadius: '8px', background: pc.bg,
                        border: `1px solid ${pc.border}`,
                      }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: pc.color, textTransform: 'capitalize' }}>
                          {plan}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {info.count} tenants
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: pc.color }}>
                          R$ {info.revenue.toLocaleString('pt-BR')}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ─── Filters ─── */}
            <div style={{
              display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap',
              alignItems: 'center',
            }}>
              <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  placeholder="Buscar por nome ou email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ ...inp, paddingLeft: '34px' }}
                />
              </div>
              <select
                value={filterPlan}
                onChange={e => setFilterPlan(e.target.value)}
                style={{ ...inp, width: 'auto', minWidth: '140px' }}
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
                style={{ ...inp, width: 'auto', minWidth: '130px' }}
              >
                <option value="all">Todos status</option>
                <option value="ativo">Ativo</option>
                <option value="bloqueado">Bloqueado</option>
                <option value="pendente">Pendente</option>
              </select>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                style={{ ...inp, width: 'auto', minWidth: '140px' }}
              >
                <option value="created_at">Ordenar: Data</option>
                <option value="msgs">Ordenar: Msgs</option>
                <option value="contatos">Ordenar: Contatos</option>
              </select>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* ─── Tenants table ─── */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '12px', overflow: 'hidden',
            }}>
              {/* Header row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.5fr 90px 70px 70px 70px 80px 70px 80px 150px',
                gap: '6px', padding: '11px 16px', borderBottom: '1px solid var(--border)',
                background: GREEN_LIGHT,
              }}>
                {['Empresa', 'Owner', 'Plano', 'Canais', 'Membros', 'Contatos', 'Msgs/mes', 'Flows', 'Status', 'Acoes'].map(h => (
                  <span key={h} style={{
                    fontSize: '10px', fontWeight: 700, color: GREEN_HOVER,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>{h}</span>
                ))}
              </div>

              {/* Loading */}
              {tenantsLoading ? (
                <div style={{ padding: '20px 16px' }}>
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1.5fr 90px 70px 70px 70px 80px 70px 80px 150px',
                      gap: '6px', padding: '12px 0', borderBottom: '1px solid var(--border)',
                    }}>
                      <Skeleton width="70%" />
                      <Skeleton width="80%" />
                      <Skeleton width="50px" />
                      <Skeleton width="30px" />
                      <Skeleton width="30px" />
                      <Skeleton width="40px" />
                      <Skeleton width="40px" />
                      <Skeleton width="30px" />
                      <Skeleton width="50px" />
                      <Skeleton width="100px" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Nenhum tenant encontrado
                </div>
              ) : filtered.map((t: any) => {
                const planStyle = PLAN_COLORS[t.plan_slug] || PLAN_COLORS.pending
                const isSelected = selectedTenantId === t.id

                return (
                  <div key={t.id}>
                    {/* Row */}
                    <div
                      onClick={() => setSelectedTenantId(isSelected ? null : t.id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1.5fr 90px 70px 70px 70px 80px 70px 80px 150px',
                        gap: '6px', padding: '12px 16px',
                        borderBottom: '1px solid var(--border)', cursor: 'pointer',
                        background: isSelected ? GREEN_LIGHT : t.is_blocked ? '#fef2f2' : 'transparent',
                        alignItems: 'center',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { if (!isSelected && !t.is_blocked) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg)' }}
                      onMouseLeave={e => { if (!isSelected && !t.is_blocked) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                    >
                      {/* Empresa */}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: t.is_blocked ? '#dc2626' : 'var(--text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {t.is_blocked && <Ban size={11} color="#dc2626" />}
                          {t.name}
                          {isSelected ? <ChevronUp size={12} style={{ marginLeft: '4px', color: 'var(--text-muted)' }} /> : <ChevronDown size={12} style={{ marginLeft: '4px', color: 'var(--text-muted)' }} />}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '—'}
                        </div>
                      </div>

                      {/* Owner */}
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.owner?.email || '—'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {t.owner?.last_login_at ? `Login: ${new Date(t.owner.last_login_at).toLocaleDateString('pt-BR')}` : 'Nunca logou'}
                        </div>
                      </div>

                      {/* Plan badge */}
                      <span style={{
                        fontSize: '11px', fontWeight: 700, color: planStyle.color,
                        background: planStyle.bg, border: `1px solid ${planStyle.border}`,
                        padding: '3px 10px', borderRadius: '99px', display: 'inline-block',
                        textTransform: 'capitalize', textAlign: 'center',
                      }}>
                        {t.plan_slug}
                      </span>

                      {/* Channels */}
                      <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{t.channelCount ?? 0}</span>

                      {/* Members (from owner info, showing 1 if owner exists) */}
                      <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{t.memberCount ?? (t.owner ? 1 : 0)}</span>

                      {/* Contacts */}
                      <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{(t.contactCount ?? 0).toLocaleString()}</span>

                      {/* Messages */}
                      <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{(t.messages_sent_this_period ?? 0).toLocaleString()}</span>

                      {/* Flows */}
                      <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{t.activeFlowCount ?? '—'}</span>

                      {/* Status */}
                      <span style={{
                        fontSize: '11px', fontWeight: 600,
                        color: t.is_blocked ? '#dc2626' : t.plan_slug === 'pending' ? '#d97706' : GREEN,
                        background: t.is_blocked ? '#fef2f2' : t.plan_slug === 'pending' ? '#fffbeb' : GREEN_LIGHT,
                        border: `1px solid ${t.is_blocked ? '#fecaca' : t.plan_slug === 'pending' ? '#fde68a' : GREEN_BORDER}`,
                        padding: '3px 10px', borderRadius: '99px', display: 'inline-block', textAlign: 'center',
                      }}>
                        {t.is_blocked ? 'Bloqueado' : t.plan_slug === 'pending' ? 'Pendente' : 'Ativo'}
                      </span>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '5px' }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => impersonateMutation.mutate({ id: t.id, name: t.name })}
                          disabled={impersonateMutation.isPending}
                          style={{
                            padding: '5px 10px', background: GREEN_LIGHT,
                            border: `1px solid ${GREEN_BORDER}`, borderRadius: '6px',
                            color: GREEN_HOVER, fontSize: '11px', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                          }}
                        >
                          <LogIn size={11} /> Entrar
                        </button>
                        {t.is_blocked ? (
                          <button
                            onClick={() => unblockMutation.mutate(t.id)}
                            disabled={unblockMutation.isPending}
                            style={{
                              padding: '5px 10px', background: GREEN_LIGHT,
                              border: `1px solid ${GREEN_BORDER}`, borderRadius: '6px',
                              color: GREEN, fontSize: '11px', fontWeight: 600,
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                            }}
                          >
                            <Play size={11} /> Desbloquear
                          </button>
                        ) : (
                          <button
                            onClick={() => { if (confirm(`Bloquear ${t.name}?`)) blockMutation.mutate({ id: t.id, reason: 'Bloqueado pelo admin' }) }}
                            disabled={blockMutation.isPending}
                            style={{
                              padding: '5px 10px', background: '#fef2f2',
                              border: '1px solid #fecaca', borderRadius: '6px',
                              color: '#dc2626', fontSize: '11px', fontWeight: 600,
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                            }}
                          >
                            <Ban size={11} /> Bloquear
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ─── Expanded panel ─── */}
                    {isSelected && (
                      <div style={{
                        padding: '20px 24px', background: 'var(--bg)',
                        borderBottom: `2px solid ${GREEN_BORDER}`,
                      }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>

                          {/* Column 1: Details */}
                          <div>
                            <div style={sectionTitle}>Detalhes</div>
                            <div style={{
                              background: 'var(--bg-card)', border: '1px solid var(--border)',
                              borderRadius: '10px', padding: '14px',
                            }}>
                              {[
                                { label: 'ID', value: t.id, mono: true },
                                { label: 'Slug', value: t.slug },
                                { label: 'Subscription', value: t.subscription?.status || 'Nenhuma' },
                                { label: 'MRR', value: `R$ ${(t.mrr ?? 0).toLocaleString('pt-BR')}` },
                                { label: 'Plano', value: t.plan_slug },
                              ].map(({ label, value, mono }) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
                                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontFamily: mono ? 'monospace' : 'inherit', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                                </div>
                              ))}
                              {t.is_blocked && (
                                <div style={{ marginTop: '10px', padding: '8px 12px', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626' }}>Motivo do bloqueio:</span>
                                  <p style={{ fontSize: '12px', color: '#dc2626', margin: '4px 0 0' }}>{t.blocked_reason || 'Nao informado'}</p>
                                </div>
                              )}
                            </div>

                            {/* Change plan */}
                            <div style={{ marginTop: '14px' }}>
                              <div style={sectionTitle}>Mudar plano</div>
                              <select
                                defaultValue={t.plan_slug}
                                onChange={e => planMutation.mutate({ id: t.id, planSlug: e.target.value })}
                                style={{ ...inp, width: '100%' }}
                              >
                                <option value="pending">Pendente</option>
                                <option value="starter">Starter (R$ 97)</option>
                                <option value="pro">Pro (R$ 197)</option>
                                <option value="enterprise">Enterprise (R$ 397)</option>
                                <option value="unlimited">Unlimited (R$ 697)</option>
                              </select>
                            </div>
                          </div>

                          {/* Column 2: Usage */}
                          <div>
                            <div style={sectionTitle}>Uso este mes</div>
                            <div style={{
                              background: 'var(--bg-card)', border: '1px solid var(--border)',
                              borderRadius: '10px', padding: '14px',
                            }}>
                              <UsageBar
                                label="Mensagens"
                                value={t.messages_sent_this_period ?? 0}
                                max={t.plan_slug === 'starter' ? 5000 : t.plan_slug === 'pro' ? 20000 : t.plan_slug === 'enterprise' ? 50000 : t.plan_slug === 'unlimited' ? 999999 : 100}
                              />
                              <UsageBar
                                label="Contatos"
                                value={t.contactCount ?? 0}
                                max={t.plan_slug === 'starter' ? 1000 : t.plan_slug === 'pro' ? 5000 : t.plan_slug === 'enterprise' ? 20000 : t.plan_slug === 'unlimited' ? 999999 : 50}
                                color="#2563eb"
                              />
                              <UsageBar
                                label="Canais"
                                value={t.channelCount ?? 0}
                                max={t.plan_slug === 'starter' ? 5 : t.plan_slug === 'pro' ? 10 : t.plan_slug === 'enterprise' ? 30 : t.plan_slug === 'unlimited' ? 999 : 0}
                                color="#7c3aed"
                              />
                              <UsageBar
                                label="Campanhas"
                                value={t.campaignCount ?? 0}
                                max={t.plan_slug === 'starter' ? 10 : t.plan_slug === 'pro' ? 50 : t.plan_slug === 'enterprise' ? 200 : t.plan_slug === 'unlimited' ? 999 : 0}
                                color="#0891b2"
                              />
                              <UsageBar
                                label="Respostas IA"
                                value={t.aiResponseCount ?? 0}
                                max={t.plan_slug === 'starter' ? 500 : t.plan_slug === 'pro' ? 2000 : t.plan_slug === 'enterprise' ? 10000 : t.plan_slug === 'unlimited' ? 999999 : 0}
                                color="#d97706"
                              />
                            </div>
                          </div>

                          {/* Column 3: Members, Flows, Campaign, Notes */}
                          <div>
                            {/* Members */}
                            <div style={sectionTitle}>Membros</div>
                            <div style={{
                              background: 'var(--bg-card)', border: '1px solid var(--border)',
                              borderRadius: '10px', padding: '14px', marginBottom: '14px',
                            }}>
                              {t.members && t.members.length > 0 ? t.members.map((m: any) => (
                                <div key={m.id || m.email} style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  padding: '6px 0', borderBottom: '1px solid var(--border)',
                                }}>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{m.name || m.email}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{m.email}</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <span style={{
                                      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                                      color: m.role === 'owner' ? GREEN : '#2563eb',
                                      background: m.role === 'owner' ? GREEN_LIGHT : '#eff6ff',
                                      padding: '2px 6px', borderRadius: '4px',
                                    }}>{m.role}</span>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                      {m.last_login_at ? new Date(m.last_login_at).toLocaleDateString('pt-BR') : 'Nunca'}
                                    </div>
                                  </div>
                                </div>
                              )) : t.owner ? (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{t.owner.name || t.owner.email}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.owner.email}</div>
                                  </div>
                                  <span style={{
                                    fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                                    color: GREEN, background: GREEN_LIGHT,
                                    padding: '2px 6px', borderRadius: '4px',
                                  }}>owner</span>
                                </div>
                              ) : (
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Nenhum membro</p>
                              )}
                            </div>

                            {/* Active Flows */}
                            <div style={sectionTitle}>Flows ativos</div>
                            <div style={{
                              background: 'var(--bg-card)', border: '1px solid var(--border)',
                              borderRadius: '10px', padding: '14px', marginBottom: '14px',
                            }}>
                              {t.activeFlows && t.activeFlows.length > 0 ? t.activeFlows.map((f: any) => (
                                <div key={f.id || f.name} style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  padding: '5px 0', borderBottom: '1px solid var(--border)',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Workflow size={12} color={GREEN} />
                                    <span style={{ fontSize: '12px', color: 'var(--text)' }}>{f.name}</span>
                                  </div>
                                  <span style={{
                                    fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                                    color: f.status === 'active' ? GREEN : '#d97706',
                                    background: f.status === 'active' ? GREEN_LIGHT : '#fffbeb',
                                    padding: '2px 6px', borderRadius: '4px',
                                  }}>{f.status}</span>
                                </div>
                              )) : (
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Sem dados de flows</p>
                              )}
                            </div>

                            {/* Last campaign */}
                            {t.lastCampaign && (
                              <>
                                <div style={sectionTitle}>Ultima campanha</div>
                                <div style={{
                                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                                  borderRadius: '10px', padding: '14px', marginBottom: '14px',
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--text)' }}>{t.lastCampaign.name || 'Campanha'}</span>
                                    <span style={{
                                      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                                      color: t.lastCampaign.status === 'completed' ? GREEN : '#d97706',
                                      background: t.lastCampaign.status === 'completed' ? GREEN_LIGHT : '#fffbeb',
                                      padding: '2px 6px', borderRadius: '4px',
                                    }}>{t.lastCampaign.status}</span>
                                  </div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    {t.lastCampaign.created_at ? new Date(t.lastCampaign.created_at).toLocaleDateString('pt-BR') : '—'}
                                  </div>
                                </div>
                              </>
                            )}

                            {/* Admin notes */}
                            <div style={sectionTitle}>Notas do admin</div>
                            <textarea
                              value={notes[t.id] ?? (t.admin_notes || '')}
                              onChange={e => setNotes(prev => ({ ...prev, [t.id]: e.target.value }))}
                              placeholder="Anotacoes internas sobre este tenant..."
                              style={{
                                ...inp,
                                minHeight: '70px', resize: 'vertical',
                                fontSize: '12px', lineHeight: '1.5',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
