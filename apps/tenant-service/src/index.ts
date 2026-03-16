import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import tenantRoutes from './routes/tenant.routes'
import { errorHandler } from './middleware/tenant.middleware'
import { logger } from './lib/logger'

const app = express()
const PORT = process.env.PORT || 3002

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(','), credentials: true }))
app.use(express.json({ limit: '100kb' }))

app.use(rateLimit({ windowMs: 60_000, max: 120 }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'tenant-service' })
})

app.use('/tenant', tenantRoutes)
app.use(errorHandler)

app.listen(PORT, () => {
  logger.info(`tenant-service running on port ${PORT}`)
})

export default app
