'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { tenantApi } from '@/lib/api'
import { Sidebar } from '@/components/layout/sidebar'
import { TrialBanner } from '@/components/layout/TrialBanner'
import { useNotifications } from '@/hooks/useNotifications'
import { usePermissionsStore } from '@/store/permissions.store'

// Componente separado — só monta quando o usuário já está autenticado
// Isso garante que o tenantId está disponível quando o Pusher conecta
function NotificationsProvider() {
  useNotifications()
  return null
}

function PermissionsLoader() {
  const { loaded, load } = usePermissionsStore()
  const { useEffect } = require('react')
  useEffect(() => { if (!loaded) load() }, [loaded, load])
  return null
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const { validateSession } = useAuthStore()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => { setHydrated(true) }, [])

  useEffect(() => {
    if (!hydrated) return
    validateSession()
    if (!useAuthStore.getState().isAuthenticated) {
      router.replace('/login')
    }
  }, [hydrated])

  // Middleware já protege no server-side. Aqui é fallback client-side.
  if (!hydrated || !isAuthenticated) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f4f4f5' }}>
      <div style={{ width: '32px', height: '32px', border: '3px solid #e4e4e7', borderTop: '3px solid #22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Só monta aqui — depois que hydrated=true e isAuthenticated=true */}
      <NotificationsProvider />
      <PermissionsLoader />
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
