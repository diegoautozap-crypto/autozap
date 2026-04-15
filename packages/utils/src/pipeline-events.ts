import { db } from './db'

export type PipelineEventType = 'created' | 'moved' | 'value_changed' | 'assigned' | 'deleted'

export interface LogPipelineEventParams {
  tenantId: string
  cardId?: string | null
  conversationId?: string | null
  pipelineId?: string | null
  eventType: PipelineEventType
  fromColumn?: string | null
  toColumn?: string | null
  fromValue?: number | null
  toValue?: number | null
  fromUserId?: string | null
  toUserId?: string | null
  actorUserId?: string | null
  metadata?: Record<string, any>
}

// Grava um evento no histórico do card/conversa. Erros são swallowed
// propositalmente — o histórico é auxiliar e não deve quebrar o fluxo principal.
export async function logPipelineCardEvent(params: LogPipelineEventParams): Promise<void> {
  try {
    await db.from('pipeline_card_events').insert({
      tenant_id: params.tenantId,
      card_id: params.cardId || null,
      conversation_id: params.conversationId || null,
      pipeline_id: params.pipelineId || null,
      event_type: params.eventType,
      from_column: params.fromColumn ?? null,
      to_column: params.toColumn ?? null,
      from_value: params.fromValue ?? null,
      to_value: params.toValue ?? null,
      from_user_id: params.fromUserId || null,
      to_user_id: params.toUserId || null,
      actor_user_id: params.actorUserId || null,
      metadata: params.metadata || {},
    })
  } catch (e) {
    console.error('[pipeline_card_events] falha ao logar', e)
  }
}
