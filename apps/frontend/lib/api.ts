import axios from 'axios'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function forceLogout(reason: string) {
  console.warn('[Auth] Forcando logout:', reason)
  localStorage.removeItem('autozap-auth')
  window.location.href = '/login'
}

// Renovacao em andamento — evita multiplas chamadas simultaneas
let refreshPromise: Promise<void> | null = null
let refreshRetried = false

async function refreshAccessToken(): Promise<void> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      // Cookie refreshToken is sent automatically via withCredentials
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
        {},
        { withCredentials: true },
      )
      // Server sets new httpOnly cookies automatically
    } catch (err: any) {
      // Retry once before logging out (could be a transient network error)
      if (!refreshRetried) {
        refreshRetried = true
        try {
          await new Promise(r => setTimeout(r, 2000))
          await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
            {},
            { withCredentials: true },
          )
          refreshRetried = false
          return
        } catch { /* retry failed, logout */ }
      }
      refreshRetried = false
      forceLogout('falha no refresh token')
      throw err
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// ─── Factory de cliente ───────────────────────────────────────────────────────

const createClient = (baseURL: string) => {
  const client = axios.create({
    baseURL,
    timeout: 30000,
    withCredentials: true, // Send httpOnly cookies on every request
  })

  // Interceptor de response: trata 401 (token expirado)
  client.interceptors.response.use(
    (res) => res,
    async (err) => {
      if (err.response?.status === 401 && !err.config._retry) {
        err.config._retry = true
        try {
          await refreshAccessToken()
          // Retry the original request — new cookies are set automatically
          return client(err.config)
        } catch {
          // forceLogout already called inside refreshAccessToken
        }
      }
      return Promise.reject(err)
    },
  )

  return client
}

export const authApi         = createClient(process.env.NEXT_PUBLIC_API_URL!)
export const tenantApi       = createClient(process.env.NEXT_PUBLIC_TENANT_SERVICE_URL!)
export const channelApi      = createClient(process.env.NEXT_PUBLIC_CHANNEL_SERVICE_URL!)
export const messageApi      = createClient(process.env.NEXT_PUBLIC_MESSAGE_SERVICE_URL!)
export const contactApi      = createClient(process.env.NEXT_PUBLIC_CONTACT_SERVICE_URL!)
export const conversationApi = createClient(process.env.NEXT_PUBLIC_CONVERSATION_SERVICE_URL!)
export const campaignApi     = createClient(process.env.NEXT_PUBLIC_CAMPAIGN_SERVICE_URL!)
