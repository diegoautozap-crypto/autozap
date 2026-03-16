import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import conversationRoutes from './routes/conversation.routes'
import { errorHandler } from './middleware/conversation.middleware'
import { logger } from './lib/logger'

const app = express()
const PORT = process.env.PORT || 3006

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(','), credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'conversation-service' }))
app.use('/', conversationRoutes)
app.use(errorHandler)
app.listen(PORT, () => logger.info(`conversation-service running on port ${PORT}`))

export default app
