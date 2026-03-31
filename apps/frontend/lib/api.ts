import axios from 'axios'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJwt(token: string): any {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

function getStoredTenantId(): string | null {
  try {
    const auth = localStorage.getItem('autozap-auth')
    if (!auth) return null
    return JSON.parse(auth)?.tenantId || null
  } catch {
    return null
  }
}

function forceLogout(reason: string) {
  console.warn('[Auth] Forçando logout:', reason)
  localStorage.clear()
  window.location.href = '/login'
}

// Renovação em andamento — evita múltiplas chamadas simultâneas
let refreshPromise: Promise<string> | null = null
let refreshRetried = false

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken')
      if (!refreshToken) throw new Error('No refresh token')

      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
        { refreshToken },
      )

      const newAccessToken: string = data.data.accessToken
      const newRefreshToken: string = data.data.refreshToken

      // ── Validação crítica: tenant não pode mudar ──────────────────────────
      const newPayload = parseJwt(newAccessToken)
      const storedTenantId = getStoredTenantId()

      if (storedTenantId && newPayload?.tid && newPayload.tid !== storedTenantId) {
        forceLogout('tenant_id mudou após refresh — possível inconsistência de sessão')
        throw new Error('Tenant mismatch')
      }

      localStorage.setItem('accessToken', newAccessToken)
      localStorage.setItem('refreshToken', newRefreshToken)

      return newAccessToken
    } catch (err: any) {
      // Retry uma vez antes de deslogar (pode ser erro de rede passageiro)
      if (!refreshRetried) {
        refreshRetried = true
        try {
          await new Promise(r => setTimeout(r, 2000))
          const refreshToken = localStorage.getItem('refreshToken')
          if (!refreshToken) throw err
          const { data } = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`, { refreshToken })
          localStorage.setItem('accessToken', data.data.accessToken)
          localStorage.setItem('refreshToken', data.data.refreshToken)
          refreshRetried = false
          return data.data.accessToken
        } catch { /* retry falhou, faz logout */ }
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

// ─── Verificação proativa: renova se faltar menos de 60s para expirar ─────────
// Roda antes de cada request — se o token está prestes a expirar, renova antes
// Isso evita que o token expire no meio de uma operação importante

function shouldRefreshProactively(): boolean {
  try {
    const token = localStorage.getItem('accessToken')
    if (!token) return false
    const payload = parseJwt(token)
    if (!payload?.exp) return false
    const expiresIn = payload.exp - Math.floor(Date.now() / 1000)
    return expiresIn < 300 // renova se faltar menos de 5 minutos
  } catch {
    return false
  }
}

// ─── Factory de cliente ───────────────────────────────────────────────────────

const createClient = (baseURL: string) => {
  const client = axios.create({ baseURL, timeout: 30000 })

  // Interceptor de request: renova proativamente se necessário
  client.interceptors.request.use(async (config) => {
    // Renova proativamente antes de expirar
    if (shouldRefreshProactively()) {
      try {
        const newToken = await refreshAccessToken()
        config.headers.Authorization = `Bearer ${newToken}`
        return config
      } catch {
        // Se falhar, deixa o request prosseguir e o 401 vai tratar
      }
    }

    const token = localStorage.getItem('accessToken')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

  // Interceptor de response: trata 401 (token expirado no meio do request)
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
          // forceLogout já foi chamado dentro de refreshAccessToken
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