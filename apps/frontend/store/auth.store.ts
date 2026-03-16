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
  setTokens: (accessToken: string, refreshToken: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password, totpCode) => {
        set({ isLoading: true })
        try {
          const { data } = await authApi.post('/auth/login', { email, password, totpCode })

          if (data.data.requiresTwoFactor) {
            set({ isLoading: false })
            return { requiresTwoFactor: true }
          }

          const { accessToken, refreshToken } = data.data
          localStorage.setItem('accessToken', accessToken)
          localStorage.setItem('refreshToken', refreshToken)

          // Get user info
          const meRes = await authApi.get('/auth/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
          })

          set({
            user: meRes.data.data,
            accessToken,
            refreshToken,
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
        const refreshToken = get().refreshToken
        if (refreshToken) {
          try {
            await authApi.post('/auth/logout', { refreshToken })
          } catch {}
        }
        localStorage.clear()
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

      setTokens: (accessToken, refreshToken) => {
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', refreshToken)
        set({ accessToken, refreshToken })
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
