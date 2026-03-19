'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('Token inválido.'); return }
    authApi.post('/auth/verify-email', { token })
      .then(() => { setStatus('success'); setMessage('Email verificado com sucesso!') })
      .catch((err: any) => { setStatus('error'); setMessage(err?.response?.data?.error?.message || 'Token inválido ou expirado.') })
  }, [token])

  return (
    <div style={{ background: '#fff', borderRadius: '16px', padding: '48px', width: '400px', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,.06)' }}>
      <div style={{ marginBottom: '24px' }}>
        <span style={{ fontSize: '28px', fontWeight: 800, color: '#111827' }}>Auto<span style={{ color: '#16a34a' }}>Zap</span></span>
      </div>
      {status === 'loading' && (
        <>
          <Loader2 size={40} color="#16a34a" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#6b7280', fontSize: '15px' }}>Verificando seu email...</p>
        </>
      )}
      {status === 'success' && (
        <>
          <CheckCircle size={48} color="#16a34a" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>Email verificado!</h2>
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>{message}</p>
          <button onClick={() => router.push('/login')} style={{ width: '100%', padding: '12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>
            Entrar na conta
          </button>
        </>
      )}
      {status === 'error' && (
        <>
          <XCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>Ops!</h2>
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>{message}</p>
          <button onClick={() => router.push('/login')} style={{ width: '100%', padding: '12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>
            Voltar para o login
          </button>
        </>
      )}
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f8fa' }}>
      <Suspense fallback={<div style={{ background: '#fff', borderRadius: '16px', padding: '48px', width: '400px', textAlign: 'center' }}><Loader2 size={40} color="#16a34a" style={{ animation: 'spin 1s linear infinite', margin: '0 auto' }} /></div>}>
        <VerifyEmailContent />
      </Suspense>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
