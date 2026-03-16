import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import contactRoutes from './routes/contact.routes'
import { errorHandler } from './middleware/contact.middleware'
import { logger } from './lib/logger'

const app = express()
const PORT = process.env.PORT || 3005

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(','), credentials: true }))
app.use(express.json({ limit: '10mb' })) // large for CSV imports
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'contact-service' }))
app.use('/', contactRoutes)
app.use(errorHandler)
app.listen(PORT, () => logger.info(`contact-service running on port ${PORT}`))

export default app
