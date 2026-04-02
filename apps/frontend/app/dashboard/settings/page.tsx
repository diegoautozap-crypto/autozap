'use client'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tenantApi, conversationApi } from '@/lib/api'
import { AlertTriangle, Zap, Check, Loader2, X, Webhook, Plus, Trash2, Eye, EyeOff, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { usePermissions } from '@/store/permissions.store'

const PLAN_NAMES: Record<string, string> = {
  pending:    'Pendente',
  starter:    'Starter',
  pro:        'Pro',
  enterprise: 'Enterprise',
  unlimited:  'Unlimited',
}

function getPlanMsgs(_t: (key: string) => string): Record<string, string> {
  return {
    starter:    '10.000 msgs',
    pro:        '50.000 msgs',
    enterprise: '150.000 msgs',
    unlimited:  'Ilimitado',
  }
}

function getPlanFeatures(_t: (key: string) => string): Record<string, string[]> {
  return {
    starter:    ['10k msgs/mes', '5 canais', '5 membros', '3 flows', '2k contatos', '500 IA/mes'],
    pro:        ['50k msgs/mes', '10 canais', '10 membros', '15 flows', '15k contatos', '5k IA/mes', 'Transcricao'],
    enterprise: ['150k msgs/mes', '30 canais', '30 membros', 'Flows ilimitados', '50k contatos', '20k IA/mes', 'Relatorios'],
    unlimited:  ['Tudo ilimitado', 'API sem limites', 'SLA garantido', 'Gerente de conta'],
  }
}

function getWebhookEvents(t: (key: string) => string) {
  return [
    { key: 'message.received',           label: t('settings.webhookEvent.messageReceived'),      desc: t('settings.webhookEvent.messageReceivedDesc') },
    { key: 'conversation.status_changed', label: t('settings.webhookEvent.statusChanged'),        desc: t('settings.webhookEvent.statusChangedDesc') },
    { key: 'conversation.assigned',       label: t('settings.webhookEvent.conversationAssigned'), desc: t('settings.webhookEvent.conversationAssignedDesc') },
    { key: 'pipeline.stage_changed',      label: t('settings.webhookEvent.pipelineChanged'),     desc: t('settings.webhookEvent.pipelineChangedDesc') },
  ]
}

function formatCpfCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}


