import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import contactRoutes from './routes/contact.routes'
import { errorHandler, logger } from '@autozap/utils'

const app = express()
const PORT = process.env.PORT || 3005

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(','), credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '10mb' }))
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }))
app.get('/health', async (_req, res) => {
  try {
    const { db: dbCheck } = await import('@autozap/utils')
    const { error } = await dbCheck.from('contacts').select('id').limit(1)
    res.json({ status: error ? 'degraded' : 'ok', service: 'contact-service', db: error ? 'down' : 'ok' })
  } catch { res.json({ status: 'degraded', service: 'contact-service', db: 'down' }) }
})
app.use('/', contactRoutes)
app.use(errorHandler)
app.listen(PORT, () => logger.info(`contact-service running on port ${PORT}`))

export default app
// 1775504952
// 1775505262
// force 1775505481
