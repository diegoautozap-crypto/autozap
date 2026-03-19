'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import { Loader2, MessageSquareMore, ArrowRight } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const { login, isLoading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const result = await login(email, password, requiresTwoFactor ? totpCode : undefined)
      if (result.requiresTwoFactor) {
        setRequiresTwoFactor(true)
        toast.info('Digite o código do autenticador')
        return
      }
      router.push('/dashboard')
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Email ou senha incorretos')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '52px', height: '52px',
            background: 'linear-gradient(135deg, #25d366, #128c7e)',
            borderRadius: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 24px #25d36630',
          }}>
            <MessageSquareMore size={26} color="#000" />
          </div>
          <h1 style={{ color: 'var(--text)', fontSize: '24px', fontWeight: 700, letterSpacing: '-0.5px' }}>
            AutoZap
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>
            {requiresTwoFactor ? 'Digite seu código de autenticação' : 'Entre na sua conta'}
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: 'var(--shadow-md)',
        }}>
          <form onSubmit={handleSubmit}>
            {!requiresTwoFactor ? (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="joao@empresa.com"
                    required
                    autoFocus
                    style={{
                      width: '100%', padding: '10px 14px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text)', fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500 }}>Senha</label>
                    {/* ✅ Link correto para recuperação de senha */}
                    <a href="/forgot-password" style={{ color: 'var(--accent)', fontSize: '12px', textDecoration: 'none' }}>Esqueceu?</a>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{
                      width: '100%', padding: '10px 14px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text)', fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                </div>
              </>
            ) : (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>
                  Código 2FA
                </label>
                <input
                  type="text"
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                  style={{
                    width: '100%', padding: '14px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)', fontSize: '24px',
                    textAlign: 'center', letterSpacing: '8px',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%', padding: '11px',
                background: 'var(--accent)', color: '#000',
                border: 'none', borderRadius: '8px',
                fontSize: '14px', fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              {isLoading ? (
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <ArrowRight size={16} />
              )}
              {requiresTwoFactor ? 'Verificar código' : 'Entrar'}
            </button>

            {requiresTwoFactor && (
              <button
                type="button"
                onClick={() => setRequiresTwoFactor(false)}
                style={{
                  width: '100%', padding: '10px',
                  background: 'none', color: 'var(--text-muted)',
                  border: 'none', borderRadius: '8px',
                  fontSize: '13px', cursor: 'pointer', marginTop: '8px',
                }}
              >
                ← Voltar
              </button>
            )}
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginTop: '24px' }}>
          Não tem conta?{' '}
          <a href="/register" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
            Criar conta grátis
          </a>
        </p>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus { border-color: var(--accent) !important; box-shadow: 0 0 0 3px var(--accent-subtle); }
      `}</style>
    </div>
  )
}
