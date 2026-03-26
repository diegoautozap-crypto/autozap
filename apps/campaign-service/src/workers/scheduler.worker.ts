import { db } from '../lib/db'
import { campaignService } from '../services/campaign.service'
import { campaignQueue } from './campaign.worker'

// Verifica a cada 60 segundos se tem campanha agendada para disparar
export function startSchedulerWorker() {
  const check = async () => {
    try {
      const now = new Date().toISOString()

      // Busca campanhas com scheduled_at <= agora e status = 'scheduled'
      const { data: campaigns } = await db
        .from('campaigns')
        .select('id, tenant_id, channel_id, batch_size, messages_per_min')
        .eq('status', 'scheduled')
        .lte('scheduled_at', now)

      if (!campaigns || campaigns.length === 0) return

      for (const campaign of campaigns) {
        try {
          const started = await campaignService.startCampaign(campaign.id, campaign.tenant_id)
          await campaignQueue.add('run', {
            campaignId: started.id,
            tenantId: campaign.tenant_id,
            channelId: campaign.channel_id,
            batchSize: campaign.batch_size,
            messagesPerMin: campaign.messages_per_min,
          })
          console.log(`[Scheduler] Campanha ${campaign.id} disparada automaticamente`)
        } catch (err) {
          console.error(`[Scheduler] Erro ao disparar campanha ${campaign.id}:`, err)
        }
      }
    } catch (err) {
      console.error('[Scheduler] Erro no worker:', err)
    }
  }

  // Executa imediatamente e depois a cada 60s
  check()
  setInterval(check, 60 * 1000)
  console.log('[Scheduler] Worker de agendamento iniciado')
}
