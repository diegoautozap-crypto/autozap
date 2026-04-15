import { db, logger, generateId, normalizeBRPhone, logPipelineCardEvent } from '@autozap/utils'
import { interpolate, sendMessage, cached, emitPusher } from '../helpers'
import { ensureContact, ensureConversation } from '../../contact.helper'
import type { FlowContext, FlowNodeData, FlowNodeRow, NodeResult } from '../types'

export async function handleCreateContact(
  node: FlowNodeRow, ctx: FlowContext, flowId: string, data: FlowNodeData,
  variables: Record<string, string>,
): Promise<NodeResult | null> {
  const fields = data?.fields || []
  const get = (variable: string) => interpolate(variable || '', ctx, variables).trim()

  let phone = '', name = '', email = ''
  const extraFields: Record<string, string> = {}

  for (const f of fields) {
    const val = get(f.variable)
    if (!val) continue
    if (f.contactField === 'phone') phone = val.replace(/\D/g, '')
    else if (f.contactField === 'name') name = val
    else if (f.contactField === 'email') email = val
    else if (f.label) extraFields[f.label] = val
  }

  if (!phone && !name) return null
  const finalPhone = phone ? normalizeBRPhone(phone) : `webhook_${Date.now()}`
  const metadata = Object.keys(extraFields).length > 0 ? extraFields : null

  const { contactId } = await ensureContact({
    tenantId: ctx.tenantId, phone: finalPhone, name: name || undefined,
    email: email || undefined, origin: 'webhook', metadata, mergeMetadata: true,
  })

  const { data: channel } = await cached(`channel:${ctx.channelId}`, 60_000, async () => { const r = await db.from('channels').select('credentials, type').eq('id', ctx.channelId).single(); return r })
  const { conversationId } = await ensureConversation({
    tenantId: ctx.tenantId, contactId, channelId: ctx.channelId,
    channelType: channel?.type || 'whatsapp', lastMessage: name ? `Lead: ${name}` : 'Lead via webhook',
  })

  const noteLines = ['📋 Lead criado via webhook']
  if (name) noteLines.push(`👤 Nome: ${name}`)
  if (finalPhone && !finalPhone.startsWith('webhook_')) noteLines.push(`📱 Telefone: ${finalPhone}`)
  if (email) noteLines.push(`📧 Email: ${email}`)
  for (const [label, val] of Object.entries(extraFields)) noteLines.push(`• ${label}: ${val}`)
  await db.from('conversation_notes').insert({ conversation_id: conversationId, tenant_id: ctx.tenantId, body: noteLines.join('\n') })

  ctx.contactId = contactId
  ctx.conversationId = conversationId
  if (finalPhone && !finalPhone.startsWith('webhook_')) ctx.phone = finalPhone
  emitPusher(ctx.tenantId, 'conversation.updated', { conversationId, contactId })
  return { success: true }
}

export async function handleMapFields(
  node: FlowNodeRow, ctx: FlowContext, data: FlowNodeData,
  variables: Record<string, string>,
): Promise<NodeResult | null> {
  const mappings = data?.mappings || []
  for (const m of mappings) {
    if (!m.from || !m.to) continue
    const val = interpolate(m.from, ctx, variables)
    if (val) variables[m.to] = val
  }

  const phoneVar = mappings.find((m: any) => m.to === 'telefone' || m.to === 'phone')
  if (phoneVar) {
    const newPhone = interpolate(phoneVar.from, ctx, variables).replace(/\D/g, '')
    if (newPhone && newPhone !== ctx.phone) {
      const normalized = normalizeBRPhone(newPhone)
      await db.from('contacts').update({ phone: normalized }).eq('id', ctx.contactId).eq('tenant_id', ctx.tenantId)
      ctx.phone = normalized
    }
  }

  const nameVar = mappings.find((m: any) => m.to === 'nome' || m.to === 'name')
  if (nameVar) {
    const newName = interpolate(nameVar.from, ctx, variables)
    if (newName) await db.from('contacts').update({ name: newName }).eq('id', ctx.contactId).eq('tenant_id', ctx.tenantId)
  }

  const emailVar = mappings.find((m: any) => m.to === 'email')
  if (emailVar) {
    const newEmail = interpolate(emailVar.from, ctx, variables)
    if (newEmail) await db.from('contacts').update({ email: newEmail }).eq('id', ctx.contactId).eq('tenant_id', ctx.tenantId)
  }

  return { success: true }
}

export async function handleTagContact(
  ctx: FlowContext, type: string, data: FlowNodeData,
): Promise<NodeResult> {
  const subtype = data?.subtype || (type === 'add_tag' ? 'add' : type === 'remove_tag' ? 'remove' : 'add')
  const ids = data?.tagIds || (data?.tagId ? [data.tagId] : [])
  for (const tagId of ids) {
    if (subtype === 'add') {
      await db.from('contact_tags').upsert({ contact_id: ctx.contactId, tag_id: tagId }, { onConflict: 'contact_id,tag_id' })
    } else {
      await db.from('contact_tags').delete().eq('contact_id', ctx.contactId).eq('tag_id', tagId)
    }
  }
  return { success: true }
}

