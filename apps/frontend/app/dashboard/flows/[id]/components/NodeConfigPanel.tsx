'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'
import { Node } from '@xyflow/react'
import { X } from 'lucide-react'
import { NODE_COLORS, NODE_LABELS, DEFAULT_STAGES } from './constants'
import { MediaUpload, ConditionPanel } from './ConditionPanel'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function NodeConfigPanel({ node, tags, flows, tenantId, onUpdate, onClose, onDelete }: {
  node: Node; tags: any[]; flows: any[]; tenantId: string
  onUpdate: (id: string, data: any) => void
  onClose: () => void
  onDelete: (id: string) => void
}) {
  const d = node.data as any
  const color = NODE_COLORS[d.type] || '#6b7280'

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb',
    borderRadius: '7px', fontSize: '13px', outline: 'none', color: '#111827',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280',
    marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em',
  }

  const { data: pipelineColumns = [] } = useQuery({
    queryKey: ['pipeline-columns-flow', tenantId],
    queryFn: async () => {
      if (!tenantId) return DEFAULT_STAGES
      const { data, error } = await supabase.from('pipeline_columns').select('key, label').eq('tenant_id', tenantId).order('sort_order', { ascending: true })
      if (error || !data || data.length === 0) return DEFAULT_STAGES
      return data as { key: string; label: string }[]
    },
    staleTime: 0,
    enabled: d.type === 'move_pipeline',
  })

  return (
    <div style={{ position: 'absolute', top: 0, right: 0, width: '320px', height: '100%', background: '#fff', borderLeft: '1px solid #e5e7eb', zIndex: 10, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 16px rgba(0,0,0,.06)' }}
      onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>

      <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
            {d.type?.startsWith('trigger_') ? 'Gatilho' : d.type === 'end' ? 'Fim' : 'Ação'}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{NODE_LABELS[d.type] || d.type}</div>
        </div>
        <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '6px', display: 'flex' }}>
          <X size={15} color="#6b7280" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {d.type === 'trigger_keyword' && (
          <div>
            <label style={labelStyle}>Palavras-chave (separadas por vírgula)</label>
            <input style={inputStyle} placeholder="preço, valor, info"
              defaultValue={(d.keywords || []).join(', ')}
              onBlur={e => onUpdate(node.id, { keywords: e.target.value.split(',').map((k: string) => k.trim()).filter(Boolean) })} />
            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Clique fora do campo para salvar</p>
          </div>
        )}
        {d.type === 'trigger_first_message' && (
          <div>
            <label style={labelStyle}>Filtrar por palavra-chave (opcional)</label>
            <input style={inputStyle} placeholder="Deixe vazio para qualquer mensagem"
              defaultValue={(d.keywords || []).join(', ')}
              onBlur={e => onUpdate(node.id, { keywords: e.target.value.split(',').map((k: string) => k.trim()).filter(Boolean) })} />
          </div>
        )}
        {d.type === 'trigger_any_reply' && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px' }}>
            <p style={{ fontSize: '13px', color: '#15803d', fontWeight: 500 }}>Dispara quando o contato enviar qualquer mensagem.</p>
          </div>
        )}
        {d.type === 'trigger_outside_hours' && (
          <>
            <div>
              <label style={labelStyle}>Início do expediente (hora)</label>
              <input type="number" min="0" max="23" style={inputStyle} value={d.start ?? 9} onChange={e => onUpdate(node.id, { start: Number(e.target.value) })} />
            </div>
            <div>
              <label style={labelStyle}>Fim do expediente (hora)</label>
              <input type="number" min="0" max="23" style={inputStyle} value={d.end ?? 18} onChange={e => onUpdate(node.id, { end: Number(e.target.value) })} />
            </div>
          </>
        )}

        {d.type === 'send_message' && (
          <div>
            <label style={labelStyle}>Mensagem</label>
            <textarea style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' as any }}
              placeholder="Olá {{nome}}! Como posso ajudar?"
              value={d.message || ''} onChange={e => onUpdate(node.id, { message: e.target.value })} />
            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Use {'{{variavel}}'} para personalizar</p>
          </div>
        )}
        {d.type === 'send_image' && (
          <>
            <div><label style={labelStyle}>Imagem</label><MediaUpload accept="image/*" label="Upload de imagem" currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} /></div>
            <div><label style={labelStyle}>Legenda (opcional)</label><input style={inputStyle} placeholder="Confira nosso catálogo!" value={d.caption || ''} onChange={e => onUpdate(node.id, { caption: e.target.value })} /></div>
          </>
        )}
        {d.type === 'send_video' && (<div><label style={labelStyle}>Vídeo</label><MediaUpload accept="video/*" label="Upload de vídeo" currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} /></div>)}
        {d.type === 'send_audio' && (<div><label style={labelStyle}>Áudio</label><MediaUpload accept="audio/*" label="Upload de áudio" currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} /></div>)}
        {d.type === 'send_document' && (
          <>
            <div><label style={labelStyle}>Documento</label><MediaUpload accept=".pdf,.doc,.docx,.xls,.xlsx" label="Upload de documento" currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} /></div>
            <div><label style={labelStyle}>Nome do arquivo</label><input style={inputStyle} placeholder="catalogo.pdf" value={d.filename || ''} onChange={e => onUpdate(node.id, { filename: e.target.value })} /></div>
          </>
        )}

        {d.type === 'input' && (
          <>
            <div><label style={labelStyle}>Pergunta para o usuário</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as any }} placeholder="Ex: Qual é o seu nome?" value={d.question || ''} onChange={e => onUpdate(node.id, { question: e.target.value })} /></div>
            <div>
              <label style={labelStyle}>Salvar resposta como variável</label>
              <input style={inputStyle} placeholder="nome" value={d.saveAs || ''} onChange={e => onUpdate(node.id, { saveAs: e.target.value.replace(/\s/g, '_').toLowerCase() })} />
              <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Use {'{{' + (d.saveAs || 'variavel') + '}}'} nos próximos nós</p>
            </div>
          </>
        )}

        {d.type === 'condition' && (<ConditionPanel d={d} nodeId={node.id} inputStyle={inputStyle} onUpdate={onUpdate} />)}

        {d.type === 'ai' && (
          <>
            <div><label style={labelStyle}>Modo</label>
              <select style={{ ...inputStyle, background: '#fff' }} value={d.mode || 'respond'} onChange={e => onUpdate(node.id, { mode: e.target.value })}>
                <option value="respond">Responder automaticamente</option>
                <option value="classify">Classificar intenção</option>
                <option value="extract">Extrair dado da mensagem</option>
                <option value="summarize">Resumir mensagem</option>
              </select>
            </div>
            <div><label style={labelStyle}>Chave da API OpenAI</label><input style={inputStyle} placeholder="sk-..." type="password" value={d.apiKey || ''} onChange={e => onUpdate(node.id, { apiKey: e.target.value })} /></div>
            <div><label style={labelStyle}>Modelo</label>
              <select style={{ ...inputStyle, background: '#fff' }} value={d.model || 'gpt-4o-mini'} onChange={e => onUpdate(node.id, { model: e.target.value })}>
                <option value="gpt-4o-mini">GPT-4o Mini (mais rápido)</option>
                <option value="gpt-4o">GPT-4o (mais inteligente)</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              </select>
            </div>
            {d.mode === 'respond' && <div><label style={labelStyle}>Instrução para a IA</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as any }} placeholder="Você é um atendente da empresa X." value={d.systemPrompt || ''} onChange={e => onUpdate(node.id, { systemPrompt: e.target.value })} /></div>}
            {d.mode === 'classify' && <div><label style={labelStyle}>Categorias (separadas por vírgula)</label><input style={inputStyle} placeholder="comprar, suporte, cancelar" defaultValue={d.classifyOptions || ''} onBlur={e => onUpdate(node.id, { classifyOptions: e.target.value })} /></div>}
            {d.mode === 'extract' && <div><label style={labelStyle}>O que extrair</label><input style={inputStyle} placeholder="o nome completo, o CPF..." value={d.extractField || ''} onChange={e => onUpdate(node.id, { extractField: e.target.value })} /></div>}
            <div><label style={labelStyle}>Salvar resposta como variável</label><input style={inputStyle} placeholder="intencao" value={d.saveAs || ''} onChange={e => onUpdate(node.id, { saveAs: e.target.value.replace(/\s/g, '_').toLowerCase() })} /></div>

            {/* Contexto do histórico */}
            <div>
              <label style={labelStyle}>Mensagens do histórico para contexto</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="range" min="0" max="200" step="5"
                  value={d.historyMessages ?? 20}
                  onChange={e => onUpdate(node.id, { historyMessages: Number(e.target.value) })}
                  style={{ flex: 1, accentColor: '#6d28d9' }}
                />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#6d28d9', minWidth: '42px', textAlign: 'right' }}>
                  {d.historyMessages === 0 ? 'nenhuma' : d.historyMessages === 200 ? 'todas' : `${d.historyMessages ?? 20}`}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#d1d5db', marginTop: '2px' }}>
                <span>Sem histórico</span>
                <span>Todas</span>
              </div>
              <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                {d.historyMessages === 0
                  ? 'A IA responde sem ver o histórico da conversa'
                  : d.historyMessages === 200
                  ? 'A IA vê toda a conversa (pode ser mais lento e caro)'
                  : `A IA considera as últimas ${d.historyMessages ?? 20} mensagens como contexto`}
              </p>
            </div>
          </>
        )}

        {d.type === 'webhook' && (
          <>
            <div><label style={labelStyle}>URL</label><input style={inputStyle} placeholder="https://api.seusite.com/webhook" value={d.url || ''} onChange={e => onUpdate(node.id, { url: e.target.value })} /></div>
            <div><label style={labelStyle}>Método HTTP</label>
              <select style={{ ...inputStyle, background: '#fff' }} value={d.method || 'POST'} onChange={e => onUpdate(node.id, { method: e.target.value })}>
                <option value="POST">POST</option><option value="GET">GET</option><option value="PUT">PUT</option>
              </select>
            </div>
            {(d.method || 'POST') !== 'GET' && <div><label style={labelStyle}>Body (JSON)</label><textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as any, fontFamily: 'monospace', fontSize: '12px' }} placeholder={'{\n  "phone": "{{phone}}"\n}'} value={d.body || ''} onChange={e => onUpdate(node.id, { body: e.target.value })} /></div>}
            <div><label style={labelStyle}>Salvar resposta como variável</label><input style={inputStyle} placeholder="resposta_webhook" value={d.saveResponseAs || ''} onChange={e => onUpdate(node.id, { saveResponseAs: e.target.value.replace(/\s/g, '_').toLowerCase() })} /></div>
          </>
        )}

        {d.type === 'wait' && (
          <>
            <div><label style={labelStyle}>Segundos</label><input type="number" min="0" style={inputStyle} value={d.seconds ?? 0} onChange={e => onUpdate(node.id, { seconds: Number(e.target.value), minutes: 0, hours: 0 })} /></div>
            <div><label style={labelStyle}>Minutos</label><input type="number" min="0" style={inputStyle} value={d.minutes ?? 0} onChange={e => onUpdate(node.id, { minutes: Number(e.target.value), seconds: 0, hours: 0 })} /></div>
            <div><label style={labelStyle}>Horas</label><input type="number" min="0" style={inputStyle} value={d.hours ?? 0} onChange={e => onUpdate(node.id, { hours: Number(e.target.value), seconds: 0, minutes: 0 })} /></div>
          </>
        )}

        {(d.type === 'add_tag' || d.type === 'remove_tag') && (
          <div>
            <label style={labelStyle}>{d.type === 'add_tag' ? 'Tag para adicionar' : 'Tag para remover'}</label>
            {tags.length === 0 ? <p style={{ fontSize: '12px', color: '#9ca3af' }}>Nenhuma tag cadastrada.</p> : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {tags.map((tag: any) => (
                  <div key={tag.id} onClick={() => onUpdate(node.id, { tagId: tag.id, tagName: tag.name })}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '99px', cursor: 'pointer', border: `2px solid ${d.tagId === tag.id ? (tag.color || '#0891b2') : '#e5e7eb'}`, background: d.tagId === tag.id ? `${tag.color || '#0891b2'}15` : '#fff', fontSize: '12px', fontWeight: 500 }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: tag.color || '#6b7280' }} />
                    <span style={{ color: d.tagId === tag.id ? (tag.color || '#0891b2') : '#374151' }}>{tag.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {d.type === 'update_contact' && (
          <>
            <div><label style={labelStyle}>Campo para atualizar</label>
              <select style={{ ...inputStyle, background: '#fff' }} value={d.field || 'name'} onChange={e => onUpdate(node.id, { field: e.target.value })}>
                <option value="name">Nome</option><option value="phone">Telefone</option><option value="custom">Campo personalizado</option>
              </select>
            </div>
            {d.field === 'custom' && <div><label style={labelStyle}>Nome do campo</label><input style={inputStyle} placeholder="cargo, empresa..." value={d.customField || ''} onChange={e => onUpdate(node.id, { customField: e.target.value })} /></div>}
            <div><label style={labelStyle}>Novo valor</label><input style={inputStyle} placeholder="{{nome}} ou texto fixo" value={d.value || ''} onChange={e => onUpdate(node.id, { value: e.target.value })} /></div>
          </>
        )}

        {d.type === 'move_pipeline' && (
          <div>
            <label style={labelStyle}>Etapa do funil</label>
            <select style={{ ...inputStyle, background: '#fff' }} value={d.stage || ''}
              onChange={e => {
                const selected = pipelineColumns.find((c: any) => c.key === e.target.value)
                onUpdate(node.id, { stage: e.target.value, stageLabel: selected?.label || e.target.value })
              }}>
              <option value="">Selecione uma etapa</option>
              {pipelineColumns.map((col: any) => <option key={col.key} value={col.key}>{col.label}</option>)}
            </select>
          </div>
        )}

        {d.type === 'assign_agent' && (
          <div><label style={labelStyle}>Mensagem para o cliente (opcional)</label>
            <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as any }} placeholder="Aguarde, um atendente irá te responder." value={d.message || ''} onChange={e => onUpdate(node.id, { message: e.target.value })} />
          </div>
        )}

        {d.type === 'go_to' && (
          <div>
            <label style={labelStyle}>Flow de destino</label>
            {flows.length === 0 ? <p style={{ fontSize: '12px', color: '#9ca3af' }}>Nenhum outro flow disponível.</p> : (
              <select style={{ ...inputStyle, background: '#fff' }} value={d.targetFlowId || ''} onChange={e => onUpdate(node.id, { targetFlowId: e.target.value })}>
                <option value="">Selecione um flow</option>
                {flows.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>O flow atual para e o flow selecionado começa</p>
          </div>
        )}

        {d.type === 'end' && (
          <div><label style={labelStyle}>Mensagem de encerramento (opcional)</label>
            <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as any }} placeholder="Obrigado pelo contato! Até mais 👋" value={d.message || ''} onChange={e => onUpdate(node.id, { message: e.target.value })} />
          </div>
        )}
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb' }}>
        <button onClick={() => onDelete(node.id)}
          style={{ width: '100%', padding: '8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px', color: '#ef4444', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          Remover nó
        </button>
      </div>
    </div>
  )
}
