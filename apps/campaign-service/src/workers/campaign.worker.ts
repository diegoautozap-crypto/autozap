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

const GUPSHUP_MAX_RPS     = 20       // 20 req/s = 1200/min por canal
const GUPSHUP_MAX_PER_MIN = GUPSHUP_MAX_RPS * 60
const LOGICAL_BATCH       = 500
const CONCURRENCY_PER_CH  = 20       // requests paralelos por canal
const MESSAGE_ID_RETRIES  = 2

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

// ─── Rate limiter por canal ────────────────────────────────────────────────────
class RateLimiter {
  private lastCallTime = 0
  private queue: Array<() => void> = []
  private processing = false

  constructor(private intervalMs: number) {}

  async acquire(): Promise<void> {
    return new Promise(resolve => {
      this.queue.push(resolve)
      if (!this.processing) this.processQueue()
    })
  }

  private async processQueue() {
    this.processing = true
    while (this.queue.length > 0) {
      const now = Date.now()
      const elapsed = now - this.lastCallTime
      if (elapsed < this.intervalMs) await sleep(this.intervalMs - elapsed)
      this.lastCallTime = Date.now()
      const resolve = this.queue.shift()
      if (resolve) resolve()
    }
    this.processing = false
  }
}

function getIntervalMs(messagesPerMin: number): number {
  const clamped = Math.min(Math.max(messagesPerMin, 1), GUPSHUP_MAX_PER_MIN)
  return Math.floor(1000 / (clamped / 60))
}

// ─── Sorteia copy aleatória ────────────────────────────────────────────────────
function pickRandomCopy(copies: string[]): string {
  return copies[Math.floor(Math.random() * copies.length)]
}

export interface InboxJob {
  tenantId: string; channelId: string; phone: string
  messageDbId: string; body: string; campaignId: string
}

export const inboxQueue = new Queue<InboxJob>('inbox_queue', {
  connection,
  defaultJobOptions: {
    attempts: 5, backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 }, removeOnFail: { count: 500 },
  },
})

export interface CampaignJob {
  campaignId: string; tenantId: string; channelId: string
  batchSize: number; messagesPerMin: number
  // Novos campos para multicopy e multicanal
  copies?: string[]           // lista de cURLs para rotacionar
  extraChannelIds?: string[]  // canais adicionais para disparar em paralelo
}

export function getTenantCampaignQueue(tenantId: string): Queue<CampaignJob> {
  return new Queue<CampaignJob>(`campaign_queue_tenant_${tenantId}`, {
    connection,
    defaultJobOptions: { attempts: 1, removeOnComplete: { count: 100 }, removeOnFail: { count: 500 } },
  })
}

export const campaignQueue = new Queue<CampaignJob>('campaign_queue', {
  connection,
  defaultJobOptions: { attempts: 1, removeOnComplete: { count: 100 }, removeOnFail: { count: 500 } },
})

const activeWorkers = new Map<string, Worker<CampaignJob>>()

function ensureTenantWorker(tenantId: string): Worker<CampaignJob> {
  if (activeWorkers.has(tenantId)) return activeWorkers.get(tenantId)!
  const queueName = `campaign_queue_tenant_${tenantId}`
  const worker = new Worker<CampaignJob>(queueName, processCampaignJob, { connection, concurrency: 1 })
  worker.on('failed', (job, err) => logger.error('Campaign job failed', { tenantId, jobId: job?.id, error: err.message }))
  logger.info('Campaign worker created for tenant', { tenantId, queueName })
  activeWorkers.set(tenantId, worker)
  return worker
}

async function checkPlanLimit(tenantId: string): Promise<boolean> {
  try {
    const { data } = await db.rpc('tenant_can_send', { p_tenant_id: tenantId, p_count: 1 })
    return !!data
  } catch { return true }
}

interface ParsedCurl { apiKey: string; bodyTemplate: string }

