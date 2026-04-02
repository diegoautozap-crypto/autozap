'use client'
import { useState } from 'react'
import { authApi } from '@/lib/api'
import { Loader2, CheckCircle } from 'lucide-react'
import { AutoZapLogo } from '@/components/ui/AutoZapLogo'
import { toast } from 'sonner'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.post('/auth/forgot-password', { email })
      setSent(true)
    } catch {
      toast.error('Erro ao enviar email. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <AutoZapLogo variant="white" size="lg" />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>Recuperar senha</p>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', boxShadow: 'var(--shadow-md)' }}>
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <CheckCircle size={48} color="#16a34a" style={{ margin: '0 auto 16px' }} />
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>Email enviado!</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
                Se o email <strong>{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha.
              </p>
              <a href="/login" style={{ display: 'block', width: '100%', padding: '11px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>
                Voltar para o login
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
                Digite seu email e enviaremos um link para redefinir sua senha.
              </p>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="joao@empresa.com"
                  required
                  autoFocus
                  style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{ width: '100%', padding: '11px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Enviando...</> : 'Enviar link de recuperação'}
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginTop: '24px' }}>
          <a href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>← Voltar para o login</a>
        </p>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } input:focus { border-color: var(--accent) !important; }`}</style>
    </div>
  )
}
