'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'
import { Node } from '@xyflow/react'
import { X, Copy, RefreshCw, Loader2, Plus, Play } from 'lucide-react'
import { NODE_COLORS, DEFAULT_STAGES, getNodeLabels, getSendSubtypes, getTagSubtypes, getLoopSubtypes } from './constants'
import { MediaUpload, ConditionPanel } from './ConditionPanel'
import { messageApi, contactApi, conversationApi, tenantApi } from '@/lib/api'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { usePermissions } from '@/store/permissions.store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MESSAGE_SERVICE_URL = process.env.NEXT_PUBLIC_MESSAGE_SERVICE_URL || 'https://autozapmessage-service-production.up.railway.app'

function KeywordChipInput({ keywords, onChange, inputStyle, placeholder }: { keywords: string[]; onChange: (kw: string[]) => void; inputStyle: React.CSSProperties; placeholder?: string }) {
  const [text, setText] = useState('')

  const addChip = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (!keywords.includes(trimmed.toLowerCase())) onChange([...keywords, trimmed])
    setText('')
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: keywords.length > 0 ? '5px' : 0 }}>
        {keywords.map((kw, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '99px', fontSize: '11px', fontWeight: 600, color: '#15803d' }}>
            {kw}
            <button onClick={() => onChange(keywords.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 1px', color: '#86efac', display: 'flex', lineHeight: 1 }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#86efac'}>
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChip() } }}
        onBlur={addChip}
        style={inputStyle}
        placeholder={placeholder || (keywords.length === 0 ? 'Digite e aperte Enter...' : 'Adicionar mais...')}
      />
    </div>
  )
}

