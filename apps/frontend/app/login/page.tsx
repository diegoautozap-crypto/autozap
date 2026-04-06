'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { authApi } from '@/lib/api'
import { toast } from 'sonner'
import { Loader2, ArrowRight, Mail } from 'lucide-react'
import { AutoZapLogo } from '@/components/ui/AutoZapLogo'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', background: '#fafafa',
  border: '1px solid #e4e4e7', borderRadius: '8px',
  color: '#18181b', fontSize: '14px', outline: 'none',
  transition: 'border-color 0.15s, background 0.15s',
  boxSizing: 'border-box',
}

export default function LoginPage() {
  const router = useRouter()
  const { login, isLoading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false)
  const [emailNotVerified, setEmailNotVerified] = useState(false)
  const [resending, setResending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailNotVerified(false)
    try {
      const result = await login(email, password, requiresTwoFactor ? totpCode : undefined)
      if (result.requiresTwoFactor) {
        setRequiresTwoFactor(true)
        toast.info('Digite o código do autenticador')
        return
      }
      // Aguarda zustand persistir no localStorage antes de redirecionar
      await new Promise(r => setTimeout(r, 100))
      const role = (useAuthStore.getState().user as any)?.role || 'agent'
      if (role === 'agent' || role === 'supervisor') router.push('/dashboard/inbox')
      else router.push('/dashboard')
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || ''
      if (msg.toLowerCase().includes('verify') || msg.toLowerCase().includes('verificad') || msg.toLowerCase().includes('email_not_verified') || err?.response?.data?.error?.code === 'EMAIL_NOT_VERIFIED') {
        setEmailNotVerified(true); return
      }
      toast.error(msg || 'Email ou senha incorretos')
    }
  }

  const handleResendVerification = async () => {
    setResending(true)
    try {
      await authApi.post('/auth/resend-verification', { email })
      toast.success('Email de verificação reenviado!')
    } catch { toast.error('Erro ao reenviar. Tente novamente.') }
    finally { setResending(false) }
  }

  if (emailNotVerified) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f4f5', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '40px', boxShadow: '0 4px 16px rgba(0,0,0,.06)', textAlign: 'center' }}>
            <div style={{ width: '60px', height: '60px', background: '#fffbeb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: '1px solid #fde68a' }}>
              <Mail size={26} color="#d97706" />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#18181b', marginBottom: '10px', letterSpacing: '-0.01em' }}>Email não verificado</h2>
            <p style={{ color: '#71717a', fontSize: '14px', lineHeight: 1.6, marginBottom: '6px' }}>Você precisa verificar seu email antes de entrar.</p>
            <p style={{ color: '#18181b', fontWeight: 600, fontSize: '14px', marginBottom: '24px' }}>{email}</p>
            <button onClick={handleResendVerification} disabled={resending}
              style={{ width: '100%', padding: '11px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: resending ? 'not-allowed' : 'pointer', opacity: resending ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
              {resending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={15} />}
              Reenviar email de verificação
            </button>
            <button onClick={() => setEmailNotVerified(false)}
              style={{ width: '100%', padding: '10px', background: 'none', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#71717a' }}>
              ← Voltar ao login
            </button>
          </div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f4f5', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <AutoZapLogo variant="white" size="lg" />
          </div>
          <p style={{ color: '#a1a1aa', fontSize: '14px', marginTop: '6px' }}>
            {requiresTwoFactor ? 'Digite seu código de autenticação' : 'Entre na sua conta'}
          </p>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <form onSubmit={handleSubmit}>
            {!requiresTwoFactor ? (
              <>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', color: '#52525b', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="joao@empresa.com" required autoFocus style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = '#fff' }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4e4e7'; e.currentTarget.style.background = '#fafafa' }} />
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ color: '#52525b', fontSize: '12px', fontWeight: 600 }}>Senha</label>
                    <a href="/forgot-password" style={{ color: '#22c55e', fontSize: '12px', textDecoration: 'none', fontWeight: 500 }}>Esqueceu?</a>
                  </div>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = '#fff' }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e4e4e7'; e.currentTarget.style.background = '#fafafa' }} />
                </div>
              </>
            ) : (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', color: '#52525b', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Código 2FA</label>
                <input type="text" value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} autoFocus
                  style={{ ...inputStyle, fontSize: '24px', textAlign: 'center', letterSpacing: '8px' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = '#fff' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e4e4e7'; e.currentTarget.style.background = '#fafafa' }} />
              </div>
            )}

            <button type="submit" disabled={isLoading}
              style={{ width: '100%', padding: '11px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.1s' }}
              onMouseEnter={e => { if (!isLoading) (e.currentTarget as HTMLButtonElement).style.background = '#16a34a' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#22c55e' }}>
              {isLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={16} />}
              {requiresTwoFactor ? 'Verificar código' : 'Entrar'}
            </button>

            {requiresTwoFactor && (
              <button type="button" onClick={() => setRequiresTwoFactor(false)}
                style={{ width: '100%', padding: '10px', background: 'none', color: '#a1a1aa', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', marginTop: '8px' }}>
                ← Voltar
              </button>
            )}
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#a1a1aa', fontSize: '13px', marginTop: '24px' }}>
          Não tem conta?{' '}
          <a href="/#planos" style={{ color: '#22c55e', textDecoration: 'none', fontWeight: 600 }}>Criar conta</a>
        </p>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
