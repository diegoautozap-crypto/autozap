'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { tenantApi } from '@/lib/api'
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
  const user = useAuthStore(s => s.user)
  const accessToken = useAuthStore(s => s.accessToken)
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Espera um tick pro zustand hidratar do localStorage
    const timer = setTimeout(() => {
      const state = useAuthStore.getState()
      if (!state.user || !state.accessToken || !state.isAuthenticated) {
        router.replace('/login')
      } else {
        // Valida com API real
        tenantApi.get('/').then(() => setReady(true)).catch(() => {
          state.logout()
          router.replace('/login')
        })
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  if (!ready) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f4f4f5' }}>
      <div style={{ width: '32px', height: '32px', border: '3px solid #e4e4e7', borderTop: '3px solid #22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
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
