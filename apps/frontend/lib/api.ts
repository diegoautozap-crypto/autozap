import axios from 'axios'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('autozap-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.accessToken || null
  } catch { return null }
}

function getRefreshToken(): string | null {
  try {
    const raw = localStorage.getItem('autozap-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.refreshToken || null
  } catch { return null }
}

function updateStoredTokens(accessToken: string, refreshToken: string) {
  try {
    const raw = localStorage.getItem('autozap-auth')
    if (!raw) return
    const parsed = JSON.parse(raw)
    parsed.state.accessToken = accessToken
    parsed.state.refreshToken = refreshToken
    localStorage.setItem('autozap-auth', JSON.stringify(parsed))
  } catch {}
}

function forceLogout(reason: string) {
  console.warn('[Auth] Forcando logout:', reason)
  localStorage.removeItem('autozap-auth')
  window.location.href = '/login'
}

// ─── Token Refresh ──────────────────────────────────────────────────────────

let refreshPromise: Promise<string> | null = null
let refreshRetried = false

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const rt = getRefreshToken()
      if (!rt) throw new Error('No refresh token')

      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
        { refreshToken: rt },
        { withCredentials: true },
      )

      const { accessToken, refreshToken } = data.data
      updateStoredTokens(accessToken, refreshToken)
      return accessToken
    } catch (err: any) {
      if (!refreshRetried) {
        refreshRetried = true
        try {
          await new Promise(r => setTimeout(r, 2000))
          const rt = getRefreshToken()
          if (!rt) throw new Error('No refresh token')
          const { data } = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
            { refreshToken: rt },
            { withCredentials: true },
          )
          const { accessToken, refreshToken } = data.data
          updateStoredTokens(accessToken, refreshToken)
          refreshRetried = false
          return accessToken
        } catch { /* retry failed */ }
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
    withCredentials: true,
  })

  // Attach token on every request
  client.interceptors.request.use(async (config) => {
    const token = getToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

  // Handle 401 → refresh → retry
  client.interceptors.response.use(
    (res) => res,
    async (err) => {
      if (err.response?.status === 401 && !err.config._retry) {
        err.config._retry = true
        try {
          const newToken = await refreshAccessToken()
          err.config.headers.Authorization = `Bearer ${newToken}`
          return client(err.config)
        } catch {
          // forceLogout already called
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