// ── Webhook de Entrada (Lead Capture) ─────────────────────────────────────────
function InboundWebhookSection() {
  const t = useT()
  const { user } = useAuthStore()
  const tenantId = (user as any)?.tenantId || (user as any)?.tid || ''
  const [showToken, setShowToken] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const { data: tenantData } = useQuery({
    queryKey: ['tenant-webhook-token'],
    queryFn: async () => {
      const { data } = await tenantApi.get('/tenant')
      return data.data
    },
  })

  useEffect(() => {
    if (tenantData?.webhookToken) setToken(tenantData.webhookToken)
  }, [tenantData])

  const webhookUrl = token
    ? `${process.env.NEXT_PUBLIC_MESSAGE_SERVICE_URL || ''}/webhook/lead/${token}`
    : null

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const { data } = await tenantApi.post('/tenant/webhook-token')
      setToken(data.data.token)
      toast.success(t('settings.toast.tokenGenerated'))
    } catch { toast.error(t('settings.toast.errorGenerateToken')) }
    finally { setGenerating(false) }
  }

  const copyUrl = () => {
    if (webhookUrl) { navigator.clipboard.writeText(webhookUrl); toast.success(t('settings.toast.urlCopied')) }
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,.04))' }}>
      <div style={{ marginBottom: '16px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: '4px' }}>{t('settings.inboundWebhookTitle')}</span>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('settings.inboundWebhookDesc')}</p>
      </div>

      {!token ? (
        <div style={{ textAlign: 'center', padding: '20px', background: 'var(--bg-input)', borderRadius: '9px', border: '1px solid var(--divider)' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>{t('settings.generateYourUrl')}</p>
          <button onClick={handleGenerate} disabled={generating}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 18px', background: '#22c55e', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1 }}>
            {generating ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />}
            {t('settings.generateUrl')}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <code style={{ flex: 1, fontSize: '11px', color: 'var(--text)', wordBreak: 'break-all' as const }}>
              {showToken ? webhookUrl : webhookUrl?.replace(/\/[^/]+$/, '/••••••••••••')}
            </code>
            <button onClick={() => setShowToken(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', flexShrink: 0 }}>
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button onClick={copyUrl} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', flexShrink: 0 }}>
              <Copy size={14} />
            </button>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.6 }}>
            <p style={{ fontWeight: 600, color: '#52525b', marginBottom: '6px' }}>{t('settings.fieldsAccepted')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              {[
                ['phone / phone_number', t('settings.fieldPhone')],
                ['name / full_name', t('settings.fieldName')],
                ['email', 'Email'],
                ['source / campaign_name', t('settings.fieldSource')],
                ['message / mensagem', t('settings.fieldMessage')],
              ].map(([field, desc]) => (
                <div key={field} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <code style={{ fontSize: '10px', background: 'var(--bg)', padding: '1px 5px', borderRadius: '4px', color: 'var(--text)', flexShrink: 0 }}>{field}</code>
                  <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <details>
            <summary style={{ fontSize: '12px', color: 'var(--text-faint)', cursor: 'pointer', userSelect: 'none' as const }}>{t('settings.viewPayloadExample')}</summary>
            <pre style={{ marginTop: '8px', padding: '12px', background: '#18181b', color: '#a3e635', borderRadius: '8px', fontSize: '11px', overflowX: 'auto' as const, lineHeight: 1.5 }}>{JSON.stringify({
              phone_number: '5511999999999',
              full_name: 'João Silva',
              email: 'joao@email.com',
              campaign_name: 'Black Friday 2026',
              message: 'Quero mais informações',
            }, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  )
}


// ── Seção de Webhooks ──────────────────────────────────────────────────────────
function WebhooksSection() {
  const t = useT()
  const WEBHOOK_EVENTS = getWebhookEvents(t)
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['message.received'])
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ['webhook-configs'],
    queryFn: async () => {
      const { data } = await tenantApi.get('/tenant/webhooks')
      return data.data || []
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await tenantApi.delete(`/tenant/webhooks/${id}`) },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['webhook-configs'] }); toast.success(t('settings.toast.webhookRemoved')) },
    onError: () => toast.error(t('settings.toast.errorRemoveWebhook')),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await tenantApi.patch(`/tenant/webhooks/${id}`, { active })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhook-configs'] }),
    onError: () => toast.error(t('settings.toast.errorUpdateWebhook')),
  })

  const toggleEvent = (key: string) => {
    setSelectedEvents(prev =>
      prev.includes(key) ? prev.filter(e => e !== key) : [...prev, key]
    )
  }

  const handleSave = async () => {
    if (!url.trim()) { toast.error(t('settings.toast.urlRequired')); return }
    if (!url.startsWith('http')) { toast.error(t('settings.toast.urlInvalid')); return }
    if (selectedEvents.length === 0) { toast.error(t('settings.toast.selectEvent')); return }
    setSaving(true)
    try {
      await tenantApi.post('/tenant/webhooks', {
        url: url.trim(),
        events: selectedEvents,
        secret: secret.trim() || null,
      })
      queryClient.invalidateQueries({ queryKey: ['webhook-configs'] })
      toast.success(t('settings.toast.webhookConfigured'))
      setShowForm(false); setUrl(''); setSecret(''); setSelectedEvents(['message.received'])
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || t('settings.toast.errorSaveWebhook'))
    } finally { setSaving(false) }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    try {
      await tenantApi.post(`/tenant/webhooks/${id}/test`)
      toast.success(t('settings.toast.testSent'))
    } catch { toast.error(t('settings.toast.errorTest')) }
    finally { setTestingId(null) }
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,.04))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: '4px' }}>{t('settings.webhooksTitle')}</span>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('settings.webhooksDesc')}</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: '#22c55e', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
            <Plus size={13} /> {t('settings.newWebhook')}
          </button>
        )}
      </div>

      {/* Formulário de criação */}
      {showForm && (
        <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '10px', padding: '18px', marginBottom: '16px' }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>{t('settings.webhookUrl')}</label>
            <input
              placeholder="https://hooks.zapier.com/hooks/catch/..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text)', background: 'var(--bg-card)', boxSizing: 'border-box' as const }}
              onFocus={e => e.currentTarget.style.borderColor = '#22c55e'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>
              {t('settings.webhookSecret')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>— {t('settings.webhookSecretHint')}</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showSecret ? 'text' : 'password'}
                placeholder={t('settings.webhookSecretPlaceholder')}
                value={secret}
                onChange={e => setSecret(e.target.value)}
                style={{ width: '100%', padding: '9px 36px 9px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text)', background: 'var(--bg-card)', boxSizing: 'border-box' as const }}
                onFocus={e => e.currentTarget.style.borderColor = '#22c55e'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
              <button onClick={() => setShowSecret(s => !s)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
                {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '8px' }}>{t('settings.webhookEvents')}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {WEBHOOK_EVENTS.map(ev => (
                <label key={ev.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '7px', border: `1px solid ${selectedEvents.includes(ev.key) ? '#bbf7d0' : 'var(--divider)'}`, background: selectedEvents.includes(ev.key) ? '#f0fdf4' : 'var(--bg-card)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedEvents.includes(ev.key)} onChange={() => toggleEvent(ev.key)} style={{ width: '14px', height: '14px', accentColor: '#22c55e', cursor: 'pointer' }} />
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', display: 'block' }}>{ev.label}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{ev.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowForm(false); setUrl(''); setSecret(''); setSelectedEvents(['message.received']) }}
              style={{ padding: '8px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: '#52525b', cursor: 'pointer' }}>
              {t('common.cancel')}
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', background: '#22c55e', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
              {t('settings.saveWebhook')}
            </button>
          </div>
        </div>
      )}

      {/* Lista de webhooks */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faintest)' }} />
        </div>
      ) : webhooks.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-faint)' }}>
          <Webhook size={24} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
          <p style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>{t('settings.noWebhooks')}</p>
          <p style={{ fontSize: '12px' }}>{t('settings.noWebhooksDesc')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(webhooks as any[]).map((wh: any) => (
            <div key={wh.id} style={{ border: '1px solid var(--border)', borderRadius: '9px', padding: '12px 14px', background: wh.active ? 'var(--bg-card)' : 'var(--bg-input)', opacity: wh.active ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: wh.active ? '#22c55e' : 'var(--text-faintest)', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wh.url}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {(wh.events || []).map((ev: string) => (
                      <span key={ev} style={{ fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '99px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                        {WEBHOOK_EVENTS.find(e => e.key === ev)?.label || ev}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <button onClick={() => handleTest(wh.id)} disabled={testingId === wh.id}
                    title={t('settings.sendTestEvent')}
                    style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-input)', color: '#52525b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {testingId === wh.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={11} />}
                    {t('settings.test')}
                  </button>
                  <button onClick={() => toggleMutation.mutate({ id: wh.id, active: !wh.active })}
                    title={wh.active ? t('settings.deactivate') : t('settings.activate')}
                    style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', border: `1px solid ${wh.active ? '#fde68a' : '#bbf7d0'}`, borderRadius: '6px', background: wh.active ? '#fffbeb' : '#f0fdf4', color: wh.active ? '#d97706' : '#16a34a', cursor: 'pointer' }}>
                    {wh.active ? t('settings.pause') : t('settings.activate')}
                  </button>
                  <button onClick={() => { if (confirm(t('settings.confirmRemoveWebhook'))) deleteMutation.mutate(wh.id) }}
                    style={{ background: 'none', border: '1px solid #fee2e2', borderRadius: '6px', cursor: 'pointer', color: '#fca5a5', padding: '4px 7px', display: 'flex' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Exemplo de payload */}
      <details style={{ marginTop: '14px' }}>
        <summary style={{ fontSize: '12px', color: 'var(--text-faint)', cursor: 'pointer', userSelect: 'none' }}>{t('settings.viewPayloadExample')}</summary>
        <pre style={{ marginTop: '8px', padding: '12px', background: '#18181b', color: '#a3e635', borderRadius: '8px', fontSize: '11px', overflowX: 'auto', lineHeight: 1.5 }}>{JSON.stringify({
          event: 'message.received',
          timestamp: '2026-03-30T14:00:00.000Z',
          tenant_id: 'uuid-do-tenant',
          data: {
            conversation_id: 'uuid-da-conversa',
            contact_name: 'João Silva',
            phone: '5511999999999',
            body: 'Olá, quero saber sobre os preços',
            content_type: 'text',
            media_url: null,
          }
        }, null, 2)}</pre>
      </details>
    </div>
  )
}

export default function SettingsPage() {
  const t = useT()
  const { isAdmin, canEdit } = usePermissions()
  const PLAN_MSGS = getPlanMsgs(t)
  const PLAN_FEATURES = getPlanFeatures(t)
  const { user } = useAuthStore()
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [showCpfModal, setShowCpfModal] = useState<string | null>(null)
  const [cpfCnpj, setCpfCnpj] = useState('')

  const { data: usage } = useQuery({
    queryKey: ['usage'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant/usage'); return data.data },
    refetchInterval: 30000,
  })
  const { data: limitsData } = useQuery({
    queryKey: ['limits'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant/limits'); return data.data },
    refetchInterval: 60000,
  })
  const { data: tenant } = useQuery({
    queryKey: ['tenant'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant'); return data.data },
  })
  const { data: subscription } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant/subscription'); return data.data },
  })
  const { data: plans } = useQuery({
    queryKey: ['billing-plans'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant/billing/plans'); return data.data },
  })

  const sent = usage?.sent ?? 0
  const limit = usage?.limit ?? 0
  const pct = usage?.percentUsed ?? 0
  const planSlug = tenant?.planSlug ?? 'pending'
  const planName = PLAN_NAMES[planSlug] ?? planSlug
  const isWarning = pct > 80
  const isPending = planSlug === 'pending'

  const handleSubscribe = async (slug: string) => {
    const digits = cpfCnpj.replace(/\D/g, '')
    if (digits.length !== 11 && digits.length !== 14) { toast.error(t('settings.toast.invalidCpfCnpj')); return }
    setSubscribing(slug)
    try {
      const { data } = await tenantApi.post('/tenant/billing/subscribe', { planSlug: slug, cpfCnpj: digits })
      const paymentUrl = data.data?.paymentUrl
      if (paymentUrl) {
        window.open(paymentUrl, '_blank')
        toast.success(t('settings.toast.redirecting'))
        setShowCpfModal(null); setCpfCnpj('')
      } else {
        toast.error(t('settings.toast.errorPaymentLink'))
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || t('settings.toast.errorSubscription'))
    } finally { setSubscribing(null) }
  }

  const getPlanPrice = (slug: string) => {
    if (!plans) {
      const prices: Record<string, string> = { starter: 'R$ 149,99', pro: 'R$ 299,99', enterprise: 'R$ 599,99', unlimited: 'R$ 999,99' }
      return prices[slug] || ''
    }
    const plan = plans.find((p: any) => p.slug === slug)
    return plan ? `R$ ${Number(plan.price_monthly).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : ''
  }

  const barColor = isWarning ? '#f97316' : '#22c55e'

  return (
    <div className="mobile-page" style={{ padding: '32px', maxWidth: '700px' }}>
      <div className="mobile-header">
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: '4px' }}>{t('settings.titleFull')}</h1>
        <p style={{ color: 'var(--text-faint)', fontSize: '14px', marginBottom: '28px' }}>{t('settings.manageAccount')}</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Banner sem plano ativo */}
        {canEdit('/dashboard/settings') && isPending && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertTriangle size={18} color="#d97706" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 700, color: '#92400e', fontSize: '14px', marginBottom: '4px' }}>{t('settings.noPlanActive')}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '14px' }}>{t('settings.choosePlanNotice')}</p>
              <a href="#planos" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#22c55e', color: '#fff', borderRadius: '7px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                <Zap size={13} /> {t('settings.viewPlans')}
              </a>
            </div>
          </div>
        )}

        {/* Banner plano ativo */}
        {canEdit('/dashboard/settings') && !isPending && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 600, color: '#15803d', fontSize: '14px', marginBottom: '2px' }}>✅ {t('settings.plan')} {planName} {t('settings.planActive')}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{subscription?.status === 'active' ? t('settings.subscriptionActive') : t('settings.awaitingPayment')}</p>
            </div>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '4px 14px', borderRadius: '99px' }}>{getPlanPrice(planSlug)}/{t('settings.month')}</span>
          </div>
        )}

        {/* Perfil */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,.04))' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '14px', display: 'block' }}>{t('settings.profile')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Email</span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{user?.email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t('settings.currentPlan')}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: isPending ? '#d97706' : '#16a34a', background: isPending ? '#fffbeb' : '#f0fdf4', border: `1px solid ${isPending ? '#fde68a' : '#bbf7d0'}`, padding: '2px 10px', borderRadius: '99px' }}>
                {isPending ? t('settings.noPlanActive') : planName}
              </span>
            </div>
          </div>
        </div>

        {/* Uso do mês */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,.04))' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '14px', display: 'block' }}>{t('settings.monthlyUsage')}</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t('settings.messagesSent')}</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{sent.toLocaleString()} / {limit === null ? '∞' : limit.toLocaleString()}</span>
          </div>
          <div style={{ height: '6px', background: 'var(--bg)', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, borderRadius: '99px', transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '12px', color: isWarning ? '#f97316' : 'var(--text-faint)', fontWeight: isWarning ? 600 : 400 }}>{pct}% {t('settings.used')}</span>
            {limit !== null && <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{Math.max(0, limit - sent).toLocaleString()} {t('settings.remaining')}</span>}
          </div>

          {/* Detailed limits breakdown */}
          {limitsData && (
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--divider)', paddingTop: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {([
                ['Canais', limitsData.usage?.channels, limitsData.limits?.channels],
                ['Membros', limitsData.usage?.members, limitsData.limits?.members],
                ['Flows ativos', limitsData.usage?.flows, limitsData.limits?.flows],
                ['Contatos', limitsData.usage?.contacts, limitsData.limits?.contacts],
                ['Campanhas/mes', limitsData.usage?.campaigns, limitsData.limits?.campaigns],
                ['Respostas IA/mes', limitsData.usage?.aiResponses, limitsData.limits?.aiResponses],
              ] as [string, number, number | null][]).map(([label, used, max]) => {
                const usedVal = used ?? 0
                const pctUsed = max === null || max === undefined ? 0 : max > 0 ? Math.round((usedVal / max) * 100) : (usedVal > 0 ? 100 : 0)
                const warn = pctUsed > 80
                return (
                  <div key={label} style={{ padding: '8px 10px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--divider)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: warn ? '#f97316' : 'var(--text)' }}>
                        {usedVal.toLocaleString()} / {max === null || max === undefined ? '∞' : max.toLocaleString()}
                      </span>
                    </div>
                    {max !== null && max !== undefined && max > 0 && (
                      <div style={{ height: '3px', background: 'var(--bg)', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(pctUsed, 100)}%`, height: '100%', background: warn ? '#f97316' : '#22c55e', borderRadius: '99px', transition: 'width 0.4s ease' }} />
                      </div>
                    )}
                  </div>
                )
              })}
              {limitsData.limits && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: limitsData.limits.transcription ? '#f0fdf4' : '#fef2f2', color: limitsData.limits.transcription ? '#16a34a' : '#ef4444', border: `1px solid ${limitsData.limits.transcription ? '#bbf7d0' : '#fecaca'}` }}>
                    {limitsData.limits.transcription ? '✓' : '✗'} Transcricao
                  </span>
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: limitsData.limits.reports ? '#f0fdf4' : '#fef2f2', color: limitsData.limits.reports ? '#16a34a' : '#ef4444', border: `1px solid ${limitsData.limits.reports ? '#bbf7d0' : '#fecaca'}` }}>
                    {limitsData.limits.reports ? '✓' : '✗'} Relatorios
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Webhook de Entrada ── */}
        {canEdit('/dashboard/settings') && <InboundWebhookSection />}

        {/* ── Webhooks de Saída ── */}
        {canEdit('/dashboard/settings') && <WebhooksSection />}

        {/* Planos */}
        {canEdit('/dashboard/settings') && <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,.04))' }} id="planos">
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '14px', display: 'block' }}>
            {isPending ? t('settings.choosePlan') : t('settings.availablePlans')}
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {(['starter', 'pro', 'enterprise', 'unlimited'] as const).map((slug) => {
              const isActive = planSlug === slug
              const isPopular = slug === 'pro'
              return (
                <div key={slug}
                  style={{ border: isActive ? '2px solid #22c55e' : isPopular ? '2px solid #7c3aed' : '1px solid var(--border)', borderRadius: '12px', padding: '18px', background: isActive ? '#f0fdf4' : 'var(--bg-card)', position: 'relative', transition: 'box-shadow 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,.07)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'}>
                  {isActive && <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '10px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '1px 8px', borderRadius: '99px' }}>{t('settings.current')}</span>}
                  {isPopular && !isActive && <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '10px', fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '1px 8px', borderRadius: '99px' }}>{t('settings.popular')}</span>}
                  <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)', marginBottom: '2px', letterSpacing: '-0.01em' }}>{PLAN_NAMES[slug]}</p>
                  <p style={{ color: 'var(--text-faint)', fontSize: '12px', marginBottom: '10px' }}>{PLAN_MSGS[slug]}</p>
                  <p style={{ fontWeight: 800, fontSize: '18px', color: 'var(--text)', marginBottom: '12px', letterSpacing: '-0.02em' }}>
                    {getPlanPrice(slug)}<span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-faint)' }}>/{t('settings.month')}</span>
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px' }}>
                    {PLAN_FEATURES[slug]?.map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Check size={11} color="#22c55e" />
                        <span style={{ fontSize: '12px', color: '#52525b' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  {!isActive && (
                    <button onClick={() => { setShowCpfModal(slug); setCpfCnpj('') }}
                      style={{ width: '100%', padding: '8px', background: isPopular ? '#7c3aed' : '#22c55e', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.1s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.opacity = '1'}>
                      {t('settings.subscribe')} {PLAN_NAMES[slug]}
                    </button>
                  )}
                  {isActive && !isPending && <div style={{ textAlign: 'center', fontSize: '12px', color: '#16a34a', fontWeight: 600, padding: '6px 0' }}>✓ {t('settings.activePlan')}</div>}
                </div>
              )
            })}
          </div>
          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '12px', marginTop: '14px' }}>
            {t('settings.paymentSecure')}
          </p>
        </div>}
      </div>

      {/* Modal CPF/CNPJ */}
      {showCpfModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowCpfModal(null) }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '28px', width: '380px', margin: '0 16px', border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(0,0,0,.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>{t('settings.subscribe')} {PLAN_NAMES[showCpfModal]}</h3>
              <button onClick={() => setShowCpfModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: '4px', display: 'flex' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>{t('settings.cpfCnpjNotice')}</p>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>{t('settings.cpfCnpj')}</label>
            <input
              type="text"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              value={cpfCnpj}
              onChange={e => setCpfCnpj(formatCpfCnpj(e.target.value))}
              maxLength={18}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '14px', outline: 'none', color: 'var(--text)', boxSizing: 'border-box' as const, marginBottom: '16px', background: 'var(--bg-input)', transition: 'border-color 0.15s' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = 'var(--bg-card)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-input)' }}
            />
            <button onClick={() => handleSubscribe(showCpfModal)} disabled={!!subscribing}
              style={{ width: '100%', padding: '11px', background: subscribing ? 'var(--border)' : '#22c55e', color: subscribing ? 'var(--text-faint)' : '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: subscribing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.1s' }}
              onMouseEnter={e => { if (!subscribing) (e.currentTarget as HTMLButtonElement).style.background = '#16a34a' }}
              onMouseLeave={e => { if (!subscribing) (e.currentTarget as HTMLButtonElement).style.background = '#22c55e' }}>
              {subscribing ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {t('settings.generatingLink')}</> : t('settings.generateLink')}
            </button>
            <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-faint)', marginTop: '12px' }}>
              {t('settings.redirectNotice')}
            </p>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
