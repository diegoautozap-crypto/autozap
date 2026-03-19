'use client'
import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { Loader2, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { toast.error('A senha deve ter pelo menos 8 caracteres'); return }
    if (password !== confirm) { toast.error('As senhas não coincidem'); return }
    if (!token) { toast.error('Token inválido'); return }
    setLoading(true)
    try {
      await authApi.post('/auth/reset-password', { token, password })
      setSuccess(true)
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Token inválido ou expirado')
    } finally {
      setLoading(false)
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '11px 14px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', outline: 'none', color: 'var(--text)', background: 'var(--bg-secondary)', boxSizing: 'border-box' }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', boxShadow: 'var(--shadow-md)' }}>
      {success ? (
        <div style={{ textAlign: 'center' }}>
          <CheckCircle size={48} color="#16a34a" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>Senha redefinida!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>Sua senha foi alterada com sucesso.</p>
          <button onClick={() => router.push('/login')} style={{ width: '100%', padding: '12px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>
            Entrar na conta
          </button>
        </div>
      ) : (
        <>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>Nova senha</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>Digite sua nova senha abaixo.</p>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Nova senha</label>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} placeholder="Mínimo 8 caracteres" value={password} onChange={e => setPassword(e.target.value)} style={{ ...inp, paddingRight: '40px' }} />
                <button type="button" onClick={() => setShowPass(p => !p)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px' }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Confirmar senha</label>
              <input type="password" placeholder="Repita a senha" value={confirm} onChange={e => setConfirm(e.target.value)} style={inp} />
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: loading ? '#e5e7eb' : 'var(--accent)', color: loading ? '#9ca3af' : '#000', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Salvando...</> : 'Redefinir senha'}
            </button>
          </form>
          <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', marginTop: '20px' }}>
            <a href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Voltar para o login</a>
          </p>
        </>
      )}
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text)' }}>Auto<span style={{ color: '#16a34a' }}>Zap</span></span>
        </div>
        <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px' }}><Loader2 size={32} color="#16a34a" style={{ animation: 'spin 1s linear infinite' }} /></div>}>
          <ResetPasswordContent />
        </Suspense>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
