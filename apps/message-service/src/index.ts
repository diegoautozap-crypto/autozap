import 'dotenv/config'
import { initSentry, captureError } from '@autozap/utils'
initSentry('message-service')
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import zlib from 'zlib'
import messageRoutes from './routes/message.routes'
import automationRoutes from './routes/automation.routes'
import flowRoutes from './routes/flow.routes'
import { errorHandler } from './middleware/message.middleware'
import { logger } from './lib/logger'
import { startMessageWorker, startRetryWorker, startAutoReplyWorker, startAgentNotifyWorker, startReconciliationJob } from './workers/message.worker'
import { startFlowResumeWorker, startManualFlowWorker } from './workers/flow.worker'

const app = express()
const PORT = process.env.PORT || 3004

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(','), credentials: true }))
app.use(cookieParser())

// ─── Captura o body bruto ANTES do express.json() ─────────────────────────────
// Necessário para descompressão de gzip/deflate (Make, Zapier comprimem o body)
app.use(express.raw({ type: '*/*', limit: '10mb' }))

// ─── Descompressão e parse do body ───────────────────────────────────────────
app.use((req: any, res: any, next: any) => {
  const encoding = (req.headers['content-encoding'] || '').toLowerCase()
  const contentType = (req.headers['content-type'] || '').toLowerCase()
  const raw: Buffer | undefined = Buffer.isBuffer(req.body) ? req.body : undefined

  // Se não tem body ou já foi parseado como objeto, passa direto
  if (!raw || raw.length === 0) {
    if (!req.body || Buffer.isBuffer(req.body)) req.body = {}
    return next()
  }

  const parseJson = (text: string) => {
    try { req.body = JSON.parse(text) } catch { req.body = {} }
  }

  if (encoding === 'gzip') {
    zlib.gunzip(raw, (err, result) => {
      if (err) { logger.warn('gzip decompression failed', { err: err.message }); req.body = {}; return next() }
      delete req.headers['content-encoding']
      parseJson(result.toString('utf8'))
      next()
    })
  } else if (encoding === 'deflate') {
    zlib.inflate(raw, (err, result) => {
      if (err) { logger.warn('deflate decompression failed', { err: err.message }); req.body = {}; return next() }
      delete req.headers['content-encoding']
      parseJson(result.toString('utf8'))
      next()
    })
  } else if (contentType.includes('application/json') || contentType.includes('text/')) {
    parseJson(raw.toString('utf8'))
    next()
  } else {
    // Tenta parsear como JSON de qualquer forma
    parseJson(raw.toString('utf8'))
    next()
  }
})

app.get('/health', async (_req, res) => {
  try {
    const { error } = await (await import('./lib/db')).db.from('flows').select('id').limit(1)
    res.json({ status: error ? 'degraded' : 'ok', service: 'message-service', db: error ? 'down' : 'ok' })
  } catch { res.json({ status: 'degraded', service: 'message-service', db: 'down' }) }
})

// Rate limiting para webhooks (100 req/min por IP)
app.use('/webhook', rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }))
app.use('/', messageRoutes)
app.use('/', automationRoutes)
app.use('/', flowRoutes)
app.use(errorHandler)

const server = app.listen(PORT, async () => {
  logger.info(`message-service running on port ${PORT}`)
  startMessageWorker()
  startRetryWorker()
  startAutoReplyWorker()
  startAgentNotifyWorker()
  startFlowResumeWorker()
  startManualFlowWorker()
  await startReconciliationJob()
  logger.info('All workers started')
})

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully...`)
  server.close(() => {
    logger.info('HTTP server closed')
    process.exit(0)
  })
  setTimeout(() => { logger.warn('Forced shutdown after timeout'); process.exit(1) }, 10000)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export default app