import 'dotenv/config'
import { initSentry } from '@autozap/utils'
initSentry('conversation-service')
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import conversationRoutes from './routes/conversation.routes'
import pipelineRoutes from './routes/pipeline.routes'
import schedulingRoutes from './routes/scheduling.routes'
import { errorHandler, logger } from '@autozap/utils'

const app = express()
const PORT = process.env.PORT || 3006

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || false, credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '1mb' }))
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }))
app.get('/health', async (_req, res) => {
  try {
    const { db: dbCheck } = await import('@autozap/utils')
    const { error } = await dbCheck.from('conversations').select('id').limit(1)
    res.json({ status: error ? 'degraded' : 'ok', service: 'conversation-service', db: error ? 'down' : 'ok' })
  } catch { res.json({ status: 'degraded', service: 'conversation-service', db: 'down' }) }
})
app.use('/', conversationRoutes)
app.use('/', pipelineRoutes)
app.use('/', schedulingRoutes)
app.use(errorHandler)
app.listen(PORT, () => logger.info(`conversation-service running on port ${PORT}`))

export default app
// 1775504952
// 1775505262
