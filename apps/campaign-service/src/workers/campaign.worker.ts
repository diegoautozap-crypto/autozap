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

const DELAY_BETWEEN_MESSAGES_MS = 0
const PARALLEL_FETCHES = 5
const PARALLEL_CRM = 5

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

interface ParsedCurl {
  apiKey: string
  source: string
  srcName: string
  templateId: string
  channel: string
}

// ─── Fila controlada de CRM ───────────────────────────────────────────────────
// Processa PARALLEL_CRM itens por vez
class CrmQueue {
  private queue: (() => Promise<void>)[] = []
  private running = false

  add(fn: () => Promise<void>) {
    this.queue.push(fn)
    if (!this.running) this.process()
  }

  private async process() {
    this.running = true
    while (this.queue.length > 0) {
      // Pega PARALLEL_CRM itens e processa em paralelo
      const batch = this.queue.splice(0, PARALLEL_CRM)
      await Promise.all(batch.map(fn => fn().catch(() => {})))
    }
    this.running = false
  }
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

  const params = new URLSearchParams(bodyRaw)
  const source = params.get('source') || ''
  const srcName = params.get('src.name') || ''
  const channel = params.get('channel') || 'whatsapp'

  const templateParam = params.get('template') || ''
  let templateId = ''
  try {
    templateId = JSON.parse(decodeURIComponent(templateParam)).id || ''
  } catch {
    try {
      templateId = JSON.parse(templateParam).id || ''
    } catch {
      templateId = templateParam.match(/"id"\s*:\s*"([^"]+)"/)?.[1] || ''
    }
  }

  logger.info('Curl parsed result', { apiKey: apiKey.slice(0, 8) + '...', source, srcName, templateId, channel })
  return { apiKey, source, srcName, templateId, channel }
}

async function sendViaFetch(
  parsed: ParsedCurl,
  phone: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const templateJson = JSON.stringify({
      id: parsed.templateId,
      params: [message],
    })

    const body = [
      'channel=' + encodeURIComponent(parsed.channel),
      'source=' + encodeURIComponent(parsed.source),
      'destination=' + encodeURIComponent(phone),
      'src.name=' + encodeURIComponent(parsed.srcName),
      'template=' + encodeURIComponent(templateJson),
    ].join('&')

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

    if (data.status === 'error') return { ok: false, error: JSON.stringify(data.message) }
    if (data.status === 'submitted' || data.messageId || data.status === 'success') return { ok: true }
    return { ok: false, error: JSON.stringify(data) }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

async function saveToCrm(
  tenantId: string,
  channelId: string,
  campaignId: string,
  contactId: string,
  phone: string,
  message: string,
  messageUuid: string,
): Promise<void> {
  const cleanPhone = phone.replace(/^\+/, '')

  await campaignService.markContactSent(contactId, messageUuid)
  await campaignService.incrementCounter(campaignId, 'sent_count')
  await db.rpc('increment_message_count', { p_tenant_id: tenantId }).catch(() => {})

  let contactDbId: string
  const { data: existingContact } = await db
    .from('contacts').select('id')
    .eq('tenant_id', tenantId).eq('phone', cleanPhone).maybeSingle()

  if (existingContact) {
    contactDbId = existingContact.id
  } else {
    const { data: newContact } = await db.from('contacts').insert({
      id: generateId(),
      tenant_id: tenantId,
      phone: cleanPhone,
      name: cleanPhone,
      origin: 'campaign',
      status: 'active',
    }).select('id').single()
    contactDbId = newContact!.id
  }

  let conversationId: string
  const { data: existingConv } = await db
    .from('conversations').select('id')
    .eq('tenant_id', tenantId).eq('contact_id', contactDbId)
    .eq('channel_id', channelId).maybeSingle()

  if (existingConv) {
    conversationId = existingConv.id
  } else {
    const { data: newConv } = await db.from('conversations').insert({
      id: generateId(),
      tenant_id: tenantId,
      contact_id: contactDbId,
      channel_id: channelId,
      channel_type: 'gupshup',
      status: 'open',
      pipeline_stage: 'lead',
      last_message_at: new Date(),
    }).select('id').single()
    conversationId = newConv!.id
  }

  await db.from('messages').insert({
    id: generateId(),
    message_uuid: messageUuid,
    tenant_id: tenantId,
    conversation_id: conversationId,
    channel_id: channelId,
    contact_id: contactDbId,
    direction: 'outbound',
    content_type: 'text',
    body: message || '(template)',
    status: 'sent',
    sent_at: new Date(),
    campaign_id: campaignId,
  })

  await db.from('conversations').update({
    last_message: message || '(template)',
    last_message_at: new Date(),
  }).eq('id', conversationId)
}

export function startCampaignWorker(): Worker {
  const worker = new Worker<CampaignJob>(
    'campaign_queue',
    async (job) => {
      const { campaignId, tenantId, channelId, batchSize } = job.data
      logger.info('Campaign worker started', { campaignId })

      const campaign = await campaignService.getCampaign(campaignId, tenantId)
      const curlTemplate = (campaign as any).curl_template
      if (!curlTemplate) throw new Error('No curl template configured')

      const parsed = parseCurlTemplate(curlTemplate)
      if (!parsed.templateId) {
        throw new Error(`Failed to parse templateId from curl. source=${parsed.source}`)
      }

      const crmQueue = new CrmQueue()
      const processedIds = new Set<string>()
      let processed = 0

      while (true) {
        const progress = await campaignService.getProgress(campaignId, tenantId)
        if (progress.status !== 'running') {
          logger.info('Campaign stopped', { campaignId, status: progress.status })
          break
        }

        const contacts = await campaignService.getPendingContacts(campaignId, batchSize)
        const pending = contacts.filter(c => !processedIds.has(c.id))
        if (pending.length === 0) {
          logger.info('No more pending contacts', { campaignId })
          break
        }

        for (let i = 0; i < pending.length; i += PARALLEL_FETCHES) {
          if (processed > 0 && processed % 100 === 0) {
            const check = await campaignService.getProgress(campaignId, tenantId)
            if (check.status !== 'running') break
          }

          const chunk = pending.slice(i, i + PARALLEL_FETCHES)

          await Promise.all(chunk.map(async (contact) => {
            try {
              const contactMessage = (
                contact.variables?.mensagem ||
                contact.variables?.copy ||
                ''
              )
                .replace(/\\r\\n/g, '\r\n')
                .replace(/\\r/g, '\r')
                .replace(/\\n/g, '\n')
                .trim()

              const messageUuid = uuidv4()
              const result = await sendViaFetch(parsed, contact.phone, contactMessage)

              if (result.ok) {
                processedIds.add(contact.id)
                processed++
                crmQueue.add(() =>
                  saveToCrm(tenantId, channelId, campaignId, contact.id, contact.phone, contactMessage, messageUuid)
                )
                logger.info('Message sent', { campaignId, phone: contact.phone, processed })
              } else {
                throw new Error(result.error || 'Gupshup error')
              }
            } catch (err: any) {
              processedIds.add(contact.id)
              crmQueue.add(async () => {
                await campaignService.markContactFailed(contact.id, err.message)
                await campaignService.incrementCounter(campaignId, 'failed_count')
              })
              logger.warn('Contact failed', { campaignId, phone: contact.phone, error: err.message })
            }
          }))

          if (DELAY_BETWEEN_MESSAGES_MS > 0) await sleep(DELAY_BETWEEN_MESSAGES_MS)
        }

        await emitProgress(campaignId, tenantId)
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