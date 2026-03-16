import { Worker, Queue } from 'bullmq'
import { logger } from '../lib/logger'
import { campaignService } from '../services/campaign.service'
import { sleep, randomBetween, generateId } from '@autozap/utils'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../lib/db'

const REDIS_URL = process.env.REDIS_URL!
const PUSHER_APP_ID = process.env.PUSHER_APP_ID
const PUSHER_KEY = process.env.PUSHER_KEY
const PUSHER_SECRET = process.env.PUSHER_SECRET
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER || 'mt1'

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

async function ensureContactAndConversation(
  tenantId: string,
  channelId: string,
  phone: string,
  name: string,
): Promise<{ contactId: string; conversationId: string }> {
  // Find or create contact
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
      name: name || phone,
      origin: 'campaign',
      status: 'active',
    }).select('id').single()
    contactId = newContact!.id
  }

  // Find or create conversation
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

async function executeCurlForPhone(
  curlTemplate: string,
  phone: string,
  contactMessage?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    // Normalize multiline curl
    let curlStr = curlTemplate
      .split('\n')
      .map(line => line.trimEnd().replace(/\\$/, ''))
      .join(' ')
      .trim()

    // Replace phone number
    curlStr = curlStr
      .replace(/%7B%7Bdestination_phone_number%7D%7D/gi, phone)
      .replace(/\{\{destination_phone_number\}\}/gi, phone)

    // Replace message in params if provided
    if (contactMessage) {
      const msg = contactMessage
        .replace(/\r\n/g, '\\n')
        .replace(/\r/g, '\\n')
        .replace(/\n/g, '\\n')
        .trim()

      curlStr = curlStr.replace(
        /(%22params%22:%5B%22)[^%"]*(%22%5D)/gi,
        `$1${encodeURIComponent(msg)}$2`
      )
    }

    logger.debug('Executing curl via exec', { phone, curlPreview: curlStr.slice(0, 150) })

    const { stdout, stderr } = await execAsync(curlStr, { timeout: 15000 })
    const output = stdout || stderr

    try {
      const data = JSON.parse(output)
      if (data.status === 'error') return { ok: false, error: JSON.stringify(data.message) }
      return { ok: true }
    } catch {
      if (output.includes('submitted') || output.includes('messageId')) return { ok: true }
      return { ok: false, error: output.slice(0, 200) }
    }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

export function startCampaignWorker(): Worker {
  const worker = new Worker<CampaignJob>(
    'campaign_queue',
    async (job) => {
      const { campaignId, tenantId, channelId, batchSize, messagesPerMin } = job.data
      logger.info('Campaign worker started', { campaignId })

      const delayMs = Math.floor((60 * 1000) / messagesPerMin)
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

        for (const contact of contacts) {
          try {
            const campaign = await campaignService.getCampaign(campaignId, tenantId)
            const curlTemplate = (campaign as any).curl_template
            if (!curlTemplate) throw new Error('No curl template configured')

            const rawMessage = contact.variables?.mensagem || contact.variables?.copy || contact.name || undefined
            const contactMessage = rawMessage?.trim()

            const messageUuid = uuidv4()
            const result = await executeCurlForPhone(curlTemplate, contact.phone, contactMessage)

            if (result.ok) {
              // Create contact and conversation in CRM
              const { contactId, conversationId } = await ensureContactAndConversation(
                tenantId, channelId, contact.phone, contact.name || contact.phone
              )

              // Save message in conversation
              await db.from('messages').insert({
                id: generateId(),
                message_uuid: messageUuid,
                tenant_id: tenantId,
                conversation_id: conversationId,
                channel_id: channelId,
                contact_id: contactId,
                direction: 'outbound',
                content_type: 'text',
                body: contactMessage || '(template)',
                status: 'sent',
                sent_at: new Date(),
                campaign_id: campaignId,
              })

              // Update conversation last message
              await db.from('conversations').update({
                last_message: (contactMessage || '(template)').replace(/\\r/g, '\n').replace(/\\n/g, '\n'),
                last_message_at: new Date(),
              }).eq('id', conversationId)

              await campaignService.markContactSent(contact.id, messageUuid)
              await campaignService.incrementCounter(campaignId, 'sent_count')
              processed++
              await emitProgress(campaignId, tenantId)
              logger.info('Campaign message sent', { campaignId, phone: contact.phone, processed })
            } else {
              throw new Error(result.error || 'Gupshup error')
            }

          } catch (err: any) {
            await campaignService.markContactFailed(contact.id, err.message)
            await campaignService.incrementCounter(campaignId, 'failed_count')
            logger.warn('Campaign contact failed', { campaignId, phone: contact.phone, error: err.message })
          }

          const jitter = randomBetween(200, 800)
          await sleep(delayMs + jitter)
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