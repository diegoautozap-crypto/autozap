'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { authApi } from '@/lib/api'
import { toast } from 'sonner'
import { Loader2, MessageSquareMore, ArrowRight, Mail } from 'lucide-react'

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

      // Redireciona baseado no role
      const role = result?.user?.role || (result as any)?.role
      if (role === 'agent') {
        router.push('/dashboard/inbox')
      } else if (role === 'supervisor') {
        router.push('/dashboard/inbox')
      } else {
        router.push('/dashboard')
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || ''
      if (msg.toLowerCase().includes('verify') || msg.toLowerCase().includes('verificad') || msg.toLowerCase().includes('email_not_verified') || err?.response?.data?.error?.code === 'EMAIL_NOT_VERIFIED') {
        setEmailNotVerified(true)
        return
      }
      toast.error(msg || 'Email ou senha incorretos')
    }
  }

  const handleResendVerification = async () => {
    setResending(true)
    try {
      await authApi.post('/auth/resend-verification', { email })
      toast.success('Email de verificação reenviado!')
    } catch {
      toast.error('Erro ao reenviar. Tente novamente.')
    } finally {
      setResending(false)
    }
  }

  if (emailNotVerified) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f8fa', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '40px', boxShadow: '0 4px 16px rgba(0,0,0,.06)', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', background: '#fffbeb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Mail size={28} color="#d97706" />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginBottom: '10px' }}>Email não verificado</h2>
            <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: 1.6, marginBottom: '6px' }}>
              Você precisa verificar seu email antes de entrar.
            </p>
            <p style={{ color: '#111827', fontWeight: 600, fontSize: '14px', marginBottom: '24px' }}>{email}</p>
            <button onClick={handleResendVerification} disabled={resending}
              style={{ width: '100%', padding: '12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: resending ? 'not-allowed' : 'pointer', opacity: resending ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
              {resending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={15} />}
              Reenviar email de verificação
            </button>
            <button onClick={() => setEmailNotVerified(false)}
              style={{ width: '100%', padding: '10px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#6b7280' }}>
              ← Voltar ao login
            </button>
          </div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ width: '52px', height: '52px', background: 'linear-gradient(135deg, #25d366, #128c7e)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px #25d36630' }}>
            <MessageSquareMore size={26} color="#000" />
          </div>
          <h1 style={{ color: 'var(--text)', fontSize: '24px', fontWeight: 700, letterSpacing: '-0.5px' }}>AutoZap</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>
            {requiresTwoFactor ? 'Digite seu código de autenticação' : 'Entre na sua conta'}
          </p>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', boxShadow: 'var(--shadow-md)' }}>
          <form onSubmit={handleSubmit}>
            {!requiresTwoFactor ? (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="joao@empresa.com" required autoFocus
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '14px', outline: 'none' }} />
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500 }}>Senha</label>
                    <a href="/forgot-password" style={{ color: 'var(--accent)', fontSize: '12px', textDecoration: 'none' }}>Esqueceu?</a>
                  </div>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '14px', outline: 'none' }} />
                </div>
              </>
            ) : (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Código 2FA</label>
                <input type="text" value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" maxLength={6} autoFocus
                  style={{ width: '100%', padding: '14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '24px', textAlign: 'center', letterSpacing: '8px', outline: 'none' }} />
              </div>
            )}

            <button type="submit" disabled={isLoading}
              style={{ width: '100%', padding: '11px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {isLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={16} />}
              {requiresTwoFactor ? 'Verificar código' : 'Entrar'}
            </button>

            {requiresTwoFactor && (
              <button type="button" onClick={() => setRequiresTwoFactor(false)}
                style={{ width: '100%', padding: '10px', background: 'none', color: 'var(--text-muted)', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', marginTop: '8px' }}>
                ← Voltar
              </button>
            )}
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginTop: '24px' }}>
          Não tem conta?{' '}
          <a href="/register" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Criar conta grátis</a>
        </p>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus { border-color: var(--accent) !important; box-shadow: 0 0 0 3px var(--accent-subtle); }
      `}</style>
    </div>
  )
}