function parseCurlTemplate(curlTemplate: string): ParsedCurl {
  const curlStr = curlTemplate.split('\n').map(l => l.trimEnd().replace(/\\$/, '')).join(' ').trim()
  const apiKey = curlStr.match(/apikey:\s*([^\s"'\\]+)/)?.[1] || ''
  let bodyTemplate = ''
  const singleQ = curlStr.match(/-d\s+'([^']+)'/)
  const doubleQ = curlStr.match(/-d\s+"((?:[^"\\]|\\.)*)"/)
  if (singleQ) { bodyTemplate = singleQ[1] }
  else if (doubleQ) { bodyTemplate = doubleQ[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') }
  else if (curlStr.includes('--data-urlencode')) {
    const extract = (fieldName: string): string => {
      const pattern = new RegExp(`--data-urlencode\\s+"${fieldName}=([\\s\\S]*?)(?="\\s+--|"\\s*$)`)
      const m = curlStr.match(pattern)
      if (m) return m[1]
      const idx = curlStr.indexOf(`--data-urlencode "${fieldName}=`)
      if (idx === -1) return ''
      const startVal = idx + `--data-urlencode "${fieldName}=`.length
      const nextFlag = curlStr.indexOf('--data-urlencode', startVal)
      const raw = nextFlag === -1 ? curlStr.slice(startVal) : curlStr.slice(startVal, nextFlag)
      return raw.replace(/"?\s*$/, '').trim()
    }
    const fields: string[] = []
    const fieldNames = ['channel', 'source', 'destination', 'src.name', 'template', 'message', 'postbackTexts']
    for (const name of fieldNames) {
      const val = extract(name)
      if (val !== '') fields.push(`${encodeURIComponent(name)}=${encodeURIComponent(val)}`)
    }
    if (fields.length > 0) bodyTemplate = fields.join('&')
  }
  bodyTemplate = bodyTemplate
    .replace(/%7B%7Bdestination_phone_number%7D%7D/gi, '__PHONE__')
    .replace(/\{\{destination_phone_number\}\}/gi, '__PHONE__')
    .replace(/%7B%7Bphone%7D%7D/gi, '__PHONE__')
    .replace(/\{\{phone\}\}/gi, '__PHONE__')
    .replace(/\{\{numero\}\}/gi, '__PHONE__')
    .replace(/\{\{telefone\}\}/gi, '__PHONE__')
  return { apiKey, bodyTemplate }
}

async function sendViaFetch(
  parsed: ParsedCurl, phone: string, message: string, attempt = 0,
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
    if (response.status === 429) {
      logger.warn('Gupshup 429 rate limit hit', { phone, attempt })
      await sleep(1000)
      return sendViaFetch(parsed, phone, message, attempt + 1)
    }
    const data = await response.json() as any
    if (data.status === 'error') return { ok: false, error: JSON.stringify(data.message) }
    if (data.status === 'submitted' || data.messageId || data.status === 'success') {
      if (!data.messageId) {
        if (attempt < MESSAGE_ID_RETRIES) { await sleep(500); return sendViaFetch(parsed, phone, message, attempt + 1) }
        return { ok: false, error: 'Gupshup did not return messageId after retries' }
      }
      return { ok: true, messageId: data.messageId || data.id }
    }
    return { ok: false, error: JSON.stringify(data) }
  } catch (err: any) { return { ok: false, error: err.message } }
}

async function processContact(
  contact: any, campaignId: string, tenantId: string, channelId: string,
  parsed: ParsedCurl, rateLimiter: RateLimiter,
): Promise<'sent' | 'failed'> {
  const rawMessage = contact.variables?.mensagem || contact.variables?.copy || ''
  const contactMessage = rawMessage.replace(/\\r\\n/g, '\r').replace(/\\r/g, '\r').replace(/\\n/g, '\n').trim()
  const bodyForDb   = contactMessage.replace(/\r/g, '\n')
  const messageUuid = uuidv4()
  const messageDbId = generateId()

  try {
    await rateLimiter.acquire()
    const result = await sendViaFetch(parsed, contact.phone, contactMessage)

    if (!result.ok || !result.messageId) {
      await campaignService.markContactFailed(contact.id, result.error || 'Missing messageId')
      await campaignService.incrementCounter(campaignId, 'failed_count')
      return 'failed'
    }

    const { error: upsertError } = await db.from('messages').upsert({
      id: messageDbId, message_uuid: messageUuid, tenant_id: tenantId, channel_id: channelId,
      direction: 'outbound', content_type: 'text', body: bodyForDb || '(template)',
      status: 'sent', sent_at: new Date(), campaign_id: campaignId, external_id: result.messageId,
    }, { onConflict: 'external_id' })

    if (upsertError) {
      await campaignService.markContactFailed(contact.id, `DB error: ${upsertError.message}`)
      await campaignService.incrementCounter(campaignId, 'failed_count')
      return 'failed'
    }

    inboxQueue.add('create-inbox', {
      tenantId, channelId, phone: contact.phone.replace(/^\+/, ''),
      messageDbId, body: bodyForDb || '(template)', campaignId,
    }).catch(err => logger.warn('Failed to enqueue inbox job', { phone: contact.phone, err: err.message }))

    await campaignService.markContactSent(contact.id, messageUuid)
    await campaignService.incrementCounter(campaignId, 'sent_count')
    try { await db.rpc('increment_message_count', { p_tenant_id: tenantId }) } catch {}

    return 'sent'
  } catch (err: any) {
    await campaignService.markContactFailed(contact.id, err.message)
    await campaignService.incrementCounter(campaignId, 'failed_count')
    return 'failed'
  }
}

async function processCampaignJob(job: any) {
  const { campaignId, tenantId, channelId, batchSize, messagesPerMin, copies, extraChannelIds } = job.data

  const effectivePerMin = Math.min(messagesPerMin || 60, GUPSHUP_MAX_PER_MIN)
  const intervalMs = getIntervalMs(effectivePerMin)

  // Todos os canais disponíveis para este job
  const allChannelIds = [channelId, ...(extraChannelIds || [])].filter(Boolean)
  const channelCount  = allChannelIds.length

  // Copies disponíveis para rotacionar
  const availableCopies: string[] = copies && copies.length > 0 ? copies : []

  logger.info('Campaign job started', {
    campaignId, tenantId, effectivePerMin, channelCount,
    copyCount: availableCopies.length,
    totalRate: effectivePerMin * channelCount,
  })

  if (!await checkPlanLimit(tenantId)) {
    await db.from('campaigns').update({ status: 'failed' }).eq('id', campaignId)
    logger.warn('Campaign blocked — plan limit reached', { campaignId })
    return
  }

  const campaign = await campaignService.getCampaign(campaignId, tenantId)

  // Parseia todas as copies — cada canal vai usar uma copy aleatória por contato
  const curlTemplate = (campaign as any).curl_template
  if (!curlTemplate && availableCopies.length === 0) throw new Error('No curl template configured')

  // Se não tem copies salvas, usa o curl_template principal
  const allCopies = availableCopies.length > 0 ? availableCopies : [curlTemplate]
  const parsedCopies = allCopies.map(c => parseCurlTemplate(c))

  // Cria um rate limiter e um pool de concorrência por canal
  const channelLimiters = allChannelIds.map(() => new RateLimiter(intervalMs))
  const channelLimits   = allChannelIds.map(() => pLimit(CONCURRENCY_PER_CH))

  let processed = 0
  const startTime = Date.now()

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

    if (processed > 0 && processed % 500 === 0) {
      if (!await checkPlanLimit(tenantId)) {
        await db.from('campaigns').update({ status: 'paused' }).eq('id', campaignId)
        logger.warn('Campaign paused — plan limit', { campaignId, processed })
        break
      }
    }

    // Distribui contatos entre canais em round-robin
    // Cada contato recebe uma copy aleatória E um canal aleatório
    const results = await Promise.all(
      contacts.map((contact, idx) => {
        const channelIdx = idx % channelCount
        const chId       = allChannelIds[channelIdx]
        const limiter    = channelLimiters[channelIdx]
        const pool       = channelLimits[channelIdx]
        // Sorteia copy aleatória para este contato
        const parsed     = parsedCopies[Math.floor(Math.random() * parsedCopies.length)]

        return pool(() => processContact(contact, campaignId, tenantId, chId, parsed, limiter))
      })
    )

    const sentCount = results.filter(r => r === 'sent').length
    processed += sentCount

    const elapsed    = (Date.now() - startTime) / 1000
    const actualRps  = processed / elapsed
    const totalRate  = effectivePerMin * channelCount

    await emitProgress(campaignId, tenantId)
    logger.info('Batch dispatched', {
      campaignId, tenantId,
      sent: sentCount, failed: contacts.length - sentCount,
      totalProcessed: processed,
      actualRps: actualRps.toFixed(1),
      configuredRate: `${totalRate}/min (${channelCount}ch × ${effectivePerMin}/min)`,
    })
  }

  await campaignService.checkCompletion(campaignId)
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
  logger.info('Campaign job finished', { campaignId, tenantId, processed, totalTimeSec: totalTime })
}

export function startCampaignWorker(): Worker {
  const legacyWorker = new Worker<CampaignJob>('campaign_queue', async (job) => {
    ensureTenantWorker(job.data.tenantId)
    await processCampaignJob(job)
  }, { connection, concurrency: 1 })

  legacyWorker.on('failed', (job, err) =>
    logger.error('Legacy campaign job failed', { jobId: job?.id, error: err.message })
  )

  logger.info(`Campaign worker initialized — max rate: ${GUPSHUP_MAX_PER_MIN}/min per channel`)
  return legacyWorker
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