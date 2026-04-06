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
  isAuthenticated: boolean
  isLoading: boolean

  login: (email: string, password: string, totpCode?: string) => Promise<{ requiresTwoFactor?: boolean }>
  logout: () => Promise<void>
  register: (name: string, email: string, password: string, tenantName: string) => Promise<void>
  updateUser: (data: Partial<User>) => void
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
      isAuthenticated: false,
      isLoading: false,

      validateSession: () => {
        const { user, isAuthenticated } = get()
        if (!user || !isAuthenticated) return

        // With httpOnly cookies, we can't inspect the token from JS.
        // Session validity is enforced server-side on every request.
        // If /auth/me fails with 401, the api interceptor will attempt refresh
        // and ultimately force logout if refresh also fails.
      },

      login: async (email, password, totpCode) => {
        set({ isLoading: true })
        try {
          const { data } = await authApi.post('/auth/login', { email, password, totpCode })

          if (data.data.requiresTwoFactor) {
            set({ isLoading: false })
            return { requiresTwoFactor: true }
          }

          // Tokens are now in httpOnly cookies set by the server.
          // We only need to fetch user data.
          const meRes = await authApi.get('/auth/me')
          const user = meRes.data.data

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          })

          return {}
        } catch (err) {
          set({ isLoading: false })
          throw err
        }
      },

      logout: async () => {
        try {
          // Server clears httpOnly cookies on logout
          await authApi.post('/auth/logout')
        } catch {}
        localStorage.removeItem('autozap-auth')
        set({ user: null, isAuthenticated: false })
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
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