export async function handleUpdateContact(
  ctx: FlowContext, data: FlowNodeData, variables: Record<string, string>,
): Promise<NodeResult | null> {
  const fields: { field: string; customField?: string; value: string }[] = data?.updateFields ||
    (data?.field ? [{ field: data.field, customField: data.customField, value: data.value || '' }] : [])
  if (fields.length === 0) return null

  const updateData: Record<string, unknown> = {}
  const { data: contact } = await db.from('contacts').select('metadata').eq('id', ctx.contactId).eq('tenant_id', ctx.tenantId).single()
  const metadata: Record<string, string> = contact?.metadata || {}
  let metadataChanged = false

  for (const f of fields) {
    const val = interpolate(f.value || '', ctx, variables)
    if (!val) continue
    if (f.field === 'name') updateData.name = val
    else if (f.field === 'phone') updateData.phone = val
    else if (f.field === 'email') updateData.email = val
    else if (f.field === 'custom' && f.customField) { metadata[f.customField] = val; metadataChanged = true }
  }
  if (metadataChanged) updateData.metadata = metadata
  if (Object.keys(updateData).length > 0) await db.from('contacts').update(updateData).eq('id', ctx.contactId).eq('tenant_id', ctx.tenantId)
  return { success: true }
}

export async function handleMovePipeline(
  ctx: FlowContext, data: FlowNodeData,
): Promise<NodeResult | null> {
  const stage = data?.stage
  if (!stage) return null
  const pipelineId = data?.pipelineId || null
  const { data: before } = await db.from('conversations')
    .select('pipeline_stage, pipeline_id').eq('id', ctx.conversationId).single()
  await db.from('conversations').update({ pipeline_stage: stage, pipeline_id: pipelineId }).eq('id', ctx.conversationId)
  emitPusher(ctx.tenantId, 'conversation.updated', { conversationId: ctx.conversationId, pipelineStage: stage, pipelineId })
  await logPipelineCardEvent({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    pipelineId: pipelineId || before?.pipeline_id || null,
    eventType: before?.pipeline_stage ? 'moved' : 'created',
    fromColumn: before?.pipeline_stage || null,
    toColumn: stage,
    metadata: { source: 'flow' },
  })
  return { success: true }
}

export async function handleAssignAgent(
  ctx: FlowContext, data: FlowNodeData, variables: Record<string, string>,
): Promise<NodeResult> {
  if (data?.message) await sendMessage({ tenantId: ctx.tenantId, channelId: ctx.channelId, contactId: ctx.contactId, conversationId: ctx.conversationId, to: ctx.phone, contentType: 'text', body: interpolate(data.message, ctx, variables) })
  const update: any = { bot_active: false }
  if (data?.agentId === 'round_robin') {
    const { data: agents } = await db.from('users').select('id').eq('tenant_id', ctx.tenantId).eq('status', 'active')
    if (agents?.length) {
      const counts = await Promise.all(agents.map(async (a: any) => {
        const { count } = await db.from('conversations').select('id', { count: 'exact', head: true }).eq('assigned_to', a.id).eq('status', 'open')
        return { id: a.id, count: count || 0 }
      }))
      counts.sort((a: any, b: any) => a.count - b.count)
      update.assigned_to = counts[0].id
    }
  } else if (data?.agentId) {
    update.assigned_to = data.agentId
  }
  await db.from('conversations').update(update).eq('id', ctx.conversationId)
  return { success: true }
}

export async function handleCreateTask(
  ctx: FlowContext, flowId: string, data: FlowNodeData, variables: Record<string, string>,
): Promise<NodeResult> {
  const title = interpolate(data?.taskTitle || 'Tarefa do flow', ctx, variables)
  const dueDate = data?.taskDueHours ? new Date(Date.now() + data.taskDueHours * 3600000).toISOString() : null
  await db.from('tasks').insert({
    id: generateId(), tenant_id: ctx.tenantId, conversation_id: ctx.conversationId,
    contact_id: ctx.contactId, assigned_to: data?.taskAssignTo || null, created_by: null,
    title, due_date: dueDate, status: 'pending', priority: 'medium',
  })
  logger.info('Task created by flow', { flowId, title })
  return { success: true }
}

export async function handleSendNotification(
  ctx: FlowContext, data: FlowNodeData, variables: Record<string, string>,
): Promise<NodeResult> {
  const notifMsg = interpolate(data?.notificationMessage || 'Notificação do flow', ctx, variables)
  const { data: contactInfo } = await db.from('contacts').select('name, phone').eq('id', ctx.contactId).single()
  const fullMsg = `📢 ${notifMsg}\n\n👤 ${contactInfo?.name || 'Contato'} (${contactInfo?.phone || ctx.phone})`

  await db.from('messages').insert({
    id: generateId(), tenant_id: ctx.tenantId, conversation_id: ctx.conversationId,
    contact_id: ctx.contactId, direction: 'internal', content_type: 'text',
    body: fullMsg, status: 'delivered',
  })

  emitPusher(ctx.tenantId, 'flow.notification', {
    conversationId: ctx.conversationId, contactName: contactInfo?.name || ctx.phone,
    message: notifMsg, agentId: data?.notifyAgentId || null,
  })
  return { success: true }
}
