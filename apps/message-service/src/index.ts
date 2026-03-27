import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
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
app.use(express.json({ limit: '1mb' }))

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
