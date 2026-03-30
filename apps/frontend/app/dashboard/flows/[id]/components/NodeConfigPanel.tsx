'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'
import { Node } from '@xyflow/react'
import { X, Copy, RefreshCw, Loader2 } from 'lucide-react'
import { NODE_COLORS, NODE_LABELS, DEFAULT_STAGES, SEND_SUBTYPES, TAG_SUBTYPES, LOOP_SUBTYPES } from './constants'
import { MediaUpload, ConditionPanel } from './ConditionPanel'
import { messageApi } from '@/lib/api'
import { toast } from 'sonner'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MESSAGE_SERVICE_URL = process.env.NEXT_PUBLIC_MESSAGE_SERVICE_URL || 'https://autozapmessage-service-production.up.railway.app'

export function NodeConfigPanel({ node, tags, flows, tenantId, onUpdate, onClose, onDelete }: {
  node: Node; tags: any[]; flows: any[]; tenantId: string
  onUpdate: (id: string, data: any) => void
  onClose: () => void
  onDelete: (id: string) => void
}) {
  const d = node.data as any
  const color = NODE_COLORS[d.type] || '#6b7280'

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
    <div style={{ position: 'absolute', top: 0, right: 0, width: '320px', height: '100%', background: '#fff', borderLeft: '1px solid #e4e4e7', zIndex: 10, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 16px rgba(0,0,0,.06)' }}
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
            <label style={labelStyle}>Palavras-chave (separadas por vírgula)</label>
            <input style={inputStyle} placeholder="preço, valor, info"
              defaultValue={(d.keywords || []).join(', ')}
              onFocus={focusInput} onBlur={e => { blurInput(e); onUpdate(node.id, { keywords: e.target.value.split(',').map((k: string) => k.trim()).filter(Boolean) }) }} />
            <p style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>Clique fora do campo para salvar</p>
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
            <input style={inputStyle} placeholder="Deixe vazio para qualquer mensagem"
              defaultValue={(d.keywords || []).join(', ')}
              onFocus={focusInput} onBlur={e => { blurInput(e); onUpdate(node.id, { keywords: e.target.value.split(',').map((k: string) => k.trim()).filter(Boolean) }) }} />
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
        </>)}

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

            {/* ── Mapeamento de campos ── */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={labelStyle}>Mapeamento de campos</label>
                <button
                  onClick={() => {
                    const map = d.fieldMap || []
                    onUpdate(node.id, { fieldMap: [...map, { externalField: '', contactField: 'phone' }] })
                  }}
                  style={{ fontSize: '11px', fontWeight: 600, color: '#0891b2', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  + Adicionar
                </button>
              </div>
              <p style={{ fontSize: '11px', color: '#a1a1aa', marginBottom: '8px' }}>
                Defina qual campo do formulário externo corresponde a cada campo do contato
              </p>
              {(d.fieldMap || []).length === 0 ? (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '7px', padding: '10px 12px', fontSize: '11px', color: '#92400e' }}>
                  ⚠️ Sem mapeamento — o sistema tentará detectar os campos automaticamente. Adicione mapeamentos se os campos do formulário tiverem nomes diferentes.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(d.fieldMap || []).map((mapping: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        placeholder="campo externo (ex: telefone)"
                        value={mapping.externalField || ''}
                        onChange={e => {
                          const map = [...(d.fieldMap || [])]
                          map[idx] = { ...map[idx], externalField: e.target.value }
                          onUpdate(node.id, { fieldMap: map })
                        }}
                        style={{ ...inputStyle, flex: 1, fontSize: '11px', padding: '6px 8px' }}
                        onFocus={focusInput} onBlur={blurInput}
                      />
                      <span style={{ fontSize: '11px', color: '#a1a1aa', flexShrink: 0 }}>→</span>
                      <select
                        value={mapping.contactField || 'phone'}
                        onChange={e => {
                          const map = [...(d.fieldMap || [])]
                          map[idx] = { ...map[idx], contactField: e.target.value }
                          onUpdate(node.id, { fieldMap: map })
                        }}
                        style={{ ...inputStyle, flex: 1, fontSize: '11px', padding: '6px 8px', background: '#fafafa' }}
                        onFocus={focusInput} onBlur={blurInput}>
                        <option value="phone">Telefone</option>
                        <option value="name">Nome</option>
                        <option value="email">Email</option>
                        <option value="source">Origem</option>
                        <option value="message">Mensagem</option>
                      </select>
                      <button
                        onClick={() => {
                          const map = (d.fieldMap || []).filter((_: any, i: number) => i !== idx)
                          onUpdate(node.id, { fieldMap: map })
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: '4px', flexShrink: 0, display: 'flex' }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Variáveis disponíveis no flow</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {[
                  ['{{webhook_telefone}}', 'valor bruto do campo telefone'],
                  ['{{webhook_nome}}', 'valor bruto do campo nome'],
                  ['{{webhook_email}}', 'valor bruto do campo email'],
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

        {d.type === 'send_message' && (<>
          <SubtypeSelector options={SEND_SUBTYPES} />
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
        </>)}

        {d.type === 'condition' && (<ConditionPanel d={d} nodeId={node.id} inputStyle={inputStyle} onUpdate={onUpdate} />)}

        {d.type === 'ai' && (<>
          <div><label style={labelStyle}>Modo</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.mode || 'respond'} onChange={e => onUpdate(node.id, { mode: e.target.value })} onFocus={focusInput} onBlur={blurInput}><option value="respond">Responder automaticamente</option><option value="classify">Classificar intenção</option><option value="extract">Extrair dado da mensagem</option><option value="summarize">Resumir mensagem</option></select></div>
          <div><label style={labelStyle}>Chave da API OpenAI</label><input style={inputStyle} placeholder="sk-..." type="password" value={d.apiKey || ''} onChange={e => onUpdate(node.id, { apiKey: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
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
        </>)}

        {d.type === 'wait' && (<>
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#0369a1' }}>
            Acima de 5 minutos o flow pausa e retoma automaticamente via fila.
          </div>
          <div><label style={labelStyle}>Segundos</label><input type="number" min="0" style={inputStyle} value={d.seconds ?? 0} onChange={e => onUpdate(node.id, { seconds: Number(e.target.value), minutes: 0, hours: 0, days: 0 })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>Minutos</label><input type="number" min="0" style={inputStyle} value={d.minutes ?? 0} onChange={e => onUpdate(node.id, { minutes: Number(e.target.value), seconds: 0, hours: 0, days: 0 })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>Horas</label><input type="number" min="0" style={inputStyle} value={d.hours ?? 0} onChange={e => onUpdate(node.id, { hours: Number(e.target.value), seconds: 0, minutes: 0, days: 0 })} onFocus={focusInput} onBlur={blurInput} /></div>
          <div><label style={labelStyle}>Dias</label><input type="number" min="0" style={inputStyle} value={d.days ?? 0} onChange={e => onUpdate(node.id, { days: Number(e.target.value), seconds: 0, minutes: 0, hours: 0 })} onFocus={focusInput} onBlur={blurInput} /></div>
          <p style={{ fontSize: '11px', color: '#a1a1aa' }}>
            Total: {((d.days||0)*24*60 + (d.hours||0)*60 + (d.minutes||0) + Math.ceil((d.seconds||0)/60))} minuto(s)
            {((d.days||0)*86400 + (d.hours||0)*3600 + (d.minutes||0)*60 + (d.seconds||0)) > 300 ? ' — agendado via fila ✓' : ' — espera síncrona'}
          </p>
        </>)}

        {d.type === 'tag_contact' && (<>
          <SubtypeSelector options={TAG_SUBTYPES} />
          <div>
            <label style={labelStyle}>{(d.subtype || 'add') === 'add' ? 'Tag para adicionar' : 'Tag para remover'}</label>
            {tags.length === 0
              ? <p style={{ fontSize: '12px', color: '#a1a1aa' }}>Nenhuma tag cadastrada.</p>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {tags.map((tag: any) => (
                    <div key={tag.id} onClick={() => onUpdate(node.id, { tagId: tag.id, tagName: tag.name })}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '99px', cursor: 'pointer', border: `1.5px solid ${d.tagId === tag.id ? (tag.color || '#22c55e') : '#e4e4e7'}`, background: d.tagId === tag.id ? `${tag.color || '#22c55e'}12` : '#fff', fontSize: '12px', fontWeight: 500 }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: tag.color || '#6b7280' }} />
                      <span style={{ color: d.tagId === tag.id ? (tag.color || '#22c55e') : '#18181b' }}>{tag.name}</span>
                    </div>
                  ))}
                </div>
            }
          </div>
        </>)}

        {d.type === 'update_contact' && (<>
          <div><label style={labelStyle}>Campo para atualizar</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.field || 'name'} onChange={e => onUpdate(node.id, { field: e.target.value })} onFocus={focusInput} onBlur={blurInput}><option value="name">Nome</option><option value="phone">Telefone</option><option value="custom">Campo personalizado</option></select></div>
          {d.field === 'custom' && <div><label style={labelStyle}>Nome do campo</label><input style={inputStyle} placeholder="cargo, empresa..." value={d.customField || ''} onChange={e => onUpdate(node.id, { customField: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>}
          <div><label style={labelStyle}>Novo valor</label><input style={inputStyle} placeholder="{{nome}} ou texto fixo" value={d.value || ''} onChange={e => onUpdate(node.id, { value: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
        </>)}

        {d.type === 'move_pipeline' && (<>
          {pipelines.length > 0 && (
            <div><label style={labelStyle}>Pipeline</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.pipelineId || ''} onChange={e => onUpdate(node.id, { pipelineId: e.target.value || null, stage: '', stageLabel: '' })} onFocus={focusInput} onBlur={blurInput}><option value="">Pipeline padrão</option>{pipelines.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          )}
          <div><label style={labelStyle}>Etapa do funil</label><select style={{ ...inputStyle, background: '#fafafa' }} value={d.stage || ''} onChange={e => { const selected = pipelineColumns.find((c: any) => c.key === e.target.value); onUpdate(node.id, { stage: e.target.value, stageLabel: selected?.label || e.target.value }) }} onFocus={focusInput} onBlur={blurInput}><option value="">Selecione uma etapa</option>{pipelineColumns.map((col: any) => <option key={col.key} value={col.key}>{col.label}</option>)}</select></div>
        </>)}

        {d.type === 'assign_agent' && (
          <div><label style={labelStyle}>Mensagem para o cliente (opcional)</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as const }} placeholder="Aguarde, um atendente irá te responder." value={d.message || ''} onChange={e => onUpdate(node.id, { message: e.target.value })} onFocus={focusInput} onBlur={blurInput} /></div>
        )}

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
