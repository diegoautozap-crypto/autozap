import { db } from '../lib/db'
import { campaignService } from '../services/campaign.service'
import { logger } from '../lib/logger'

function getNextRecurrenceDate(type: string, from: Date): Date {
  const next = new Date(from)
  if (type === 'daily') next.setDate(next.getDate() + 1)
  else if (type === 'weekly') next.setDate(next.getDate() + 7)
  else if (type === 'monthly') next.setMonth(next.getMonth() + 1)
  return next
}

export function startSchedulerWorker() {
  const check = async () => {
    try {
      const now = new Date().toISOString()

      // 1. Campanhas agendadas prontas para disparar
      const { data: scheduled } = await db
        .from('campaigns')
        .select('id, tenant_id')
        .eq('status', 'scheduled')
        .lte('scheduled_at', now)

      for (const campaign of (scheduled || [])) {
        try {
          await campaignService.startCampaign(campaign.id, campaign.tenant_id)
          logger.info('[Scheduler] Campanha disparada', { campaignId: campaign.id })
        } catch (err: any) {
          logger.error('[Scheduler] Erro ao disparar campanha', { campaignId: campaign.id, error: err?.message })
        }
      }

      // 2. Campanhas recorrentes completadas — cria próxima execução
      const { data: recurring } = await db
        .from('campaigns')
        .select('id, tenant_id, name, channel_id, curl_template, copies, extra_channel_ids, batch_size, messages_per_min, content_type, media_url, created_by, recurrence_type, recurrence_filter, completed_at')
        .eq('status', 'completed')
        .neq('recurrence_type', 'none')
        .not('recurrence_type', 'is', null)

      for (const camp of (recurring || [])) {
        try {
          const completedAt = camp.completed_at ? new Date(camp.completed_at) : new Date()
          const nextDate = getNextRecurrenceDate(camp.recurrence_type, completedAt)

          // Só cria se a próxima data é no futuro
          if (nextDate <= new Date()) continue

          // Verifica se já criou a próxima (evita duplicatas)
          const { data: existing } = await db
            .from('campaigns')
            .select('id')
            .eq('parent_campaign_id', camp.id)
            .eq('status', 'scheduled')
            .limit(1)
          if (existing && existing.length > 0) continue

          // Cria nova campanha agendada
          const newCamp = await campaignService.createCampaign({
            tenantId: camp.tenant_id,
            channelId: camp.channel_id,
            name: `${camp.name} (recorrente)`,
            messageTemplate: ' ',
            curlTemplate: camp.curl_template,
            copies: camp.copies,
            extraChannelIds: camp.extra_channel_ids,
            batchSize: camp.batch_size,
            messagesPerMin: camp.messages_per_min,
            contentType: camp.content_type,
            mediaUrl: camp.media_url,
            scheduledAt: nextDate,
            createdBy: camp.created_by,
            recurrenceType: camp.recurrence_type,
            recurrenceFilter: camp.recurrence_filter,
            parentCampaignId: camp.id,
          })

          // Carrega contatos pelo filtro do segmento
          if (camp.recurrence_filter) {
            await campaignService.addContactsByFilter(newCamp.id, camp.tenant_id, camp.recurrence_filter)
          }

          // Marca a campanha original para não reprocessar
          await db.from('campaigns').update({ last_recurrence_at: new Date() }).eq('id', camp.id)

          logger.info('[Scheduler] Campanha recorrente criada', { parentId: camp.id, newId: newCamp.id, nextDate })
        } catch (err: any) {
          logger.error('[Scheduler] Erro ao criar recorrência', { campaignId: camp.id, error: err?.message })
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
