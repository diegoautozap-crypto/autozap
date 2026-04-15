import { db, logger, generateId, logPipelineCardEvent } from '@autozap/utils'

const MESSAGE_SERVICE_URL = process.env.MESSAGE_SERVICE_URL || 'http://localhost:3004'
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!

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

interface AutomationAction {
  type: 'send_message' | 'assign_agent' | 'add_tag' | 'move_pipeline'
  value: Record<string, any>
  delay?: number // segundos antes de executar esta ação
}

export class AutomationService {

  async processAutomations(ctx: AutomationContext): Promise<void> {
    try {
      const { data: automations } = await db
        .from('automations')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)
        .or(`channel_id.eq.${ctx.channelId},channel_id.is.null`)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (!automations || automations.length === 0) return

      for (const automation of automations) {
        const matches = await this.checkTrigger(automation, ctx)
        if (matches) {
          const canRun = await this.checkCooldown(automation, ctx)
          if (!canRun) {
            logger.info('Automation skipped — cooldown active', { automationId: automation.id, contactId: ctx.contactId })
            continue
          }
          await this.executeActions(automation, ctx)
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
        if (!ctx.isFirstMessage) return false
        const keywords: string[] = trigger_value?.keywords || []
        if (keywords.length === 0) return true
        const body = (ctx.messageBody || '').toLowerCase()
        return keywords.some(kw => body.includes(kw.toLowerCase().trim()))
      }
      case 'outside_hours': {
        const start = trigger_value?.start ?? 9
        const end = trigger_value?.end ?? 18
        const days = trigger_value?.days ?? [1, 2, 3, 4, 5]
        const now = new Date()
        const day = now.getDay()
        const hour = now.getHours()
        return !days.includes(day) || hour < start || hour >= end
      }
      default:
        return false
    }
  }

