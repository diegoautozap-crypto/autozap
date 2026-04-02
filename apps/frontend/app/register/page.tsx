'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import { Loader2, MessageSquareMore, ArrowRight, Check, Mail } from 'lucide-react'

const benefits = [
  'Inbox em tempo real',
  'Campanhas em massa',
  'CRM integrado',
  'Flows de automação',
]

const PLAN_NAMES: Record<string, string> = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise', unlimited: 'Unlimited' }
const PLAN_PRICES: Record<string, string> = { starter: 'R$149,99', pro: 'R$299,99', enterprise: 'R$599,99', unlimited: 'R$999,99' }

export default function RegisterPageWrapper() {
  return <Suspense><RegisterPage /></Suspense>
}

function RegisterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedPlan = searchParams.get('plan') || ''
  const { register, isLoading } = useAuthStore()
  const [form, setForm] = useState({ name: '', email: '', password: '', tenantName: '' })
  const [step, setStep] = useState<'form' | 'verify'>('form')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) {
      toast.error('Senha deve ter pelo menos 8 caracteres')
      return
    }
    try {
      await register(form.name, form.email, form.password, form.tenantName)
      setStep('verify')
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao criar conta')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: '#f9fafb', border: '1px solid #e5e7eb',
    borderRadius: '8px', color: '#111827', fontSize: '14px',
    outline: 'none', transition: 'border-color 0.15s',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', color: '#6b7280',
    fontSize: '12px', fontWeight: 500, marginBottom: '6px',
  }

  if (step === 'verify') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f8fa', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '40px', boxShadow: '0 4px 16px rgba(0,0,0,.06)', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', background: '#eff6ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Mail size={28} color="#2563eb" />
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', marginBottom: '10px' }}>Verifique seu email</h2>
            <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: 1.6, marginBottom: '8px' }}>
              Enviamos um link de confirmação para:
            </p>
            <p style={{ color: '#111827', fontWeight: 600, fontSize: '15px', marginBottom: '24px' }}>{form.email}</p>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 16px', marginBottom: '24px', textAlign: 'left' }}>
              <p style={{ fontSize: '13px', color: '#15803d', fontWeight: 500, marginBottom: '6px' }}>📋 O que fazer agora:</p>
              <ol style={{ fontSize: '13px', color: '#374151', paddingLeft: '18px', lineHeight: 1.8, margin: 0 }}>
                <li>Abra seu email</li>
                <li>Clique em <strong>Confirmar email</strong></li>
                <li>Faça login e comece a usar</li>
              </ol>
            </div>
            <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '20px' }}>
              Não recebeu? Verifique a caixa de spam ou{' '}
              <a href="/register" style={{ color: '#16a34a', textDecoration: 'none', fontWeight: 500 }}>tente novamente</a>
            </p>
            <a href={selectedPlan ? `/login?plan=${selectedPlan}` : '/login'} style={{ display: 'block', width: '100%', padding: '12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>
              Ir para o login
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#f6f8fa' }}>
      {/* Left — benefits */}
      <div style={{ display: 'none', width: '45%', background: '#16a34a', padding: '48px', flexDirection: 'column', justifyContent: 'center' }} className="register-left">
        <div style={{ marginBottom: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
            <div style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageSquareMore size={20} color="#fff" />
            </div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: '18px' }}>AutoZap</span>
          </div>
          <h2 style={{ color: '#fff', fontSize: '32px', fontWeight: 700, lineHeight: 1.2, marginBottom: '16px' }}>
            WhatsApp CRM para escalar suas vendas
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '15px', lineHeight: 1.6 }}>
            Dispare campanhas em massa, gerencie leads e responda clientes — tudo em um só lugar.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {benefits.map(b => (
            <div key={b} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Check size={13} color="#fff" />
              </div>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px' }}>{b}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right — form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ width: '48px', height: '48px', background: '#16a34a', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', boxShadow: '0 8px 24px rgba(22,163,74,0.3)' }}>
              <MessageSquareMore size={24} color="#fff" />
            </div>
            <h1 style={{ color: '#111827', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em' }}>Crie sua conta</h1>
            <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '6px' }}>Comece a automatizar seu WhatsApp agora</p>
          </div>

          {selectedPlan && PLAN_NAMES[selectedPlan] && (
            <div style={{ background: '#f0fdf4', border: '1.5px solid #22c55e', borderRadius: '12px', padding: '14px 18px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '13px', color: '#15803d', fontWeight: 600, margin: 0 }}>Plano selecionado</p>
                <p style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '2px 0 0' }}>{PLAN_NAMES[selectedPlan]} — {PLAN_PRICES[selectedPlan]}/mês</p>
              </div>
              <span style={{ fontSize: '20px' }}>✅</span>
            </div>
          )}

          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 16px rgba(0,0,0,.06)' }}>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Seu nome *</label>
                <input style={inputStyle} placeholder="João Silva" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoFocus onFocus={e => (e.currentTarget.style.borderColor = '#16a34a')} onBlur={e => (e.currentTarget.style.borderColor = '#e5e7eb')} />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Nome da empresa *</label>
                <input style={inputStyle} placeholder="Minha Empresa" value={form.tenantName} onChange={e => setForm({ ...form, tenantName: e.target.value })} required onFocus={e => (e.currentTarget.style.borderColor = '#16a34a')} onBlur={e => (e.currentTarget.style.borderColor = '#e5e7eb')} />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Email *</label>
                <input type="email" style={inputStyle} placeholder="joao@empresa.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required onFocus={e => (e.currentTarget.style.borderColor = '#16a34a')} onBlur={e => (e.currentTarget.style.borderColor = '#e5e7eb')} />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Senha *</label>
                <input type="password" style={inputStyle} placeholder="Mínimo 8 caracteres" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={8} onFocus={e => (e.currentTarget.style.borderColor = '#16a34a')} onBlur={e => (e.currentTarget.style.borderColor = '#e5e7eb')} />
              </div>
              <button type="submit" disabled={isLoading}
                style={{ width: '100%', padding: '12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onMouseEnter={e => { if (!isLoading) (e.currentTarget as HTMLButtonElement).style.background = '#15803d' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#16a34a' }}>
                {isLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={16} />}
                Criar conta
              </button>
              <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '12px', marginTop: '14px' }}>
                Ao criar uma conta você concorda com nossos{' '}
                <a href="#" style={{ color: '#16a34a', textDecoration: 'none' }}>Termos de Uso</a>
              </p>
            </form>
          </div>

          <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '13px', marginTop: '20px' }}>
            Já tem conta?{' '}
            <a href="/login" style={{ color: '#16a34a', textDecoration: 'none', fontWeight: 500 }}>Entrar</a>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (min-width: 768px) { .register-left { display: flex !important; } }
      `}</style>
    </div>
  )
}
