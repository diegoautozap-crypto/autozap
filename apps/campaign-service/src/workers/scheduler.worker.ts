import { db } from '../lib/db'
import { campaignService } from '../services/campaign.service'
import { logger } from '../lib/logger'

// Verifica a cada 60 segundos se tem campanha agendada para disparar
export function startSchedulerWorker() {
  const check = async () => {
    try {
      const now = new Date().toISOString()

      const { data: campaigns } = await db
        .from('campaigns')
        .select('id, tenant_id')
        .eq('status', 'scheduled')
        .lte('scheduled_at', now)

      if (!campaigns || campaigns.length === 0) return

      for (const campaign of campaigns) {
        try {
          // startCampaign já enfileira no tenant queue
          await campaignService.startCampaign(campaign.id, campaign.tenant_id)
          logger.info('[Scheduler] Campanha disparada', { campaignId: campaign.id })
        } catch (err: any) {
          logger.error('[Scheduler] Erro ao disparar campanha', { campaignId: campaign.id, error: err?.message })
        }
      }
    } catch (err: any) {
      logger.error('[Scheduler] Erro no worker', { error: err?.message })
    }
  }

  check()
  setInterval(check, 60 * 1000)
  logger.info('[Scheduler] Worker de agendamento iniciado')
}
