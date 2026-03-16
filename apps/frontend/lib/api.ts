import axios from 'axios'

// ─── API clients for each service ─────────────────────────────────────────────

const createClient = (baseURL: string) => {
  const client = axios.create({ baseURL, timeout: 30000 })

  // Attach access token to every request
  client.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

  // Auto-refresh on 401
  client.interceptors.response.use(
    (res) => res,
    async (err) => {
      if (err.response?.status === 401 && !err.config._retry) {
        err.config._retry = true
        try {
          const refreshToken = localStorage.getItem('refreshToken')
          if (!refreshToken) throw new Error('No refresh token')

          const { data } = await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
            { refreshToken },
          )
          localStorage.setItem('accessToken', data.data.accessToken)
          localStorage.setItem('refreshToken', data.data.refreshToken)
          err.config.headers.Authorization = `Bearer ${data.data.accessToken}`
          return client(err.config)
        } catch {
          localStorage.clear()
          window.location.href = '/login'
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
