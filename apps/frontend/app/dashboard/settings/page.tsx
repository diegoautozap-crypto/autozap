'use client'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tenantApi, conversationApi } from '@/lib/api'
import { AlertTriangle, Zap, Check, Loader2, X, Webhook, Plus, Trash2, Eye, EyeOff, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'

const PLAN_NAMES: Record<string, string> = {
  trial:      'Trial',
  starter:    'Starter',
  pro:        'Pro',
  enterprise: 'Enterprise',
  unlimited:  'Unlimited',
}

const PLAN_MSGS: Record<string, string> = {
  starter:    '10.000 msgs',
  pro:        '50.000 msgs',
  enterprise: '100.000 msgs',
  unlimited:  'Ilimitado',
}

const PLAN_FEATURES: Record<string, string[]> = {
  starter:    ['10.000 mensagens/mês', 'Inbox em tempo real', 'Campanhas em massa', 'CRM de contatos'],
  pro:        ['50.000 mensagens/mês', 'Tudo do Starter', 'Múltiplos usuários', 'Suporte prioritário'],
  enterprise: ['100.000 mensagens/mês', 'Tudo do Pro', 'API dedicada', 'SLA garantido'],
  unlimited:  ['Mensagens ilimitadas', 'Tudo do Enterprise', 'Onboarding dedicado', 'Suporte 24/7'],
}

const WEBHOOK_EVENTS = [
  { key: 'message.received',           label: 'Mensagem recebida',         desc: 'Chega uma nova mensagem de um contato' },
  { key: 'conversation.status_changed', label: 'Conversa mudou de status',  desc: 'Conversa foi aberta, fechada ou colocada em espera' },
  { key: 'conversation.assigned',       label: 'Conversa assumida',         desc: 'Atendente assumiu ou liberou o bot' },
  { key: 'pipeline.stage_changed',      label: 'Card movido no pipeline',   desc: 'Card foi arrastado para outra coluna' },
]

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
    ? `https://autozapmessage-service-production.up.railway.app/webhook/lead/${token}`
    : null

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const { data } = await tenantApi.post('/tenant/webhook-token')
      setToken(data.data.token)
      toast.success('Token gerado!')
    } catch { toast.error('Erro ao gerar token') }
    finally { setGenerating(false) }
  }

  const copyUrl = () => {
    if (webhookUrl) { navigator.clipboard.writeText(webhookUrl); toast.success('URL copiada!') }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
      <div style={{ marginBottom: '16px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: '4px' }}>Webhook de Entrada — Captura de Leads</span>
        <p style={{ fontSize: '12px', color: '#71717a' }}>Receba leads de formulários da Meta, Zapier, Make ou qualquer sistema externo direto no CRM</p>
      </div>

      {!token ? (
        <div style={{ textAlign: 'center', padding: '20px', background: '#fafafa', borderRadius: '9px', border: '1px solid #f4f4f5' }}>
          <p style={{ fontSize: '13px', color: '#71717a', marginBottom: '12px' }}>Gere sua URL única para receber leads externos</p>
          <button onClick={handleGenerate} disabled={generating}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 18px', background: '#22c55e', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1 }}>
            {generating ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />}
            Gerar URL
          </button>
        </div>
      ) : (
        <div>
          <div style={{ background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <code style={{ flex: 1, fontSize: '11px', color: '#18181b', wordBreak: 'break-all' as const }}>
              {showToken ? webhookUrl : webhookUrl?.replace(/\/[^/]+$/, '/••••••••••••')}
            </code>
            <button onClick={() => setShowToken(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', display: 'flex', flexShrink: 0 }}>
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button onClick={copyUrl} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', display: 'flex', flexShrink: 0 }}>
              <Copy size={14} />
            </button>
          </div>

          <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '12px', lineHeight: 1.6 }}>
            <p style={{ fontWeight: 600, color: '#52525b', marginBottom: '6px' }}>Campos aceitos no POST:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              {[
                ['phone / phone_number', 'Telefone (obrigatório)'],
                ['name / full_name', 'Nome do contato'],
                ['email', 'Email'],
                ['source / campaign_name', 'Origem do lead'],
                ['message / mensagem', 'Mensagem inicial'],
              ].map(([field, desc]) => (
                <div key={field} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <code style={{ fontSize: '10px', background: '#f4f4f5', padding: '1px 5px', borderRadius: '4px', color: '#18181b', flexShrink: 0 }}>{field}</code>
                  <span style={{ fontSize: '11px', color: '#a1a1aa' }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <details>
            <summary style={{ fontSize: '12px', color: '#a1a1aa', cursor: 'pointer', userSelect: 'none' as const }}>Ver exemplo de payload</summary>
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['webhook-configs'] }); toast.success('Webhook removido') },
    onError: () => toast.error('Erro ao remover webhook'),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await tenantApi.patch(`/tenant/webhooks/${id}`, { active })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhook-configs'] }),
    onError: () => toast.error('Erro ao atualizar webhook'),
  })

  const toggleEvent = (key: string) => {
    setSelectedEvents(prev =>
      prev.includes(key) ? prev.filter(e => e !== key) : [...prev, key]
    )
  }

  const handleSave = async () => {
    if (!url.trim()) { toast.error('URL é obrigatória'); return }
    if (!url.startsWith('http')) { toast.error('URL inválida — deve começar com http:// ou https://'); return }
    if (selectedEvents.length === 0) { toast.error('Selecione pelo menos um evento'); return }
    setSaving(true)
    try {
      await tenantApi.post('/tenant/webhooks', {
        url: url.trim(),
        events: selectedEvents,
        secret: secret.trim() || null,
      })
      queryClient.invalidateQueries({ queryKey: ['webhook-configs'] })
      toast.success('Webhook configurado!')
      setShowForm(false); setUrl(''); setSecret(''); setSelectedEvents(['message.received'])
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Erro ao salvar webhook')
    } finally { setSaving(false) }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    try {
      await tenantApi.post(`/tenant/webhooks/${id}/test`)
      toast.success('Evento de teste enviado!')
    } catch { toast.error('Erro ao enviar teste') }
    finally { setTestingId(null) }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: '4px' }}>Webhooks & Integrações</span>
          <p style={{ fontSize: '12px', color: '#71717a' }}>Envie eventos para Zapier, n8n, Make ou qualquer URL</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: '#22c55e', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
            <Plus size={13} /> Novo webhook
          </button>
        )}
      </div>

      {/* Formulário de criação */}
      {showForm && (
        <div style={{ background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '10px', padding: '18px', marginBottom: '16px' }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>URL do webhook *</label>
            <input
              placeholder="https://hooks.zapier.com/hooks/catch/..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#18181b', background: '#fff', boxSizing: 'border-box' as const }}
              onFocus={e => e.currentTarget.style.borderColor = '#22c55e'}
              onBlur={e => e.currentTarget.style.borderColor = '#e4e4e7'}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>
              Secret (opcional) <span style={{ fontWeight: 400, color: '#a1a1aa' }}>— para verificar autenticidade</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showSecret ? 'text' : 'password'}
                placeholder="Deixe em branco para não usar"
                value={secret}
                onChange={e => setSecret(e.target.value)}
                style={{ width: '100%', padding: '9px 36px 9px 12px', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#18181b', background: '#fff', boxSizing: 'border-box' as const }}
                onFocus={e => e.currentTarget.style.borderColor = '#22c55e'}
                onBlur={e => e.currentTarget.style.borderColor = '#e4e4e7'}
              />
              <button onClick={() => setShowSecret(s => !s)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', display: 'flex' }}>
                {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '8px' }}>Eventos *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {WEBHOOK_EVENTS.map(ev => (
                <label key={ev.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '7px', border: `1px solid ${selectedEvents.includes(ev.key) ? '#bbf7d0' : '#f4f4f5'}`, background: selectedEvents.includes(ev.key) ? '#f0fdf4' : '#fff', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedEvents.includes(ev.key)} onChange={() => toggleEvent(ev.key)} style={{ width: '14px', height: '14px', accentColor: '#22c55e', cursor: 'pointer' }} />
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#18181b', display: 'block' }}>{ev.label}</span>
                    <span style={{ fontSize: '11px', color: '#a1a1aa' }}>{ev.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowForm(false); setUrl(''); setSecret(''); setSelectedEvents(['message.received']) }}
              style={{ padding: '8px 16px', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', color: '#52525b', cursor: 'pointer' }}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', background: '#22c55e', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
              Salvar webhook
            </button>
          </div>
        </div>
      )}

      {/* Lista de webhooks */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#d4d4d8' }} />
        </div>
      ) : webhooks.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '24px', color: '#a1a1aa' }}>
          <Webhook size={24} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
          <p style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Nenhum webhook configurado</p>
          <p style={{ fontSize: '12px' }}>Adicione um para integrar com Zapier, n8n, Make e outros</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(webhooks as any[]).map((wh: any) => (
            <div key={wh.id} style={{ border: '1px solid #e4e4e7', borderRadius: '9px', padding: '12px 14px', background: wh.active ? '#fff' : '#fafafa', opacity: wh.active ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: wh.active ? '#22c55e' : '#d4d4d8', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wh.url}</span>
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
                    title="Enviar evento de teste"
                    style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', border: '1px solid #e4e4e7', borderRadius: '6px', background: '#fafafa', color: '#52525b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {testingId === wh.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={11} />}
                    Testar
                  </button>
                  <button onClick={() => toggleMutation.mutate({ id: wh.id, active: !wh.active })}
                    title={wh.active ? 'Desativar' : 'Ativar'}
                    style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', border: `1px solid ${wh.active ? '#fde68a' : '#bbf7d0'}`, borderRadius: '6px', background: wh.active ? '#fffbeb' : '#f0fdf4', color: wh.active ? '#d97706' : '#16a34a', cursor: 'pointer' }}>
                    {wh.active ? 'Pausar' : 'Ativar'}
                  </button>
                  <button onClick={() => { if (confirm('Remover webhook?')) deleteMutation.mutate(wh.id) }}
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
        <summary style={{ fontSize: '12px', color: '#a1a1aa', cursor: 'pointer', userSelect: 'none' }}>Ver exemplo de payload</summary>
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
  const { user } = useAuthStore()
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [showCpfModal, setShowCpfModal] = useState<string | null>(null)
  const [cpfCnpj, setCpfCnpj] = useState('')

  const { data: usage } = useQuery({
    queryKey: ['usage'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant/usage'); return data.data },
    refetchInterval: 30000,
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
  const planSlug = tenant?.planSlug ?? 'trial'
  const planName = PLAN_NAMES[planSlug] ?? planSlug
  const isWarning = pct > 80
  const isTrial = planSlug === 'trial'
  const trialEndsAt = subscription?.trial_ends_at || subscription?.current_period_end
  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null
  const trialExpired = (isTrial && pct >= 100) || (trialDaysLeft !== null && trialDaysLeft === 0)

  const handleSubscribe = async (slug: string) => {
    const digits = cpfCnpj.replace(/\D/g, '')
    if (digits.length !== 11 && digits.length !== 14) { toast.error('CPF ou CNPJ inválido'); return }
    setSubscribing(slug)
    try {
      const { data } = await tenantApi.post('/tenant/billing/subscribe', { planSlug: slug, cpfCnpj: digits })
      const paymentUrl = data.data?.paymentUrl
      if (paymentUrl) {
        window.open(paymentUrl, '_blank')
        toast.success('Redirecionando para o pagamento...')
        setShowCpfModal(null); setCpfCnpj('')
      } else {
        toast.error('Erro ao gerar link de pagamento')
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Erro ao criar assinatura')
    } finally { setSubscribing(null) }
  }

  const getPlanPrice = (slug: string) => {
    if (!plans) {
      const prices: Record<string, string> = { starter: 'R$ 97', pro: 'R$ 197', enterprise: 'R$ 397', unlimited: 'R$ 697' }
      return prices[slug] || ''
    }
    const plan = plans.find((p: any) => p.slug === slug)
    return plan ? `R$ ${Number(plan.price_monthly).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : ''
  }

  const barColor = trialExpired ? '#ef4444' : isWarning ? '#f97316' : '#22c55e'

  return (
    <div style={{ padding: '32px', maxWidth: '700px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#18181b', letterSpacing: '-0.02em', marginBottom: '4px' }}>Plano e Configurações</h1>
      <p style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '28px' }}>Gerencie sua conta e uso do plano</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Banner trial expirado */}
        {isTrial && trialExpired && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertTriangle size={18} color="#ef4444" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 700, color: '#dc2626', fontSize: '14px', marginBottom: '4px' }}>Seu trial expirou</p>
              <p style={{ color: '#71717a', fontSize: '13px', marginBottom: '14px' }}>Escolha um plano abaixo para continuar usando o AutoZap.</p>
              <a href="#planos" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#22c55e', color: '#fff', borderRadius: '7px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                <Zap size={13} /> Ver planos
              </a>
            </div>
          </div>
        )}

        {/* Banner trial ativo */}
        {isTrial && !trialExpired && (
          <div style={{ background: trialDaysLeft !== null && trialDaysLeft <= 2 ? '#fffbeb' : '#f0fdf4', border: `1px solid ${trialDaysLeft !== null && trialDaysLeft <= 2 ? '#fde68a' : '#bbf7d0'}`, borderRadius: '12px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 600, color: '#18181b', fontSize: '14px', marginBottom: '2px' }}>
                {trialDaysLeft !== null && trialDaysLeft <= 2 ? `⚠️ Trial expira em ${trialDaysLeft} dia${trialDaysLeft !== 1 ? 's' : ''}!` : `🎉 Trial ativo — ${usage?.remaining ?? 0} mensagens restantes`}
              </p>
              <p style={{ color: '#71717a', fontSize: '13px' }}>Escolha um plano para não perder o acesso</p>
            </div>
            <a href="#planos" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#22c55e', color: '#fff', borderRadius: '7px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
              <Zap size={13} /> Fazer upgrade
            </a>
          </div>
        )}

        {/* Banner plano ativo */}
        {!isTrial && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 600, color: '#15803d', fontSize: '14px', marginBottom: '2px' }}>✅ Plano {planName} ativo</p>
              <p style={{ color: '#71717a', fontSize: '13px' }}>{subscription?.status === 'active' ? 'Assinatura recorrente ativa' : 'Aguardando confirmação de pagamento'}</p>
            </div>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#15803d', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '4px 14px', borderRadius: '99px' }}>{getPlanPrice(planSlug)}/mês</span>
          </div>
        )}

        {/* Perfil */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '14px', display: 'block' }}>Perfil</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#71717a' }}>Email</span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#18181b' }}>{user?.email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#71717a' }}>Plano atual</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: isTrial ? '#d97706' : '#16a34a', background: isTrial ? '#fffbeb' : '#f0fdf4', border: `1px solid ${isTrial ? '#fde68a' : '#bbf7d0'}`, padding: '2px 10px', borderRadius: '99px' }}>
                {isTrial ? '🎯 Trial (7 dias)' : planName}
              </span>
            </div>
          </div>
        </div>

        {/* Uso do mês */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '14px', display: 'block' }}>Uso do mês</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: '#71717a' }}>Mensagens enviadas</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#18181b' }}>{sent.toLocaleString()} / {limit === null ? '∞' : limit.toLocaleString()}</span>
          </div>
          <div style={{ height: '6px', background: '#f4f4f5', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, borderRadius: '99px', transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '12px', color: trialExpired ? '#ef4444' : isWarning ? '#f97316' : '#a1a1aa', fontWeight: isWarning ? 600 : 400 }}>{pct}% utilizado</span>
            {limit !== null && <span style={{ fontSize: '12px', color: '#a1a1aa' }}>{Math.max(0, limit - sent).toLocaleString()} restantes</span>}
          </div>
        </div>

        {/* ── Webhook de Entrada ── */}
        <InboundWebhookSection />

        {/* ── Webhooks de Saída ── */}
        <WebhooksSection />

        {/* Planos */}
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }} id="planos">
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '14px', display: 'block' }}>
            {isTrial ? '🚀 Escolha seu plano' : 'Planos disponíveis'}
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {(['starter', 'pro', 'enterprise', 'unlimited'] as const).map((slug) => {
              const isActive = planSlug === slug
              const isPopular = slug === 'pro'
              return (
                <div key={slug}
                  style={{ border: isActive ? '2px solid #22c55e' : isPopular ? '2px solid #7c3aed' : '1px solid #e4e4e7', borderRadius: '12px', padding: '18px', background: isActive ? '#f0fdf4' : '#fff', position: 'relative', transition: 'box-shadow 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,.07)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'}>
                  {isActive && <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '10px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '1px 8px', borderRadius: '99px' }}>Atual</span>}
                  {isPopular && !isActive && <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '10px', fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '1px 8px', borderRadius: '99px' }}>Popular</span>}
                  <p style={{ fontWeight: 700, fontSize: '15px', color: '#18181b', marginBottom: '2px', letterSpacing: '-0.01em' }}>{PLAN_NAMES[slug]}</p>
                  <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '10px' }}>{PLAN_MSGS[slug]}</p>
                  <p style={{ fontWeight: 800, fontSize: '18px', color: '#18181b', marginBottom: '12px', letterSpacing: '-0.02em' }}>
                    {getPlanPrice(slug)}<span style={{ fontSize: '12px', fontWeight: 400, color: '#a1a1aa' }}>/mês</span>
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
                      Assinar {PLAN_NAMES[slug]}
                    </button>
                  )}
                  {isActive && !isTrial && <div style={{ textAlign: 'center', fontSize: '12px', color: '#16a34a', fontWeight: 600, padding: '6px 0' }}>✓ Plano ativo</div>}
                </div>
              )
            })}
          </div>
          <p style={{ textAlign: 'center', color: '#a1a1aa', fontSize: '12px', marginTop: '14px' }}>
            Pagamento seguro via PIX ou cartão de crédito • Cancele quando quiser
          </p>
        </div>
      </div>

      {/* Modal CPF/CNPJ */}
      {showCpfModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowCpfModal(null) }}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '28px', width: '380px', margin: '0 16px', border: '1px solid #e4e4e7', boxShadow: '0 24px 60px rgba(0,0,0,.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#18181b', margin: 0, letterSpacing: '-0.01em' }}>Assinar {PLAN_NAMES[showCpfModal]}</h3>
              <button onClick={() => setShowCpfModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: '4px', display: 'flex' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: '#71717a', marginBottom: '16px' }}>Informe seu CPF ou CNPJ para criar a assinatura.</p>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#52525b', display: 'block', marginBottom: '6px' }}>CPF ou CNPJ</label>
            <input
              type="text"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              value={cpfCnpj}
              onChange={e => setCpfCnpj(formatCpfCnpj(e.target.value))}
              maxLength={18}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', outline: 'none', color: '#18181b', boxSizing: 'border-box' as const, marginBottom: '16px', background: '#fafafa', transition: 'border-color 0.15s' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = '#fff' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e4e4e7'; e.currentTarget.style.background = '#fafafa' }}
            />
            <button onClick={() => handleSubscribe(showCpfModal)} disabled={!!subscribing}
              style={{ width: '100%', padding: '11px', background: subscribing ? '#e4e4e7' : '#22c55e', color: subscribing ? '#a1a1aa' : '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: subscribing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.1s' }}
              onMouseEnter={e => { if (!subscribing) (e.currentTarget as HTMLButtonElement).style.background = '#16a34a' }}
              onMouseLeave={e => { if (!subscribing) (e.currentTarget as HTMLButtonElement).style.background = '#22c55e' }}>
              {subscribing ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Gerando link...</> : 'Gerar link de pagamento'}
            </button>
            <p style={{ textAlign: 'center', fontSize: '12px', color: '#a1a1aa', marginTop: '12px' }}>
              Você será redirecionado para pagar via PIX ou cartão
            </p>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
