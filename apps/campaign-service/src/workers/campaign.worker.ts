import { Worker, Queue } from 'bullmq'
import pLimit from 'p-limit'
import { logger } from '../lib/logger'
import { campaignService } from '../services/campaign.service'
import { sleep, generateId } from '@autozap/utils'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../lib/db'

const REDIS_URL      = process.env.REDIS_URL!
const PUSHER_APP_ID  = process.env.PUSHER_APP_ID
const PUSHER_KEY     = process.env.PUSHER_KEY
const PUSHER_SECRET  = process.env.PUSHER_SECRET
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER || 'mt1'

const LOGICAL_BATCH = 50   // contatos por slice
const CONCURRENCY   = 10   // máx simultâneos reais (p-limit)
const MESSAGE_ID_RETRIES = 2  // retries se messageId não vier

function getRedisConnection() {
  try {
    const url = new URL(REDIS_URL)
    return {
      host: url.hostname, port: Number(url.port) || 6379,
      password: url.password || undefined, username: url.username || undefined,
      tls: url.protocol === 'rediss:' ? {} : undefined,
    }
  } catch { return { host: 'localhost', port: 6379 } }
}

const connection = getRedisConnection()

export interface InboxJob {
  tenantId: string; channelId: string; phone: string
  messageDbId: string; body: string; campaignId: string
}

export const inboxQueue = new Queue<InboxJob>('inbox_queue', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail:    { count: 500 },
  },
})

export interface CampaignJob {
  campaignId: string; tenantId: string; channelId: string
  batchSize: number; messagesPerMin: number
}

export const campaignQueue = new Queue<CampaignJob>('campaign_queue', {
  connection,
  defaultJobOptions: { attempts: 1, removeOnComplete: { count: 100 }, removeOnFail: { count: 500 } },
})

async function checkPlanLimit(tenantId: string): Promise<boolean> {
  try {
    const { data } = await db.rpc('tenant_can_send', { p_tenant_id: tenantId, p_count: 1 })
    return !!data
  } catch { return true }
}

interface ParsedCurl { apiKey: string; bodyTemplate: string; messagesPerMin?: number }

