import 'dotenv/config'
import { initSentry } from '@autozap/utils'
initSentry('tenant-service')
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import tenantRoutes, { asaasWebhookRouter } from './routes/tenant.routes'
import adminRoutes from './routes/admin.routes'
import { errorHandler, logger } from '@autozap/utils'

const app = express()
const PORT = process.env.PORT || 3002

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(','), credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '100kb' }))
app.use(rateLimit({ windowMs: 60_000, max: 120 }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'tenant-service' })
})

app.use('/tenant', asaasWebhookRouter)
app.use('/tenant', tenantRoutes)
app.use('/admin', adminRoutes)
app.use(errorHandler)

app.listen(PORT, () => {
  logger.info(`tenant-service running on port ${PORT}`)
})

export default app