import { db } from '../lib/db'
import { logger } from '../lib/logger'
import {
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

export class TenantService {
  // ── Get tenant ───────────────────────────────────────────────────────────────

  async getTenant(tenantId: string): Promise<Tenant> {
    const { data, error } = await db
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single()

    if (error || !data) throw new NotFoundError('Tenant')
    return this.mapRow(data)
  }

  // ── Update tenant settings ───────────────────────────────────────────────────

  async updateSettings(tenantId: string, settings: Partial<TenantSettings>): Promise<Tenant> {
    const current = await this.getTenant(tenantId)
    const merged = { ...current.settings, ...settings }

    const { data, error } = await db
      .from('tenants')
      .update({ settings: merged })
      .eq('id', tenantId)
      .select()
      .single()

    if (error) throw new AppError('DB_ERROR', error.message, 500)
    logger.info('Tenant settings updated', { tenantId })
    return this.mapRow(data)
  }

  // ── Update name ───────────────────────────────────────────────────────────────

  async updateName(tenantId: string, name: string): Promise<Tenant> {
    const { data, error } = await db
      .from('tenants')
      .update({ name })
      .eq('id', tenantId)
      .select()
      .single()

    if (error) throw new AppError('DB_ERROR', error.message, 500)
    return this.mapRow(data)
  }

  // ── List users in tenant ─────────────────────────────────────────────────────

  async listUsers(tenantId: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit

    const { data, count, error } = await db
      .from('users')
      .select('id, name, email, role, avatar_url, email_verified, two_factor_enabled, last_login_at, created_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw new AppError('DB_ERROR', error.message, 500)
    return {
      users: data || [],
      meta: paginationMeta(count || 0, page, limit),
    }
  }

  // ── Invite / update user role ─────────────────────────────────────────────────

  async updateUserRole(tenantId: string, userId: string, role: string): Promise<void> {
    const { error } = await db
      .from('users')
      .update({ role })
      .eq('id', userId)
      .eq('tenant_id', tenantId)

    if (error) throw new AppError('DB_ERROR', error.message, 500)
    logger.info('User role updated', { tenantId, userId, role })
  }

  async deactivateUser(tenantId: string, userId: string): Promise<void> {
    const { error } = await db
      .from('users')
      .update({ is_active: false })
      .eq('id', userId)
      .eq('tenant_id', tenantId)

    if (error) throw new AppError('DB_ERROR', error.message, 500)
  }

  // ── Plan & limits ─────────────────────────────────────────────────────────────

  async getSubscription(tenantId: string) {
    const { data, error } = await db
      .from('subscriptions')
      .select('*, plans(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) throw new NotFoundError('Subscription')
    return data
  }

  async checkMessageLimit(tenantId: string): Promise<void> {
    const { data: tenant } = await db
      .from('tenants')
      .select('plan_slug, messages_sent_this_period')
      .eq('id', tenantId)
      .single()

    if (!tenant) throw new NotFoundError('Tenant')

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
    // Called by a scheduled job at the start of each billing period
    const { error } = await db
      .from('tenants')
      .update({ messages_sent_this_period: 0 })
      .not('id', 'is', null)

    if (error) logger.error('Failed to reset period counts', { error })
    else logger.info('Period message counts reset for all tenants')
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private mapRow(row: any): Tenant {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      planSlug: row.plan_slug,
      messagesSentThisPeriod: row.messages_sent_this_period,
      isActive: row.is_active,
      settings: row.settings,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }
}

export const tenantService = new TenantService()