function parseCurlTemplate(curlTemplate: string): ParsedCurl {
  const curlStr = curlTemplate.split('\n').map(l => l.trimEnd().replace(/\\$/, '')).join(' ').trim()
  const apiKey = curlStr.match(/apikey:\s*([^\s"'\\]+)/)?.[1] || ''
  const singleQ = curlStr.match(/-d\s+'([^']+)'/)
  let bodyRaw = ''
  if (singleQ) { bodyRaw = singleQ[1] } else {
    const dq = curlStr.match(/-d\s+"((?:[^"\\]|\\.)*)"/)
    if (dq) bodyRaw = dq[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  const bodyTemplate = bodyRaw
    .replace(/%7B%7Bdestination_phone_number%7D%7D/gi, '__PHONE__')
    .replace(/\{\{destination_phone_number\}\}/gi, '__PHONE__')
  logger.info('Curl parsed', { apiKey: apiKey.slice(0, 8) + '...' })
  return { apiKey, bodyTemplate }
}

// ─── Envia via Gupshup com retry para messageId ausente ──────────────────────
async function sendViaFetch(
  parsed: ParsedCurl,
  phone: string,
  message: string,
  attempt = 0,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    let body = parsed.bodyTemplate.replace('__PHONE__', encodeURIComponent(phone))
    if (message) {
      const tm = body.match(/template=([^&]*)/)
      if (tm) {
        try {
          const obj = JSON.parse(decodeURIComponent(tm[1]))
          obj.params = [message]
          body = body.replace(/template=[^&]*/, 'template=' + encodeURIComponent(JSON.stringify(obj)))
        } catch (e) { logger.warn('Failed to replace template params', { error: (e as any).message }) }
      }
    }

    const response = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
      method: 'POST',
      headers: { 'apikey': parsed.apiKey, 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body,
    })

    const data = await response.json() as any

    logger.info('Gupshup send response', {
      phone, status: data.status, messageId: data.messageId,
      attempt, fullResponse: JSON.stringify(data).slice(0, 500),
    })

    if (data.status === 'error') return { ok: false, error: JSON.stringify(data.message) }

    if (data.status === 'submitted' || data.messageId || data.status === 'success') {
      // ✅ Se messageId ausente, tenta mais 2x antes de falhar
      if (!data.messageId) {
        if (attempt < MESSAGE_ID_RETRIES) {
          logger.warn('Gupshup response missing messageId — retrying', { phone, attempt: attempt + 1 })
          await sleep(1000)
          return sendViaFetch(parsed, phone, message, attempt + 1)
        }
        logger.warn('Gupshup response missing messageId after retries — marking failed', { phone })
        return { ok: false, error: 'Gupshup did not return messageId after retries' }
      }
      return { ok: true, messageId: data.messageId || data.id }
    }

    return { ok: false, error: JSON.stringify(data) }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

// ─── Processa um contato ──────────────────────────────────────────────────────
async function processContact(
  contact: any,
  campaignId: string,
  tenantId: string,
  channelId: string,
  parsed: ParsedCurl,
): Promise<'sent' | 'failed'> {
  const rawMessage = contact.variables?.mensagem || contact.variables?.copy || ''
  const contactMessage = rawMessage.replace(/\\r\\n/g, '\r').replace(/\\r/g, '\r').replace(/\\n/g, '\n').trim()
  const bodyForDb   = contactMessage.replace(/\r/g, '\n')
  const messageUuid = uuidv4()
  const messageDbId = generateId()

  try {
    // PASSO 1: Envia para Gupshup (com retry para messageId)
    const result = await sendViaFetch(parsed, contact.phone, contactMessage)

    if (!result.ok || !result.messageId) {
      logger.error('Send failed or missing messageId', { phone: contact.phone, error: result.error })
      await campaignService.markContactFailed(contact.id, result.error || 'Missing messageId')
      await campaignService.incrementCounter(campaignId, 'failed_count')
      return 'failed'
    }

    // PASSO 2: Persiste IMEDIATAMENTE — usa upsert para segurança em retry
    const { error: upsertError } = await db.from('messages').upsert({
      id:           messageDbId,
      message_uuid: messageUuid,
      tenant_id:    tenantId,
      channel_id:   channelId,
      direction:    'outbound',
      content_type: 'text',
      body:         bodyForDb || '(template)',
      status:       'sent',
      sent_at:      new Date(),
      campaign_id:  campaignId,
      external_id:  result.messageId, // ✅ sempre presente aqui
    }, { onConflict: 'external_id' }) // ✅ retry não duplica

    if (upsertError) {
      logger.error('Failed to persist message', { phone: contact.phone, messageId: result.messageId, error: upsertError.message })
      await campaignService.markContactFailed(contact.id, `DB error: ${upsertError.message}`)
      await campaignService.incrementCounter(campaignId, 'failed_count')
      return 'failed'
    }

    logger.info('Message persisted', { phone: contact.phone, messageDbId, externalId: result.messageId })

    // PASSO 3: Inbox assíncrono via BullMQ
    inboxQueue.add('create-inbox', {
      tenantId, channelId,
      phone:       contact.phone.replace(/^\+/, ''),
      messageDbId, body: bodyForDb || '(template)', campaignId,
    }).catch(err => logger.warn('Failed to enqueue inbox job', { phone: contact.phone, err: err.message }))

    // PASSO 4: Contadores
    await campaignService.markContactSent(contact.id, messageUuid)
    await campaignService.incrementCounter(campaignId, 'sent_count')
    try { await db.rpc('increment_message_count', { p_tenant_id: tenantId }) } catch {}

    return 'sent'

  } catch (err: any) {
    logger.error('processContact error', { phone: contact.phone, error: err.message })
    await campaignService.markContactFailed(contact.id, err.message)
    await campaignService.incrementCounter(campaignId, 'failed_count')
    return 'failed'
  }
}

// ─── Worker principal ─────────────────────────────────────────────────────────
export function startCampaignWorker(): Worker {
  const worker = new Worker<CampaignJob>('campaign_queue', async (job) => {
    const { campaignId, tenantId, channelId, batchSize, messagesPerMin } = job.data
    logger.info('Campaign worker started', { campaignId, messagesPerMin })

    if (!await checkPlanLimit(tenantId)) {
      await db.from('campaigns').update({ status: 'failed' }).eq('id', campaignId)
      logger.warn('Campaign blocked — plan limit reached', { campaignId })
      return
    }

    const campaign = await campaignService.getCampaign(campaignId, tenantId)
    const curlTemplate = (campaign as any).curl_template
    if (!curlTemplate) throw new Error('No curl template configured')
    const parsed = parseCurlTemplate(curlTemplate)

    // ✅ Rate limit: calcula delay entre mensagens baseado em messagesPerMin
    const delayPerMessage = messagesPerMin > 0 ? Math.floor(60000 / messagesPerMin) : 0
    logger.info('Rate limit configured', { messagesPerMin, delayPerMessageMs: delayPerMessage })

    const limit = pLimit(CONCURRENCY) // controla concorrência real
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

      for (let i = 0; i < contacts.length; i += LOGICAL_BATCH) {
        const check = await campaignService.getProgress(campaignId, tenantId)
        if (check.status !== 'running') break

        if (processed > 0 && processed % 50 === 0) {
          if (!await checkPlanLimit(tenantId)) {
            await db.from('campaigns').update({ status: 'paused' }).eq('id', campaignId)
            logger.warn('Campaign paused — plan limit', { campaignId, processed })
            break
          }
        }

        const chunk = contacts.slice(i, i + LOGICAL_BATCH)

        // ✅ p-limit controla concorrência + delay por mensagem para rate limit
        const results = await Promise.all(
          chunk.map((contact, idx) =>
            limit(async () => {
              // ✅ Rate limit: distribui delay entre mensagens do batch
              if (delayPerMessage > 0 && idx > 0) {
                await sleep(delayPerMessage)
              }
              return processContact(contact, campaignId, tenantId, channelId, parsed)
            })
          )
        )

        const sentCount = results.filter(r => r === 'sent').length
        processed += sentCount

        await emitProgress(campaignId, tenantId)
        logger.info('Batch dispatched', { campaignId, sent: sentCount, failed: chunk.length - sentCount, totalProcessed: processed })
      }
    }

    await campaignService.checkCompletion(campaignId)
    logger.info('Campaign worker finished', { campaignId, processed })
  }, { connection, concurrency: 1 })

  worker.on('failed', (job, err) => logger.error('Campaign job failed', { jobId: job?.id, error: err.message }))
  logger.info('Campaign worker initialized')
  return worker
}

async function emitProgress(campaignId: string, tenantId: string): Promise<void> {
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET) return
  try {
    const progress = await campaignService.getProgress(campaignId, tenantId)
    const body = JSON.stringify({ name: 'campaign.progress', channel: `tenant-${tenantId}`, data: JSON.stringify({ campaignId, ...progress }) })
    const crypto = await import('crypto')
    const ts  = Math.floor(Date.now() / 1000)
    const md5 = crypto.createHash('md5').update(body).digest('hex')
    const sig = crypto.createHmac('sha256', PUSHER_SECRET).update(`POST\n/apps/${PUSHER_APP_ID}/events\nauth_key=${PUSHER_KEY}&auth_timestamp=${ts}&auth_version=1.0&body_md5=${md5}`).digest('hex')
    await fetch(`https://api-${PUSHER_CLUSTER}.pusher.com/apps/${PUSHER_APP_ID}/events?auth_key=${PUSHER_KEY}&auth_timestamp=${ts}&auth_version=1.0&body_md5=${md5}&auth_signature=${sig}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  } catch (err) { logger.error('Failed to emit Pusher event', { err }) }
}
