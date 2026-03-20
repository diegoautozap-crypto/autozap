'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tenantApi } from '@/lib/api'
import { toast } from 'sonner'
import { Users, DollarSign, TrendingUp, MessageSquare, Shield, Ban, Play, RefreshCw, ChevronDown, Loader2, LogIn, Clock } from 'lucide-react'

const PLAN_COLORS: Record<string, { color: string; bg: string }> = {
  trial:      { color: '#d97706', bg: '#fffbeb' },
  starter:    { color: '#2563eb', bg: '#eff6ff' },
  pro:        { color: '#7c3aed', bg: '#f5f3ff' },
  enterprise: { color: '#059669', bg: '#ecfdf5' },
  unlimited:  { color: '#dc2626', bg: '#fef2f2' },
}

function adminApi() {
  const secret = typeof window !== 'undefined' ? sessionStorage.getItem('adminSecret') || '' : ''
  return {
    get: (url: string) => tenantApi.get(url, { headers: { 'x-admin-secret': secret } }),
    patch: (url: string, data?: any) => tenantApi.patch(url, data, { headers: { 'x-admin-secret': secret } }),
    post: (url: string, data?: any) => tenantApi.post(url, data, { headers: { 'x-admin-secret': secret } }),
  }
}

export default function AdminPage() {
  const queryClient = useQueryClient()
  const [selectedTenant, setSelectedTenant] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [filterPlan, setFilterPlan] = useState('all')

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => { const { data } = await adminApi().get('/admin/stats'); return data.data },
    refetchInterval: 30000,
  })

  const { data: tenants, isLoading: tenantsLoading, refetch } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: async () => { const { data } = await adminApi().get('/admin/tenants'); return data.data },
    refetchInterval: 60000,
  })

  const blockMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await adminApi().patch(`/admin/tenants/${id}/block`, { reason })
    },
    onSuccess: () => { toast.success('Tenant bloqueado'); queryClient.invalidateQueries({ queryKey: ['admin-tenants'] }) },
    onError: () => toast.error('Erro ao bloquear'),
  })

  const unblockMutation = useMutation({
    mutationFn: async (id: string) => { await adminApi().patch(`/admin/tenants/${id}/unblock`) },
    onSuccess: () => { toast.success('Tenant desbloqueado'); queryClient.invalidateQueries({ queryKey: ['admin-tenants'] }) },
    onError: () => toast.error('Erro ao desbloquear'),
  })

  const planMutation = useMutation({
    mutationFn: async ({ id, planSlug }: { id: string; planSlug: string }) => {
      await adminApi().patch(`/admin/tenants/${id}/plan`, { planSlug })
    },
    onSuccess: () => { toast.success('Plano atualizado'); queryClient.invalidateQueries({ queryKey: ['admin-tenants'] }) },
    onError: () => toast.error('Erro ao atualizar plano'),
  })

  const extendMutation = useMutation({
    mutationFn: async ({ id, days }: { id: string; days: number }) => {
      await adminApi().patch(`/admin/tenants/${id}/extend-trial`, { days })
    },
    onSuccess: () => { toast.success('Trial estendido'); queryClient.invalidateQueries({ queryKey: ['admin-tenants'] }) },
    onError: () => toast.error('Erro ao estender trial'),
  })

  const impersonateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await adminApi().post(`/admin/tenants/${id}/impersonate`)
      return data.data
    },
    onSuccess: (data) => {
      const original = { accessToken: localStorage.getItem('accessToken'), refreshToken: localStorage.getItem('refreshToken') }
      sessionStorage.setItem('originalTokens', JSON.stringify(original))
      localStorage.setItem('accessToken', data.accessToken)
      localStorage.removeItem('refreshToken')
      toast.success('Logado como cliente!')
      window.location.href = '/dashboard'
    },
    onError: () => toast.error('Erro ao impersonar'),
  })

  const filtered = (tenants || []).filter((t: any) => {
    const matchSearch = !search || t.name?.toLowerCase().includes(search.toLowerCase()) || t.owner?.email?.toLowerCase().includes(search.toLowerCase())
    const matchPlan = filterPlan === 'all' || t.plan_slug === filterPlan
    return matchSearch && matchPlan
  })

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', padding: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>AutoZap Admin</h1>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Painel de controle interno</p>
          </div>
        </div>
        <button onClick={() => refetch()} style={{ padding: '8px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Tenants', value: stats?.totalTenants ?? '—', icon: Users, color: '#2563eb' },
          { label: 'Novos hoje', value: stats?.newToday ?? '—', icon: TrendingUp, color: '#16a34a' },
          { label: 'Novos semana', value: stats?.newThisWeek ?? '—', icon: TrendingUp, color: '#7c3aed' },
          { label: 'Pagantes', value: stats?.activePaying ?? '—', icon: DollarSign, color: '#059669' },
          { label: 'Em trial', value: stats?.trialCount ?? '—', icon: Clock, color: '#d97706' },
          { label: 'Msgs hoje', value: stats?.messagesTODAY ?? '—', icon: MessageSquare, color: '#0891b2' },
          { label: 'MRR', value: stats?.mrr ? `R$ ${stats.mrr.toLocaleString()}` : '—', icon: DollarSign, color: '#16a34a' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Icon size={13} color={color} />
              <span style={{ fontSize: '11px', color: '#64748b' }}>{label}</span>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#f1f5f9' }}>{statsLoading ? '...' : value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <input
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9', fontSize: '13px', outline: 'none' }}
        />
        <select
          value={filterPlan}
          onChange={e => setFilterPlan(e.target.value)}
          style={{ padding: '8px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9', fontSize: '13px', outline: 'none' }}
        >
          <option value="all">Todos os planos</option>
          <option value="trial">Trial</option>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
          <option value="unlimited">Unlimited</option>
        </select>
      </div>

      {/* Tenants table */}
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 80px 80px 80px 160px', gap: '8px', padding: '12px 16px', borderBottom: '1px solid #334155', background: '#0f172a' }}>
          {['Empresa', 'Owner', 'Plano', 'Canais', 'Contatos', 'Msgs', 'Ações'].map(h => (
            <span key={h} style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>

        {tenantsLoading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: '#64748b' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>Nenhum tenant encontrado</div>
        ) : filtered.map((t: any) => {
          const planStyle = PLAN_COLORS[t.plan_slug] || PLAN_COLORS.trial
          const isSelected = selectedTenant?.id === t.id
          return (
            <div key={t.id}>
              <div
                onClick={() => setSelectedTenant(isSelected ? null : t)}
                style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 80px 80px 80px 160px', gap: '8px', padding: '12px 16px', borderBottom: '1px solid #1e293b', cursor: 'pointer', background: isSelected ? '#0f2040' : t.is_blocked ? '#1a0a0a' : 'transparent', alignItems: 'center' }}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: '13px', color: t.is_blocked ? '#ef4444' : '#f1f5f9' }}>
                    {t.is_blocked && '🔴 '}{t.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{t.created_at?.split('T')[0]}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{t.owner?.email || '—'}</div>
                  <div style={{ fontSize: '11px', color: '#475569' }}>
                    {t.owner?.last_login_at ? `Login: ${new Date(t.owner.last_login_at).toLocaleDateString('pt-BR')}` : 'Nunca logou'}
                  </div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: planStyle.color, background: planStyle.bg, padding: '2px 8px', borderRadius: '99px', display: 'inline-block' }}>
                  {t.plan_slug}
                </span>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>{t.channelCount}</span>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>{t.contactCount.toLocaleString()}</span>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>{t.messages_sent_this_period?.toLocaleString()}</span>
                <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => impersonateMutation.mutate(t.id)}
                    title="Logar como cliente"
                    style={{ padding: '4px 8px', background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: '5px', color: '#60a5fa', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    <LogIn size={10} /> Entrar
                  </button>
                  {t.is_blocked ? (
                    <button
                      onClick={() => unblockMutation.mutate(t.id)}
                      style={{ padding: '4px 8px', background: '#14532d', border: '1px solid #16a34a', borderRadius: '5px', color: '#4ade80', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                    >
                      <Play size={10} /> Desbloquear
                    </button>
                  ) : (
                    <button
                      onClick={() => { if (confirm(`Bloquear ${t.name}?`)) blockMutation.mutate({ id: t.id, reason: 'Bloqueado pelo admin' }) }}
                      style={{ padding: '4px 8px', background: '#450a0a', border: '1px solid #dc2626', borderRadius: '5px', color: '#f87171', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                    >
                      <Ban size={10} /> Bloquear
                    </button>
                  )}
                </div>
              </div>

              {/* Painel expandido */}
              {isSelected && (
                <div style={{ padding: '16px 20px', background: '#0f172a', borderBottom: '1px solid #334155', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase' }}>Detalhes</p>
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '3px 0' }}>ID: <span style={{ color: '#f1f5f9', fontFamily: 'monospace', fontSize: '11px' }}>{t.id}</span></p>
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '3px 0' }}>Slug: {t.slug}</p>
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '3px 0' }}>Subscription: {t.subscription?.status || 'none'}</p>
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '3px 0' }}>MRR: R$ {t.mrr}</p>
                    {t.lastCampaign && <p style={{ fontSize: '12px', color: '#94a3b8', margin: '3px 0' }}>Última campanha: {t.lastCampaign.created_at?.split('T')[0]} ({t.lastCampaign.status})</p>}
                    {t.is_blocked && <p style={{ fontSize: '12px', color: '#ef4444', margin: '3px 0' }}>Motivo: {t.blocked_reason}</p>}
                  </div>

                  {/* Mudar plano */}
                  <div style={{ minWidth: '160px' }}>
                    <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase' }}>Mudar plano</p>
                    <select
                      defaultValue={t.plan_slug}
                      onChange={e => planMutation.mutate({ id: t.id, planSlug: e.target.value })}
                      style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#f1f5f9', fontSize: '12px', outline: 'none', width: '100%' }}
                    >
                      <option value="trial">Trial</option>
                      <option value="starter">Starter</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                      <option value="unlimited">Unlimited</option>
                    </select>
                  </div>

                  {/* Estender trial */}
                  <div style={{ minWidth: '160px' }}>
                    <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase' }}>Estender trial</p>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[7, 14, 30].map(d => (
                        <button key={d} onClick={() => extendMutation.mutate({ id: t.id, days: d })}
                          style={{ padding: '5px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#94a3b8', fontSize: '12px', cursor: 'pointer' }}>
                          +{d}d
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}