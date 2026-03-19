import { Worker, Queue } from 'bullmq'
import { logger } from '../lib/logger'
import { campaignService } from '../services/campaign.service'
import { sleep, generateId } from '@autozap/utils'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../lib/db'

const REDIS_URL = process.env.REDIS_URL!
const PUSHER_APP_ID = process.env.PUSHER_APP_ID
const PUSHER_KEY = process.env.PUSHER_KEY
const PUSHER_SECRET = process.env.PUSHER_SECRET
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER || 'mt1'

const PARALLEL_BATCH = 5
const BATCH_DELAY_MS = 0

function getRedisConnection() {
  try {
    const url = new URL(REDIS_URL)
    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
      username: url.username || undefined,
      tls: url.protocol === 'rediss:' ? {} : undefined,
    }
  } catch {
    return { host: 'localhost', port: 6379 }
  }
}

const connection = getRedisConnection()

export interface CampaignJob {
  campaignId: string
  tenantId: string
  channelId: string
  batchSize: number
  messagesPerMin: number
}

export const campaignQueue = new Queue<CampaignJob>('campaign_queue', {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
})

async function checkPlanLimit(tenantId: string): Promise<boolean> {
  try {
    const { data } = await db.rpc('tenant_can_send', { p_tenant_id: tenantId, p_count: 1 })
    return !!data
  } catch {
    return true
  }
}

async function ensureContactAndConversation(
  tenantId: string,
  channelId: string,
  phone: string,
): Promise<{ contactId: string; conversationId: string }> {
  phone = phone.replace(/^\+/, '')

  let contactId: string
  const { data: existingContact } = await db
    .from('contacts').select('id')
    .eq('tenant_id', tenantId).eq('phone', phone).maybeSingle()

  if (existingContact) {
    contactId = existingContact.id
  } else {
    const { data: newContact } = await db.from('contacts').insert({
      id: generateId(),
      tenant_id: tenantId,
      phone,
      name: phone,
      origin: 'campaign',
      status: 'active',
    }).select('id').single()
    contactId = newContact!.id
  }

  let conversationId: string
  const { data: existingConv } = await db
    .from('conversations').select('id')
    .eq('tenant_id', tenantId).eq('contact_id', contactId)
    .eq('channel_id', channelId).maybeSingle()

  if (existingConv) {
    conversationId = existingConv.id
  } else {
    const { data: newConv } = await db.from('conversations').insert({
      id: generateId(),
      tenant_id: tenantId,
      contact_id: contactId,
      channel_id: channelId,
      channel_type: 'gupshup',
      status: 'open',
      pipeline_stage: 'lead',
      last_message_at: new Date(),
    }).select('id').single()
    conversationId = newConv!.id
  }

  return { contactId, conversationId }
}

interface ParsedCurl {
  apiKey: string
  bodyTemplate: string
}

