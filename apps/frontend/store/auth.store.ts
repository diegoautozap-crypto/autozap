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
  updateUser: (data: Partial<User>) => void
  validateSession: () => void
}

function parseJwt(token: string): any {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

function setAuthCookie(token: string) {
  const expires = new Date()
  expires.setFullYear(expires.getFullYear() + 1)
  document.cookie = `accessToken=${token}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`
}

function clearAuthCookie() {
  document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
}

function forceLogout(reason: string) {
  console.warn('[Auth] Sessão inválida:', reason)
  localStorage.clear()
  clearAuthCookie()
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

      validateSession: () => {
        const { user, accessToken } = get()
        if (!user || !accessToken) return

        const payload = parseJwt(accessToken)
        if (!payload) {
          forceLogout('token inválido')
          return
        }

        // ✅ Se o token está expirado, NÃO força logout aqui
        // O interceptor do api.ts vai renovar automaticamente no próximo request
        // Forçar logout aqui causaria deslogin desnecessário durante o refresh
        const now = Math.floor(Date.now() / 1000)
        const isExpired = payload.exp && payload.exp < now
        if (isExpired) {
          // Token expirado mas temos refresh token — deixa o api.ts renovar
          // Só força logout se não tiver refresh token
          const refreshToken = localStorage.getItem('refreshToken')
          if (!refreshToken) {
            forceLogout('token expirado e sem refresh token')
          }
          return
        }

        // Token ainda válido — verifica consistência
        if (payload.tid && user.tenantId && payload.tid !== user.tenantId) {
          forceLogout(`tenant_id inconsistente: token=${payload.tid} store=${user.tenantId}`)
          return
        }

        if (payload.sub && user.userId && payload.sub !== user.userId) {
          forceLogout(`userId inconsistente: token=${payload.sub} store=${user.userId}`)
          return
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
          localStorage.setItem('accessToken', accessToken)
          localStorage.setItem('refreshToken', refreshToken)
          setAuthCookie(accessToken)

          const meRes = await authApi.get('/auth/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
          })

          const user = meRes.data.data

          const payload = parseJwt(accessToken)
          if (payload?.tid && user?.tenantId && payload.tid !== user.tenantId) {
            localStorage.clear()
            clearAuthCookie()
            set({ isLoading: false })
            throw new Error('Inconsistência de sessão detectada no login')
          }

          set({
            user,
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
        clearAuthCookie()
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
        setAuthCookie(accessToken)
        set({ accessToken, refreshToken })
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