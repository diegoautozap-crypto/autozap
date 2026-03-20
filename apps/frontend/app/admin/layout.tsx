'use client'
import { useState, useEffect } from 'react'
import { Shield } from 'lucide-react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false)
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    const saved = sessionStorage.getItem('admin_unlocked')
    if (saved === 'true') setUnlocked(true)
  }, [])

  if (!hydrated) return null

  if (!unlocked) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '380px', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Shield size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#f1f5f9', marginBottom: '6px' }}>AutoZap Admin</h1>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px' }}>Acesso restrito. Digite a senha de admin.</p>
          <input
            type="password"
            placeholder="Senha de admin"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const stored = localStorage.getItem('adminSecret') || secret
                sessionStorage.setItem('adminSecret', secret)
                setUnlocked(true)
                sessionStorage.setItem('admin_unlocked', 'true')
              }
            }}
            style={{ width: '100%', padding: '10px 14px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9', fontSize: '14px', outline: 'none', marginBottom: '12px' }}
            autoFocus
          />
          {error && <p style={{ fontSize: '12px', color: '#ef4444', marginBottom: '10px' }}>{error}</p>}
          <button
            onClick={() => {
              if (!secret) { setError('Digite a senha'); return }
              sessionStorage.setItem('adminSecret', secret)
              sessionStorage.setItem('admin_unlocked', 'true')
              setUnlocked(true)
            }}
            style={{ width: '100%', padding: '10px', background: '#dc2626', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
          >
            Entrar
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}