function parseCurlTemplate(curlTemplate: string): ParsedCurl {
  const curlStr = curlTemplate
    .split('\n')
    .map(line => line.trimEnd().replace(/\\$/, ''))
    .join(' ')
    .trim()

  const apiKeyMatch = curlStr.match(/apikey:\s*([^\s"'\\]+)/)
  const apiKey = apiKeyMatch?.[1] || ''

  const singleQuoteMatch = curlStr.match(/-d\s+'([^']+)'/)
  let bodyRaw = ''
  if (singleQuoteMatch) {
    bodyRaw = singleQuoteMatch[1]
  } else {
    const doubleQuoteMatch = curlStr.match(/-d\s+"((?:[^"\\]|\\.)*)"/)
    if (doubleQuoteMatch) {
      bodyRaw = doubleQuoteMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
  }

  const bodyTemplate = bodyRaw
    .replace(/%7B%7Bdestination_phone_number%7D%7D/gi, '__PHONE__')
    .replace(/\{\{destination_phone_number\}\}/gi, '__PHONE__')

  logger.info('Curl parsed', { apiKey: apiKey.slice(0, 8) + '...' })
  return { apiKey, bodyTemplate }
}

async function sendViaFetch(
  parsed: ParsedCurl,
  phone: string,
  message: string,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    let body = parsed.bodyTemplate.replace('__PHONE__', encodeURIComponent(phone))

    if (message) {
      const templateMatch = body.match(/template=([^&]*)/)
      if (templateMatch) {
        try {
          const templateObj = JSON.parse(decodeURIComponent(templateMatch[1]))
          templateObj.params = [message]
          const newTemplateEncoded = encodeURIComponent(JSON.stringify(templateObj))
          body = body.replace(/template=[^&]*/, 'template=' + newTemplateEncoded)
        } catch (e) {
          logger.warn('Failed to replace template params', { error: (e as any).message })
        }
      }
    }

    const response = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
      method: 'POST',
      headers: {
        'apikey': parsed.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body,
    })

    const data = await response.json() as any
    logger.debug('Gupshup response', { phone, status: data.status, messageId: data.messageId })

    if (data.status === 'error') return { ok: false, error: JSON.stringify(data.message) }
    if (data.status === 'submitted' || data.messageId || data.status === 'success') {
      return { ok: true, messageId: data.messageId || data.id || undefined }
    }
    return { ok: false, error: JSON.stringify(data) }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

async function processContact(
  contact: any,
  campaignId: string,
  tenantId: string,
  channelId: string,
  parsed: ParsedCurl,
): Promise<'sent' | 'failed'> {
  try {
    const rawMessage = contact.variables?.mensagem || contact.variables?.copy || ''
    const contactMessage = rawMessage
      .replace(/\\r\\n/g, '\r')
      .replace(/\\r/g, '\r')
      .replace(/\\n/g, '\n')
      .trim()

    const messageUuid = uuidv4()
    const bodyForDb = contactMessage.replace(/\r/g, '\n')

    // ✅ PASSO 1: Garante contato e conversa ANTES de enviar
    const { contactId, conversationId } = await ensureContactAndConversation(
      tenantId, channelId, contact.phone
    )

    // ✅ PASSO 2: Salva mensagem no banco com status 'queued' e sem external_id ainda
    const messageId = generateId()
    await db.from('messages').insert({
      id: messageId,
      message_uuid: messageUuid,
      tenant_id: tenantId,
      conversation_id: conversationId,
      channel_id: channelId,
      contact_id: contactId,
      direction: 'outbound',
      content_type: 'text',
      body: bodyForDb || '(template)',
      status: 'queued',
      campaign_id: campaignId,
      external_id: null,
    })

    // ✅ PASSO 3: Envia para o Gupshup
    const result = await sendViaFetch(parsed, contact.phone, contactMessage)

    if (result.ok) {
      // ✅ PASSO 4: Atualiza external_id e status imediatamente após envio bem sucedido
      await db.from('messages').update({
        status: 'sent',
        external_id: result.messageId || null,
        sent_at: new Date(),
      }).eq('id', messageId)

      await db.from('conversations').update({
        last_message: bodyForDb || '(template)',
        last_message_at: new Date(),
      }).eq('id', conversationId)

      await campaignService.markContactSent(contact.id, messageUuid)
      await campaignService.incrementCounter(campaignId, 'sent_count')
      try { await db.rpc('increment_message_count', { p_tenant_id: tenantId }) } catch {}
      return 'sent'
    } else {
      // Falhou — atualiza status da mensagem para failed
      await db.from('messages').update({
        status: 'failed',
        error_message: result.error || 'Gupshup error',
      }).eq('id', messageId)
      throw new Error(result.error || 'Gupshup error')
    }
  } catch (err: any) {
    await campaignService.markContactFailed(contact.id, err.message)
    await campaignService.incrementCounter(campaignId, 'failed_count')
    logger.warn('Campaign contact failed', { campaignId, phone: contact.phone, error: err.message })
    return 'failed'
  }
}

export function startCampaignWorker(): Worker {
  const worker = new Worker<CampaignJob>(
    'campaign_queue',
    async (job) => {
      const { campaignId, tenantId, channelId, batchSize } = job.data
      logger.info('Campaign worker started', { campaignId })

      const canStart = await checkPlanLimit(tenantId)
      if (!canStart) {
        await db.from('campaigns').update({ status: 'failed' }).eq('id', campaignId)
        logger.warn('Campaign blocked — plan limit reached', { campaignId, tenantId })
        return
      }

      const campaign = await campaignService.getCampaign(campaignId, tenantId)
      const curlTemplate = (campaign as any).curl_template
      if (!curlTemplate) throw new Error('No curl template configured')
      const parsed = parseCurlTemplate(curlTemplate)

      let processed = 0

      while (true) {
        const progress = await campaignService.getProgress(campaignId, tenantId)
        if (progress.status !== 'running') {
          logger.info('Campaign stopped', { campaignId, status: progress.status })
          break
        }

        const contacts = await campaignService.getPendingContacts(campaignId, batchSize)
        if (contacts.length === 0) {
          logger.info('No more pending contacts', { campaignId })
          break
        }

        for (let i = 0; i < contacts.length; i += PARALLEL_BATCH) {
          const check = await campaignService.getProgress(campaignId, tenantId)
          if (check.status !== 'running') break

          if (processed > 0 && processed % 50 === 0) {
            const canContinue = await checkPlanLimit(tenantId)
            if (!canContinue) {
              await db.from('campaigns').update({ status: 'paused' }).eq('id', campaignId)
              logger.warn('Campaign paused — plan limit reached', { campaignId, tenantId, processed })
              break
            }
          }

          const chunk = contacts.slice(i, i + PARALLEL_BATCH)
          const results = await Promise.all(
            chunk.map(contact => processContact(contact, campaignId, tenantId, channelId, parsed))
          )

          const sentCount = results.filter(r => r === 'sent').length
          processed += sentCount

          await emitProgress(campaignId, tenantId)
          logger.info('Batch dispatched', { campaignId, sent: sentCount, totalProcessed: processed })

          if (BATCH_DELAY_MS > 0 && i + PARALLEL_BATCH < contacts.length) {
            await sleep(BATCH_DELAY_MS)
          }
        }
      }

      await campaignService.checkCompletion(campaignId)
      logger.info('Campaign worker finished', { campaignId, processed })
    },
    { connection, concurrency: 1 },
  )

  worker.on('failed', (job, err) => {
    logger.error('Campaign job failed', { jobId: job?.id, error: err.message })
  })

  logger.info('Campaign worker started')
  return worker
}

async function emitProgress(campaignId: string, tenantId: string): Promise<void> {
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET) return
  try {
    const progress = await campaignService.getProgress(campaignId, tenantId)
    const body = JSON.stringify({
      name: 'campaign.progress',
      channel: `tenant-${tenantId}`,
      data: JSON.stringify({ campaignId, ...progress }),
    })
    const crypto = await import('crypto')
    const timestamp = Math.floor(Date.now() / 1000)
    const md5Body = crypto.createHash('md5').update(body).digest('hex')
    const stringToSign = `POST\n/apps/${PUSHER_APP_ID}/events\nauth_key=${PUSHER_KEY}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${md5Body}`
    const signature = crypto.createHmac('sha256', PUSHER_SECRET).update(stringToSign).digest('hex')
    await fetch(
      `https://api-${PUSHER_CLUSTER}.pusher.com/apps/${PUSHER_APP_ID}/events?auth_key=${PUSHER_KEY}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${md5Body}&auth_signature=${signature}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
    )
  } catch (err) {
    logger.error('Failed to emit Pusher event', { err })
  }
}