export function NodeConfigPanel({ node, tags, flows, channels, tenantId, onUpdate, onClose, onDelete }: {
  node: Node; tags: any[]; flows: any[]; channels: any[]; tenantId: string
  onUpdate: (id: string, data: any) => void
  onClose: () => void
  onDelete: (id: string) => void
}) {
  const d = node.data as any
  const color = NODE_COLORS[d.type] || '#6b7280'
  const t = useT()
  const { canEdit } = usePermissions()
  const canEditFlows = canEdit('/dashboard/flows')
  const nodeLabels = getNodeLabels(t)
  const SEND_SUBTYPES = getSendSubtypes(t)
  const TAG_SUBTYPES = getTagSubtypes(t)
  const LOOP_SUBTYPES = getLoopSubtypes(t)
  const queryClient = useQueryClient()
  const [newTagName, setNewTagName] = useState('')
  const [creatingTag, setCreatingTag] = useState(false)
  const [manualRunning, setManualRunning] = useState(false)
  const [manualResult, setManualResult] = useState<{ queued: number } | null>(null)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px',
    background: '#fafafa', border: '1px solid #e4e4e7',
    borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#18181b',
    transition: 'border-color 0.15s, background 0.15s',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 600, color: '#71717a',
    marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em',
  }

  const focusInput = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = color
    e.currentTarget.style.background = '#fff'
  }
  const blurInput = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = '#e4e4e7'
    e.currentTarget.style.background = '#fafafa'
  }

  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields-flow', tenantId],
    queryFn: async () => {
      if (!tenantId) return []
      const { data } = await supabase.from('custom_fields').select('name, label').eq('tenant_id', tenantId).order('sort_order', { ascending: true })
      return (data || []) as { name: string; label: string }[]
    },
    staleTime: 60000,
    enabled: d.type === 'update_contact' || d.type === 'create_contact',
  })

  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines-flow', tenantId],
    queryFn: async () => {
      if (!tenantId) return []
      const { data, error } = await supabase.from('pipelines').select('id, name').eq('tenant_id', tenantId).order('created_at', { ascending: true })
      if (error || !data) return []
      return data as { id: string; name: string }[]
    },
    staleTime: 0,
    enabled: d.type === 'move_pipeline',
  })

  const { data: pipelineColumns = [] } = useQuery({
    queryKey: ['pipeline-columns-flow', tenantId, d.pipelineId || null],
    queryFn: async () => {
      if (!tenantId) return DEFAULT_STAGES
      let query = supabase.from('pipeline_columns').select('key, label').eq('tenant_id', tenantId).order('sort_order', { ascending: true })
      if (d.pipelineId) { query = query.eq('pipeline_id', d.pipelineId) } else { query = query.is('pipeline_id', null) }
      const { data, error } = await query
      if (error || !data || data.length === 0) return DEFAULT_STAGES
      return data as { key: string; label: string }[]
    },
    staleTime: 0,
    enabled: d.type === 'move_pipeline',
  })

  // ── Team members para assign_agent ────────────────────────────────────────
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members-flow'],
    queryFn: async () => { const { data } = await conversationApi.get('/team'); return data.data || [] },
    enabled: d.type === 'assign_agent',
  })

  // ── Scheduling configs para schedule_appointment ──────────────────────────
  const { data: schedulingConfigs = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['scheduling-configs-flow'],
    queryFn: async () => { const { data } = await conversationApi.get('/scheduling'); return data.data || [] },
    enabled: d.type === 'schedule_appointment',
  })

  // ── Google Calendar calendars ────────────────────────────────────────────
  const { data: googleCalendars = [] } = useQuery<{ id: string; name: string; primary: boolean }[]>({
    queryKey: ['google-calendars'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant/integrations/google/calendars'); return data.data || [] },
    enabled: d.type === 'schedule_appointment',
  })

  // ── Google connection status ─────────────────────────────────────────────
  const { data: tenantData } = useQuery({
    queryKey: ['tenant-google-flow'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant'); return data.data },
    enabled: d.type === 'schedule_appointment',
  })
  const googleConnected = !!tenantData?.metadata?.google_email

  // ── Webhook token para trigger_webhook ────────────────────────────────────
  const { data: flowData, refetch: refetchFlow } = useQuery({
    queryKey: ['flow-webhook-token', d.flowId],
    queryFn: async () => {
      if (!d.flowId) return null
      const { data } = await messageApi.get(`/flows/${d.flowId}`)
      return data.data
    },
    enabled: d.type === 'trigger_webhook' && !!d.flowId,
  })

  const [generatingToken, setGeneratingToken] = useState(false)
  const webhookToken = flowData?.webhook_token
  const webhookUrl = webhookToken
    ? `${MESSAGE_SERVICE_URL}/webhook/flow/${d.flowId}/${webhookToken}`
    : null

  const generateToken = async () => {
    if (!d.flowId) return
    setGeneratingToken(true)
    try {
      await messageApi.post(`/flows/${d.flowId}/webhook-token`)
      refetchFlow()
      toast.success(t('nodes.urlGenerated'))
    } catch { toast.error(t('nodes.urlGenerateError')) }
    finally { setGeneratingToken(false) }
  }

  const copyUrl = () => {
    if (webhookUrl) { navigator.clipboard.writeText(webhookUrl); toast.success(t('nodes.urlCopied')) }
  }

  const SubtypeSelector = ({ options }: { options: { value: string; label: string; emoji: string; desc?: string }[] }) => (
    <div>
      <label style={labelStyle}>{t('nodes.type')}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {options.map(opt => {
          const active = (d.subtype || options[0].value) === opt.value
          return (
            <div key={opt.value} onClick={() => onUpdate(node.id, { subtype: opt.value })}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', cursor: 'pointer', border: `1.5px solid ${active ? color : '#e4e4e7'}`, background: active ? `${color}08` : '#fafafa', transition: 'all 0.1s' }}>
              <span style={{ fontSize: '16px' }}>{opt.emoji}</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: active ? color : '#18181b' }}>{opt.label}</div>
                {opt.desc && <div style={{ fontSize: '11px', color: '#a1a1aa' }}>{opt.desc}</div>}
              </div>
              {active && (
                <div style={{ marginLeft: 'auto', width: '16px', height: '16px', borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="flow-config-panel" style={{ position: 'absolute', top: 0, right: 0, width: '320px', height: '100%', background: '#fff', borderLeft: '1px solid #e4e4e7', zIndex: 10, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 16px rgba(0,0,0,.06)' }}
      onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>

      <div style={{ padding: '16px', borderBottom: '1px solid #f4f4f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
            {d.type?.startsWith('trigger_') ? t('nodes.sectionTrigger') : d.type === 'end' ? t('nodes.sectionEnd') : t('nodes.sectionAction')}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#18181b', letterSpacing: '-0.01em' }}>{nodeLabels[d.type] || d.type}</div>
        </div>
        <button onClick={onClose} style={{ background: '#f4f4f5', border: 'none', borderRadius: '7px', cursor: 'pointer', padding: '6px', display: 'flex' }}>
          <X size={15} color="#71717a" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {d.type === 'trigger_keyword' && (<>
          <div>
            <label style={labelStyle}>{t('nodes.keywords')}</label>
            <KeywordChipInput
              keywords={d.keywords || []}
              onChange={keywords => onUpdate(node.id, { keywords })}
              inputStyle={inputStyle}
              placeholder={(d.keywords || []).length === 0 ? t('nodes.inputPlaceholder') : t('nodes.inputAddMore')}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('nodes.matchType')}</label>
            <select style={{ ...inputStyle, background: '#fafafa' }} value={d.matchType || 'contains'} onChange={e => onUpdate(node.id, { matchType: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
              <option value="contains">{t('nodes.matchContains')}</option>
              <option value="equals">{t('nodes.matchEquals')}</option>
            </select>
          </div>
        </>)}

        {d.type === 'trigger_first_message' && (<>
          <div>
            <label style={labelStyle}>{t('nodes.filterByKeyword')}</label>
            <KeywordChipInput
              keywords={d.keywords || []}
              onChange={keywords => onUpdate(node.id, { keywords })}
              inputStyle={inputStyle}
              placeholder={t('nodes.filterByKeywordPlaceholder')}
            />
          </div>
        </>)}

        {d.type === 'trigger_any_reply' && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px' }}>
            <p style={{ fontSize: '13px', color: '#15803d', fontWeight: 500 }}>{t('nodes.anyReplyInfo')}</p>
          </div>
        )}

        {d.type === 'trigger_outside_hours' && (<>
          <div><label style={labelStyle}>{t('nodes.businessStart')}</label><input type="number" min="0" max="23" style={inputStyle} value={d.start ?? 9} onChange={e => onUpdate(node.id, { start: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>{t('nodes.businessEnd')}</label><input type="number" min="0" max="23" style={inputStyle} value={d.end ?? 18} onChange={e => onUpdate(node.id, { end: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>{t('nodes.timezone')}</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.timezone || 'America/Sao_Paulo'} onChange={e => onUpdate(node.id, { timezone: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
            <option value="America/Sao_Paulo">Brasília (GMT-3)</option>
            <option value="America/Manaus">Manaus (GMT-4)</option>
            <option value="America/Fortaleza">Fortaleza (GMT-3)</option>
            <option value="America/New_York">New York (GMT-5)</option>
            <option value="America/Chicago">Chicago (GMT-6)</option>
            <option value="America/Los_Angeles">Los Angeles (GMT-8)</option>
            <option value="Europe/London">London (GMT+0)</option>
            <option value="Europe/Lisbon">Lisboa (GMT+0)</option>
          </select></div>
        </>)}

        {/* ── Trigger Manual ──────────────────────────────────────────────── */}
        {d.type === 'trigger_manual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#6d28d9', lineHeight: 1.5 }}>
                {t('nodes.manualInfo')}
              </div>
              <div>
                <label style={labelStyle}>{t('nodes.recipientTags')}</label>
                {tags.length === 0 ? (
                  <p style={{ fontSize: '12px', color: '#a1a1aa' }}>{t('nodes.noTagsRegistered')}</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {tags.map((tag: any) => {
                      const sel = (d.tagIds || []).includes(tag.id)
                      return (
                        <div key={tag.id} onClick={() => { const next = sel ? (d.tagIds || []).filter((id: string) => id !== tag.id) : [...(d.tagIds || []), tag.id]; onUpdate(node.id, { tagIds: next }) }}
                          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '99px', cursor: 'pointer', border: `1.5px solid ${sel ? (tag.color || '#7c3aed') : '#e4e4e7'}`, background: sel ? `${tag.color || '#7c3aed'}12` : '#fff', fontSize: '12px', fontWeight: 500, transition: 'all 0.1s' }}>
                          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: tag.color || '#6b7280' }} />
                          <span style={{ color: sel ? (tag.color || '#7c3aed') : '#18181b' }}>{tag.name}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              <button disabled={manualRunning || (d.tagIds || []).length === 0} onClick={async () => {
                setManualRunning(true); setManualResult(null)
                try {
                  const { data } = await messageApi.post(`/flows/${d.flowId}/run`, { tagIds: d.tagIds })
                  setManualResult(data.data)
                  toast.success(`${data.data.queued} ${t('nodes.contactsQueued')}`)
                } catch (err: any) { toast.error(err?.response?.data?.error?.message || t('nodes.executionError')) }
                finally { setManualRunning(false) }
              }}
                style={{ width: '100%', padding: '10px', background: manualRunning || (d.tagIds || []).length === 0 ? '#e4e4e7' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: manualRunning || (d.tagIds || []).length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                {manualRunning ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> {t('nodes.executing')}</> : <><Play size={14} /> {t('nodes.executeNow')}</>}
              </button>
              {manualResult && (
                <p style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>✓ {manualResult.queued} {t('nodes.contactsQueued')}</p>
              )}
            </div>
        )}

        {/* ── Trigger Webhook ─────────────────────────────────────────────── */}
        {d.type === 'trigger_webhook' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#0369a1', lineHeight: 1.5 }}>
              {t('nodes.webhookInfo')}
            </div>

            {!webhookUrl ? (
              <div style={{ textAlign: 'center', padding: '16px', background: '#fafafa', borderRadius: '8px', border: '1px solid #f4f4f5' }}>
                <p style={{ fontSize: '12px', color: '#71717a', marginBottom: '10px' }}>{t('nodes.saveFlowFirst')}</p>
                <button onClick={generateToken} disabled={generatingToken || !d.flowId}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 16px', background: '#0891b2', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, color: '#fff', cursor: generatingToken ? 'not-allowed' : 'pointer', opacity: !d.flowId ? 0.5 : 1 }}>
                  {generatingToken ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
                  {t('nodes.generateUrl')}
                </button>
              </div>
            ) : (
              <div>
                <label style={labelStyle}>{t('nodes.webhookUrlLabel')}</label>
                <div style={{ background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '9px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <code style={{ flex: 1, fontSize: '10px', color: '#18181b', wordBreak: 'break-all' }}>{webhookUrl}</code>
                  <button onClick={copyUrl} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0891b2', display: 'flex', flexShrink: 0 }} title={t('nodes.copyUrl')}>
                    <Copy size={13} />
                  </button>
                  <button onClick={generateToken} disabled={generatingToken} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', display: 'flex', flexShrink: 0 }} title={t('nodes.generateNewUrl')}>
                    <RefreshCw size={13} />
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>{t('nodes.webhookPasteHint')}</p>
              </div>
            )}

            <div>
              <label style={labelStyle}>{t('nodes.webhookVarsLabel')}</label>
              <p style={{ fontSize: '11px', color: '#a1a1aa', marginBottom: '8px' }}>
                {t('nodes.webhookVarsHint')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {[
                  ['{{webhook_phone}}', t('nodes.webhookPhoneVar')],
                  ['{{webhook_name}}', t('nodes.webhookNameVar')],
                  ['{{webhook_email}}', t('nodes.webhookEmailVar')],
                  ['{{webhook_CAMPO}}', t('nodes.webhookAnyVar')],
                ].map(([varName, desc]) => (
                  <div key={varName} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <code style={{ fontSize: '10px', background: '#f0f9ff', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>{varName}</code>
                    <span style={{ fontSize: '11px', color: '#a1a1aa' }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}



        {d.type === 'create_contact' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#15803d', lineHeight: 1.5 }}>
              {t('nodes.createContactInfo')}
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={labelStyle}>{t('nodes.fields')}</label>
                <button
                  onClick={() => {
                    const fields = d.fields || []
                    onUpdate(node.id, { fields: [...fields, { label: '', variable: '', contactField: 'custom' }] })
                  }}
                  style={{ fontSize: '11px', fontWeight: 600, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {t('nodes.addField')}
                </button>
              </div>

              {(d.fields || []).length === 0 ? (
                <div style={{ background: '#fafafa', border: '1px dashed #e4e4e7', borderRadius: '8px', padding: '16px', textAlign: 'center', fontSize: '12px', color: '#a1a1aa' }}>
                  {t('nodes.addFieldsHint')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(d.fields || []).map((field: any, idx: number) => (
                    <div key={idx} style={{ background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <select
                          value={field.contactField || 'custom'}
                          onChange={e => {
                            const fields = [...(d.fields || [])]
                            const defaultLabels: Record<string, string> = { phone: t('nodes.fieldPhone'), name: t('nodes.fieldName'), email: t('nodes.fieldEmail') }
                            const newLabel = e.target.value === 'custom' ? (field.label || '') : defaultLabels[e.target.value] || ''
                            fields[idx] = { ...fields[idx], contactField: e.target.value, label: newLabel }
                            onUpdate(node.id, { fields })
                          }}
                          style={{ ...inputStyle, flex: 1, fontSize: '11px', padding: '5px 8px', background: '#fff', marginRight: '6px' }}
                          onFocus={focusInput} onBlur={blurInput}>
                          <option value="phone">📱 {t('nodes.fieldPhone')}</option>
                          <option value="name">👤 {t('nodes.fieldName')}</option>
                          <option value="email">📧 {t('nodes.fieldEmail')}</option>
                          <option value="custom">✏️ {t('nodes.fieldCustom')}</option>
                        </select>
                        <button
                          onClick={() => {
                            const fields = (d.fields || []).filter((_: any, i: number) => i !== idx)
                            onUpdate(node.id, { fields })
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', fontSize: '11px', flexShrink: 0 }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'}>
                          {t('nodes.remove')}
                        </button>
                      </div>
                      {field.contactField === 'custom' && (
                        <div style={{ marginBottom: '6px' }}>
                          <input
                            placeholder={t('nodes.fieldNamePlaceholder')}
                            value={field.label || ''}
                            onChange={e => {
                              const fields = [...(d.fields || [])]
                              fields[idx] = { ...fields[idx], label: e.target.value }
                              onUpdate(node.id, { fields })
                            }}
                            style={{ ...inputStyle, fontSize: '11px', padding: '5px 8px' }}
                            onFocus={focusInput} onBlur={blurInput}
                          />
                        </div>
                      )}
                      <input
                        placeholder={t('nodes.variablePlaceholder')}
                        value={field.variable || ''}
                        onChange={e => {
                          const fields = [...(d.fields || [])]
                          fields[idx] = { ...fields[idx], variable: e.target.value }
                          onUpdate(node.id, { fields })
                        }}
                        style={{ ...inputStyle, fontSize: '11px', padding: '5px 8px', fontFamily: 'monospace' }}
                        onFocus={focusInput} onBlur={blurInput}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: '8px', padding: '10px 12px', fontSize: '11px', color: '#71717a' }}>
              <p style={{ fontWeight: 600, marginBottom: '4px' }}>{t('nodes.configExample')}</p>
              <p>📱 {t('nodes.fieldPhone')} → <code style={{ color: '#0891b2' }}>{'{{webhook_phone}}'}</code></p>
              <p>👤 {t('nodes.fieldName')} → <code style={{ color: '#0891b2' }}>{'{{webhook_name}}'}</code></p>
              <p>✏️ {t('nodes.fieldCustom')} → <code style={{ color: '#0891b2' }}>{'{{webhook_cidade}}'}</code></p>
            </div>
          </div>
        )}

        {d.type === 'map_fields' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#6d28d9', lineHeight: 1.5 }}>
              {t('nodes.mapFieldsInfo')}
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={labelStyle}>{t('nodes.mappings')}</label>
                <button
                  onClick={() => {
                    const mappings = d.mappings || []
                    onUpdate(node.id, { mappings: [...mappings, { from: '', to: '' }] })
                  }}
                  style={{ fontSize: '11px', fontWeight: 600, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {t('nodes.add')}
                </button>
              </div>

              {(d.mappings || []).length === 0 ? (
                <div style={{ background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: '7px', padding: '12px', fontSize: '12px', color: '#a1a1aa', textAlign: 'center' }}>
                  {t('nodes.addMappingHint')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(d.mappings || []).map((mapping: any, idx: number) => (
                    <div key={idx} style={{ background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#71717a' }}>{t('nodes.fieldN')} {idx + 1}</span>
                        <button
                          onClick={() => {
                            const mappings = (d.mappings || []).filter((_: any, i: number) => i !== idx)
                            onUpdate(node.id, { mappings })
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', fontSize: '11px' }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'}>
                          {t('nodes.remove')}
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div>
                          <label style={{ ...labelStyle, fontSize: '10px' }}>{t('nodes.sourceVariable')} (ex: {'{{webhook_phone}}'})</label>
                          <input
                            placeholder="{{webhook_phone}}"
                            value={mapping.from || ''}
                            onChange={e => {
                              const mappings = [...(d.mappings || [])]
                              mappings[idx] = { ...mappings[idx], from: e.target.value }
                              onUpdate(node.id, { mappings })
                            }}
                            style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }}
                            onFocus={focusInput} onBlur={blurInput}
                          />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: '10px' }}>{t('nodes.saveAsVariable')}</label>
                          <input
                            placeholder="telefone"
                            value={mapping.to || ''}
                            onChange={e => {
                              const mappings = [...(d.mappings || [])]
                              mappings[idx] = { ...mappings[idx], to: e.target.value.replace(/\s/g, '_').toLowerCase() }
                              onUpdate(node.id, { mappings })
                            }}
                            style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px' }}
                            onFocus={focusInput} onBlur={blurInput}
                          />
                          <p style={{ fontSize: '10px', color: '#a1a1aa', marginTop: '2px' }}>
                            {t('nodes.useVariableHint')}: {'{{' }{mapping.to || 'variavel'}{'}}' }
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: '8px', padding: '10px 12px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#52525b', marginBottom: '6px' }}>{t('nodes.specialVarsLabel')}</p>
              <p style={{ fontSize: '11px', color: '#a1a1aa', lineHeight: 1.6 }}>
                {t('nodes.specialVarsHint')}
              </p>
            </div>
          </div>
        )}

        {d.type === 'send_message' && (<>
          <SubtypeSelector options={SEND_SUBTYPES} />
          {channels.length > 1 && (
            <div>
              <label style={labelStyle}>{t('nodes.sendChannel')}</label>
              <select style={{ ...inputStyle, background: '#fafafa' }} value={d.channelId || ''} onChange={e => onUpdate(node.id, { channelId: e.target.value || null })} onFocus={focusInput} onBlur={blurInput}>
                <option value="">{t('nodes.defaultChannel')}</option>
                {channels.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}{ch.phone_number ? ` (${ch.phone_number})` : ''}</option>)}
              </select>
            </div>
          )}
          {(d.subtype === 'text' || !d.subtype) && (
            <div>
              <label style={labelStyle}>{t('nodes.message')}</label>
              <textarea style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' as const }} placeholder={t('nodes.messagePlaceholder')} value={d.message || ''} onChange={e => onUpdate(node.id, { message: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
              <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>{t('nodes.useVariablePersonalize')}</p>
            </div>
          )}
          {d.subtype === 'buttons' && (<>
            <div>
              <label style={labelStyle}>Mensagem</label>
              <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder="Texto que aparece acima dos botões" value={d.message || ''} onChange={e => onUpdate(node.id, { message: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
            </div>
            <div>
              <label style={labelStyle}>Botões (máx 3)</label>
              {(d.buttons || []).map((btn: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <input style={{ ...inputStyle, flex: 1 }} placeholder={`Botão ${i + 1}`} value={btn.title || ''} onChange={e => { const newBtns = [...(d.buttons || [])]; newBtns[i] = { ...btn, title: e.target.value }; onUpdate(node.id, { buttons: newBtns }) }} onFocus={focusInput} onBlur={blurInput} />
                  <button onClick={() => { const newBtns = (d.buttons || []).filter((_: any, j: number) => j !== i); onUpdate(node.id, { buttons: newBtns }) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}>✕</button>
                </div>
              ))}
              {(d.buttons || []).length < 3 && (
                <button onClick={() => onUpdate(node.id, { buttons: [...(d.buttons || []), { title: '' }] })} style={{ fontSize: '12px', color: '#22c55e', background: 'none', border: '1px dashed #22c55e', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', width: '100%' }}>+ Adicionar botão</button>
              )}
              <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>O cliente clica no botão ao invés de digitar</p>
            </div>
          </>)}
          {d.subtype === 'list' && (<>
            <div>
              <label style={labelStyle}>Mensagem</label>
              <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder="Texto que aparece acima da lista" value={d.message || ''} onChange={e => onUpdate(node.id, { message: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
            </div>
            <div>
              <label style={labelStyle}>Texto do botão</label>
              <input style={inputStyle} placeholder="Ver opções" value={d.listButtonText || ''} onChange={e => onUpdate(node.id, { listButtonText: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
            </div>
            <div>
              <label style={labelStyle}>Opções da lista (máx 10)</label>
              {(d.listRows || []).map((row: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <div style={{ flex: 1 }}>
                    <input style={{ ...inputStyle, marginBottom: '4px' }} placeholder={`Opção ${i + 1}`} value={row.title || ''} onChange={e => { const newRows = [...(d.listRows || [])]; newRows[i] = { ...row, title: e.target.value }; onUpdate(node.id, { listRows: newRows }) }} onFocus={focusInput} onBlur={blurInput} />
                    <input style={{ ...inputStyle, fontSize: '12px' }} placeholder="Descrição (opcional)" value={row.description || ''} onChange={e => { const newRows = [...(d.listRows || [])]; newRows[i] = { ...row, description: e.target.value }; onUpdate(node.id, { listRows: newRows }) }} onFocus={focusInput} onBlur={blurInput} />
                  </div>
                  <button onClick={() => { const newRows = (d.listRows || []).filter((_: any, j: number) => j !== i); onUpdate(node.id, { listRows: newRows }) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', alignSelf: 'flex-start' }}>✕</button>
                </div>
              ))}
              {(d.listRows || []).length < 10 && (
                <button onClick={() => onUpdate(node.id, { listRows: [...(d.listRows || []), { title: '', description: '' }] })} style={{ fontSize: '12px', color: '#22c55e', background: 'none', border: '1px dashed #22c55e', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', width: '100%' }}>+ Adicionar opção</button>
              )}
              <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>O cliente abre um menu dropdown e seleciona</p>
            </div>
          </>)}
          {d.subtype === 'image' && (<>
            <div><label style={labelStyle}>{t('nodes.image')}</label><MediaUpload accept="image/*" label={t('nodes.imageUpload')} currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} /></div>
            <div><label style={labelStyle}>{t('nodes.captionOptional')}</label><input style={inputStyle} placeholder={t('nodes.captionPlaceholder')} value={d.caption || ''} onChange={e => onUpdate(node.id, { caption: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          </>)}
          {d.subtype === 'video' && (<div><label style={labelStyle}>{t('nodes.video')}</label><MediaUpload accept="video/*" label={t('nodes.videoUpload')} currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} /></div>)}
          {d.subtype === 'audio' && (<div><label style={labelStyle}>{t('nodes.audio')}</label><MediaUpload accept="audio/*" label={t('nodes.audioUpload')} currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} /></div>)}
          {d.subtype === 'document' && (<>
            <div><label style={labelStyle}>{t('nodes.document')}</label><MediaUpload accept=".pdf,.doc,.docx,.xls,.xlsx" label={t('nodes.documentUpload')} currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} /></div>
            <div><label style={labelStyle}>{t('nodes.filename')}</label><input style={inputStyle} placeholder={t('nodes.filenamePlaceholder')} value={d.filename || ''} onChange={e => onUpdate(node.id, { filename: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          </>)}
        </>)}

        {d.type === 'input' && (<>
          <div><label style={labelStyle}>{t('nodes.questionLabel')}</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder={t('nodes.questionPlaceholder')} value={d.question || ''} onChange={e => onUpdate(node.id, { question: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div>
            <label style={labelStyle}>{t('nodes.saveResponseAs')}</label>
            <input style={inputStyle} placeholder="nome" value={d.saveAs || ''} onChange={e => onUpdate(node.id, { saveAs: e.target.value.replace(/\s/g, '_').toLowerCase() })} onFocus={focusInput} onBlur={blurInput} />
            <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>{t('nodes.useVariableHint')}: {'{{' }{d.saveAs || 'variavel'}{'}}' }</p>
          </div>
          <div>
            <label style={labelStyle}>Timeout</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <input type="number" min="0" max="10080" step="1" style={inputStyle} placeholder="Minutos" value={d.timeoutMinutes || ''} onChange={e => onUpdate(node.id, { timeoutMinutes: Number(e.target.value) || 0, timeoutHours: 0 })} onFocus={focusInput} onBlur={blurInput} />
                <p style={{ fontSize: '10px', color: '#a1a1aa', marginTop: '2px' }}>Minutos</p>
              </div>
              <div>
                <input type="number" min="0" max="168" step="1" style={inputStyle} placeholder="Horas" value={d.timeoutHours || ''} onChange={e => onUpdate(node.id, { timeoutHours: Number(e.target.value) || 0, timeoutMinutes: 0 })} onFocus={focusInput} onBlur={blurInput} />
                <p style={{ fontSize: '10px', color: '#a1a1aa', marginTop: '2px' }}>Horas</p>
              </div>
            </div>
            <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>
              {d.timeoutMinutes ? `Timeout: ${d.timeoutMinutes} min` : d.timeoutHours ? `Timeout: ${d.timeoutHours}h` : 'Sem timeout (espera indefinidamente)'}
            </p>
          </div>
        </>)}

        {d.type === 'condition' && (<ConditionPanel d={d} nodeId={node.id} inputStyle={inputStyle} onUpdate={onUpdate} />)}

        {d.type === 'ai' && (<>
          <div><label style={labelStyle}>{t('nodes.aiMode')}</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.mode || 'respond'} onChange={e => onUpdate(node.id, { mode: e.target.value })} onFocus={focusInput} onBlur={blurInput}><option value="respond">{t('nodes.aiRespond')}</option><option value="classify">{t('nodes.aiClassify')}</option><option value="extract">{t('nodes.aiExtract')}</option><option value="summarize">{t('nodes.aiSummarize')}</option></select></div>
          <div>
            <label style={labelStyle}>{t('nodes.openaiKey')}</label>
            <input style={inputStyle} placeholder={t('nodes.openaiKeyPlaceholder')} type="password" value={d.apiKey || ''} onChange={e => onUpdate(node.id, { apiKey: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
            <p style={{ fontSize: '11px', color: '#0891b2', marginTop: '4px' }}>💡 {t('nodes.openaiKeyHint')}</p>
          </div>
          <div><label style={labelStyle}>{t('nodes.aiModel')}</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.model || 'gpt-4o-mini'} onChange={e => onUpdate(node.id, { model: e.target.value })} onFocus={focusInput} onBlur={blurInput}><option value="gpt-4o-mini">{t('nodes.aiModelMini')}</option><option value="gpt-4o">{t('nodes.aiModelFull')}</option><option value="gpt-3.5-turbo">{t('nodes.aiModelLegacy')}</option></select></div>
          {d.mode === 'respond' && <div><label style={labelStyle}>{t('nodes.aiInstruction')}</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder={t('nodes.aiInstructionPlaceholder')} value={d.systemPrompt || ''} onChange={e => onUpdate(node.id, { systemPrompt: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>}
          {d.mode === 'classify' && <div><label style={labelStyle}>{t('nodes.aiCategories')}</label><input style={inputStyle} placeholder={t('nodes.aiCategoriesPlaceholder')} defaultValue={d.classifyOptions || ''} onFocus={focusInput} onBlur={e => { blurInput(e); onUpdate(node.id, { classifyOptions: e.target.value }) }} /></div>}
          {d.mode === 'extract' && <div><label style={labelStyle}>{t('nodes.aiExtractLabel')}</label><input style={inputStyle} placeholder={t('nodes.aiExtractPlaceholder')} value={d.extractField || ''} onChange={e => onUpdate(node.id, { extractField: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>}
          <div><label style={labelStyle}>{t('nodes.saveResponseAs')}</label><input style={inputStyle} placeholder="intencao" value={d.saveAs || ''} onChange={e => onUpdate(node.id, { saveAs: e.target.value.replace(/\s/g, '_').toLowerCase() })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div>
            <label style={labelStyle}>{t('nodes.aiHistoryLabel')}</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="range" min="0" max="200" step="5" value={d.historyMessages ?? 20} onChange={e => onUpdate(node.id, { historyMessages: Number(e.target.value) })} style={{ flex: 1, accentColor: color }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color, minWidth: '42px', textAlign: 'right' }}>{d.historyMessages === 0 ? t('nodes.aiHistoryNone') : d.historyMessages === 200 ? t('nodes.aiHistoryAll') : `${d.historyMessages ?? 20}`}</span>
            </div>
          </div>
        </>)}

        {d.type === 'webhook' && (<>
          <div><label style={labelStyle}>{t('nodes.webhookUrl')}</label><input style={inputStyle} placeholder={t('nodes.webhookUrlPlaceholder')} value={d.url || ''} onChange={e => onUpdate(node.id, { url: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>{t('nodes.httpMethod')}</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.method || 'POST'} onChange={e => onUpdate(node.id, { method: e.target.value })} onFocus={focusInput} onBlur={blurInput}><option value="POST">POST</option><option value="GET">GET</option><option value="PUT">PUT</option></select></div>
          {(d.method || 'POST') !== 'GET' && <div><label style={labelStyle}>{t('nodes.bodyJson')}</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const, fontFamily: 'monospace', fontSize: '12px' }} placeholder='{
  "phone": "{{phone}}"
}' value={d.body || ''} onChange={e => onUpdate(node.id, { body: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>}
          <div><label style={labelStyle}>{t('nodes.saveWebhookResponse')}</label><input style={inputStyle} placeholder={t('nodes.saveWebhookPlaceholder')} value={d.saveResponseAs || ''} onChange={e => onUpdate(node.id, { saveResponseAs: e.target.value.replace(/\s/g, '_').toLowerCase() })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={labelStyle}>{t('nodes.headersOptional')}</label>
              <button onClick={() => onUpdate(node.id, { headers: [...(d.headers || []), { key: '', value: '' }] })} style={{ fontSize: '11px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>{t('nodes.add')}</button>
            </div>
            {(d.headers || []).map((h: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                <input style={{ ...inputStyle, flex: 1, fontSize: '12px', padding: '6px 8px' }} placeholder="Authorization" value={h.key || ''} onChange={e => { const headers = [...(d.headers || [])]; headers[i] = { ...h, key: e.target.value }; onUpdate(node.id, { headers }) }} onFocus={focusInput} onBlur={blurInput} />
                <input style={{ ...inputStyle, flex: 2, fontSize: '12px', padding: '6px 8px' }} placeholder="Bearer sk-xxx..." value={h.value || ''} onChange={e => { const headers = [...(d.headers || [])]; headers[i] = { ...h, value: e.target.value }; onUpdate(node.id, { headers }) }} onFocus={focusInput} onBlur={blurInput} />
                <button onClick={() => { const headers = (d.headers || []).filter((_: any, j: number) => j !== i); onUpdate(node.id, { headers }) }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}>×</button>
              </div>
            ))}
          </div>
        </>)}

        {d.type === 'wait' && (<>
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#0369a1' }}>
            {t('nodes.waitInfo')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div><label style={labelStyle}>{t('nodes.days')}</label><input type="number" min="0" style={inputStyle} value={d.days ?? 0} onChange={e => onUpdate(node.id, { days: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
            <div><label style={labelStyle}>{t('nodes.hours')}</label><input type="number" min="0" max="23" style={inputStyle} value={d.hours ?? 0} onChange={e => onUpdate(node.id, { hours: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
            <div><label style={labelStyle}>{t('nodes.minutes')}</label><input type="number" min="0" max="59" style={inputStyle} value={d.minutes ?? 0} onChange={e => onUpdate(node.id, { minutes: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
            <div><label style={labelStyle}>{t('nodes.seconds')}</label><input type="number" min="0" max="59" style={inputStyle} value={d.seconds ?? 0} onChange={e => onUpdate(node.id, { seconds: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
          </div>
          {(() => {
            const total = (d.days||0)*86400 + (d.hours||0)*3600 + (d.minutes||0)*60 + (d.seconds||0)
            const parts: string[] = []
            if (d.days) parts.push(`${d.days}d`)
            if (d.hours) parts.push(`${d.hours}h`)
            if (d.minutes) parts.push(`${d.minutes}min`)
            if (d.seconds) parts.push(`${d.seconds}s`)
            return (
              <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>
                {t('nodes.total')} {parts.join(' ') || '0s'}
                {total > 300 ? ` — ${t('nodes.scheduledViaQueue')} ✓` : total > 0 ? ` — ${t('nodes.syncWait')}` : ''}
              </p>
            )
          })()}
        </>)}

        {d.type === 'tag_contact' && (<>
          <SubtypeSelector options={TAG_SUBTYPES} />
          <div>
            <label style={labelStyle}>{(d.subtype || 'add') === 'add' ? t('nodes.tagsToAdd') : t('nodes.tagsToRemove')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {tags.map((tag: any) => {
                const selectedIds: string[] = d.tagIds || (d.tagId ? [d.tagId] : [])
                const isSelected = selectedIds.includes(tag.id)
                return (
                  <div key={tag.id} onClick={() => {
                    const current: string[] = d.tagIds || (d.tagId ? [d.tagId] : [])
                    const next = isSelected ? current.filter((id: string) => id !== tag.id) : [...current, tag.id]
                    onUpdate(node.id, { tagIds: next, tagId: next[0] || null })
                  }}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '99px', cursor: 'pointer', border: `1.5px solid ${isSelected ? (tag.color || '#22c55e') : '#e4e4e7'}`, background: isSelected ? `${tag.color || '#22c55e'}12` : '#fff', fontSize: '12px', fontWeight: 500 }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: tag.color || '#6b7280' }} />
                    <span style={{ color: isSelected ? (tag.color || '#22c55e') : '#18181b' }}>{tag.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
          {(d.subtype || 'add') === 'add' && (
            <div style={{ marginTop: '8px' }}>
              <label style={labelStyle}>{t('nodes.createNewTag')}</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: '12px' }} placeholder={t('nodes.tagNamePlaceholder')} value={newTagName} onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (async () => {
                    if (!newTagName.trim()) return; setCreatingTag(true)
                    try { const { data } = await contactApi.post('/tags', { name: newTagName.trim(), color: '#22c55e' }); onUpdate(node.id, { tagId: data.data.id, tagName: data.data.name }); queryClient.invalidateQueries({ queryKey: ['tags'] }); setNewTagName(''); toast.success(`Tag "${data.data.name}" ${t('nodes.tagCreated')}`) }
                    catch (err: any) { toast.error(err?.response?.data?.error?.message || t('nodes.tagCreateError')) }
                    finally { setCreatingTag(false) }
                  })() } }}
                  onFocus={focusInput} onBlur={blurInput} />
                <button disabled={creatingTag || !newTagName.trim()} onClick={async () => {
                  if (!newTagName.trim()) return; setCreatingTag(true)
                  try { const { data } = await contactApi.post('/tags', { name: newTagName.trim(), color: '#22c55e' }); onUpdate(node.id, { tagId: data.data.id, tagName: data.data.name }); queryClient.invalidateQueries({ queryKey: ['tags'] }); setNewTagName(''); toast.success(`Tag "${data.data.name}" ${t('nodes.tagCreated')}`) }
                  catch (err: any) { toast.error(err?.response?.data?.error?.message || t('nodes.tagCreateError')) }
                  finally { setCreatingTag(false) }
                }}
                  style={{ padding: '6px 12px', background: newTagName.trim() ? '#22c55e' : '#e4e4e7', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: newTagName.trim() ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                  {creatingTag ? '...' : t('nodes.create')}
                </button>
              </div>
            </div>
          )}
        </>)}

        {d.type === 'update_contact' && (<>
          {(() => {
            // Migra formato antigo (field/value único) para novo (updateFields array)
            const fields: { field: string; customField?: string; value: string }[] = d.updateFields ||
              (d.field ? [{ field: d.field, customField: d.customField, value: d.value || '' }] : [{ field: 'name', value: '' }])
            const setFields = (f: typeof fields) => onUpdate(node.id, { updateFields: f, field: undefined, customField: undefined, value: undefined })
            const updateField = (i: number, ch: Partial<typeof fields[0]>) => setFields(fields.map((f, j) => j === i ? { ...f, ...ch } : f))
            const removeField = (i: number) => setFields(fields.filter((_, j) => j !== i))
            const addField = () => setFields([...fields, { field: 'custom', customField: '', value: '' }])
            return (<>
              {fields.map((f, i) => (
                <div key={i} style={{ background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <select style={{ ...inputStyle, flex: 1, padding: '5px 8px', fontSize: '12px' }} value={f.field === 'custom' && f.customField ? `cf:${f.customField}` : f.field}
                      onChange={e => {
                        const v = e.target.value
                        if (v.startsWith('cf:')) updateField(i, { field: 'custom', customField: v.slice(3) })
                        else if (v === 'custom_new') updateField(i, { field: 'custom', customField: '' })
                        else updateField(i, { field: v, customField: '' })
                      }} onFocus={focusInput} onBlur={blurInput}>
                      <option value="name">{t('nodes.fieldName')}</option>
                      <option value="phone">{t('nodes.fieldPhone')}</option>
                      <option value="email">{t('nodes.fieldEmail')}</option>
                      {customFields.length > 0 && <option disabled>{t('nodes.customFieldsSeparator')}</option>}
                      {customFields.map((cf: { name: string; label: string }) => (
                        <option key={cf.name} value={`cf:${cf.name}`}>{cf.label}</option>
                      ))}
                      <option value="custom_new">{t('nodes.otherField')}</option>
                    </select>
                    {fields.length > 1 && (
                      <button onClick={() => removeField(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#a1a1aa', display: 'flex', flexShrink: 0 }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa'}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  {f.field === 'custom' && !customFields.some(cf => cf.name === f.customField) && (
                    <input style={{ ...inputStyle, padding: '5px 8px', fontSize: '12px' }} placeholder={t('nodes.customFieldPlaceholder')} value={f.customField || ''} onChange={e => updateField(i, { customField: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
                  )}
                  <input style={{ ...inputStyle, padding: '5px 8px', fontSize: '12px' }} placeholder={t('nodes.valuePlaceholder')} value={f.value} onChange={e => updateField(i, { value: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
                </div>
              ))}
              <button onClick={addField}
                style={{ width: '100%', padding: '7px', background: 'transparent', border: '1.5px dashed #e4e4e7', borderRadius: '8px', color: '#71717a', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', transition: 'border-color 0.15s, color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#22c55e'; (e.currentTarget as HTMLButtonElement).style.color = '#16a34a' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e4e4e7'; (e.currentTarget as HTMLButtonElement).style.color = '#71717a' }}>
                <Plus size={13} /> {t('nodes.addFieldButton')}
              </button>
            </>)
          })()}
        </>)}

        {d.type === 'move_pipeline' && (<>
          {pipelines.length > 0 && (
            <div><label style={labelStyle}>{t('nodes.pipeline')}</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.pipelineId || ''} onChange={e => onUpdate(node.id, { pipelineId: e.target.value || null, stage: '', stageLabel: '' })} onFocus={focusInput} onBlur={blurInput}><option value="">{t('nodes.defaultPipeline')}</option>{pipelines.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          )}
          <div><label style={labelStyle}>{t('nodes.funnelStage')}</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.stage || ''} onChange={e => { const selected = pipelineColumns.find((c: any) => c.key === e.target.value); onUpdate(node.id, { stage: e.target.value, stageLabel: selected?.label || e.target.value }) }} onFocus={focusInput} onBlur={blurInput}><option value="">{t('nodes.selectStage')}</option>{pipelineColumns.map((col: any) => <option key={col.key} value={col.key}>{col.label}</option>)}</select></div>
        </>)}

        {d.type === 'assign_agent' && (<>
          <div>
            <label style={labelStyle}>{t('nodes.assignTo')}</label>
            <select style={{ ...inputStyle, background: '#fafafa' }} value={d.agentId || ''} onChange={e => onUpdate(node.id, { agentId: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
              <option value="">{t('nodes.assignNobody')}</option>
              <option value="round_robin">🔄 {t('nodes.assignRoundRobin')}</option>
              {(teamMembers || []).map((m: any) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>{t('nodes.clientMessage')}</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder={t('nodes.clientMessagePlaceholder')} value={d.message || ''} onChange={e => onUpdate(node.id, { message: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
        </>)}

        {d.type === 'go_to' && (
          <div>
            <label style={labelStyle}>{t('nodes.targetFlow')}</label>
            {flows.length === 0
              ? <p style={{ fontSize: '12px', color: '#a1a1aa' }}>{t('nodes.noOtherFlows')}</p>
              : <select style={{ ...inputStyle, background: '#fafafa' }} value={d.targetFlowId || ''} onChange={e => onUpdate(node.id, { targetFlowId: e.target.value })} onFocus={focusInput} onBlur={blurInput}><option value="">{t('nodes.selectFlow')}</option>{flows.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            }
            <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>{t('nodes.goToHint')}</p>
          </div>
        )}

        {d.type === 'loop' && (<>
          <SubtypeSelector options={LOOP_SUBTYPES} />
          {(d.subtype === 'repeat' || !d.subtype) && (<>
            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#6d28d9' }}>
              {t('nodes.loopRepeatInfo')}
            </div>
            <div><label style={labelStyle}>{t('nodes.repetitions')}</label><input type="number" min="1" max="100" style={inputStyle} value={d.times ?? 1} onChange={e => onUpdate(node.id, { times: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
          </>)}
          {d.subtype === 'retry' && (<>
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#ea580c' }}>
              {t('nodes.loopRetryInfo')}
            </div>
            <div><label style={labelStyle}>{t('nodes.maxRetries')}</label><input type="number" min="1" max="20" style={inputStyle} value={d.maxRetries ?? 3} onChange={e => onUpdate(node.id, { maxRetries: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
          </>)}
          {d.subtype === 'while' && (<>
            <div><label style={labelStyle}>{t('nodes.whileField')}</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.conditionField || 'variable'} onChange={e => onUpdate(node.id, { conditionField: e.target.value })} onFocus={focusInput} onBlur={blurInput}><option value="variable">{t('nodes.whileVariable')}</option><option value="message">{t('nodes.whileMessage')}</option><option value="phone">{t('nodes.whilePhone')}</option></select></div>
            {(d.conditionField || 'variable') === 'variable' && (
              <div><label style={labelStyle}>{t('nodes.variableName')}</label><input style={inputStyle} placeholder={t('nodes.variableNamePlaceholder')} value={d.conditionFieldName || ''} onChange={e => onUpdate(node.id, { conditionFieldName: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
            )}
            <div><label style={labelStyle}>{t('nodes.operator')}</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.conditionOperator || 'is_empty'} onChange={e => onUpdate(node.id, { conditionOperator: e.target.value })} onFocus={focusInput} onBlur={blurInput}><option value="is_empty">{t('nodes.opIsEmpty')}</option><option value="is_not_empty">{t('nodes.opIsNotEmpty')}</option><option value="equals">{t('nodes.opEquals')}</option><option value="not_equals">{t('nodes.opNotEquals')}</option><option value="contains">{t('nodes.opContains')}</option><option value="not_contains">{t('nodes.opNotContains')}</option></select></div>
            {!['is_empty', 'is_not_empty'].includes(d.conditionOperator || 'is_empty') && (
              <div><label style={labelStyle}>{t('nodes.valueLabel')}</label><input style={inputStyle} placeholder={t('nodes.valueCompare')} value={d.conditionValue || ''} onChange={e => onUpdate(node.id, { conditionValue: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
            )}
            <div><label style={labelStyle}>{t('nodes.maxIterations')}</label><input type="number" min="1" max="100" style={inputStyle} value={d.maxIterations ?? 10} onChange={e => onUpdate(node.id, { maxIterations: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
          </>)}
        </>)}

        {d.type === 'transcribe_audio' && (<>
          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#6d28d9' }}>
            🎙️ {t('nodes.transcribeInfo')}
          </div>
          <div>
            <label style={labelStyle}>{t('nodes.saveTranscription')}</label>
            <input style={inputStyle} placeholder="transcricao" value={d.transcribeSaveAs || ''} onChange={e => onUpdate(node.id, { transcribeSaveAs: e.target.value.replace(/\s/g, '_').toLowerCase() })} onFocus={focusInput} onBlur={blurInput} />
            <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>{t('nodes.transcriptionHint')}: {'{{' }{d.transcribeSaveAs || 'transcricao'}{'}}' }</p>
          </div>
          <div>
            <label style={labelStyle}>{t('nodes.audioLanguage')}</label>
            <select style={{ ...inputStyle, background: '#fafafa' }} value={d.transcribeLanguage || 'pt'} onChange={e => onUpdate(node.id, { transcribeLanguage: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
              <option value="pt">Português</option>
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="it">Italiano</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('nodes.openaiKeyOptional')}</label>
            <input style={inputStyle} placeholder={t('nodes.openaiKeyOptionalPlaceholder')} type="password" value={d.apiKey || ''} onChange={e => onUpdate(node.id, { apiKey: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
          </div>
        </>)}

        {d.type === 'create_task' && (<>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#92400e' }}>
            📋 {t('nodes.createTaskInfo')}
          </div>
          <div><label style={labelStyle}>{t('nodes.taskTitle')}</label><input style={inputStyle} placeholder={t('nodes.taskTitlePlaceholder')} value={d.taskTitle || ''} onChange={e => onUpdate(node.id, { taskTitle: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>{t('nodes.taskDueHours')}</label><input type="number" min="0" style={inputStyle} placeholder={t('nodes.taskDuePlaceholder')} value={d.taskDueHours || ''} onChange={e => onUpdate(node.id, { taskDueHours: Number(e.target.value) || 0 })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>{t('nodes.taskAssignTo')}</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.taskAssignTo || ''} onChange={e => onUpdate(node.id, { taskAssignTo: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
            <option value="">{t('nodes.noAssignment')}</option>
            {(teamMembers || []).map((m: any) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select></div>
        </>)}

        {d.type === 'send_notification' && (<>
          <div style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#9d174d' }}>
            🔔 {t('nodes.notificationInfo')}
          </div>
          <div><label style={labelStyle}>{t('nodes.notificationMessage')}</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder={t('nodes.notificationPlaceholder')} value={d.notificationMessage || ''} onChange={e => onUpdate(node.id, { notificationMessage: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>{t('nodes.notifyWho')}</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.notifyAgentId || ''} onChange={e => onUpdate(node.id, { notifyAgentId: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
            <option value="">{t('nodes.allAgents')}</option>
            {(teamMembers || []).map((m: any) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select></div>
        </>)}

        {d.type === 'split_ab' && (<>
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#9a3412' }}>
            🧪 {t('nodes.splitInfo')}
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={labelStyle}>{t('nodes.paths')}</label>
              <button onClick={() => {
                const paths = [...(d.splitPaths || [{ label: 'A', weight: 50 }, { label: 'B', weight: 50 }])]
                paths.push({ label: String.fromCharCode(65 + paths.length), weight: Math.round(100 / (paths.length + 1)) })
                onUpdate(node.id, { splitPaths: paths })
              }} style={{ fontSize: '11px', color: '#ea580c', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>{t('nodes.add')}</button>
            </div>
            {(d.splitPaths || [{ label: 'A', weight: 50 }, { label: 'B', weight: 50 }]).map((p: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color, minWidth: '20px' }}>{p.label}</span>
                <input type="number" min="1" max="100" style={{ ...inputStyle, flex: 1, padding: '6px 8px', fontSize: '12px' }} value={p.weight} onChange={e => {
                  const paths = [...(d.splitPaths || [{ label: 'A', weight: 50 }, { label: 'B', weight: 50 }])]
                  paths[i] = { ...p, weight: Number(e.target.value) }
                  onUpdate(node.id, { splitPaths: paths })
                }} onFocus={focusInput} onBlur={blurInput} />
                <span style={{ fontSize: '11px', color: '#a1a1aa' }}>%</span>
                {(d.splitPaths || []).length > 2 && <button onClick={() => {
                  const paths = (d.splitPaths || []).filter((_: any, j: number) => j !== i)
                  onUpdate(node.id, { splitPaths: paths })
                }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}>×</button>}
              </div>
            ))}
          </div>
        </>)}

        {d.type === 'random_path' && (<>
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#9a3412' }}>
            🎲 {t('nodes.randomInfo')}
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={labelStyle}>{t('nodes.paths')}</label>
              <button onClick={() => {
                const paths = [...(d.randomPaths || ['A', 'B'])]
                paths.push(String.fromCharCode(65 + paths.length))
                onUpdate(node.id, { randomPaths: paths })
              }} style={{ fontSize: '11px', color: '#ea580c', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>{t('nodes.add')}</button>
            </div>
            {(d.randomPaths || ['A', 'B']).map((p: string, i: number) => (
              <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color, minWidth: '20px' }}>{p}</span>
                <span style={{ fontSize: '11px', color: '#a1a1aa' }}>{t('nodes.equalChance')}</span>
                {(d.randomPaths || []).length > 2 && <button onClick={() => {
                  const paths = (d.randomPaths || []).filter((_: any, j: number) => j !== i)
                  onUpdate(node.id, { randomPaths: paths })
                }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}>×</button>}
              </div>
            ))}
          </div>
        </>)}

        {d.type === 'schedule_appointment' && (<>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#15803d' }}>
            📅 {t('nodes.scheduleAppointmentInfo')}
          </div>

          {/* Modo: Google Calendar ou Interno */}
          <div><label style={labelStyle}>Modo</label>
            <select style={{ ...inputStyle, background: '#fafafa' }} value={d.calendarMode || 'google'} onChange={e => onUpdate(node.id, { calendarMode: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
              <option value="google">Google Calendar</option>
              <option value="internal">Interno (sem Google)</option>
            </select>
          </div>

          {(d.calendarMode || 'google') === 'google' && (<>
            {/* Ação: Agendar ou Cancelar */}
            <div><label style={labelStyle}>Ação</label>
              <select style={{ ...inputStyle, background: '#fafafa' }} value={d.calendarAction || 'schedule'} onChange={e => onUpdate(node.id, { calendarAction: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
                <option value="schedule">Agendar</option>
                <option value="cancel">Cancelar agendamento</option>
              </select>
            </div>

            {!googleConnected ? (
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#92400e' }}>
                ⚠️ Google Calendar não conectado. Vá em <strong>Configurações</strong> e conecte sua conta Google primeiro.
              </div>
            ) : (<>
              <div><label style={labelStyle}>Calendário</label>
                <select style={{ ...inputStyle, background: '#fafafa' }} value={d.googleCalendarId || ''} onChange={e => onUpdate(node.id, { googleCalendarId: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
                  <option value="">Selecione um calendário...</option>
                  {googleCalendars.map((cal: any) => <option key={cal.id} value={cal.id}>{cal.name}{cal.primary ? ' (Principal)' : ''}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>Duração do evento (min)</label>
                <select style={{ ...inputStyle, background: '#fafafa' }} value={d.eventDuration || 60} onChange={e => onUpdate(node.id, { eventDuration: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput}>
                  <option value={30}>30 minutos</option>
                  <option value={60}>1 hora</option>
                  <option value={90}>1h30</option>
                  <option value={120}>2 horas</option>
                  <option value={180}>3 horas</option>
                  <option value={240}>4 horas</option>
                  <option value={360}>6 horas</option>
                  <option value={480}>8 horas</option>
                  <option value={720}>12 horas</option>
                  <option value={1440}>Dia inteiro</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div><label style={labelStyle}>Horário início</label>
                  <input type="time" style={inputStyle} value={d.workStart || '08:00'} onChange={e => onUpdate(node.id, { workStart: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
                </div>
                <div><label style={labelStyle}>Horário fim</label>
                  <input type="time" style={inputStyle} value={d.workEnd || '18:00'} onChange={e => onUpdate(node.id, { workEnd: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
                </div>
              </div>
              <div><label style={labelStyle}>Dias da semana</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {[{ k: 'mon', l: 'Seg' }, { k: 'tue', l: 'Ter' }, { k: 'wed', l: 'Qua' }, { k: 'thu', l: 'Qui' }, { k: 'fri', l: 'Sex' }, { k: 'sat', l: 'Sáb' }, { k: 'sun', l: 'Dom' }].map(day => {
                    const days = d.workDays || { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }
                    const active = days[day.k]
                    return (
                      <button key={day.k} onClick={() => onUpdate(node.id, { workDays: { ...days, [day.k]: !active } })}
                        style={{ padding: '4px 8px', borderRadius: '6px', border: `1px solid ${active ? '#16a34a' : '#e4e4e7'}`, background: active ? '#f0fdf4' : '#fff', color: active ? '#16a34a' : '#a1a1aa', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                        {day.l}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div><label style={labelStyle}>Dias à frente</label>
                <input type="number" min={1} max={30} style={inputStyle} value={d.advanceDays || 7} onChange={e => onUpdate(node.id, { advanceDays: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} />
                <p style={{ fontSize: '10px', color: '#a1a1aa', marginTop: '2px' }}>Quantos dias à frente o cliente pode agendar</p>
              </div>
              <div><label style={labelStyle}>Título do evento</label>
                <input style={inputStyle} placeholder="Reserva - {{name}}" value={d.eventTitle || ''} onChange={e => onUpdate(node.id, { eventTitle: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
                <p style={{ fontSize: '10px', color: '#a1a1aa', marginTop: '2px' }}>Use {'{{name}}'}, {'{{phone}}'} como variáveis</p>
              </div>

              {/* Tabela de preços */}
              <div>
                <label style={labelStyle}>Tabela de preços (opcional)</label>
                <p style={{ fontSize: '10px', color: '#a1a1aa', marginBottom: '8px' }}>Preencha os valores por dia/horário. Deixe vazio = sem preço. Digite 0 = indisponível.</p>
                {(() => {
                  const start = d.workStart || '08:00'
                  const end = d.workEnd || '18:00'
                  const dur = d.eventDuration || 60
                  const [sh, sm] = start.split(':').map(Number)
                  const [eh, em2] = end.split(':').map(Number)
                  let startMin = sh * 60 + sm
                  const endMin = (eh === 0 && em2 === 0) ? 24 * 60 : eh * 60 + em2
                  const slots: string[] = []
                  while (startMin + dur <= endMin) {
                    slots.push(`${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`)
                    startMin += dur
                  }
                  const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
                  const allDays = d.workDays || { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }
                  const activeDays = dayOrder.filter(k => allDays[k])
                  const dayLabels: Record<string, string> = { mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom' }
                  const priceTable = d.priceTable || {}

                  if (slots.length === 0 || activeDays.length === 0) return <p style={{ fontSize: '11px', color: '#a1a1aa' }}>Configure horários e dias primeiro</p>

                  return (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '4px 6px', borderBottom: '1px solid #e4e4e7', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Hora</th>
                            {activeDays.map(day => (
                              <th key={day} style={{ padding: '4px 4px', borderBottom: '1px solid #e4e4e7', textAlign: 'center', color: '#6b7280', fontWeight: 600 }}>{dayLabels[day]}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {slots.map(slot => (
                            <tr key={slot}>
                              <td style={{ padding: '3px 6px', borderBottom: '1px solid #f4f4f5', fontWeight: 600, color: '#374151' }}>{slot}</td>
                              {activeDays.map(day => {
                                const key = `${day}_${slot}`
                                const val = priceTable[key]
                                return (
                                  <td key={day} style={{ padding: '2px 2px', borderBottom: '1px solid #f4f4f5' }}>
                                    <input
                                      type="number" min="0" step="10"
                                      style={{ width: '100%', padding: '4px 4px', border: '1px solid #e4e4e7', borderRadius: '5px', fontSize: '12px', textAlign: 'center', background: val === 0 ? '#fee2e2' : val ? '#f0fdf4' : '#fafafa', color: val === 0 ? '#ef4444' : '#374151', boxSizing: 'border-box' as const, fontWeight: val ? 600 : 400 }}
                                      placeholder="—"
                                      value={val === 0 ? '0' : val || ''}
                                      onChange={e => {
                                        const newTable = { ...priceTable }
                                        const v = e.target.value
                                        if (v === '' || v === undefined) delete newTable[key]
                                        else newTable[key] = Number(v)
                                        onUpdate(node.id, { priceTable: newTable })
                                      }}
                                      onFocus={focusInput} onBlur={blurInput}
                                    />
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })()}
              </div>
            </>)}
          </>)}

          {(d.calendarMode) === 'internal' && (<>
            <div><label style={labelStyle}>{t('nodes.schedulingConfig')}</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.schedulingConfigId || ''} onChange={e => onUpdate(node.id, { schedulingConfigId: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
              <option value="">{schedulingConfigs.length === 0 ? t('nodes.schedulingConfigNone') : t('nodes.schedulingConfigSelect')}</option>
              {schedulingConfigs.map((cfg: any) => <option key={cfg.id} value={cfg.id}>{cfg.name}</option>)}
            </select></div>
          </>)}

          <div><label style={labelStyle}>{t('nodes.schedulingMsgAskDate')}</label><textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' as const }} placeholder="📅 Escolha o dia:" value={d.msgAskDate || ''} onChange={e => onUpdate(node.id, { msgAskDate: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>{t('nodes.schedulingMsgAskTime')}</label><textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' as const }} placeholder="⏰ Horários disponíveis:" value={d.msgAskTime || ''} onChange={e => onUpdate(node.id, { msgAskTime: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>{t('nodes.schedulingMsgConfirm')}</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder="✅ Agendado com sucesso!&#10;&#10;📅 Data: {{agendamento_data}}&#10;⏰ Horário: {{agendamento_horario}}" value={d.msgConfirm || ''} onChange={e => onUpdate(node.id, { msgConfirm: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>{t('nodes.schedulingMsgNoSlots')}</label><textarea style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' as const }} placeholder="Sem horários disponíveis" value={d.msgNoSlots || ''} onChange={e => onUpdate(node.id, { msgNoSlots: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
        </>)}

        {d.type === 'sticky_note' && (<>
          <div><label style={labelStyle}>Título</label>
            <input style={inputStyle} placeholder="Título da nota" value={d.title || ''} onChange={e => onUpdate(node.id, { title: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
          </div>
          <div><label style={labelStyle}>Texto</label>
            <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder="Descrição..." value={d.text || ''} onChange={e => onUpdate(node.id, { text: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
          </div>
          <div><label style={labelStyle}>Cor</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { k: 'yellow', bg: '#fef9c3', border: '#facc15' },
                { k: 'green', bg: '#dcfce7', border: '#4ade80' },
                { k: 'blue', bg: '#dbeafe', border: '#60a5fa' },
                { k: 'purple', bg: '#f3e8ff', border: '#c084fc' },
                { k: 'pink', bg: '#fce7f3', border: '#f472b6' },
                { k: 'red', bg: '#fee2e2', border: '#f87171' },
                { k: 'gray', bg: '#f3f4f6', border: '#9ca3af' },
              ].map(c => (
                <button key={c.k} onClick={() => onUpdate(node.id, { color: c.k })}
                  style={{ width: '28px', height: '28px', borderRadius: '50%', background: c.bg, border: `2.5px solid ${(d.color || 'yellow') === c.k ? c.border : 'transparent'}`, cursor: 'pointer' }} />
              ))}
            </div>
          </div>
        </>)}

        {d.type === 'end' && (
          <div><label style={labelStyle}>{t('nodes.endMessage')}</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder={t('nodes.endPlaceholder')} value={d.message || ''} onChange={e => onUpdate(node.id, { message: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
        )}
      </div>

      {canEditFlows && <div style={{ padding: '12px 16px', borderTop: '1px solid #f4f4f5' }}>
        <button onClick={() => onDelete(node.id)}
          style={{ width: '100%', padding: '8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#ef4444', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.1s' }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#fee2e2'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'}>
          {t('nodes.removeNode')}
        </button>
      </div>}
      <style>{"@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"}</style>
    </div>
  )
}
