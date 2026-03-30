'use client'
import { useState } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { useQuery } from '@tanstack/react-query'
import { tenantApi } from '@/lib/api'
import { AlertTriangle, Zap, Check, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

const PLAN_NAMES: Record<string, string> = {
  trial:      'Trial',
  starter:    'Starter',
  pro:        'Pro',
  enterprise: 'Enterprise',
  unlimited:  'Unlimited',
}

const PLAN_MSGS: Record<string, string> = {
  starter:    '10.000 msgs',
  pro:        '50.000 msgs',
  enterprise: '100.000 msgs',
  unlimited:  'Ilimitado',
}

const PLAN_FEATURES: Record<string, string[]> = {
  starter:    ['10.000 mensagens/mês', 'Inbox em tempo real', 'Campanhas em massa', 'CRM de contatos'],
  pro:        ['50.000 mensagens/mês', 'Tudo do Starter', 'Múltiplos usuários', 'Suporte prioritário'],
  enterprise: ['100.000 mensagens/mês', 'Tudo do Pro', 'API dedicada', 'SLA garantido'],
  unlimited:  ['Mensagens ilimitadas', 'Tudo do Enterprise', 'Onboarding dedicado', 'Suporte 24/7'],
}

function formatCpfCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export default function SettingsPage() {
  const { user } = useAuthStore()
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [showCpfModal, setShowCpfModal] = useState<string | null>(null)
  const [cpfCnpj, setCpfCnpj] = useState('')

  const { data: usage } = useQuery({
    queryKey: ['usage'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant/usage'); return data.data },
    refetchInterval: 30000,
  })
  const { data: tenant } = useQuery({
    queryKey: ['tenant'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant'); return data.data },
  })
  const { data: subscription } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant/subscription'); return data.data },
  })
  const { data: plans } = useQuery({
    queryKey: ['billing-plans'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant/billing/plans'); return data.data },
  })

  const sent = usage?.sent ?? 0
  const limit = usage?.limit ?? 0
  const pct = usage?.percentUsed ?? 0
  const planSlug = tenant?.planSlug ?? 'trial'
  const planName = PLAN_NAMES[planSlug] ?? planSlug
  const isWarning = pct > 80
  const isTrial = planSlug === 'trial'
  const trialEndsAt = subscription?.trial_ends_at || subscription?.current_period_end
  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null
  const trialExpired = (isTrial && pct >= 100) || (trialDaysLeft !== null && trialDaysLeft === 0)

  const handleSubscribe = async (slug: string) => {
    const digits = cpfCnpj.replace(/\D/g, '')
    if (digits.length !== 11 && digits.length !== 14) { toast.error('CPF ou CNPJ inválido'); return }
    setSubscribing(slug)
    try {
      const { data } = await tenantApi.post('/tenant/billing/subscribe', { planSlug: slug, cpfCnpj: digits })
      const paymentUrl = data.data?.paymentUrl
      if (paymentUrl) {
        window.open(paymentUrl, '_blank')
        toast.success('Redirecionando para o pagamento...')
        setShowCpfModal(null); setCpfCnpj('')
      } else {
        toast.error('Erro ao gerar link de pagamento')
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao criar assinatura')
    } finally { setSubscribing(null) }
  }

  const getPlanPrice = (slug: string) => {
    if (!plans) {
      const prices: Record<string, string> = { starter: 'R$ 97', pro: 'R$ 197', enterprise: 'R$ 397', unlimited: 'R$ 697' }
      return prices[slug] || ''
    }
    const plan = plans.find((p: any) => p.slug === slug)
    return plan ? `R$ ${Number(plan.price_monthly).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : ''
  }

  const barColor = trialExpired ? '#ef4444' : isWarning ? '#f97316' : '#22c55e'

  return (
    <div style={{ padding: '32px', maxWidth: '700px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#18181b', letterSpacing: '-0.02em', marginBottom: '4px' }}>Plano e Configurações</h1>
      <p style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '28px' }}>Gerencie sua conta e uso do plano</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Banner trial expirado */}
        {isTrial && trialExpired && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertTriangle size={18} color="#ef4444" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 700, color: '#dc2626', fontSize: '14px', marginBottom: '4px' }}>Seu trial expirou</p>
              <p style={{ color: '#71717a', fontSize: '13px', marginBottom: '14px' }}>Escolha um plano abaixo para continuar usando o AutoZap.</p>
              <a href="#planos" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#22c55e', color: '#fff', borderRadius: '7px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                <Zap size={13} /> Ver planos
              </a>
            </div>
          </div>
        )}

        {/* Banner trial ativo */}
        {isTrial && !trialExpired && (
          <div style={{ background: trialDaysLeft !== null && trialDaysLeft <= 2 ? '#fffbeb' : '#f0fdf4', border: `1px solid ${trialDaysLeft !== null && trialDaysLeft <= 2 ? '#fde68a' : '#bbf7d0'}`, borderRadius: '12px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 600, color: '#18181b', fontSize: '14px', marginBottom: '2px' }}>
                {trialDaysLeft !== null && trialDaysLeft <= 2 ? `⚠️ Trial expira em ${trialDaysLeft} dia${trialDaysLeft !== 1 ? 's' : ''}!` : `🎉 Trial ativo — ${usage?.remaining ?? 0} mensagens restantes`}
              </p>
              <p style={{ color: '#71717a', fontSize: '13px' }}>Escolha um plano para não perder o acesso</p>
            </div>
            <a href="#planos" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#22c55e', color: '#fff', borderRadius: '7px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
              <Zap size={13} /> Fazer upgrade
            </a>
          </div>
        )}

        {/* Banner plano ativo */}
        {!isTrial && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 600, color: '#15803d', fontSize: '14px', marginBottom: '2px' }}>✅ Plano {planName} ativo</p>
              <p style={{ color: '#71717a', fontSize: '13px' }}>{subscription?.status === 'active' ? 'Assinatura recorrente ativa' : 'Aguardando confirmação de pagamento'}</p>
            </div>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '4px 14px', borderRadius: '99px' }}>{getPlanPrice(planSlug)}/mês</span>
          </div>
        )}

        {/* Perfil */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '14px', display: 'block' }}>Perfil</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#71717a' }}>Email</span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#18181b' }}>{user?.email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#71717a' }}>Plano atual</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: isTrial ? '#d97706' : '#16a34a', background: isTrial ? '#fffbeb' : '#f0fdf4', border: `1px solid ${isTrial ? '#fde68a' : '#bbf7d0'}`, padding: '2px 10px', borderRadius: '99px' }}>
                {isTrial ? '🎯 Trial (7 dias)' : planName}
              </span>
            </div>
          </div>
        </div>

        {/* Uso do mês */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '14px', display: 'block' }}>Uso do mês</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: '#71717a' }}>Mensagens enviadas</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#18181b' }}>{sent.toLocaleString()} / {limit === null ? '∞' : limit.toLocaleString()}</span>
          </div>
          <div style={{ height: '6px', background: '#f4f4f5', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, borderRadius: '99px', transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '12px', color: trialExpired ? '#ef4444' : isWarning ? '#f97316' : '#a1a1aa', fontWeight: isWarning ? 600 : 400 }}>{pct}% utilizado</span>
            {limit !== null && <span style={{ fontSize: '12px', color: '#a1a1aa' }}>{Math.max(0, limit - sent).toLocaleString()} restantes</span>}
          </div>
        </div>

        {/* Planos */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }} id="planos">
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '14px', display: 'block' }}>
            {isTrial ? '🚀 Escolha seu plano' : 'Planos disponíveis'}
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {(['starter', 'pro', 'enterprise', 'unlimited'] as const).map((slug) => {
              const isActive = planSlug === slug
              const isPopular = slug === 'pro'
              return (
                <div key={slug}
                  style={{ border: isActive ? '2px solid #22c55e' : isPopular ? '2px solid #7c3aed' : '1px solid #e4e4e7', borderRadius: '12px', padding: '18px', background: isActive ? '#f0fdf4' : '#fff', position: 'relative', transition: 'box-shadow 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,.07)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'}>
                  {isActive && <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '10px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '1px 8px', borderRadius: '99px' }}>Atual</span>}
                  {isPopular && !isActive && <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '10px', fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '1px 8px', borderRadius: '99px' }}>Popular</span>}
                  <p style={{ fontWeight: 700, fontSize: '15px', color: '#18181b', marginBottom: '2px', letterSpacing: '-0.01em' }}>{PLAN_NAMES[slug]}</p>
                  <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '10px' }}>{PLAN_MSGS[slug]}</p>
                  <p style={{ fontWeight: 800, fontSize: '18px', color: '#18181b', marginBottom: '12px', letterSpacing: '-0.02em' }}>
                    {getPlanPrice(slug)}<span style={{ fontSize: '12px', fontWeight: 400, color: '#a1a1aa' }}>/mês</span>
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px' }}>
                    {PLAN_FEATURES[slug]?.map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Check size={11} color="#22c55e" />
                        <span style={{ fontSize: '12px', color: '#52525b' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  {!isActive && (
                    <button onClick={() => { setShowCpfModal(slug); setCpfCnpj('') }}
                      style={{ width: '100%', padding: '8px', background: isPopular ? '#7c3aed' : '#22c55e', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.1s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.opacity = '1'}>
                      Assinar {PLAN_NAMES[slug]}
                    </button>
                  )}
                  {isActive && !isTrial && <div style={{ textAlign: 'center', fontSize: '12px', color: '#16a34a', fontWeight: 600, padding: '6px 0' }}>✓ Plano ativo</div>}
                </div>
              )
            })}
          </div>
          <p style={{ textAlign: 'center', color: '#a1a1aa', fontSize: '12px', marginTop: '14px' }}>
            Pagamento seguro via PIX ou cartão de crédito • Cancele quando quiser
          </p>
        </div>
      </div>

      {/* Modal CPF/CNPJ */}
      {showCpfModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowCpfModal(null) }}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '380px', margin: '0 16px', border: '1px solid #e4e4e7', boxShadow: '0 24px 60px rgba(0,0,0,.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#18181b', margin: 0, letterSpacing: '-0.01em' }}>Assinar {PLAN_NAMES[showCpfModal]}</h3>
              <button onClick={() => setShowCpfModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '4px', display: 'flex' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: '#71717a', marginBottom: '16px' }}>Informe seu CPF ou CNPJ para criar a assinatura.</p>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>CPF ou CNPJ</label>
            <input
              type="text"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              value={cpfCnpj}
              onChange={e => setCpfCnpj(formatCpfCnpj(e.target.value))}
              maxLength={18}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', outline: 'none', color: '#18181b', boxSizing: 'border-box' as const, marginBottom: '16px', background: '#fafafa', transition: 'border-color 0.15s' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = '#fff' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e4e4e7'; e.currentTarget.style.background = '#fafafa' }}
            />
            <button onClick={() => handleSubscribe(showCpfModal)} disabled={!!subscribing}
              style={{ width: '100%', padding: '11px', background: subscribing ? '#e4e4e7' : '#22c55e', color: subscribing ? '#a1a1aa' : '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: subscribing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.1s' }}
              onMouseEnter={e => { if (!subscribing) (e.currentTarget as HTMLButtonElement).style.background = '#16a34a' }}
              onMouseLeave={e => { if (!subscribing) (e.currentTarget as HTMLButtonElement).style.background = '#22c55e' }}>
              {subscribing ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Gerando link...</> : 'Gerar link de pagamento'}
            </button>
            <p style={{ textAlign: 'center', fontSize: '12px', color: '#a1a1aa', marginTop: '12px' }}>
              Você será redirecionado para pagar via PIX ou cartão
            </p>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
