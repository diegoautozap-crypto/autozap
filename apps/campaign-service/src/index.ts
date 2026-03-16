import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import campaignRoutes from './routes/campaign.routes'
import { errorHandler } from './middleware/campaign.middleware'
import { logger } from './lib/logger'
import { startCampaignWorker } from './workers/campaign.worker'

const app = express()
const PORT = process.env.PORT || 3007

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(','), credentials: true }))
app.use(express.json({ limit: '10mb' }))

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'campaign-service' }))
app.use('/', campaignRoutes)
app.use(errorHandler)

app.listen(PORT, () => {
  logger.info(`campaign-service running on port ${PORT}`)
  startCampaignWorker()
  logger.info('Campaign worker started')
})

export default app
