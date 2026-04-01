import * as Sentry from '@sentry/node'

let initialized = false

export function initSentry(serviceName: string) {
  const dsn = process.env.SENTRY_DSN
  if (!dsn || initialized) return

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    serverName: serviceName,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Remove dados sensíveis
      if (event.request?.headers) {
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
      }
      return event
    },
  })

  initialized = true
  console.log(`[Sentry] Initialized for ${serviceName}`)
}

export function captureError(err: unknown, context?: Record<string, unknown>) {
  if (!initialized) return
  if (context) Sentry.setContext('extra', context)
  Sentry.captureException(err)
}

export { Sentry }
