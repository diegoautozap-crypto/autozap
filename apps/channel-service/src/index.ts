import 'dotenv/config'
import { initSentry } from '@autozap/utils'
initSentry('channel-service')
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import channelRoutes from './routes/channel.routes'
import { errorHandler } from './middleware/channel.middleware'
import { logger } from './lib/logger'

const app = express()
const PORT = process.env.PORT || 3003

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(','), credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '1mb' }))
app.use(rateLimit({ windowMs: 60_000, max: 200 }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'channel-service' })
})

app.use('/', channelRoutes)
app.use(errorHandler)

app.listen(PORT, () => {
  logger.info(`channel-service running on port ${PORT}`)
})

export default app
