import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import zlib from 'zlib'
import messageRoutes from './routes/message.routes'
import automationRoutes from './routes/automation.routes'
import flowRoutes from './routes/flow.routes'
import { errorHandler } from './middleware/message.middleware'
import { logger } from './lib/logger'
import { startMessageWorker, startRetryWorker, startReconciliationJob } from './workers/message.worker'
import { startFlowResumeWorker } from './workers/flow.worker'

const app = express()
const PORT = process.env.PORT || 3004

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(','), credentials: true }))

// ─── Descompressão de requests gzip/deflate (necessário para Make/Zapier) ─────
app.use((req: any, res: any, next: any) => {
  const encoding = req.headers['content-encoding']
  if (!encoding) return next()

  if (encoding === 'gzip') {
    const gunzip = zlib.createGunzip()
    const chunks: Buffer[] = []
    req.pipe(gunzip)
    gunzip.on('data', (chunk: Buffer) => chunks.push(chunk))
    gunzip.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      try {
        req.body = JSON.parse(body)
      } catch {
        req.body = body
      }
      delete req.headers['content-encoding']
      next()
    })
    gunzip.on('error', () => next())
  } else if (encoding === 'deflate') {
    const inflate = zlib.createInflate()
    const chunks: Buffer[] = []
    req.pipe(inflate)
    inflate.on('data', (chunk: Buffer) => chunks.push(chunk))
    inflate.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      try {
        req.body = JSON.parse(body)
      } catch {
        req.body = body
      }
      delete req.headers['content-encoding']
      next()
    })
    inflate.on('error', () => next())
  } else {
    next()
  }
})

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'message-service' })
})

app.use('/', messageRoutes)
app.use('/', automationRoutes)
app.use('/', flowRoutes)
app.use(errorHandler)

app.listen(PORT, async () => {
  logger.info(`message-service running on port ${PORT}`)
  startMessageWorker()
  startRetryWorker()
  startFlowResumeWorker()
  await startReconciliationJob()
  logger.info('All workers started')
})

export default app