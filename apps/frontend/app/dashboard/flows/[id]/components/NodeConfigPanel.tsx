'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'
import { Node } from '@xyflow/react'
import { X, Copy, RefreshCw, Loader2, Plus, Play } from 'lucide-react'
import { NODE_COLORS, NODE_LABELS, DEFAULT_STAGES, SEND_SUBTYPES, TAG_SUBTYPES, LOOP_SUBTYPES } from './constants'
import { MediaUpload, ConditionPanel } from './ConditionPanel'
import { messageApi, contactApi, conversationApi } from '@/lib/api'
import { toast } from 'sonner'

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
      toast.success('URL gerada!')
    } catch { toast.error('Erro ao gerar URL') }
    finally { setGeneratingToken(false) }
  }

  const copyUrl = () => {
    if (webhookUrl) { navigator.clipboard.writeText(webhookUrl); toast.success('URL copiada!') }
  }

  const SubtypeSelector = ({ options }: { options: { value: string; label: string; emoji: string; desc?: string }[] }) => (
    <div>
      <label style={labelStyle}>Tipo</label>
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
            {d.type?.startsWith('trigger_') ? 'Gatilho' : d.type === 'end' ? 'Fim' : 'Ação'}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#18181b', letterSpacing: '-0.01em' }}>{NODE_LABELS[d.type] || d.type}</div>
        </div>
        <button onClick={onClose} style={{ background: '#f4f4f5', border: 'none', borderRadius: '7px', cursor: 'pointer', padding: '6px', display: 'flex' }}>
          <X size={15} color="#71717a" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {d.type === 'trigger_keyword' && (<>
          <div>
            <label style={labelStyle}>Palavras-chave</label>
            <KeywordChipInput
              keywords={d.keywords || []}
              onChange={keywords => onUpdate(node.id, { keywords })}
              inputStyle={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Tipo de comparação</label>
            <select style={{ ...inputStyle, background: '#fafafa' }} value={d.matchType || 'contains'} onChange={e => onUpdate(node.id, { matchType: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
              <option value="contains">Contém a palavra</option>
              <option value="equals">Igual à palavra</option>
            </select>
          </div>
        </>)}

        {d.type === 'trigger_first_message' && (<>
          <div>
            <label style={labelStyle}>Filtrar por palavra-chave (opcional)</label>
            <KeywordChipInput
              keywords={d.keywords || []}
              onChange={keywords => onUpdate(node.id, { keywords })}
              inputStyle={inputStyle}
              placeholder="Deixe vazio para qualquer mensagem"
            />
          </div>
        </>)}

        {d.type === 'trigger_any_reply' && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px' }}>
            <p style={{ fontSize: '13px', color: '#15803d', fontWeight: 500 }}>Dispara quando o contato enviar qualquer mensagem.</p>
          </div>
        )}

        {d.type === 'trigger_outside_hours' && (<>
          <div><label style={labelStyle}>Início do expediente (hora)</label><input type="number" min="0" max="23" style={inputStyle} value={d.start ?? 9} onChange={e => onUpdate(node.id, { start: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>Fim do expediente (hora)</label><input type="number" min="0" max="23" style={inputStyle} value={d.end ?? 18} onChange={e => onUpdate(node.id, { end: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>Fuso horário</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.timezone || 'America/Sao_Paulo'} onChange={e => onUpdate(node.id, { timezone: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
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
                Selecione as tags e clique em <strong>Executar</strong> para disparar o flow para todos os contatos dessas tags.
              </div>
              <div>
                <label style={labelStyle}>Tags dos destinatários</label>
                {tags.length === 0 ? (
                  <p style={{ fontSize: '12px', color: '#a1a1aa' }}>Nenhuma tag cadastrada.</p>
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
                  toast.success(`${data.data.queued} contatos enfileirados!`)
                } catch (err: any) { toast.error(err?.response?.data?.error?.message || 'Erro ao executar') }
                finally { setManualRunning(false) }
              }}
                style={{ width: '100%', padding: '10px', background: manualRunning || (d.tagIds || []).length === 0 ? '#e4e4e7' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: manualRunning || (d.tagIds || []).length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                {manualRunning ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Executando...</> : <><Play size={14} /> Executar agora</>}
              </button>
              {manualResult && (
                <p style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>✓ {manualResult.queued} contatos enfileirados para execução</p>
              )}
            </div>
        )}

        {/* ── Trigger Webhook ─────────────────────────────────────────────── */}
        {d.type === 'trigger_webhook' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#0369a1', lineHeight: 1.5 }}>
              Este flow dispara quando um sistema externo (Make, Zapier, formulário da Meta) faz um POST na URL abaixo.
            </div>

            {!webhookUrl ? (
              <div style={{ textAlign: 'center', padding: '16px', background: '#fafafa', borderRadius: '8px', border: '1px solid #f4f4f5' }}>
                <p style={{ fontSize: '12px', color: '#71717a', marginBottom: '10px' }}>Salve o flow primeiro, depois gere a URL</p>
                <button onClick={generateToken} disabled={generatingToken || !d.flowId}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 16px', background: '#0891b2', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, color: '#fff', cursor: generatingToken ? 'not-allowed' : 'pointer', opacity: !d.flowId ? 0.5 : 1 }}>
                  {generatingToken ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
                  Gerar URL
                </button>
              </div>
            ) : (
              <div>
                <label style={labelStyle}>URL do webhook</label>
                <div style={{ background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '9px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <code style={{ flex: 1, fontSize: '10px', color: '#18181b', wordBreak: 'break-all' }}>{webhookUrl}</code>
                  <button onClick={copyUrl} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0891b2', display: 'flex', flexShrink: 0 }} title="Copiar URL">
                    <Copy size={13} />
                  </button>
                  <button onClick={generateToken} disabled={generatingToken} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', display: 'flex', flexShrink: 0 }} title="Gerar nova URL">
                    <RefreshCw size={13} />
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>Cole essa URL no Make, Zapier ou qualquer sistema externo</p>
              </div>
            )}

            <div>
              <label style={labelStyle}>Variáveis disponíveis no flow</label>
              <p style={{ fontSize: '11px', color: '#a1a1aa', marginBottom: '8px' }}>
                Todos os campos recebidos viram variáveis automaticamente. Use o nó <strong>Mapear campos</strong> para renomear ou transformar.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {[
                  ['{{webhook_phone}}', 'telefone recebido'],
                  ['{{webhook_name}}', 'nome recebido'],
                  ['{{webhook_email}}', 'email recebido'],
                  ['{{webhook_CAMPO}}', 'qualquer outro campo'],
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
              Cria ou atualiza o contato com os dados do webhook. Campos extras aparecem no painel lateral do inbox.
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={labelStyle}>Campos</label>
                <button
                  onClick={() => {
                    const fields = d.fields || []
                    onUpdate(node.id, { fields: [...fields, { label: '', variable: '', contactField: 'custom' }] })
                  }}
                  style={{ fontSize: '11px', fontWeight: 600, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer' }}>
                  + Adicionar campo
                </button>
              </div>

              {(d.fields || []).length === 0 ? (
                <div style={{ background: '#fafafa', border: '1px dashed #e4e4e7', borderRadius: '8px', padding: '16px', textAlign: 'center', fontSize: '12px', color: '#a1a1aa' }}>
                  Adicione campos para criar o contato
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
                            const defaultLabels: Record<string, string> = { phone: 'Telefone', name: 'Nome', email: 'Email' }
                            const newLabel = e.target.value === 'custom' ? (field.label || '') : defaultLabels[e.target.value] || ''
                            fields[idx] = { ...fields[idx], contactField: e.target.value, label: newLabel }
                            onUpdate(node.id, { fields })
                          }}
                          style={{ ...inputStyle, flex: 1, fontSize: '11px', padding: '5px 8px', background: '#fff', marginRight: '6px' }}
                          onFocus={focusInput} onBlur={blurInput}>
                          <option value="phone">📱 Telefone</option>
                          <option value="name">👤 Nome</option>
                          <option value="email">📧 Email</option>
                          <option value="custom">✏️ Campo extra</option>
                        </select>
                        <button
                          onClick={() => {
                            const fields = (d.fields || []).filter((_: any, i: number) => i !== idx)
                            onUpdate(node.id, { fields })
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', fontSize: '11px', flexShrink: 0 }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'}>
                          remover
                        </button>
                      </div>
                      {field.contactField === 'custom' && (
                        <div style={{ marginBottom: '6px' }}>
                          <input
                            placeholder="Nome do campo (ex: Cidade, Produto)"
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
                        placeholder="Variável (ex: {{webhook_phone}})"
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
              <p style={{ fontWeight: 600, marginBottom: '4px' }}>Exemplo de configuração:</p>
              <p>📱 Telefone → <code style={{ color: '#0891b2' }}>{'{{webhook_phone}}'}</code></p>
              <p>👤 Nome → <code style={{ color: '#0891b2' }}>{'{{webhook_name}}'}</code></p>
              <p>✏️ Cidade → <code style={{ color: '#0891b2' }}>{'{{webhook_cidade}}'}</code></p>
            </div>
          </div>
        )}

        {d.type === 'map_fields' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '12px', fontSize: '12px', color: '#6d28d9', lineHeight: 1.5 }}>
              Mapeie os campos recebidos pelo webhook para variáveis que você vai usar nos próximos nós.
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={labelStyle}>Mapeamentos</label>
                <button
                  onClick={() => {
                    const mappings = d.mappings || []
                    onUpdate(node.id, { mappings: [...mappings, { from: '', to: '' }] })
                  }}
                  style={{ fontSize: '11px', fontWeight: 600, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer' }}>
                  + Adicionar
                </button>
              </div>

              {(d.mappings || []).length === 0 ? (
                <div style={{ background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: '7px', padding: '12px', fontSize: '12px', color: '#a1a1aa', textAlign: 'center' }}>
                  Clique em + Adicionar para mapear os campos
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(d.mappings || []).map((mapping: any, idx: number) => (
                    <div key={idx} style={{ background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#71717a' }}>Campo {idx + 1}</span>
                        <button
                          onClick={() => {
                            const mappings = (d.mappings || []).filter((_: any, i: number) => i !== idx)
                            onUpdate(node.id, { mappings })
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', fontSize: '11px' }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'}>
                          remover
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div>
                          <label style={{ ...labelStyle, fontSize: '10px' }}>Variável de origem (ex: {'{{webhook_phone}}'})</label>
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
                          <label style={{ ...labelStyle, fontSize: '10px' }}>Salvar como variável</label>
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
                            Use {'{{' }{mapping.to || 'variavel'}{'}}' } nos próximos nós
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#fafafa', border: '1px solid #f4f4f5', borderRadius: '8px', padding: '10px 12px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#52525b', marginBottom: '6px' }}>Variáveis especiais:</p>
              <p style={{ fontSize: '11px', color: '#a1a1aa', lineHeight: 1.6 }}>
                Se você salvar como <code style={{ background: '#f0fdf4', color: '#16a34a', padding: '1px 4px', borderRadius: '3px' }}>telefone</code>, <code style={{ background: '#f0fdf4', color: '#16a34a', padding: '1px 4px', borderRadius: '3px' }}>nome</code> ou <code style={{ background: '#f0fdf4', color: '#16a34a', padding: '1px 4px', borderRadius: '3px' }}>email</code>, o contato será atualizado automaticamente.
              </p>
            </div>
          </div>
        )}

        {d.type === 'send_message' && (<>
          <SubtypeSelector options={SEND_SUBTYPES} />
          {channels.length > 1 && (
            <div>
              <label style={labelStyle}>Canal de envio</label>
              <select style={{ ...inputStyle, background: '#fafafa' }} value={d.channelId || ''} onChange={e => onUpdate(node.id, { channelId: e.target.value || null })} onFocus={focusInput} onBlur={blurInput}>
                <option value="">Canal padrão (da conversa)</option>
                {channels.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.name}{ch.phone_number ? ` (${ch.phone_number})` : ''}</option>)}
              </select>
            </div>
          )}
          {(d.subtype === 'text' || !d.subtype) && (
            <div>
              <label style={labelStyle}>Mensagem</label>
              <textarea style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' as const }} placeholder="Olá {{nome}}! Como posso ajudar?" value={d.message || ''} onChange={e => onUpdate(node.id, { message: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
              <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>Use {'{{variavel}}'} para personalizar</p>
            </div>
          )}
          {d.subtype === 'image' && (<>
            <div><label style={labelStyle}>Imagem</label><MediaUpload accept="image/*" label="Upload de imagem" currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} /></div>
            <div><label style={labelStyle}>Legenda (opcional)</label><input style={inputStyle} placeholder="Confira nosso catálogo!" value={d.caption || ''} onChange={e => onUpdate(node.id, { caption: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          </>)}
          {d.subtype === 'video' && (<div><label style={labelStyle}>Vídeo</label><MediaUpload accept="video/*" label="Upload de vídeo" currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} /></div>)}
          {d.subtype === 'audio' && (<div><label style={labelStyle}>Áudio</label><MediaUpload accept="audio/*" label="Upload de áudio" currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} /></div>)}
          {d.subtype === 'document' && (<>
            <div><label style={labelStyle}>Documento</label><MediaUpload accept=".pdf,.doc,.docx,.xls,.xlsx" label="Upload de documento" currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} /></div>
            <div><label style={labelStyle}>Nome do arquivo</label><input style={inputStyle} placeholder="catalogo.pdf" value={d.filename || ''} onChange={e => onUpdate(node.id, { filename: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          </>)}
        </>)}

        {d.type === 'input' && (<>
          <div><label style={labelStyle}>Pergunta para o usuário</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder="Ex: Qual é o seu nome?" value={d.question || ''} onChange={e => onUpdate(node.id, { question: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div>
            <label style={labelStyle}>Salvar resposta como variável</label>
            <input style={inputStyle} placeholder="nome" value={d.saveAs || ''} onChange={e => onUpdate(node.id, { saveAs: e.target.value.replace(/\s/g, '_').toLowerCase() })} onFocus={focusInput} onBlur={blurInput} />
            <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>Use {'{{' }{d.saveAs || 'variavel'}{'}}' } nos próximos nós</p>
          </div>
          <div>
            <label style={labelStyle}>Timeout (horas)</label>
            <input type="number" min="0" max="168" step="1" style={inputStyle} placeholder="0 = sem timeout" value={d.timeoutHours || ''} onChange={e => onUpdate(node.id, { timeoutHours: Number(e.target.value) || 0 })} onFocus={focusInput} onBlur={blurInput} />
            <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>Se não responder em {d.timeoutHours || 'X'}h, segue pela saída "timeout"</p>
          </div>
        </>)}

        {d.type === 'condition' && (<ConditionPanel d={d} nodeId={node.id} inputStyle={inputStyle} onUpdate={onUpdate} />)}

        {d.type === 'ai' && (<>
          <div><label style={labelStyle}>Modo</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.mode || 'respond'} onChange={e => onUpdate(node.id, { mode: e.target.value })} onFocus={focusInput} onBlur={blurInput}><option value="respond">Responder automaticamente</option><option value="classify">Classificar intenção</option><option value="extract">Extrair dado da mensagem</option><option value="summarize">Resumir mensagem</option></select></div>
          <div>
            <label style={labelStyle}>Chave da API OpenAI</label>
            <input style={inputStyle} placeholder="sk-... (deixe vazio para usar a chave das Configurações)" type="password" value={d.apiKey || ''} onChange={e => onUpdate(node.id, { apiKey: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
            <p style={{ fontSize: '11px', color: '#0891b2', marginTop: '4px' }}>💡 Você pode configurar a chave uma vez em <a href="/dashboard/settings" style={{ color: '#0891b2', fontWeight: 600 }}>Configurações</a> e todos os nós usam automaticamente</p>
          </div>
          <div><label style={labelStyle}>Modelo</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.model || 'gpt-4o-mini'} onChange={e => onUpdate(node.id, { model: e.target.value })} onFocus={focusInput} onBlur={blurInput}><option value="gpt-4o-mini">GPT-4o Mini (mais rápido)</option><option value="gpt-4o">GPT-4o (mais inteligente)</option><option value="gpt-3.5-turbo">GPT-3.5 Turbo</option></select></div>
          {d.mode === 'respond' && <div><label style={labelStyle}>Instrução para a IA</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder="Você é um atendente da empresa X." value={d.systemPrompt || ''} onChange={e => onUpdate(node.id, { systemPrompt: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>}
          {d.mode === 'classify' && <div><label style={labelStyle}>Categorias (separadas por vírgula)</label><input style={inputStyle} placeholder="comprar, suporte, cancelar" defaultValue={d.classifyOptions || ''} onFocus={focusInput} onBlur={e => { blurInput(e); onUpdate(node.id, { classifyOptions: e.target.value }) }} /></div>}
          {d.mode === 'extract' && <div><label style={labelStyle}>O que extrair</label><input style={inputStyle} placeholder="o nome completo, o CPF..." value={d.extractField || ''} onChange={e => onUpdate(node.id, { extractField: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>}
          <div><label style={labelStyle}>Salvar resposta como variável</label><input style={inputStyle} placeholder="intencao" value={d.saveAs || ''} onChange={e => onUpdate(node.id, { saveAs: e.target.value.replace(/\s/g, '_').toLowerCase() })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div>
            <label style={labelStyle}>Mensagens do histórico para contexto</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="range" min="0" max="200" step="5" value={d.historyMessages ?? 20} onChange={e => onUpdate(node.id, { historyMessages: Number(e.target.value) })} style={{ flex: 1, accentColor: color }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color, minWidth: '42px', textAlign: 'right' }}>{d.historyMessages === 0 ? 'nenhuma' : d.historyMessages === 200 ? 'todas' : `${d.historyMessages ?? 20}`}</span>
            </div>
          </div>
        </>)}

        {d.type === 'webhook' && (<>
          <div><label style={labelStyle}>URL</label><input style={inputStyle} placeholder="https://api.seusite.com/webhook" value={d.url || ''} onChange={e => onUpdate(node.id, { url: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>Método HTTP</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.method || 'POST'} onChange={e => onUpdate(node.id, { method: e.target.value })} onFocus={focusInput} onBlur={blurInput}><option value="POST">POST</option><option value="GET">GET</option><option value="PUT">PUT</option></select></div>
          {(d.method || 'POST') !== 'GET' && <div><label style={labelStyle}>Body (JSON)</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const, fontFamily: 'monospace', fontSize: '12px' }} placeholder='{
  "phone": "{{phone}}"
}' value={d.body || ''} onChange={e => onUpdate(node.id, { body: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>}
          <div><label style={labelStyle}>Salvar resposta como variável</label><input style={inputStyle} placeholder="resposta_webhook" value={d.saveResponseAs || ''} onChange={e => onUpdate(node.id, { saveResponseAs: e.target.value.replace(/\s/g, '_').toLowerCase() })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={labelStyle}>Headers (opcional)</label>
              <button onClick={() => onUpdate(node.id, { headers: [...(d.headers || []), { key: '', value: '' }] })} style={{ fontSize: '11px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Adicionar</button>
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
            Acima de 5 minutos o flow pausa e retoma automaticamente via fila.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div><label style={labelStyle}>Dias</label><input type="number" min="0" style={inputStyle} value={d.days ?? 0} onChange={e => onUpdate(node.id, { days: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
            <div><label style={labelStyle}>Horas</label><input type="number" min="0" max="23" style={inputStyle} value={d.hours ?? 0} onChange={e => onUpdate(node.id, { hours: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
            <div><label style={labelStyle}>Minutos</label><input type="number" min="0" max="59" style={inputStyle} value={d.minutes ?? 0} onChange={e => onUpdate(node.id, { minutes: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
            <div><label style={labelStyle}>Segundos</label><input type="number" min="0" max="59" style={inputStyle} value={d.seconds ?? 0} onChange={e => onUpdate(node.id, { seconds: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
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
                Total: {parts.join(' ') || '0s'}
                {total > 300 ? ' — agendado via fila ✓' : total > 0 ? ' — espera síncrona' : ''}
              </p>
            )
          })()}
        </>)}

        {d.type === 'tag_contact' && (<>
          <SubtypeSelector options={TAG_SUBTYPES} />
          <div>
            <label style={labelStyle}>{(d.subtype || 'add') === 'add' ? 'Tags para adicionar' : 'Tags para remover'}</label>
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
              <label style={labelStyle}>Criar nova tag</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: '12px' }} placeholder="Nome da tag..." value={newTagName} onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (async () => {
                    if (!newTagName.trim()) return; setCreatingTag(true)
                    try { const { data } = await contactApi.post('/tags', { name: newTagName.trim(), color: '#22c55e' }); onUpdate(node.id, { tagId: data.data.id, tagName: data.data.name }); queryClient.invalidateQueries({ queryKey: ['tags'] }); setNewTagName(''); toast.success(`Tag "${data.data.name}" criada!`) }
                    catch (err: any) { toast.error(err?.response?.data?.error?.message || 'Erro ao criar tag') }
                    finally { setCreatingTag(false) }
                  })() } }}
                  onFocus={focusInput} onBlur={blurInput} />
                <button disabled={creatingTag || !newTagName.trim()} onClick={async () => {
                  if (!newTagName.trim()) return; setCreatingTag(true)
                  try { const { data } = await contactApi.post('/tags', { name: newTagName.trim(), color: '#22c55e' }); onUpdate(node.id, { tagId: data.data.id, tagName: data.data.name }); queryClient.invalidateQueries({ queryKey: ['tags'] }); setNewTagName(''); toast.success(`Tag "${data.data.name}" criada!`) }
                  catch (err: any) { toast.error(err?.response?.data?.error?.message || 'Erro ao criar tag') }
                  finally { setCreatingTag(false) }
                }}
                  style={{ padding: '6px 12px', background: newTagName.trim() ? '#22c55e' : '#e4e4e7', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: newTagName.trim() ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                  {creatingTag ? '...' : '+ Criar'}
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
                      <option value="name">Nome</option>
                      <option value="phone">Telefone</option>
                      <option value="email">Email</option>
                      {customFields.length > 0 && <option disabled>── Campos personalizados ──</option>}
                      {customFields.map((cf: { name: string; label: string }) => (
                        <option key={cf.name} value={`cf:${cf.name}`}>{cf.label}</option>
                      ))}
                      <option value="custom_new">+ Outro campo...</option>
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
                    <input style={{ ...inputStyle, padding: '5px 8px', fontSize: '12px' }} placeholder="Nome do campo (ex: cargo, empresa)" value={f.customField || ''} onChange={e => updateField(i, { customField: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
                  )}
                  <input style={{ ...inputStyle, padding: '5px 8px', fontSize: '12px' }} placeholder="{{variavel}} ou texto fixo" value={f.value} onChange={e => updateField(i, { value: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
                </div>
              ))}
              <button onClick={addField}
                style={{ width: '100%', padding: '7px', background: 'transparent', border: '1.5px dashed #e4e4e7', borderRadius: '8px', color: '#71717a', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', transition: 'border-color 0.15s, color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#22c55e'; (e.currentTarget as HTMLButtonElement).style.color = '#16a34a' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e4e4e7'; (e.currentTarget as HTMLButtonElement).style.color = '#71717a' }}>
                <Plus size={13} /> Adicionar campo
              </button>
            </>)
          })()}
        </>)}

        {d.type === 'move_pipeline' && (<>
          {pipelines.length > 0 && (
            <div><label style={labelStyle}>Pipeline</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.pipelineId || ''} onChange={e => onUpdate(node.id, { pipelineId: e.target.value || null, stage: '', stageLabel: '' })} onFocus={focusInput} onBlur={blurInput}><option value="">Pipeline padrão</option>{pipelines.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          )}
          <div><label style={labelStyle}>Etapa do funil</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.stage || ''} onChange={e => { const selected = pipelineColumns.find((c: any) => c.key === e.target.value); onUpdate(node.id, { stage: e.target.value, stageLabel: selected?.label || e.target.value }) }} onFocus={focusInput} onBlur={blurInput}><option value="">Selecione uma etapa</option>{pipelineColumns.map((col: any) => <option key={col.key} value={col.key}>{col.label}</option>)}</select></div>
        </>)}

        {d.type === 'assign_agent' && (<>
          <div>
            <label style={labelStyle}>Atribuir para</label>
            <select style={{ ...inputStyle, background: '#fafafa' }} value={d.agentId || ''} onChange={e => onUpdate(node.id, { agentId: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
              <option value="">Ninguém (só desativar bot)</option>
              <option value="round_robin">🔄 Round-robin (menos ocupado)</option>
              {(teamMembers || []).map((m: any) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Mensagem para o cliente (opcional)</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder="Aguarde, um atendente irá te responder." value={d.message || ''} onChange={e => onUpdate(node.id, { message: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
        </>)}

        {d.type === 'go_to' && (
          <div>
            <label style={labelStyle}>Flow de destino</label>
            {flows.length === 0
              ? <p style={{ fontSize: '12px', color: '#a1a1aa' }}>Nenhum outro flow disponível.</p>
              : <select style={{ ...inputStyle, background: '#fafafa' }} value={d.targetFlowId || ''} onChange={e => onUpdate(node.id, { targetFlowId: e.target.value })} onFocus={focusInput} onBlur={blurInput}><option value="">Selecione um flow</option>{flows.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            }
            <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>O flow atual para e o flow selecionado começa</p>
          </div>
        )}

        {d.type === 'loop' && (<>
          <SubtypeSelector options={LOOP_SUBTYPES} />
          {(d.subtype === 'repeat' || !d.subtype) && (<>
            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#6d28d9' }}>
              Conecte a saída <strong>Loop</strong> aos nós que devem repetir. <strong>Concluído</strong> segue após terminar todas as repetições.
            </div>
            <div><label style={labelStyle}>Número de repetições</label><input type="number" min="1" max="100" style={inputStyle} value={d.times ?? 1} onChange={e => onUpdate(node.id, { times: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
          </>)}
          {d.subtype === 'retry' && (<>
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#ea580c' }}>
              Conecte a saída <strong>Tentativa</strong> ao fluxo de tentativa. <strong>Esgotado</strong> dispara quando atingir o limite.
            </div>
            <div><label style={labelStyle}>Máximo de tentativas</label><input type="number" min="1" max="20" style={inputStyle} value={d.maxRetries ?? 3} onChange={e => onUpdate(node.id, { maxRetries: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
          </>)}
          {d.subtype === 'while' && (<>
            <div><label style={labelStyle}>Campo</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.conditionField || 'variable'} onChange={e => onUpdate(node.id, { conditionField: e.target.value })} onFocus={focusInput} onBlur={blurInput}><option value="variable">Variável</option><option value="message">Mensagem</option><option value="phone">Telefone</option></select></div>
            {(d.conditionField || 'variable') === 'variable' && (
              <div><label style={labelStyle}>Nome da variável</label><input style={inputStyle} placeholder="ex: status_pagamento" value={d.conditionFieldName || ''} onChange={e => onUpdate(node.id, { conditionFieldName: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
            )}
            <div><label style={labelStyle}>Operador</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.conditionOperator || 'is_empty'} onChange={e => onUpdate(node.id, { conditionOperator: e.target.value })} onFocus={focusInput} onBlur={blurInput}><option value="is_empty">Está vazio</option><option value="is_not_empty">Não está vazio</option><option value="equals">É igual a</option><option value="not_equals">É diferente de</option><option value="contains">Contém</option><option value="not_contains">Não contém</option></select></div>
            {!['is_empty', 'is_not_empty'].includes(d.conditionOperator || 'is_empty') && (
              <div><label style={labelStyle}>Valor</label><input style={inputStyle} placeholder="valor para comparar" value={d.conditionValue || ''} onChange={e => onUpdate(node.id, { conditionValue: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
            )}
            <div><label style={labelStyle}>Máximo de iterações (segurança)</label><input type="number" min="1" max="100" style={inputStyle} value={d.maxIterations ?? 10} onChange={e => onUpdate(node.id, { maxIterations: Number(e.target.value) })} onFocus={focusInput} onBlur={blurInput} /></div>
          </>)}
        </>)}

        {d.type === 'transcribe_audio' && (<>
          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#6d28d9' }}>
            🎙️ Se o contato enviar <b>áudio</b>, transcreve para texto automaticamente. Se enviar <b>texto</b>, usa direto. O resultado fica na variável abaixo.
          </div>
          <div>
            <label style={labelStyle}>Salvar transcrição como variável</label>
            <input style={inputStyle} placeholder="transcricao" value={d.transcribeSaveAs || ''} onChange={e => onUpdate(node.id, { transcribeSaveAs: e.target.value.replace(/\s/g, '_').toLowerCase() })} onFocus={focusInput} onBlur={blurInput} />
            <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>Use {'{{' }{d.transcribeSaveAs || 'transcricao'}{'}}' } nos próximos nós (ex: IA, condição)</p>
          </div>
          <div>
            <label style={labelStyle}>Idioma do áudio</label>
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
            <label style={labelStyle}>Chave OpenAI (opcional)</label>
            <input style={inputStyle} placeholder="Deixe vazio para usar a chave das Configurações" type="password" value={d.apiKey || ''} onChange={e => onUpdate(node.id, { apiKey: e.target.value })} onFocus={focusInput} onBlur={blurInput} />
          </div>
        </>)}

        {d.type === 'set_variable' && (<>
          <div><label style={labelStyle}>Nome da variável</label><input style={inputStyle} placeholder="score" value={d.variableName || ''} onChange={e => onUpdate(node.id, { variableName: e.target.value.replace(/\s/g, '_').toLowerCase() })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>Valor</label><input style={inputStyle} placeholder="Ex: 10, {{nome}}, lead_quente" value={d.variableValue || ''} onChange={e => onUpdate(node.id, { variableValue: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>Use {'{{variavel}}'} pra referir outras variáveis</p>
        </>)}

        {d.type === 'math' && (<>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#1e40af' }}>
            🧮 Faz cálculos com variáveis. Ex: lead scoring, contadores, valores.
          </div>
          <div><label style={labelStyle}>Variável</label><input style={inputStyle} placeholder="score" value={d.mathVariable || ''} onChange={e => onUpdate(node.id, { mathVariable: e.target.value.replace(/\s/g, '_').toLowerCase() })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>Operação</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.mathOperator || '+'} onChange={e => onUpdate(node.id, { mathOperator: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
            <option value="+">+ Somar</option>
            <option value="-">- Subtrair</option>
            <option value="*">× Multiplicar</option>
            <option value="/">÷ Dividir</option>
          </select></div>
          <div><label style={labelStyle}>Valor</label><input style={inputStyle} placeholder="10" value={d.mathValue || ''} onChange={e => onUpdate(node.id, { mathValue: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          <p style={{ fontSize: '11px', color: '#a1a1aa' }}>Resultado: {d.mathVariable || 'score'} = {d.mathVariable || 'score'} {d.mathOperator || '+'} {d.mathValue || '0'}</p>
        </>)}

        {d.type === 'create_task' && (<>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#92400e' }}>
            📋 Cria uma tarefa automaticamente vinculada à conversa.
          </div>
          <div><label style={labelStyle}>Título da tarefa</label><input style={inputStyle} placeholder="Ligar pro cliente {{nome}}" value={d.taskTitle || ''} onChange={e => onUpdate(node.id, { taskTitle: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>Vencimento em (horas)</label><input type="number" min="0" style={inputStyle} placeholder="72 = 3 dias" value={d.taskDueHours || ''} onChange={e => onUpdate(node.id, { taskDueHours: Number(e.target.value) || 0 })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>Atribuir para</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.taskAssignTo || ''} onChange={e => onUpdate(node.id, { taskAssignTo: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
            <option value="">Sem atribuição</option>
            {(teamMembers || []).map((m: any) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select></div>
        </>)}

        {d.type === 'send_notification' && (<>
          <div style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#9d174d' }}>
            🔔 Envia notificação em tempo real pro atendente no inbox.
          </div>
          <div><label style={labelStyle}>Mensagem da notificação</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder="Lead quente! {{nome}} quer o plano Enterprise" value={d.notificationMessage || ''} onChange={e => onUpdate(node.id, { notificationMessage: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>Notificar quem</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.notifyAgentId || ''} onChange={e => onUpdate(node.id, { notifyAgentId: e.target.value })} onFocus={focusInput} onBlur={blurInput}>
            <option value="">Todos os agentes</option>
            {(teamMembers || []).map((m: any) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
          </select></div>
        </>)}

        {d.type === 'split_ab' && (<>
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#9a3412' }}>
            🧪 Divide o tráfego em caminhos diferentes por porcentagem. Útil pra testar qual mensagem converte mais.
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={labelStyle}>Caminhos</label>
              <button onClick={() => {
                const paths = [...(d.splitPaths || [{ label: 'A', weight: 50 }, { label: 'B', weight: 50 }])]
                paths.push({ label: String.fromCharCode(65 + paths.length), weight: Math.round(100 / (paths.length + 1)) })
                onUpdate(node.id, { splitPaths: paths })
              }} style={{ fontSize: '11px', color: '#ea580c', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Adicionar</button>
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
            🎲 Escolhe um caminho aleatório a cada execução. Útil pra rotacionar mensagens.
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={labelStyle}>Caminhos</label>
              <button onClick={() => {
                const paths = [...(d.randomPaths || ['A', 'B'])]
                paths.push(String.fromCharCode(65 + paths.length))
                onUpdate(node.id, { randomPaths: paths })
              }} style={{ fontSize: '11px', color: '#ea580c', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ Adicionar</button>
            </div>
            {(d.randomPaths || ['A', 'B']).map((p: string, i: number) => (
              <div key={i} style={{ display: 'flex', gap: '4px', marginBottom: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color, minWidth: '20px' }}>{p}</span>
                <span style={{ fontSize: '11px', color: '#a1a1aa' }}>chance igual</span>
                {(d.randomPaths || []).length > 2 && <button onClick={() => {
                  const paths = (d.randomPaths || []).filter((_: any, j: number) => j !== i)
                  onUpdate(node.id, { randomPaths: paths })
                }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}>×</button>}
              </div>
            ))}
          </div>
        </>)}

        {d.type === 'end' && (
          <div><label style={labelStyle}>Mensagem de encerramento (opcional)</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder="Obrigado pelo contato! Até mais 👋" value={d.message || ''} onChange={e => onUpdate(node.id, { message: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
        )}
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid #f4f4f5' }}>
        <button onClick={() => onDelete(node.id)}
          style={{ width: '100%', padding: '8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#ef4444', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.1s' }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#fee2e2'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'}>
          Remover nó
        </button>
      </div>
      <style>{"@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }"}</style>
    </div>
  )
}
