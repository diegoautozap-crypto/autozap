import { randomBytes } from 'crypto'
import {
  db,
  logger,
  AppError,
  NotFoundError,
  ConflictError,
  PlanLimitError,
  generateId,
  slugify,
  paginationMeta,
} from '@autozap/utils'
import { PLAN_LIMITS } from '@autozap/types'
import type { Tenant, PlanSlug, TenantSettings } from '@autozap/types'

import { Resend } from 'resend'

const ASAAS_API_URL = 'https://api.asaas.com/v3'
const resend = new Resend(process.env.RESEND_API_KEY)
const RESEND_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev'
const ASAAS_API_KEY = process.env.ASAAS_API_KEY!

const PLAN_PRICES: Record<string, number> = {
  starter:    149.99,
  pro:        299.99,
  enterprise: 599.99,
  unlimited:  999.99,
}

const PLAN_NAMES: Record<string, string> = {
  starter:    'AutoZap Starter',
  pro:        'AutoZap Pro',
  enterprise: 'AutoZap Enterprise',
  unlimited:  'AutoZap Unlimited',
}

async function asaasRequest(method: string, path: string, body?: object) {
  const response = await fetch(`${ASAAS_API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': ASAAS_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json() as any
  if (!response.ok) {
    logger.error('Asaas API error', { path, status: response.status, data })
    throw new AppError('ASAAS_ERROR', data?.errors?.[0]?.description || 'Asaas API error', 500)
  }
  return data
}

export class TenantService {
  // ── Get tenant ────────────────────────────────────────────────────────────

  async getTenant(tenantId: string): Promise<Tenant> {
    const { data, error } = await db
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single()

    if (error || !data) throw new NotFoundError('Tenant')
    return this.mapRow(data)
  }

  // ── Update tenant settings ────────────────────────────────────────────────

  async updateSettings(tenantId: string, settings: Partial<TenantSettings>): Promise<Tenant> {
    const current = await this.getTenant(tenantId)
    const merged = { ...current.settings, ...settings }

    const { data, error } = await db
      .from('tenants')
      .update({ settings: merged })
      .eq('id', tenantId)
      .select()
      .single()

    if (error) { logger.error('DB operation failed', { error: error.message }); throw new AppError('DB_ERROR', 'Database operation failed', 500) }
    logger.info('Tenant settings updated', { tenantId })
    return this.mapRow(data)
  }

  // ── Update name ───────────────────────────────────────────────────────────

  async updateName(tenantId: string, name: string): Promise<Tenant> {
    const { data, error } = await db
      .from('tenants')
      .update({ name })
      .eq('id', tenantId)
      .select()
      .single()

    if (error) { logger.error('DB operation failed', { error: error.message }); throw new AppError('DB_ERROR', 'Database operation failed', 500) }
    return this.mapRow(data)
  }

  // ── List users in tenant ──────────────────────────────────────────────────

  async listUsers(tenantId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit

    const { data, count, error } = await db
      .from('users')
      .select('id, name, email, role, avatar_url, email_verified, two_factor_enabled, last_login_at, created_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) { logger.error('DB operation failed', { error: error.message }); throw new AppError('DB_ERROR', 'Database operation failed', 500) }
    return {
      users: data || [],
      meta: paginationMeta(count || 0, page, limit),
    }
  }

  // ── Invite / update user role ─────────────────────────────────────────────

  async updateUserRole(tenantId: string, userId: string, role: string): Promise<void> {
    const { error } = await db
      .from('users')
      .update({ role })
      .eq('id', userId)
      .eq('tenant_id', tenantId)

    if (error) { logger.error('DB operation failed', { error: error.message }); throw new AppError('DB_ERROR', 'Database operation failed', 500) }
    logger.info('User role updated', { tenantId, userId, role })
  }

  async deactivateUser(tenantId: string, userId: string): Promise<void> {
    const { error } = await db
      .from('users')
      .update({ is_active: false })
      .eq('id', userId)
      .eq('tenant_id', tenantId)

    if (error) { logger.error('DB operation failed', { error: error.message }); throw new AppError('DB_ERROR', 'Database operation failed', 500) }
  }

  // ── Plan & limits ─────────────────────────────────────────────────────────

  async getSubscription(tenantId: string) {
    const { data } = await db
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return data
  }

  async checkMessageLimit(tenantId: string): Promise<void> {
    const { data: tenant } = await db
      .from('tenants')
      .select('plan_slug, messages_sent_this_period, current_period_start')
      .eq('id', tenantId)
      .single()

    if (!tenant) throw new NotFoundError('Tenant')

    // Auto-reset a cada 30 dias a partir do current_period_start
    const periodStart = tenant.current_period_start ? new Date(tenant.current_period_start) : null
    const now = new Date()
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    if (!periodStart || (now.getTime() - periodStart.getTime()) >= thirtyDaysMs) {
      await db.from('tenants').update({
        messages_sent_this_period: 0,
        current_period_start: now,
      }).eq('id', tenantId)
      logger.info('Auto-reset message count — new 30-day period', { tenantId })
      return // contador zerado, pode enviar
    }

    const limit = PLAN_LIMITS[tenant.plan_slug as PlanSlug]
    if (limit !== null && tenant.messages_sent_this_period >= limit) {
      throw new PlanLimitError(
        `Plan limit of ${limit.toLocaleString()} messages reached. Upgrade your plan to continue sending.`,
      )
    }
  }

  async incrementMessageCount(tenantId: string, count = 1): Promise<void> {
    const { error } = await db.rpc('increment_message_count', {
      p_tenant_id: tenantId,
      p_count: count,
    })
    if (error) logger.error('Failed to increment message count', { tenantId, error })
  }

  async resetPeriodCounts(): Promise<void> {
    const { error } = await db
      .from('tenants')
      .update({ messages_sent_this_period: 0 })
      .not('id', 'is', null)

    if (error) logger.error('Failed to reset period counts', { error })
    else logger.info('Period message counts reset for all tenants')
  }

  // ── Billing: criar ou buscar cliente no Asaas ─────────────────────────────

  async getOrCreateAsaasCustomer(tenantId: string, email: string, name: string, cpfCnpj?: string): Promise<string> {
    // Verifica se já tem customer_id salvo
    const { data: existingSub } = await db
      .from('subscriptions')
      .select('asaas_customer_id')
      .eq('tenant_id', tenantId)
      .not('asaas_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingSub?.asaas_customer_id) {
      return existingSub.asaas_customer_id
    }

    // Cria novo cliente no Asaas
    const customer = await asaasRequest('POST', '/customers', {
      name,
      email,
      ...(cpfCnpj ? { cpfCnpj } : {}),
      externalReference: tenantId,
    })

    logger.info('Asaas customer created', { tenantId, customerId: customer.id })
    return customer.id
  }

  // ── Billing: criar assinatura no Asaas ───────────────────────────────────

  async createSubscription(tenantId: string, planSlug: string, userEmail: string, userName: string, cpfCnpj?: string): Promise<{ paymentUrl: string; subscriptionId: string }> {
    const price = PLAN_PRICES[planSlug]
    if (!price) throw new AppError('INVALID_PLAN', 'Plano inválido', 400)

    const planName = PLAN_NAMES[planSlug]

    // Busca ou cria cliente
    const customerId = await this.getOrCreateAsaasCustomer(tenantId, userEmail, userName, cpfCnpj)

    // Busca o plan_id no banco
    const { data: plan } = await db
      .from('plans')
      .select('id')
      .eq('slug', planSlug)
      .single()

    if (!plan) throw new AppError('PLAN_NOT_FOUND', 'Plano não encontrado', 404)

    // Cria assinatura recorrente mensal no Asaas
    const today = new Date()
    const nextDue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const asaasSubscription = await asaasRequest('POST', '/subscriptions', {
      customer: customerId,
      billingType: 'UNDEFINED', // aceita PIX e cartão
      value: price,
      nextDueDate: nextDue,
      cycle: 'MONTHLY',
      description: `${planName} - AutoZap`,
      externalReference: `${tenantId}:${planSlug}`,
    })

    logger.info('Asaas subscription created', {
      tenantId,
      planSlug,
      subscriptionId: asaasSubscription.id,
    })

    // Salva no banco com status pending
    await db.from('subscriptions').insert({
      id: generateId(),
      tenant_id: tenantId,
      plan_id: plan.id,
      status: 'pending',
      asaas_subscription_id: asaasSubscription.id,
      asaas_customer_id: customerId,
      payment_method: 'asaas',
      current_period_start: new Date(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })

    // URL de pagamento
    // ✅ Busca a primeira fatura gerada pela assinatura
    let paymentUrl = ''
    try {
      await new Promise(r => setTimeout(r, 1500))
      const payments = await asaasRequest('GET', `/subscriptions/${asaasSubscription.id}/payments`)
      const firstPayment = payments?.data?.[0]
      if (firstPayment?.invoiceUrl) {
        paymentUrl = firstPayment.invoiceUrl
      } else if (firstPayment?.id) {
        paymentUrl = `https://www.asaas.com/c/${firstPayment.id}`
      } else {
        paymentUrl = `https://www.asaas.com/c/${asaasSubscription.id}`
      }
    } catch {
      paymentUrl = `https://www.asaas.com/c/${asaasSubscription.id}`
    }

    logger.info('Payment URL generated', { tenantId, paymentUrl: paymentUrl.slice(0, 60) })

    return {
      paymentUrl,
      subscriptionId: asaasSubscription.id,
    }
  }

  // ── Billing: processar webhook do Asaas ──────────────────────────────────

  async processAsaasWebhook(event: string, payload: any): Promise<void> {
    logger.info('Asaas webhook received', { event })

    // Pagamento confirmado → ativa plano
    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      const externalRef = payload.payment?.externalReference || payload.subscription?.externalReference
      if (!externalRef) return

      const [tenantId, planSlug] = externalRef.split(':')
      if (!tenantId || !planSlug) return

      // Atualiza plano do tenant + renova período (reset contador)
      await db.from('tenants')
        .update({
          plan_slug: planSlug,
          messages_sent_this_period: 0,
          current_period_start: new Date(),
        })
        .eq('id', tenantId)

      // Atualiza subscription para active
      await db.from('subscriptions')
        .update({ status: 'active' })
        .eq('tenant_id', tenantId)
        .eq('asaas_subscription_id', payload.subscription?.id || payload.payment?.subscription)

      logger.info('Plan activated via Asaas webhook', { tenantId, planSlug })

      // Envia email de verificação se usuário ainda não verificou
      try {
        const { data: owner } = await db.from('users')
          .select('id, email, name, email_verified')
          .eq('tenant_id', tenantId).eq('role', 'owner').single()
        if (owner && !owner.email_verified) {
          const emailVerifyToken = randomBytes(32).toString('hex')
          await db.from('users').update({ email_verify_token: emailVerifyToken }).eq('id', owner.id)
          const verifyUrl = `${process.env.APP_URL || 'https://useautozap.app'}/verify-email?token=${emailVerifyToken}`
          await resend.emails.send({
            from: RESEND_FROM,
            to: owner.email,
            subject: 'Confirme seu email — AutoZap',
            html: `
              <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
                <h1 style="color: #16a34a; font-size: 24px;">Pagamento confirmado!</h1>
                <p>Olá, ${owner.name || 'cliente'}!</p>
                <p>Seu pagamento do plano <strong>${PLAN_NAMES[planSlug]}</strong> foi confirmado. Agora confirme seu email pra ativar sua conta:</p>
                <a href="${verifyUrl}" style="display: inline-block; background: #16a34a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Confirmar email</a>
                <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">Se você não criou essa conta, ignore este email.</p>
              </div>`,
          })
          logger.info('Verification email sent after payment', { tenantId, email: owner.email })
        }
      } catch (err) {
        logger.error('Failed to send verification email after payment', { tenantId, err })
      }

      // ✅ Envia email de confirmação de assinatura
      try {
        const { data: userData } = await db
          .from('users')
          .select('email, name')
          .eq('tenant_id', tenantId)
          .eq('role', 'owner')
          .single()

        if (userData?.email) {
          const planNames: Record<string, string> = {
            starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise', unlimited: 'Unlimited'
          }
          const planPrices: Record<string, string> = {
            starter: 'R$ 149,99', pro: 'R$ 299,99', enterprise: 'R$ 599,99', unlimited: 'R$ 999,99'
          }
          await resend.emails.send({
            from: RESEND_FROM,
            to: userData.email,
            subject: `✅ Assinatura AutoZap ${planNames[planSlug]} confirmada!`,
            html: `
              <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
                <h1 style="color: #16a34a; font-size: 24px; margin-bottom: 8px;">Assinatura confirmada!</h1>
                <p style="color: #374151; font-size: 16px;">Olá, ${userData.name || 'cliente'}!</p>
                <p style="color: #374151; font-size: 15px;">
                  Seu pagamento foi confirmado e sua assinatura do plano 
                  <strong>${planNames[planSlug]}</strong> está ativa.
                </p>
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin: 24px 0;">
                  <p style="margin: 0 0 8px; color: #15803d; font-weight: 600;">Detalhes do plano</p>
                  <p style="margin: 0; color: #374151;">Plano: <strong>${planNames[planSlug]}</strong></p>
                  <p style="margin: 4px 0 0; color: #374151;">Valor: <strong>${planPrices[planSlug]}/mês</strong></p>
                </div>
                <a href="https://useautozap.app/dashboard" 
                   style="display: inline-block; background: #16a34a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                  Acessar AutoZap
                </a>
                <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">
                  Dúvidas? Entre em contato pelo WhatsApp: 
                  <a href="https://wa.me/5547999497488" style="color: #16a34a;">5547999497488</a>
                </p>
              </div>
            `,
          })
          logger.info('Confirmation email sent', { tenantId, email: userData.email })
        }
      } catch (emailErr) {
        logger.error('Failed to send confirmation email', { tenantId, emailErr })
      }

      // Notifica o dono do AutoZap sobre nova assinatura
      try {
        const { data: tenantData } = await db.from('tenants').select('name').eq('id', tenantId).single()
        const { data: ownerData } = await db.from('users').select('name, email').eq('tenant_id', tenantId).eq('role', 'owner').single()
        const planNames: Record<string, string> = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise', unlimited: 'Unlimited' }
        const planPrices: Record<string, string> = { starter: 'R$ 149,99', pro: 'R$ 299,99', enterprise: 'R$ 599,99', unlimited: 'R$ 999,99' }
        await resend.emails.send({
          from: RESEND_FROM,
          to: 'autozapltda@gmail.com',
          subject: `🎉 Nova assinatura — ${planNames[planSlug]} — ${tenantData?.name || tenantId}`,
          html: `
            <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
              <h1 style="color: #16a34a; font-size: 24px;">Nova assinatura!</h1>
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin: 16px 0;">
                <p style="margin: 0 0 6px; color: #374151;"><strong>Empresa:</strong> ${tenantData?.name || '—'}</p>
                <p style="margin: 0 0 6px; color: #374151;"><strong>Responsável:</strong> ${ownerData?.name || '—'}</p>
                <p style="margin: 0 0 6px; color: #374151;"><strong>Email:</strong> ${ownerData?.email || '—'}</p>
                <p style="margin: 0 0 6px; color: #374151;"><strong>Plano:</strong> ${planNames[planSlug]}</p>
                <p style="margin: 0; color: #374151;"><strong>Valor:</strong> ${planPrices[planSlug]}/mês</p>
              </div>
              <p style="color: #9ca3af; font-size: 12px;">ID: ${tenantId}</p>
            </div>`,
        })
      } catch (notifyErr) {
        logger.error('Failed to send admin notification', { tenantId, notifyErr })
      }
    }

    // Pagamento atrasado → bloqueia acesso (volta pra pending)
    if (event === 'PAYMENT_OVERDUE') {
      const externalRef = payload.payment?.externalReference
      if (!externalRef) return
      const [tenantId] = externalRef.split(':')

      await db.from('tenants')
        .update({ plan_slug: 'pending' })
        .eq('id', tenantId)

      await db.from('subscriptions')
        .update({ status: 'past_due' })
        .eq('tenant_id', tenantId)

      logger.warn('Payment overdue — tenant blocked', { tenantId })
    }

    // Assinatura cancelada → volta para pending
    if (event === 'SUBSCRIPTION_CANCELLED' || event === 'PAYMENT_DELETED') {
      const externalRef = payload.subscription?.externalReference || payload.payment?.externalReference
      if (!externalRef) return
      const [tenantId] = externalRef.split(':')

      await db.from('tenants')
        .update({ plan_slug: 'pending' })
        .eq('id', tenantId)

      await db.from('subscriptions')
        .update({ status: 'cancelled', canceled_at: new Date() })
        .eq('tenant_id', tenantId)

      logger.info('Subscription cancelled, tenant downgraded to pending', { tenantId })
    }
  }

  // ── Billing: cancelar assinatura ─────────────────────────────────────────

  async cancelSubscription(tenantId: string): Promise<void> {
    const { data: sub } = await db
      .from('subscriptions')
      .select('asaas_subscription_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .maybeSingle()

    if (sub?.asaas_subscription_id) {
      await asaasRequest('DELETE', `/subscriptions/${sub.asaas_subscription_id}`)
    }

    await db.from('tenants')
      .update({ plan_slug: 'pending' })
      .eq('id', tenantId)

    await db.from('subscriptions')
      .update({ status: 'cancelled', canceled_at: new Date() })
      .eq('tenant_id', tenantId)

    logger.info('Subscription cancelled', { tenantId })
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private mapRow(row: any): Tenant {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      planSlug: row.plan_slug,
      messagesSentThisPeriod: row.messages_sent_this_period,
      isActive: row.is_active,
      settings: row.settings,
      webhookToken: row.webhook_token || null,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }
}

export const tenantService = new TenantService()