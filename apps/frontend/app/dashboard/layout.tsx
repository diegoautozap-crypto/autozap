'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { Sidebar } from '@/components/layout/sidebar'
import { TrialBanner } from '@/components/layout/TrialBanner'
import { useNotifications } from '@/hooks/useNotifications'

// Componente separado — só monta quando o usuário já está autenticado
// Isso garante que o tenantId está disponível quando o Pusher conecta
function NotificationsProvider() {
  useNotifications()
  return null
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, validateSession } = useAuthStore()
  const [hydrated, setHydrated] = useState(false)
  const [validating, setValidating] = useState(true)

  useEffect(() => { setHydrated(true) }, [])

  useEffect(() => {
    if (!hydrated) return
    const check = async () => {
      await validateSession()
      if (!useAuthStore.getState().isAuthenticated) {
        router.push('/login')
      }
      setValidating(false)
    }
    check()
  }, [hydrated])

  if (!hydrated || validating) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '32px', height: '32px', border: '3px solid #e4e4e7', borderTop: '3px solid #22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      </div>
    </div>
  )
  if (!isAuthenticated) return null

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Só monta aqui — depois que hydrated=true e isAuthenticated=true */}
      <NotificationsProvider />
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <TrialBanner />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
