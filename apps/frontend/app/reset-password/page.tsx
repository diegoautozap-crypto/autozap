'use client'
import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { Loader2, CheckCircle, Eye, EyeOff, MessageSquareMore } from 'lucide-react'
import { toast } from 'sonner'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px',
  border: '1px solid #e4e4e7', borderRadius: '8px',
  fontSize: '14px', outline: 'none',
  color: '#18181b', background: '#fafafa',
  boxSizing: 'border-box', transition: 'border-color 0.15s, background 0.15s',
}

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
    } finally { setLoading(false) }
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', background: '#f0fdf4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid #bbf7d0' }}>
          <CheckCircle size={28} color="#22c55e" />
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#18181b', marginBottom: '8px', letterSpacing: '-0.01em' }}>Senha redefinida!</h2>
        <p style={{ color: '#71717a', fontSize: '14px', marginBottom: '24px' }}>Sua senha foi alterada com sucesso.</p>
        <button onClick={() => router.push('/login')}
          style={{ width: '100%', padding: '12px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.1s' }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#16a34a'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#22c55e'}>
          Entrar na conta
        </button>
      </div>
    )
  }

  return (
    <>
      <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#18181b', marginBottom: '4px', letterSpacing: '-0.01em' }}>Nova senha</h2>
      <p style={{ color: '#71717a', fontSize: '14px', marginBottom: '24px' }}>Digite sua nova senha abaixo.</p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>Nova senha</label>
          <div style={{ position: 'relative' }}>
            <input type={showPass ? 'text' : 'password'} placeholder="Mínimo 8 caracteres" value={password} onChange={e => setPassword(e.target.value)}
              style={{ ...inputStyle, paddingRight: '42px' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = '#fff' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e4e4e7'; e.currentTarget.style.background = '#fafafa' }} />
            <button type="button" onClick={() => setShowPass(p => !p)}
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '4px', display: 'flex' }}>
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>Confirmar senha</label>
          <input type="password" placeholder="Repita a senha" value={confirm} onChange={e => setConfirm(e.target.value)} style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = '#fff' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e4e4e7'; e.currentTarget.style.background = '#fafafa' }} />
        </div>
        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: '12px', background: loading ? '#e4e4e7' : '#22c55e', color: loading ? '#a1a1aa' : '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.1s' }}
          onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#16a34a' }}
          onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#22c55e' }}>
          {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Salvando...</> : 'Redefinir senha'}
        </button>
      </form>
      <p style={{ textAlign: 'center', fontSize: '13px', color: '#a1a1aa', marginTop: '20px' }}>
        <a href="/login" style={{ color: '#22c55e', textDecoration: 'none', fontWeight: 600 }}>Voltar para o login</a>
      </p>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f4f5', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ width: '52px', height: '52px', background: '#22c55e', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(34,197,94,0.3)' }}>
            <MessageSquareMore size={26} color="#fff" />
          </div>
          <h1 style={{ color: '#18181b', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.03em' }}>AutoZap</h1>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '16px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <Suspense fallback={
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Loader2 size={28} color="#22c55e" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          }>
            <ResetPasswordContent />
          </Suspense>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
