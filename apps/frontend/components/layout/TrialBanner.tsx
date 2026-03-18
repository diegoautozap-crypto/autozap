'use client'

import { useQuery } from '@tanstack/react-query'
import { tenantApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { AlertTriangle, X, Zap } from 'lucide-react'
import { useState } from 'react'

export function TrialBanner() {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)

  const { data: usage } = useQuery({
    queryKey: ['usage'],
    queryFn: async () => {
      const { data } = await tenantApi.get('/tenant/usage')
      return data.data
    },
    refetchInterval: 60000,
  })

  const { data: tenant } = useQuery({
    queryKey: ['tenant'],
    queryFn: async () => {
      const { data } = await tenantApi.get('/tenant')
      return data.data
    },
  })

  const { data: subscription } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const { data } = await tenantApi.get('/tenant/subscription')
      return data.data
    },
  })

  if (dismissed) return null

  const planSlug = tenant?.planSlug
  if (planSlug !== 'trial') return null

  const pct = usage?.percentUsed ?? 0
  const remaining = usage?.remaining ?? 0

  const trialEndsAt = subscription?.trial_ends_at || subscription?.current_period_end
  const daysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

  const isExpiredByMessages = pct >= 100
  const isExpiredByDate = daysLeft !== null && daysLeft === 0
  const isExpired = isExpiredByMessages || isExpiredByDate
  const isWarning = !isExpired && (pct >= 80 || (daysLeft !== null && daysLeft <= 2))

  if (!isExpired && !isWarning) return null

  return (
    <div style={{
      background: isExpired ? '#fef2f2' : '#fffbeb',
      borderBottom: `1px solid ${isExpired ? '#fecaca' : '#fde68a'}`,
      padding: '10px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <AlertTriangle size={15} color={isExpired ? '#ef4444' : '#d97706'} />
        <span style={{ fontSize: '13px', color: isExpired ? '#dc2626' : '#92400e', fontWeight: 500 }}>
          {isExpired
            ? 'Seu trial expirou — você não pode mais enviar mensagens.'
            : isExpiredByMessages
              ? `Atenção: apenas ${remaining} mensagens restantes no trial.`
              : `Trial expira em ${daysLeft} dia${daysLeft !== 1 ? 's' : ''} — ${remaining} mensagens restantes.`
          }
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={() => router.push('/dashboard/settings#planos')}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '5px 12px',
            background: isExpired ? '#ef4444' : '#d97706',
            color: '#fff', border: 'none',
            borderRadius: '6px', fontSize: '12px',
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Zap size={12} />
          {isExpired ? 'Fazer upgrade' : 'Ver planos'}
        </button>
        {!isExpired && (
          <button
            onClick={() => setDismissed(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '2px', display: 'flex' }}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
