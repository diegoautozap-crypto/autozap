import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import campaignRoutes from './routes/campaign.routes'
import followupRoutes from './routes/followup.routes'
import { errorHandler } from './middleware/campaign.middleware'
import { logger } from './lib/logger'
import { startCampaignWorker }    from './workers/campaign.worker'
import { startInboxWorker }       from './workers/inbox.worker'
import { startReconciliationJob } from './workers/reconciliation.worker'

const app = express()
const PORT = process.env.PORT || 3007

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(','), credentials: true }))
app.use(express.json({ limit: '10mb' }))

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'campaign-service' }))
app.use('/', campaignRoutes)
app.use('/', followupRoutes)
app.use(errorHandler)

app.listen(PORT, () => {
  logger.info(`campaign-service running on port ${PORT}`)
  startCampaignWorker()
  startInboxWorker()
  startReconciliationJob()
  logger.info('All workers started')
})

export default app