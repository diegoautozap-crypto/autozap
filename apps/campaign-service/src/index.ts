import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import campaignRoutes from './routes/campaign.routes'
import { errorHandler } from './middleware/campaign.middleware'
import { logger } from './lib/logger'
import { startCampaignWorker }    from './workers/campaign.worker'
import { startInboxWorker }       from './workers/inbox.worker'
import { startReconciliationJob } from './workers/reconciliation.worker'
import { startSchedulerWorker }   from './workers/scheduler.worker'

const app = express()
const PORT = process.env.PORT || 3007

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(','), credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '10mb' }))

app.get('/health', async (_req, res) => {
  try {
    const { error } = await (await import('./lib/db')).db.from('campaigns').select('id').limit(1)
    res.json({ status: error ? 'degraded' : 'ok', service: 'campaign-service', db: error ? 'down' : 'ok' })
  } catch { res.json({ status: 'degraded', service: 'campaign-service', db: 'down' }) }
})
app.use('/', campaignRoutes)
app.use(errorHandler)

const server = app.listen(PORT, () => {
  logger.info(`campaign-service running on port ${PORT}`)
  startCampaignWorker()
  startInboxWorker()
  startReconciliationJob()
  startSchedulerWorker()
  logger.info('All workers started')
})

const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully...`)
  server.close(() => { logger.info('HTTP server closed'); process.exit(0) })
  setTimeout(() => { logger.warn('Forced shutdown'); process.exit(1) }, 10000)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export default app// 1775504952
