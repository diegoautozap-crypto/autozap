'use client'
import { useAuthStore } from '@/store/auth.store'
import { useQuery } from '@tanstack/react-query'
import { tenantApi } from '@/lib/api'

const PLAN_NAMES: Record<string, string> = {
  starter:    'Starter',
  pro:        'Pro',
  enterprise: 'Enterprise',
  unlimited:  'Unlimited',
}

const PLAN_PRICES: Record<string, string> = {
  starter:    'R$ 97/mês',
  pro:        'R$ 197/mês',
  enterprise: 'R$ 397/mês',
  unlimited:  'R$ 797/mês',
}

const PLAN_MSGS: Record<string, string> = {
  starter:    '10.000 msgs',
  pro:        '50.000 msgs',
  enterprise: '100.000 msgs',
  unlimited:  'Ilimitado',
}

export default function SettingsPage() {
  const { user } = useAuthStore()

  const { data: usage } = useQuery({
    queryKey: ['usage'],
    queryFn: async () => {
      const { data } = await tenantApi.get('/tenant/usage')
      return data.data
    },
    refetchInterval: 30000,
  })

  const { data: tenant } = useQuery({
    queryKey: ['tenant'],
    queryFn: async () => {
      const { data } = await tenantApi.get('/tenant')
      return data.data
    },
  })

  const sent = usage?.sent ?? 0
  const limit = usage?.limit ?? 0
  const pct = usage?.percentUsed ?? 0
  const planSlug = tenant?.planSlug ?? 'starter'
  const planName = PLAN_NAMES[planSlug] ?? planSlug
  const isWarning = pct > 80

  const card: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '24px',
  }

  const label: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '12px',
    display: 'block',
  }

  return (
    <div style={{ padding: '32px', maxWidth: '700px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em', marginBottom: '4px' }}>
        Plano e Configurações
      </h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '28px' }}>
        Gerencie sua conta e uso do plano
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Perfil */}
        <div style={card}>
          <span style={label}>Perfil</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>Email</span>
              <span style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>{user?.email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>Plano atual</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', padding: '2px 10px', borderRadius: '99px' }}>
                {planName}
              </span>
            </div>
          </div>
        </div>

        {/* Uso */}
        <div style={card}>
          <span style={label}>Uso do mês</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>Mensagens enviadas</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
              {sent.toLocaleString()} / {limit === null ? '∞' : limit.toLocaleString()}
            </span>
          </div>
          <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(pct, 100)}%`,
              height: '100%',
              background: isWarning ? '#f97316' : '#16a34a',
              borderRadius: '99px',
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '12px', color: isWarning ? '#f97316' : '#9ca3af', fontWeight: isWarning ? 600 : 400 }}>
              {pct}% utilizado
            </span>
            {limit !== null && (
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                {Math.max(0, limit - sent).toLocaleString()} restantes
              </span>
            )}
          </div>
        </div>

        {/* Planos */}
        <div style={card}>
          <span style={label}>Planos disponíveis</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {(['starter', 'pro', 'enterprise', 'unlimited'] as const).map(slug => {
              const isActive = planSlug === slug
              return (
                <div
                  key={slug}
                  style={{
                    border: isActive ? '2px solid #16a34a' : '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '16px',
                    background: isActive ? '#f0fdf4' : '#fff',
                    position: 'relative',
                  }}
                >
                  {isActive && (
                    <span style={{
                      position: 'absolute', top: '10px', right: '10px',
                      fontSize: '10px', fontWeight: 700,
                      color: '#16a34a', background: '#dcfce7',
                      padding: '1px 8px', borderRadius: '99px',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      Atual
                    </span>
                  )}
                  <p style={{ fontWeight: 600, fontSize: '14px', color: '#111827', marginBottom: '3px' }}>
                    {PLAN_NAMES[slug]}
                  </p>
                  <p style={{ color: '#6b7280', fontSize: '12px', marginBottom: '8px' }}>
                    {PLAN_MSGS[slug]}
                  </p>
                  <p style={{ fontWeight: 700, fontSize: '15px', color: '#111827' }}>
                    {PLAN_PRICES[slug]}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
