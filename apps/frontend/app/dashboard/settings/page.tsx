'use client'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tenantApi, conversationApi } from '@/lib/api'
import { AlertTriangle, Zap, Check, Loader2, X, Webhook, Plus, Trash2, Eye, EyeOff, Copy, ChevronDown, ChevronUp, Bot, FileText, Palette, Bell, Volume2, VolumeX } from 'lucide-react'
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
    starter:    ['10k msgs/mes', '5 canais', '5 membros', '3 flows', '10k contatos', '10k IA/mes', 'Campanhas ilimitadas', '15 produtos'],
    pro:        ['50k msgs/mes', '10 canais', '10 membros', '15 flows', '50k contatos', '50k IA/mes', 'Campanhas ilimitadas', '100 produtos', 'Transcricao'],
    enterprise: ['150k msgs/mes', '30 canais', '30 membros', 'Flows ilimitados', '150k contatos', '150k IA/mes', 'Campanhas ilimitadas', '500 produtos', 'Relatorios'],
    unlimited:  ['Tudo ilimitado', 'Produtos ilimitados', 'API sem limites', 'SLA garantido', 'Gerente de conta'],
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

// ── Preferências de Notificação ──────────────────────────────────────────────
function NotificationSection() {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('autozap-sound') !== 'off' } catch { return true }
  })
  const [pushEnabled, setPushEnabled] = useState(() => {
    try { return localStorage.getItem('autozap-push') !== 'off' } catch { return true }
  })

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    localStorage.setItem('autozap-sound', next ? 'on' : 'off')
    toast.success(next ? 'Som ativado' : 'Som desativado')
  }

  const togglePush = () => {
    const next = !pushEnabled
    setPushEnabled(next)
    localStorage.setItem('autozap-push', next ? 'on' : 'off')
    if (next && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    toast.success(next ? 'Notificações ativadas' : 'Notificações desativadas')
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,.04))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Bell size={15} color="#22c55e" />
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Notificações</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-input)', borderRadius: '9px', border: '1px solid var(--divider)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {soundEnabled ? <Volume2 size={16} color="#22c55e" /> : <VolumeX size={16} color="var(--text-faint)" />}
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>Som de notificação</p>
              <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0 }}>Tocar som ao receber nova mensagem</p>
            </div>
          </div>
          <button onClick={toggleSound} style={{ width: '40px', height: '22px', borderRadius: '99px', border: 'none', cursor: 'pointer', background: soundEnabled ? '#22c55e' : 'var(--border)', position: 'relative', transition: 'background 0.2s', padding: 0 }}>
            <span style={{ position: 'absolute', top: '2px', left: soundEnabled ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-input)', borderRadius: '9px', border: '1px solid var(--divider)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Bell size={16} color={pushEnabled ? '#22c55e' : 'var(--text-faint)'} />
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', margin: 0 }}>Notificações push</p>
              <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0 }}>Receber alertas no navegador</p>
            </div>
          </div>
          <button onClick={togglePush} style={{ width: '40px', height: '22px', borderRadius: '99px', border: 'none', cursor: 'pointer', background: pushEnabled ? '#22c55e' : 'var(--border)', position: 'relative', transition: 'background 0.2s', padding: 0 }}>
            <span style={{ position: 'absolute', top: '2px', left: pushEnabled ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Teste de IA ─────────────────────────────────────────────────────────────
function AiTestChat({ prompt, model }: { prompt: string; model: string }) {
  const [testMsg, setTestMsg] = useState('')
  const [testReply, setTestReply] = useState('')
  const [testing, setTesting] = useState(false)

  const handleTest = async () => {
    if (!testMsg.trim() || !prompt.trim()) return
    setTesting(true)
    setTestReply('')
    try {
      const { data } = await tenantApi.post('/tenant/ai-test', { message: testMsg, prompt, model })
      setTestReply(data.data?.reply || 'Sem resposta')
    } catch { setTestReply('Erro ao testar. Verifique a API key.') }
    setTesting(false)
  }

  return (
    <div style={{ padding: '14px', background: 'var(--bg)', borderRadius: '9px', border: '1px solid var(--divider)' }}>
      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '8px' }}>Testar chatbot</p>
      <div style={{ display: 'flex', gap: '6px', marginBottom: testReply ? '10px' : 0 }}>
        <input value={testMsg} onChange={e => setTestMsg(e.target.value)} placeholder="Digite uma mensagem de teste..."
          onKeyDown={e => { if (e.key === 'Enter') handleTest() }}
          style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text)' }} />
        <button onClick={handleTest} disabled={testing || !testMsg.trim() || !prompt.trim()}
          style={{ padding: '8px 14px', background: '#2563eb', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, color: '#fff', cursor: testing ? 'not-allowed' : 'pointer', opacity: testing ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
          {testing ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Bot size={12} />}
          Testar
        </button>
      </div>
      {testReply && (
        <div style={{ padding: '10px 12px', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#2563eb', marginBottom: '4px', display: 'block' }}>Resposta da IA:</span>
          {testReply}
        </div>
      )}
    </div>
  )
}

// ── Chatbot IA ───────────────────────────────────────────────────────────────
function AiChatbotSection() {
  const t = useT()
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  const { data: tenant } = useQuery({
    queryKey: ['tenant'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant'); return data.data },
  })

  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiIncludeProducts, setAiIncludeProducts] = useState(false)
  const [aiModel, setAiModel] = useState('gpt-4o-mini')
  const [openaiKey, setOpenaiKey] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [aiPersonality, setAiPersonality] = useState<string>('personalizado')

  const personalityPresets: Record<string, string> = {
    formal: 'Voce e um assistente profissional. Use linguagem formal, trate o cliente por "senhor/senhora". Seja educado, objetivo e eficiente. Nao use emojis ou girias.',
    informal: 'Voce e um assistente amigavel e descontraido. Use linguagem informal, pode usar emojis. Trate o cliente pelo nome. Seja simpatico e prestativo.',
    vendedor: 'Voce e um consultor comercial experiente. Seu objetivo e ajudar o cliente a encontrar a melhor opcao e fechar negocio. Destaque beneficios, ofereca alternativas. Seja persuasivo mas nao insistente.',
    suporte: 'Voce e um agente de suporte. Seu foco e resolver o problema do cliente da forma mais rapida possivel. Faca perguntas objetivas para entender o problema. Ofereca solucoes passo a passo.',
    recepcionista: 'Voce e a recepcionista virtual da empresa. Seu foco e recepcionar, tirar duvidas basicas, informar horarios e agendar atendimentos. Seja cordial e organize as demandas.',
    consultor: 'Voce e um consultor especialista. Ajude o cliente a entender suas necessidades, tire duvidas tecnicas e recomende a melhor solucao. Seja didatico e paciente.',
  }

  useEffect(() => {
    if (tenant && !loaded) {
      setAiEnabled(tenant.settings?.aiChatbotEnabled ?? false)
      const savedPrompt = tenant.settings?.aiChatbotPrompt ?? ''
      setAiPrompt(savedPrompt)
      setAiIncludeProducts(tenant.settings?.aiIncludeProducts ?? false)
      setAiModel(tenant.settings?.aiModel ?? 'gpt-4o-mini')
      setOpenaiKey(tenant.metadata?.openai_api_key ?? '')
      // Detect if saved prompt matches a preset
      const matchedPreset = Object.entries(personalityPresets).find(([, v]) => v === savedPrompt)
      setAiPersonality(matchedPreset ? matchedPreset[0] : 'personalizado')
      setLoaded(true)
    }
  }, [tenant, loaded])

  const handleSave = async () => {
    setSaving(true)
    try {
      await tenantApi.patch('/tenant/settings', {
        settings: {
          aiChatbotEnabled: aiEnabled,
          aiChatbotPrompt: aiPrompt,
          aiIncludeProducts,
          aiModel,
        },
        metadata: {
          openai_api_key: openaiKey || undefined,
        },
      })
      queryClient.invalidateQueries({ queryKey: ['tenant'] })
      toast.success('Configuracoes de IA salvas com sucesso')
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Erro ao salvar configuracoes de IA')
    } finally { setSaving(false) }
  }

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    position: 'relative',
    width: '40px',
    height: '22px',
    background: active ? '#22c55e' : 'var(--border)',
    borderRadius: '99px',
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.2s',
    flexShrink: 0,
  })

  const toggleDot = (active: boolean): React.CSSProperties => ({
    position: 'absolute',
    top: '3px',
    left: active ? '20px' : '3px',
    width: '16px',
    height: '16px',
    background: '#fff',
    borderRadius: '50%',
    transition: 'left 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,.15)',
  })

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,.04))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f0f9ff', border: '1px solid #bae6fd', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bot size={16} color="#0284c7" />
        </div>
        <div>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: '2px' }}>Chatbot IA</span>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Configure o assistente de IA para responder clientes automaticamente</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Toggle: Ativar chatbot IA */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-input)', borderRadius: '9px', border: '1px solid var(--divider)' }}>
          <div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', display: 'block' }}>Ativar chatbot IA</span>
            <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>Responde automaticamente quando nenhum agente esta online</span>
          </div>
          <button onClick={() => setAiEnabled(!aiEnabled)} style={toggleStyle(aiEnabled)}>
            <div style={toggleDot(aiEnabled)} />
          </button>
        </div>

        {/* Personalidade do chatbot */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '8px' }}>Personalidade</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {([
              { key: 'formal', label: 'Formal' },
              { key: 'informal', label: 'Informal' },
              { key: 'vendedor', label: 'Vendedor' },
              { key: 'suporte', label: 'Suporte' },
              { key: 'recepcionista', label: 'Recepcionista' },
              { key: 'consultor', label: 'Consultor' },
              { key: 'personalizado', label: 'Personalizado' },
            ] as const).map(p => (
              <button
                key={p.key}
                onClick={() => {
                  setAiPersonality(p.key)
                  if (p.key === 'personalizado') {
                    setAiPrompt('')
                  } else {
                    setAiPrompt(personalityPresets[p.key])
                  }
                }}
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '99px',
                  border: aiPersonality === p.key ? '1.5px solid #22c55e' : '1px solid var(--border)',
                  background: aiPersonality === p.key ? '#f0fdf4' : 'var(--bg-input)',
                  color: aiPersonality === p.key ? '#16a34a' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt do sistema */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>Prompt do sistema</label>
          <textarea
            placeholder="Voce e o assistente da [empresa]. Ajude clientes com duvidas sobre produtos, precos e agendamentos."
            value={aiPrompt}
            onChange={e => { setAiPrompt(e.target.value); setAiPersonality('personalizado') }}
            rows={4}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text)', background: 'var(--bg-card)', boxSizing: 'border-box' as const, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }}
            onFocus={e => e.currentTarget.style.borderColor = '#22c55e'}
            onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
          />
          <p style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>Instrucoes que definem a personalidade e escopo do chatbot. {aiPersonality !== 'personalizado' ? 'Voce pode editar o texto acima livremente.' : ''}</p>
        </div>

        {/* Toggle: Incluir catálogo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-input)', borderRadius: '9px', border: '1px solid var(--divider)' }}>
          <div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', display: 'block' }}>Incluir catalogo de produtos no contexto</span>
            <span style={{ fontSize: '11.5px', color: 'var(--text-faint)' }}>O chatbot tera acesso aos seus produtos para responder com precos e detalhes</span>
          </div>
          <button onClick={() => setAiIncludeProducts(!aiIncludeProducts)} style={toggleStyle(aiIncludeProducts)}>
            <div style={toggleDot(aiIncludeProducts)} />
          </button>
        </div>

        {/* Modelo */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>Modelo</label>
          <select
            value={aiModel}
            onChange={e => setAiModel(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text)', background: 'var(--bg-card)', cursor: 'pointer', fontFamily: 'inherit' }}
            onFocus={(e: any) => e.currentTarget.style.borderColor = '#22c55e'}
            onBlur={(e: any) => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <option value="gpt-4o-mini">gpt-4o-mini (mais rapido)</option>
            <option value="gpt-4o">gpt-4o (mais inteligente)</option>
          </select>
        </div>

        {/* Chave OpenAI */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>Chave OpenAI</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showApiKey ? 'text' : 'password'}
              placeholder="sk-..."
              value={openaiKey}
              onChange={e => setOpenaiKey(e.target.value)}
              style={{ width: '100%', padding: '9px 36px 9px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text)', background: 'var(--bg-card)', boxSizing: 'border-box' as const, fontFamily: 'ui-monospace, monospace' }}
              onFocus={e => e.currentTarget.style.borderColor = '#22c55e'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
            <button onClick={() => setShowApiKey(s => !s)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex' }}>
              {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>Sua chave da API OpenAI. Necessaria para o chatbot funcionar.</p>
        </div>

        {/* Testar IA */}
        <AiTestChat prompt={aiPrompt} model={aiModel} />

        {/* Salvar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleSave} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 22px', background: '#22c55e', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'all 0.12s' }}
            onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#16a34a' }}
            onMouseLeave={e => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#22c55e' }}>
            {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
            Salvar configuracoes de IA
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Formulário de Captura (Form Builder) ─────────────────────────────────────
function FormBuilderSection() {
  const { user } = useAuthStore()
  const { data: tenant } = useQuery({
    queryKey: ['tenant'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant'); return data.data },
  })

  const webhookToken = tenant?.webhookToken || ''

  const [formTitle, setFormTitle] = useState('Entre em contato')
  const [formButton, setFormButton] = useState('Enviar')
  const [formColor, setFormColor] = useState('22c55e')
  const [fieldEmail, setFieldEmail] = useState(false)
  const [fieldCompany, setFieldCompany] = useState(false)
  const [fieldMessage, setFieldMessage] = useState(false)
  const [customFields, setCustomFields] = useState<{ label: string; type: string }[]>([])
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldType, setNewFieldType] = useState('text')
  const [formLogo, setFormLogo] = useState('')
  const [formBgColor, setFormBgColor] = useState('f4f4f5')
  const [formSuccessText, setFormSuccessText] = useState('Obrigado pelo contato! Retornaremos em breve.')
  const [formHideBrand, setFormHideBrand] = useState(false)
  const [copied, setCopied] = useState(false)

  const PRESET_COLORS = [
    { value: '22c55e', label: 'Verde' },
    { value: '3b82f6', label: 'Azul' },
    { value: '8b5cf6', label: 'Roxo' },
    { value: 'f97316', label: 'Laranja' },
    { value: 'ef4444', label: 'Vermelho' },
    { value: '06b6d4', label: 'Ciano' },
    { value: 'ec4899', label: 'Rosa' },
    { value: '18181b', label: 'Preto' },
  ]

  const formFields = ['name', 'phone', ...(fieldEmail ? ['email'] : []), ...(fieldCompany ? ['company'] : []), ...(fieldMessage ? ['message'] : [])]
  const customParam = customFields.length > 0 ? `&custom=${encodeURIComponent(JSON.stringify(customFields))}` : ''
  const extraParams = `${formLogo ? `&logo=${encodeURIComponent(formLogo)}` : ''}${formBgColor !== 'f4f4f5' ? `&bg=${formBgColor}` : ''}${formSuccessText !== 'Obrigado pelo contato! Retornaremos em breve.' ? `&success=${encodeURIComponent(formSuccessText)}` : ''}${formHideBrand ? '&brand=0' : ''}`
  const formUrl = webhookToken
    ? `https://useautozap.app/form/${webhookToken}?title=${encodeURIComponent(formTitle)}&button=${encodeURIComponent(formButton)}&color=${formColor}&fields=${formFields.join(',')}${customParam}${extraParams}`
    : ''
  const embedCode = formUrl ? `<iframe src="${formUrl}" width="100%" height="500" frameborder="0"></iframe>` : ''

  const copyEmbed = () => {
    if (embedCode) {
      navigator.clipboard.writeText(embedCode)
      setCopied(true)
      toast.success('Codigo copiado!')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const fieldLabelMap: Record<string, string> = {
    name: 'Nome',
    phone: 'Telefone',
    email: 'Email',
    company: 'Empresa',
    message: 'Mensagem',
  }
  const fieldPlaceholderMap: Record<string, string> = {
    name: 'Seu nome',
    phone: '(11) 99999-9999',
    email: 'seu@email.com',
    company: 'Nome da empresa',
    message: 'Sua mensagem...',
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow, 0 1px 3px rgba(0,0,0,.04))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileText size={16} color="#16a34a" />
        </div>
        <div>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: '2px' }}>Formulario de captura</span>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Gere um formulario HTML para capturar leads direto no seu inbox</p>
        </div>
      </div>

      {!webhookToken ? (
        <div style={{ textAlign: 'center', padding: '20px', background: 'var(--bg-input)', borderRadius: '9px', border: '1px solid var(--divider)' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Gere primeiro o token de webhook acima para usar o formulario de captura.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Field config */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '8px' }}>Campos do formulario</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { key: 'name', label: 'Nome', checked: true, disabled: true },
                { key: 'phone', label: 'Telefone (obrigatorio)', checked: true, disabled: true },
                { key: 'email', label: 'Email', checked: fieldEmail, onChange: () => setFieldEmail(!fieldEmail) },
                { key: 'company', label: 'Empresa', checked: fieldCompany, onChange: () => setFieldCompany(!fieldCompany) },
                { key: 'message', label: 'Mensagem', checked: fieldMessage, onChange: () => setFieldMessage(!fieldMessage) },
              ].map(f => (
                <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '7px', border: `1px solid ${f.checked ? '#bbf7d0' : 'var(--divider)'}`, background: f.checked ? '#f0fdf4' : 'var(--bg-card)', cursor: f.disabled ? 'default' : 'pointer', opacity: f.disabled ? 0.7 : 1 }}>
                  <input type="checkbox" checked={f.checked} disabled={f.disabled} onChange={f.onChange} style={{ width: '14px', height: '14px', accentColor: '#22c55e', cursor: f.disabled ? 'default' : 'pointer' }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{f.label}</span>
                </label>
              ))}
            </div>

            {/* Campos customizados */}
            {customFields.map((cf, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '7px', border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', flex: 1 }}>{cf.label} <span style={{ fontSize: '10px', color: 'var(--text-faint)' }}>({cf.type})</span></span>
                <button onClick={() => setCustomFields(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faintest)', padding: '2px', display: 'flex' }}>
                  <X size={12} />
                </button>
              </div>
            ))}

            {/* Adicionar campo */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} placeholder="Nome do campo" style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', outline: 'none', color: 'var(--text)', background: 'var(--bg-card)', boxSizing: 'border-box' as const }}
                onKeyDown={e => { if (e.key === 'Enter' && newFieldLabel.trim()) { setCustomFields(prev => [...prev, { label: newFieldLabel.trim(), type: newFieldType }]); setNewFieldLabel('') } }} />
              <select value={newFieldType} onChange={e => setNewFieldType(e.target.value)} style={{ padding: '7px 8px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', color: 'var(--text)', background: 'var(--bg-card)', outline: 'none' }}>
                <option value="text">Texto</option>
                <option value="number">Numero</option>
                <option value="date">Data</option>
                <option value="textarea">Texto longo</option>
              </select>
              <button onClick={() => { if (newFieldLabel.trim()) { setCustomFields(prev => [...prev, { label: newFieldLabel.trim(), type: newFieldType }]); setNewFieldLabel('') } }}
                style={{ padding: '7px 12px', background: '#22c55e', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                <Plus size={12} /> Adicionar
              </button>
            </div>
          </div>

          {/* Customization */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>Titulo</label>
              <input
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text)', background: 'var(--bg-card)', boxSizing: 'border-box' as const }}
                onFocus={e => e.currentTarget.style.borderColor = '#22c55e'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>Texto do botao</label>
              <input
                value={formButton}
                onChange={e => setFormButton(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text)', background: 'var(--bg-card)', boxSizing: 'border-box' as const }}
                onFocus={e => e.currentTarget.style.borderColor = '#22c55e'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Palette size={13} /> Cor principal
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setFormColor(c.value)}
                  title={c.label}
                  style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: `#${c.value}`,
                    border: formColor === c.value ? '3px solid var(--text)' : '2px solid transparent',
                    cursor: 'pointer',
                    boxShadow: formColor === c.value ? '0 0 0 2px var(--bg-card)' : 'none',
                    transition: 'all 0.15s',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Logo */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>Logo da empresa (URL da imagem)</label>
            <input value={formLogo} onChange={e => setFormLogo(e.target.value)} placeholder="https://exemplo.com/logo.png"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text)', background: 'var(--bg-card)', boxSizing: 'border-box' as const }}
              onFocus={e => e.currentTarget.style.borderColor = '#22c55e'} onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'} />
          </div>

          {/* Background + Success */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>Cor de fundo</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[{ value: 'f4f4f5', label: 'Cinza' }, { value: 'ffffff', label: 'Branco' }, { value: '18181b', label: 'Preto' }, { value: 'eff6ff', label: 'Azul' }, { value: 'f0fdf4', label: 'Verde' }, { value: 'fef2f2', label: 'Rosa' }].map(c => (
                  <button key={c.value} onClick={() => setFormBgColor(c.value)} title={c.label}
                    style={{ width: '28px', height: '28px', borderRadius: '6px', background: `#${c.value}`, border: formBgColor === c.value ? '3px solid var(--text)' : '2px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s' }} />
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>Texto de sucesso</label>
              <input value={formSuccessText} onChange={e => setFormSuccessText(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text)', background: 'var(--bg-card)', boxSizing: 'border-box' as const }}
                onFocus={e => e.currentTarget.style.borderColor = '#22c55e'} onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'} />
            </div>
          </div>

          {/* Hide brand */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input type="checkbox" checked={formHideBrand} onChange={() => setFormHideBrand(!formHideBrand)} style={{ width: '14px', height: '14px', accentColor: '#22c55e' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Esconder "Powered by AutoZap"</span>
          </label>

          {/* Live Preview */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '8px' }}>Pre-visualizacao</label>
            <div style={{ background: `#${formBgColor}`, borderRadius: '10px', padding: '24px', display: 'flex', justifyContent: 'center' }}>
              <div style={{ background: '#fff', borderRadius: '12px', padding: '28px 24px', width: '100%', maxWidth: '380px', boxShadow: '0 4px 20px rgba(0,0,0,.08)' }}>
                {formLogo && <img src={formLogo} alt="logo" style={{ maxHeight: '40px', maxWidth: '160px', display: 'block', margin: '0 auto 16px', objectFit: 'contain' }} />}
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#18181b', marginBottom: '20px', textAlign: 'center' }}>{formTitle || 'Entre em contato'}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {formFields.map(f => (
                    <div key={f}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '4px' }}>
                        {fieldLabelMap[f]} {(f === 'phone' || f === 'name') && <span style={{ color: '#ef4444' }}>*</span>}
                      </label>
                      {f === 'message' ? (
                        <textarea disabled placeholder={fieldPlaceholderMap[f]} rows={3} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', background: '#fafafa', color: '#a1a1aa', resize: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
                      ) : (
                        <input disabled placeholder={fieldPlaceholderMap[f]} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', background: '#fafafa', color: '#a1a1aa', boxSizing: 'border-box' as const }} />
                      )}
                    </div>
                  ))}
                  {customFields.map((cf, i) => (
                    <div key={`custom-${i}`}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '4px' }}>{cf.label}</label>
                      {cf.type === 'textarea' ? (
                        <textarea disabled placeholder={cf.label} rows={3} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', background: '#fafafa', color: '#a1a1aa', resize: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
                      ) : (
                        <input disabled type={cf.type} placeholder={cf.label} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', background: '#fafafa', color: '#a1a1aa', boxSizing: 'border-box' as const }} />
                      )}
                    </div>
                  ))}
                  <button
                    disabled
                    style={{ width: '100%', padding: '10px', background: `#${formColor}`, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'default', marginTop: '4px' }}
                  >
                    {formButton || 'Enviar'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Embed code */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>Codigo para incorporar</label>
            <div style={{ position: 'relative' }}>
              <textarea
                readOnly
                value={embedCode}
                rows={3}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '11px', color: 'var(--text)', background: 'var(--bg-input)', boxSizing: 'border-box' as const, fontFamily: 'ui-monospace, monospace', resize: 'none', lineHeight: 1.5 }}
              />
              <button
                onClick={copyEmbed}
                style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: copied ? '#f0fdf4' : 'var(--bg-card)', border: `1px solid ${copied ? '#bbf7d0' : 'var(--border)'}`, borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: copied ? '#16a34a' : 'var(--text-muted)', cursor: 'pointer' }}
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>
              Cole este codigo no HTML do seu site. O formulario enviara leads diretamente para o seu inbox.
            </p>
          </div>

          {/* Direct link */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>Link direto</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <code style={{ flex: 1, fontSize: '11px', color: 'var(--text)', background: 'var(--bg-input)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', wordBreak: 'break-all' as const, lineHeight: 1.4 }}>
                {formUrl}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(formUrl); toast.success('Link copiado!') }}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-faint)', padding: '6px 8px', display: 'flex', flexShrink: 0 }}
              >
                <Copy size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
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
    const prices: Record<string, string> = { starter: 'R$ 149,99', pro: 'R$ 299,99', enterprise: 'R$ 599,99', unlimited: 'R$ 999,99' }
    return prices[slug] || ''
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

        {/* ── Formulário de Captura ── */}
        {canEdit('/dashboard/settings') && <FormBuilderSection />}

        {/* ── Notificações ── */}
        <NotificationSection />


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
