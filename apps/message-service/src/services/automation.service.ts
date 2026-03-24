import { db } from '../lib/db'
import { logger } from '../lib/logger'
import { generateId } from '@autozap/utils'

const MESSAGE_SERVICE_URL = process.env.MESSAGE_SERVICE_URL || 'http://localhost:3004'
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'autozap_internal'
const CHANNEL_SERVICE_URL = process.env.CHANNEL_SERVICE_URL || 'http://localhost:3003'

interface AutomationContext {
  tenantId: string
  channelId: string
  contactId: string
  conversationId: string
  phone: string
  messageBody: string
  isFirstMessage: boolean
  hour: number
}

export class AutomationService {

  async processAutomations(ctx: AutomationContext): Promise<void> {
    try {
      // Busca automações ativas do tenant para esse canal (ou globais sem canal)
      const { data: automations } = await db
        .from('automations')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)
        .or(`channel_id.eq.${ctx.channelId},channel_id.is.null`)
        .order('created_at', { ascending: true })

      if (!automations || automations.length === 0) return

      for (const automation of automations) {
        const matches = await this.checkTrigger(automation, ctx)
        if (matches) {
          await this.executeAction(automation, ctx)
          // Só executa a primeira automação que bater — evita spam
          break
        }
      }
    } catch (err) {
      logger.error('Automation processing error', { err, tenantId: ctx.tenantId })
    }
  }

  private async checkTrigger(automation: any, ctx: AutomationContext): Promise<boolean> {
    const { trigger_type, trigger_value } = automation

    switch (trigger_type) {
      case 'keyword': {
        const keywords: string[] = trigger_value?.keywords || []
        const body = (ctx.messageBody || '').toLowerCase()
        return keywords.some(kw => body.includes(kw.toLowerCase().trim()))
      }

      case 'first_message': {
        return ctx.isFirstMessage
      }

      case 'outside_hours': {
        const start = trigger_value?.start ?? 9
        const end = trigger_value?.end ?? 18
        const days = trigger_value?.days ?? [1, 2, 3, 4, 5] // seg-sex
        const now = new Date()
        const day = now.getDay()
        const hour = now.getHours()
        const isOutside = !days.includes(day) || hour < start || hour >= end
        return isOutside
      }

      default:
        return false
    }
  }

  private async executeAction(automation: any, ctx: AutomationContext): Promise<void> {
    const { action_type, action_value } = automation

    logger.info('Executing automation', {
      automationId: automation.id,
      actionType: action_type,
      tenantId: ctx.tenantId,
    })

    switch (action_type) {
      case 'send_message': {
        const message = this.interpolate(action_value?.message || '', ctx)
        if (!message) return

        const delay = action_value?.delay || 0
        if (delay > 0) await new Promise(r => setTimeout(r, delay * 1000))

        await this.sendMessage({
          tenantId: ctx.tenantId,
          channelId: ctx.channelId,
          contactId: ctx.contactId,
          conversationId: ctx.conversationId,
          to: ctx.phone,
          body: message,
        })

        await this.logAutomation(automation.id, ctx, 'success', `Mensagem enviada: ${message.slice(0, 50)}`)
        break
      }

      case 'assign_agent': {
        const userId = action_value?.userId
        if (!userId) return
        await db.from('conversations')
          .update({ assigned_to: userId })
          .eq('id', ctx.conversationId)
        await this.logAutomation(automation.id, ctx, 'success', `Atribuído ao agente ${userId}`)
        break
      }

      case 'add_tag': {
        const tagId = action_value?.tagId
        if (!tagId) return
        await db.from('contact_tags').upsert({
          contact_id: ctx.contactId,
          tag_id: tagId,
          tenant_id: ctx.tenantId,
        }, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true })
        await this.logAutomation(automation.id, ctx, 'success', `Tag adicionada`)
        break
      }

      case 'move_pipeline': {
        const stage = action_value?.stage
        if (!stage) return
        await db.from('conversations')
          .update({ pipeline_stage: stage })
          .eq('id', ctx.conversationId)
        await this.logAutomation(automation.id, ctx, 'success', `Movido para ${stage}`)
        break
      }

      default:
        logger.warn('Unknown action type', { actionType: action_type })
    }
  }

  private interpolate(template: string, ctx: AutomationContext): string {
    return template
      .replace(/\{\{phone\}\}/gi, ctx.phone)
      .replace(/\{\{telefone\}\}/gi, ctx.phone)
  }

  private async sendMessage(opts: {
    tenantId: string
    channelId: string
    contactId: string
    conversationId: string
    to: string
    body: string
  }): Promise<void> {
    const response = await fetch(`${MESSAGE_SERVICE_URL}/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({
        tenantId: opts.tenantId,
        channelId: opts.channelId,
        contactId: opts.contactId,
        conversationId: opts.conversationId,
        to: opts.to,
        contentType: 'text',
        body: opts.body,
      }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Failed to send automation message: ${JSON.stringify(err)}`)
    }
  }

  private async logAutomation(
    automationId: string,
    ctx: AutomationContext,
    status: 'success' | 'error',
    detail: string,
  ): Promise<void> {
    try {
      await db.from('automation_logs').insert({
        id: generateId(),
        automation_id: automationId,
        tenant_id: ctx.tenantId,
        contact_id: ctx.contactId,
        conversation_id: ctx.conversationId,
        status,
        detail,
      })
    } catch {
      // logs são não-críticos
    }
  }
}

export const automationService = new AutomationService()
