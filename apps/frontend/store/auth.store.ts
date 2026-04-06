'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '@/lib/api'

interface User {
  userId: string
  tenantId: string
  role: string
  email: string
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean

  login: (email: string, password: string, totpCode?: string) => Promise<{ requiresTwoFactor?: boolean }>
  logout: () => Promise<void>
  register: (name: string, email: string, password: string, tenantName: string) => Promise<void>
  updateUser: (data: Partial<User>) => void
  setTokens: (accessToken: string, refreshToken: string) => void
  validateSession: () => void
}

function forceLogout(reason: string) {
  console.warn('[Auth] Sessao invalida:', reason)
  localStorage.removeItem('autozap-auth')
  window.location.href = '/login'
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken })
      },

      validateSession: () => {
        const { user, isAuthenticated, accessToken } = get()
        if (!user || !isAuthenticated || !accessToken) {
          if (isAuthenticated) forceLogout('sessao incompleta')
        }
      },

      login: async (email, password, totpCode) => {
        set({ isLoading: true })
        try {
          const { data } = await authApi.post('/auth/login', { email, password, totpCode })

          if (data.data.requiresTwoFactor) {
            set({ isLoading: false })
            return { requiresTwoFactor: true }
          }

          const { accessToken, refreshToken } = data.data

          // Persiste tokens ANTES de qualquer outra chamada
          const storeData = { state: { accessToken, refreshToken, user: null, isAuthenticated: false }, version: 0 }
          try {
            const existing = JSON.parse(localStorage.getItem('autozap-auth') || '{}')
            storeData.version = existing.version || 0
            if (existing.state) storeData.state = { ...existing.state, accessToken, refreshToken }
          } catch {}
          localStorage.setItem('autozap-auth', JSON.stringify(storeData))
          set({ accessToken, refreshToken })

          // Busca dados do usuário com token explícito no header
          const meRes = await authApi.get('/auth/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          const user = meRes.data.data

          // Persiste tudo de uma vez
          set({ user, isAuthenticated: true, isLoading: false })
          try {
            const final = JSON.parse(localStorage.getItem('autozap-auth') || '{}')
            final.state = { ...final.state, user, isAuthenticated: true, accessToken, refreshToken }
            localStorage.setItem('autozap-auth', JSON.stringify(final))
          } catch {}

          return {}
        } catch (err) {
          set({ isLoading: false })
          throw err
        }
      },

      logout: async () => {
        const rt = get().refreshToken
        try {
          await authApi.post('/auth/logout', { refreshToken: rt })
        } catch {}
        localStorage.removeItem('autozap-auth')
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
      },

      register: async (name, email, password, tenantName) => {
        set({ isLoading: true })
        try {
          await authApi.post('/auth/register', { name, email, password, tenantName })
          set({ isLoading: false })
        } catch (err) {
          set({ isLoading: false })
          throw err
        }
      },

      updateUser: (data) => {
        const current = get().user
        if (!current) return
        set({ user: { ...current, ...data } })
      },
    }),
    {
      name: 'autozap-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