  // ─── Executa TODAS as ações em sequência ────────────────────────────────────
  private async executeActions(automation: any, ctx: AutomationContext): Promise<void> {
    // Suporta novo formato (actions[]) e legado (action_type + action_value)
    const actions: AutomationAction[] = this.resolveActions(automation)

    if (actions.length === 0) {
      logger.warn('Automation has no actions', { automationId: automation.id })
      return
    }

    logger.info('Executing automation actions', {
      automationId: automation.id,
      actionCount: actions.length,
      tenantId: ctx.tenantId,
    })

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]
      try {
        // Aplica delay desta ação específica antes de executar
        if (action.delay && action.delay > 0) {
          await new Promise(r => setTimeout(r, action.delay! * 1000))
        }
        await this.executeSingleAction(action, automation.id, ctx, i + 1, actions.length)
      } catch (err) {
        logger.error('Action failed — continuing to next', {
          automationId: automation.id,
          actionIndex: i,
          actionType: action.type,
          err,
        })
        await this.logAutomation(automation.id, ctx, 'error', `Ação ${i + 1} (${action.type}) falhou: ${String(err)}`)
        // Continua para a próxima ação mesmo em caso de erro
      }
    }
  }

  // Resolve o array de ações — novo formato ou legado
  private resolveActions(automation: any): AutomationAction[] {
    // Novo formato: campo actions[] no banco
    if (automation.actions && Array.isArray(automation.actions) && automation.actions.length > 0) {
      return automation.actions.map((a: any) => ({
        type: a.type,
        value: a.value || {},
        delay: a.delay || 0,
      }))
    }
    // Legado: action_type + action_value
    if (automation.action_type) {
      return [{
        type: automation.action_type,
        value: automation.action_value || {},
        delay: automation.action_value?.delay || 0,
      }]
    }
    return []
  }
  // ─────────────────────────────────────────────────────────────────────────────

  private async executeSingleAction(
    action: AutomationAction,
    automationId: string,
    ctx: AutomationContext,
    step: number,
    total: number,
  ): Promise<void> {
    const stepLabel = total > 1 ? ` (${step}/${total})` : ''

    switch (action.type) {
      case 'send_message': {
        const message = this.interpolate(action.value?.message || '', ctx)
        if (!message) return
        await this.sendMessage({
          tenantId: ctx.tenantId, channelId: ctx.channelId,
          contactId: ctx.contactId, conversationId: ctx.conversationId,
          to: ctx.phone, body: message,
        })
        await this.logAutomation(automationId, ctx, 'success', `Mensagem enviada${stepLabel}: ${message.slice(0, 50)}`)
        break
      }

      case 'assign_agent': {
        const userId = action.value?.userId
        const notifyMessage = action.value?.message

        if (userId) {
          await db.from('conversations').update({ assigned_to: userId }).eq('id', ctx.conversationId)
        }

        // Pausa o bot ao atribuir agente
        await db.from('conversations').update({ bot_active: false }).eq('id', ctx.conversationId)

        if (notifyMessage) {
          const message = this.interpolate(notifyMessage, ctx)
          await this.sendMessage({
            tenantId: ctx.tenantId, channelId: ctx.channelId,
            contactId: ctx.contactId, conversationId: ctx.conversationId,
            to: ctx.phone, body: message,
          })
        }

        await this.logAutomation(automationId, ctx, 'success', `Agente atribuído + bot pausado${stepLabel}`)
        break
      }

      case 'add_tag': {
        const tagId = action.value?.tagId
        if (!tagId) return
        await db.from('contact_tags').upsert(
          { contact_id: ctx.contactId, tag_id: tagId, tenant_id: ctx.tenantId },
          { onConflict: 'contact_id,tag_id', ignoreDuplicates: true },
        )
        await this.logAutomation(automationId, ctx, 'success', `Tag adicionada${stepLabel}`)
        break
      }

      case 'move_pipeline': {
        const stage = action.value?.stage
        if (!stage) return
        const { data: before } = await db.from('conversations')
          .select('pipeline_stage, pipeline_id').eq('id', ctx.conversationId).single()
        await db.from('conversations').update({ pipeline_stage: stage }).eq('id', ctx.conversationId)
        await this.logAutomation(automationId, ctx, 'success', `Movido para ${stage}${stepLabel}`)
        await logPipelineCardEvent({
          tenantId: ctx.tenantId,
          conversationId: ctx.conversationId,
          pipelineId: before?.pipeline_id || null,
          eventType: before?.pipeline_stage ? 'moved' : 'created',
          fromColumn: before?.pipeline_stage || null,
          toColumn: stage,
          metadata: { source: 'automation', automationId },
        })
        break
      }

      default:
        logger.warn('Unknown action type', { actionType: action.type })
    }
  }

  private async checkCooldown(automation: any, ctx: AutomationContext): Promise<boolean> {
    const cooldown = automation.cooldown_minutes

    if (cooldown === null || cooldown === undefined) return true
    if (cooldown === 0) {
      const { count } = await db
        .from('automation_logs')
        .select('id', { count: 'exact', head: true })
        .eq('automation_id', automation.id)
        .eq('contact_id', ctx.contactId)
        .eq('status', 'success')
      return (count || 0) === 0
    }

    const since = new Date(Date.now() - cooldown * 60 * 1000).toISOString()
    const { count } = await db
      .from('automation_logs')
      .select('id', { count: 'exact', head: true })
      .eq('automation_id', automation.id)
      .eq('contact_id', ctx.contactId)
      .eq('status', 'success')
      .gte('created_at', since)
    return (count || 0) === 0
  }

  private interpolate(template: string, ctx: AutomationContext): string {
    return template
      .replace(/\{\{phone\}\}/gi, ctx.phone)
      .replace(/\{\{telefone\}\}/gi, ctx.phone)
  }

  private async sendMessage(opts: {
    tenantId: string; channelId: string; contactId: string
    conversationId: string; to: string; body: string
  }): Promise<void> {
    const response = await fetch(`${MESSAGE_SERVICE_URL}/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({
        tenantId: opts.tenantId, channelId: opts.channelId,
        contactId: opts.contactId, conversationId: opts.conversationId,
        to: opts.to, contentType: 'text', body: opts.body,
      }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Failed to send automation message: ${JSON.stringify(err)}`)
    }
  }

  private async logAutomation(automationId: string, ctx: AutomationContext, status: 'success' | 'error', detail: string): Promise<void> {
    try {
      await db.from('automation_logs').insert({
        id: generateId(), automation_id: automationId,
        tenant_id: ctx.tenantId, contact_id: ctx.contactId,
        conversation_id: ctx.conversationId, status, detail,
      })
    } catch (err) { logger.warn('Failed to log automation', { automationId, err }) }
  }
}

export const automationService = new AutomationService()