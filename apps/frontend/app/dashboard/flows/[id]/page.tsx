'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, Connection, Edge, Node,
  Panel, BackgroundVariant, MarkerType, Handle, Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { createClient } from '@supabase/supabase-js'
import { messageApi, contactApi } from '@/lib/api'
import { toast } from 'sonner'
import {
  Save, ArrowLeft, Loader2, Zap, MessageSquare, Clock, Tag,
  MoveRight, UserCheck, Workflow, Image, Video, Music, FileText,
  Upload, X, Reply, GitBranch, AlignLeft, Webhook, Brain,
  TagsIcon, UserCog, CornerDownRight, Square, Plus, Trash2,
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const NODE_COLORS: Record<string, string> = {
  trigger_keyword:       '#16a34a',
  trigger_first_message: '#16a34a',
  trigger_any_reply:     '#16a34a',
  trigger_outside_hours: '#16a34a',
  send_message:          '#2563eb',
  send_image:            '#0891b2',
  send_video:            '#7c3aed',
  send_audio:            '#db2777',
  send_document:         '#d97706',
  input:                 '#0284c7',
  condition:             '#ea580c',
  ai:                    '#6d28d9',
  webhook:               '#0f172a',
  wait:                  '#6b7280',
  add_tag:               '#0891b2',
  remove_tag:            '#dc2626',
  update_contact:        '#0369a1',
  move_pipeline:         '#d97706',
  assign_agent:          '#db2777',
  go_to:                 '#16a34a',
  end:                   '#dc2626',
}

const NODE_ICONS: Record<string, any> = {
  trigger_keyword:       Zap,
  trigger_first_message: Zap,
  trigger_any_reply:     Reply,
  trigger_outside_hours: Clock,
  send_message:          MessageSquare,
  send_image:            Image,
  send_video:            Video,
  send_audio:            Music,
  send_document:         FileText,
  input:                 AlignLeft,
  condition:             GitBranch,
  ai:                    Brain,
  webhook:               Webhook,
  wait:                  Clock,
  add_tag:               Tag,
  remove_tag:            TagsIcon,
  update_contact:        UserCog,
  move_pipeline:         MoveRight,
  assign_agent:          UserCheck,
  go_to:                 CornerDownRight,
  end:                   Square,
}

const NODE_LABELS: Record<string, string> = {
  trigger_keyword:       'Palavra-chave',
  trigger_first_message: 'Primeira mensagem',
  trigger_any_reply:     'Qualquer resposta',
  trigger_outside_hours: 'Fora do horário',
  send_message:          'Enviar texto',
  send_image:            'Enviar imagem',
  send_video:            'Enviar vídeo',
  send_audio:            'Enviar áudio',
  send_document:         'Enviar documento',
  input:                 'Aguardar resposta',
  condition:             'Condição (se/senão)',
  ai:                    'Inteligência Artificial',
  webhook:               'Webhook',
  wait:                  'Espera',
  add_tag:               'Adicionar tag',
  remove_tag:            'Remover tag',
  update_contact:        'Atualizar contato',
  move_pipeline:         'Mover no funil',
  assign_agent:          'Atribuir agente',
  go_to:                 'Ir para outro flow',
  end:                   'Finalizar flow',
}

// ─── Tipos para condição múltipla ─────────────────────────────────────────────
interface ConditionRule {
  id: string
  field: string        // message | variable | phone | webhook_status
  fieldName?: string   // nome da variável se field=variable
  operator: string
  value: string
}

interface ConditionBranch {
  id: string
  label: string        // ex: "Celular", "Notebook", "TV"
  logic: 'AND' | 'OR'  // como as regras dentro deste ramo se combinam
  rules: ConditionRule[]
}

function defaultBranch(label: string): ConditionBranch {
  return {
    id: `branch_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    label,
    logic: 'AND',
    rules: [{ id: `rule_${Date.now()}`, field: 'message', operator: 'contains', value: '' }],
  }
}

// ─── FlowNode ─────────────────────────────────────────────────────────────────
function FlowNode({ data, selected }: { data: any; selected: boolean }) {
  const color = NODE_COLORS[data.type] || '#6b7280'
  const Icon = NODE_ICONS[data.type] || Zap
  const isTrigger = data.type?.startsWith('trigger_')
  const isCondition = data.type === 'condition'

  // Branches do nó de condição
  const branches: ConditionBranch[] = data.branches || []

  const subtitle = () => {
    if (data.type === 'trigger_keyword') return (data.keywords || []).join(', ') || 'Nenhuma palavra'
    if (data.type === 'trigger_first_message') return 'Primeira mensagem do contato'
    if (data.type === 'trigger_any_reply') return 'Qualquer mensagem recebida'
    if (data.type === 'trigger_outside_hours') return `${data.start ?? 9}h – ${data.end ?? 18}h`
    if (data.type === 'send_message') return (data.message || '').slice(0, 50) || 'Sem mensagem'
    if (data.type === 'send_image') return data.mediaUrl ? '✓ Imagem carregada' : 'Nenhuma imagem'
    if (data.type === 'send_video') return data.mediaUrl ? '✓ Vídeo carregado' : 'Nenhum vídeo'
    if (data.type === 'send_audio') return data.mediaUrl ? '✓ Áudio carregado' : 'Nenhum áudio'
    if (data.type === 'send_document') return data.mediaUrl ? '✓ Documento carregado' : 'Nenhum documento'
    if (data.type === 'input') return data.question ? data.question.slice(0, 40) : 'Aguardando resposta...'
    if (data.type === 'condition') {
      if (branches.length > 0) return `${branches.length} condição${branches.length > 1 ? 'ões' : ''} + fallback`
      return 'Configurar condições'
    }
    if (data.type === 'ai') return data.mode === 'classify' ? 'Classificar intenção' : data.mode === 'extract' ? 'Extrair dados' : data.mode === 'summarize' ? 'Resumir' : 'Responder com IA'
    if (data.type === 'webhook') return data.url ? data.url.slice(0, 40) : 'URL não configurada'
    if (data.type === 'wait') {
      if (data.hours) return `Aguardar ${data.hours}h`
      if (data.minutes) return `Aguardar ${data.minutes} min`
      return `Aguardar ${data.seconds ?? 0}s`
    }
    if (data.type === 'add_tag') return data.tagName || 'Tag não selecionada'
    if (data.type === 'remove_tag') return data.tagName || 'Tag não selecionada'
    if (data.type === 'update_contact') return data.field ? `Atualizar ${data.field}` : 'Campo não definido'
    if (data.type === 'move_pipeline') return data.stage || 'Etapa não definida'
    if (data.type === 'assign_agent') return 'Transferir para atendente'
    if (data.type === 'go_to') return 'Ir para outro flow'
    if (data.type === 'end') return data.message ? data.message.slice(0, 40) : 'Finalizar'
    return ''
  }

  // Calcula posições dos handles de condição
  const totalHandles = branches.length + 1 // branches + fallback
  const handleSpacing = 100 / (totalHandles + 1)

  const BRANCH_COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#db2777', '#d97706', '#0891b2']

  return (
    <div style={{
      background: '#fff', border: `2px solid ${selected ? color : '#e5e7eb'}`,
      borderRadius: '12px', padding: '14px 16px', minWidth: '220px', maxWidth: '260px',
      boxShadow: selected ? `0 0 0 3px ${color}22` : '0 2px 8px rgba(0,0,0,.08)',
      transition: 'all 0.15s',
    }}>
      {!isTrigger && (
        <Handle type="target" position={Position.Left}
          style={{ background: '#d1d5db', width: 10, height: 10, border: '2px solid #fff' }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={14} color={color} />
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {isTrigger ? 'Gatilho' : data.type === 'end' ? 'Fim' : 'Ação'}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>
            {NODE_LABELS[data.type] || data.type}
          </div>
        </div>
      </div>
      {data.type === 'send_image' && data.mediaUrl && (
        <img src={data.mediaUrl} alt="preview" style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '6px', marginBottom: '6px' }} />
      )}
      {subtitle() && (
        <div style={{ fontSize: '11px', color: '#9ca3af', background: '#f9fafb', borderRadius: '6px', padding: '5px 8px', wordBreak: 'break-word' }}>
          {subtitle()}
        </div>
      )}

      {/* Handles de condição múltipla */}
      {isCondition && branches.length > 0 && (
        <>
          {branches.map((branch, i) => {
            const branchColor = BRANCH_COLORS[i % BRANCH_COLORS.length]
            // Espaça os handles verticalmente com offset fixo de 20px entre eles
            const topOffset = 20 + i * 22
            return (
              <Handle key={branch.id} type="source" position={Position.Right}
                id={`branch_${branch.id}`}
                style={{ background: branchColor, width: 10, height: 10, border: '2px solid #fff', top: 'auto', bottom: 'auto', transform: 'none', position: 'absolute', right: -6, top: topOffset }} />
            )
          })}
          {/* Fallback handle */}
          <Handle type="source" position={Position.Right} id="fallback"
            style={{ background: '#9ca3af', width: 10, height: 10, border: '2px solid #fff', top: 'auto', bottom: 'auto', transform: 'none', position: 'absolute', right: -6, top: 20 + branches.length * 22 }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
            {branches.map((branch, i) => (
              <span key={branch.id} style={{ fontSize: '10px', color: BRANCH_COLORS[i % BRANCH_COLORS.length], fontWeight: 600 }}>
                {branch.label}
              </span>
            ))}
            <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600 }}>· Fallback</span>
          </div>
        </>
      )}

      {/* Handles legado (quando não tem branches configuradas) */}
      {isCondition && branches.length === 0 && (
        <>
          <Handle type="source" position={Position.Right} id="true"
            style={{ background: '#16a34a', width: 10, height: 10, border: '2px solid #fff', top: '35%' }} />
          <Handle type="source" position={Position.Right} id="false"
            style={{ background: '#ef4444', width: 10, height: 10, border: '2px solid #fff', top: '65%' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', marginTop: '8px' }}>
            <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>✓ Sim</span>
            <span style={{ fontSize: '10px', color: '#6b7280' }}>·</span>
            <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 600 }}>✗ Não</span>
          </div>
        </>
      )}

      {!isCondition && data.type !== 'end' && (
        <Handle type="source" position={Position.Right} id="success"
          style={{ background: color, width: 10, height: 10, border: '2px solid #fff' }} />
      )}
    </div>
  )
}

const nodeTypes = { flowNode: FlowNode }

function MediaUpload({ accept, label, currentUrl, onUploaded }: {
  accept: string; label: string; currentUrl?: string; onUploaded: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { toast.error('Arquivo muito grande. Máximo 20MB'); return }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'bin'
      const path = `flows/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      const { data } = supabase.storage.from('media').getPublicUrl(path)
      onUploaded(data.publicUrl)
      toast.success('Arquivo carregado!')
    } catch (err: any) {
      toast.error('Erro ao fazer upload: ' + err.message)
    } finally { setUploading(false) }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={handleFile} />
      {currentUrl ? (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '7px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, fontSize: '12px', color: '#15803d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ✓ {currentUrl.split('/').pop()}
          </div>
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>
            Trocar
          </button>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          style={{ width: '100%', padding: '12px', background: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: '7px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#6b7280' }}>
          {uploading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={18} />}
          <span style={{ fontSize: '12px', fontWeight: 500 }}>{uploading ? 'Enviando...' : label}</span>
        </button>
      )}
    </div>
  )
}

// ─── Painel de condição múltipla ──────────────────────────────────────────────
const BRANCH_COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#db2777', '#d97706', '#0891b2']
const OPERATORS = [
  { value: 'contains',      label: 'Contém' },
  { value: 'not_contains',  label: 'Não contém' },
  { value: 'equals',        label: 'É igual a' },
  { value: 'not_equals',    label: 'É diferente de' },
  { value: 'starts_with',   label: 'Começa com' },
  { value: 'ends_with',     label: 'Termina com' },
  { value: 'is_empty',      label: 'Está vazio' },
  { value: 'is_not_empty',  label: 'Não está vazio' },
]

function ConditionPanel({ d, nodeId, inputStyle, labelStyle, onUpdate }: {
  d: any; nodeId: string; inputStyle: React.CSSProperties; labelStyle: React.CSSProperties
  onUpdate: (id: string, data: any) => void
}) {
  const branches: ConditionBranch[] = d.branches || []

  const updateBranches = (newBranches: ConditionBranch[]) => {
    onUpdate(nodeId, { branches: newBranches })
  }

  const addBranch = () => {
    updateBranches([...branches, defaultBranch(`Caminho ${branches.length + 1}`)])
  }

  const removeBranch = (branchId: string) => {
    updateBranches(branches.filter(b => b.id !== branchId))
  }

  const updateBranch = (branchId: string, changes: Partial<ConditionBranch>) => {
    updateBranches(branches.map(b => b.id === branchId ? { ...b, ...changes } : b))
  }

  const addRule = (branchId: string) => {
    updateBranches(branches.map(b => b.id === branchId ? {
      ...b,
      rules: [...b.rules, { id: `rule_${Date.now()}`, field: 'message', operator: 'contains', value: '' }]
    } : b))
  }

  const removeRule = (branchId: string, ruleId: string) => {
    updateBranches(branches.map(b => b.id === branchId ? {
      ...b, rules: b.rules.filter(r => r.id !== ruleId)
    } : b))
  }

  const updateRule = (branchId: string, ruleId: string, changes: Partial<ConditionRule>) => {
    updateBranches(branches.map(b => b.id === branchId ? {
      ...b, rules: b.rules.map(r => r.id === ruleId ? { ...r, ...changes } : r)
    } : b))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#15803d' }}>
        Cada caminho tem suas condições. Se nenhuma bater, vai para o <strong>Fallback</strong>.
      </div>

      {branches.map((branch, bi) => {
        const branchColor = BRANCH_COLORS[bi % BRANCH_COLORS.length]
        return (
          <div key={branch.id} style={{ border: `2px solid ${branchColor}40`, borderRadius: '10px', overflow: 'hidden' }}>
            {/* Header do caminho */}
            <div style={{ background: `${branchColor}10`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${branchColor}30` }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: branchColor, flexShrink: 0 }} />
              <input
                value={branch.label}
                onChange={e => updateBranch(branch.id, { label: e.target.value })}
                style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '13px', fontWeight: 700, color: branchColor, outline: 'none' }}
                placeholder="Nome do caminho"
              />
              <select value={branch.logic} onChange={e => updateBranch(branch.id, { logic: e.target.value as 'AND' | 'OR' })}
                style={{ fontSize: '11px', fontWeight: 700, border: `1px solid ${branchColor}50`, borderRadius: '4px', padding: '2px 6px', background: '#fff', color: branchColor, cursor: 'pointer', outline: 'none' }}>
                <option value="AND">E (AND)</option>
                <option value="OR">OU (OR)</option>
              </select>
              {branches.length > 1 && (
                <button onClick={() => removeBranch(branch.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#9ca3af', display: 'flex' }}>
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Regras do caminho */}
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {branch.rules.map((rule, ri) => (
                <div key={rule.id}>
                  {ri > 0 && (
                    <div style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, color: branchColor, marginBottom: '6px' }}>
                      {branch.logic}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f9fafb', borderRadius: '8px', padding: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <select value={rule.field} onChange={e => updateRule(branch.id, rule.id, { field: e.target.value, fieldName: '' })}
                        style={{ ...inputStyle, flex: 1, padding: '5px 8px', fontSize: '12px' }}>
                        <option value="message">Mensagem</option>
                        <option value="variable">Variável</option>
                        <option value="phone">Telefone</option>
                        <option value="webhook_status">Status webhook</option>
                      </select>
                      {branch.rules.length > 1 && (
                        <button onClick={() => removeRule(branch.id, rule.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#9ca3af', display: 'flex', flexShrink: 0 }}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    {rule.field === 'variable' && (
                      <input value={rule.fieldName || ''} onChange={e => updateRule(branch.id, rule.id, { fieldName: e.target.value })}
                        style={{ ...inputStyle, padding: '5px 8px', fontSize: '12px' }}
                        placeholder="nome da variável (ex: intencao)" />
                    )}
                    <select value={rule.operator} onChange={e => updateRule(branch.id, rule.id, { operator: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', fontSize: '12px' }}>
                      {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                    </select>
                    {!['is_empty', 'is_not_empty'].includes(rule.operator) && (
                      <input value={rule.value} onChange={e => updateRule(branch.id, rule.id, { value: e.target.value })}
                        style={{ ...inputStyle, padding: '5px 8px', fontSize: '12px' }}
                        placeholder="valor..." />
                    )}
                  </div>
                </div>
              ))}

              <button onClick={() => addRule(branch.id)}
                style={{ width: '100%', padding: '5px', background: 'transparent', border: `1px dashed ${branchColor}50`, borderRadius: '6px', color: branchColor, fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <Plus size={11} /> Adicionar regra
              </button>
            </div>
          </div>
        )
      })}

      {/* Fallback */}
      <div style={{ border: '2px dashed #d1d5db', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#9ca3af', flexShrink: 0 }} />
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af' }}>Fallback</span>
        <span style={{ fontSize: '11px', color: '#d1d5db' }}>— quando nenhuma condição bater</span>
      </div>

      <button onClick={addBranch}
        style={{ width: '100%', padding: '8px', background: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: '8px', color: '#6b7280', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        <Plus size={13} /> Adicionar caminho
      </button>
    </div>
  )
}

// ─── NodeConfigPanel ──────────────────────────────────────────────────────────
function NodeConfigPanel({ node, tags, flows, onUpdate, onClose, onDelete }: {
  node: Node; tags: any[]; flows: any[]
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

  return (
    <div style={{ position: 'absolute', top: 0, right: 0, width: '320px', height: '100%', background: '#fff', borderLeft: '1px solid #e5e7eb', zIndex: 10, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 16px rgba(0,0,0,.06)' }}>
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

        {/* GATILHOS */}
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
              <input type="number" min="0" max="23" style={inputStyle} value={d.start ?? 9}
                onChange={e => onUpdate(node.id, { start: Number(e.target.value) })} />
            </div>
            <div>
              <label style={labelStyle}>Fim do expediente (hora)</label>
              <input type="number" min="0" max="23" style={inputStyle} value={d.end ?? 18}
                onChange={e => onUpdate(node.id, { end: Number(e.target.value) })} />
            </div>
          </>
        )}

        {/* SEND */}
        {d.type === 'send_message' && (
          <div>
            <label style={labelStyle}>Mensagem</label>
            <textarea style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' as any }}
              placeholder="Olá {{nome}}! Como posso ajudar?"
              value={d.message || ''}
              onChange={e => onUpdate(node.id, { message: e.target.value })} />
            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Use {'{{variavel}}'} para personalizar</p>
          </div>
        )}
        {d.type === 'send_image' && (
          <>
            <div>
              <label style={labelStyle}>Imagem</label>
              <MediaUpload accept="image/*" label="Upload de imagem" currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} />
            </div>
            <div>
              <label style={labelStyle}>Legenda (opcional)</label>
              <input style={inputStyle} placeholder="Confira nosso catálogo!"
                value={d.caption || ''}
                onChange={e => onUpdate(node.id, { caption: e.target.value })} />
            </div>
          </>
        )}
        {d.type === 'send_video' && (
          <div>
            <label style={labelStyle}>Vídeo</label>
            <MediaUpload accept="video/*" label="Upload de vídeo" currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} />
          </div>
        )}
        {d.type === 'send_audio' && (
          <div>
            <label style={labelStyle}>Áudio</label>
            <MediaUpload accept="audio/*" label="Upload de áudio" currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} />
          </div>
        )}
        {d.type === 'send_document' && (
          <>
            <div>
              <label style={labelStyle}>Documento</label>
              <MediaUpload accept=".pdf,.doc,.docx,.xls,.xlsx" label="Upload de documento" currentUrl={d.mediaUrl} onUploaded={url => onUpdate(node.id, { mediaUrl: url })} />
            </div>
            <div>
              <label style={labelStyle}>Nome do arquivo</label>
              <input style={inputStyle} placeholder="catalogo.pdf" value={d.filename || ''} onChange={e => onUpdate(node.id, { filename: e.target.value })} />
            </div>
          </>
        )}

        {/* INPUT */}
        {d.type === 'input' && (
          <>
            <div>
              <label style={labelStyle}>Pergunta para o usuário</label>
              <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as any }}
                placeholder="Ex: Qual é o seu nome?"
                value={d.question || ''}
                onChange={e => onUpdate(node.id, { question: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Salvar resposta como variável</label>
              <input style={inputStyle} placeholder="nome"
                value={d.saveAs || ''}
                onChange={e => onUpdate(node.id, { saveAs: e.target.value.replace(/\s/g, '_').toLowerCase() })} />
              <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                Use {'{{' + (d.saveAs || 'variavel') + '}}'} nos próximos nós
              </p>
            </div>
          </>
        )}

        {/* CONDITION — NOVO com múltiplos caminhos */}
        {d.type === 'condition' && (
          <ConditionPanel
            d={d} nodeId={node.id}
            inputStyle={inputStyle} labelStyle={labelStyle}
            onUpdate={onUpdate}
          />
        )}

        {/* AI NODE */}
        {d.type === 'ai' && (
          <>
            <div>
              <label style={labelStyle}>Modo</label>
              <select style={{ ...inputStyle, background: '#fff' }} value={d.mode || 'respond'}
                onChange={e => onUpdate(node.id, { mode: e.target.value })}>
                <option value="respond">Responder automaticamente</option>
                <option value="classify">Classificar intenção</option>
                <option value="extract">Extrair dado da mensagem</option>
                <option value="summarize">Resumir mensagem</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Chave da API OpenAI</label>
              <input style={inputStyle} placeholder="sk-..." type="password"
                value={d.apiKey || ''}
                onChange={e => onUpdate(node.id, { apiKey: e.target.value })} />
              <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Ou configure OPENAI_API_KEY no Railway</p>
            </div>
            <div>
              <label style={labelStyle}>Modelo</label>
              <select style={{ ...inputStyle, background: '#fff' }} value={d.model || 'gpt-4o-mini'}
                onChange={e => onUpdate(node.id, { model: e.target.value })}>
                <option value="gpt-4o-mini">GPT-4o Mini (mais rápido)</option>
                <option value="gpt-4o">GPT-4o (mais inteligente)</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              </select>
            </div>
            {d.mode === 'respond' && (
              <div>
                <label style={labelStyle}>Instrução para a IA (system prompt)</label>
                <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as any }}
                  placeholder="Você é um atendente da empresa X. Responda de forma simpática e objetiva."
                  value={d.systemPrompt || ''}
                  onChange={e => onUpdate(node.id, { systemPrompt: e.target.value })} />
              </div>
            )}
            {d.mode === 'classify' && (
              <div>
                <label style={labelStyle}>Categorias (separadas por vírgula)</label>
                <input style={inputStyle} placeholder="comprar, suporte, cancelar, outro"
                  defaultValue={d.classifyOptions || ''}
                  onBlur={e => onUpdate(node.id, { classifyOptions: e.target.value })} />
              </div>
            )}
            {d.mode === 'extract' && (
              <div>
                <label style={labelStyle}>O que extrair</label>
                <input style={inputStyle} placeholder="o nome completo, o CPF, o endereço..."
                  value={d.extractField || ''}
                  onChange={e => onUpdate(node.id, { extractField: e.target.value })} />
              </div>
            )}
            <div>
              <label style={labelStyle}>Salvar resposta da IA como variável</label>
              <input style={inputStyle} placeholder="intencao, nome_extraido..."
                value={d.saveAs || ''}
                onChange={e => onUpdate(node.id, { saveAs: e.target.value.replace(/\s/g, '_').toLowerCase() })} />
              {d.saveAs && (
                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                  Use {'{{' + d.saveAs + '}}'} nos próximos nós
                </p>
              )}
            </div>
            {d.mode === 'respond' && (
              <div>
                <label style={labelStyle}>Mensagens do histórico (contexto)</label>
                <input type="number" min="5" max="200" style={{ ...inputStyle, maxWidth: '100px' }}
                  value={d.historyMessages ?? 50}
                  onChange={e => onUpdate(node.id, { historyMessages: Number(e.target.value) })} />
                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Recomendado: 50</p>
              </div>
            )}
          </>
        )}

        {/* WEBHOOK */}
        {d.type === 'webhook' && (
          <>
            <div>
              <label style={labelStyle}>URL</label>
              <input style={inputStyle} placeholder="https://api.seusite.com/webhook"
                value={d.url || ''}
                onChange={e => onUpdate(node.id, { url: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Método HTTP</label>
              <select style={{ ...inputStyle, background: '#fff' }} value={d.method || 'POST'}
                onChange={e => onUpdate(node.id, { method: e.target.value })}>
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
            {(d.method || 'POST') !== 'GET' && (
              <div>
                <label style={labelStyle}>Body (JSON)</label>
                <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as any, fontFamily: 'monospace', fontSize: '12px' }}
                  placeholder={'{\n  "phone": "{{phone}}"\n}'}
                  value={d.body || ''}
                  onChange={e => onUpdate(node.id, { body: e.target.value })} />
              </div>
            )}
            <div>
              <label style={labelStyle}>Salvar resposta como variável</label>
              <input style={inputStyle} placeholder="resposta_webhook"
                value={d.saveResponseAs || ''}
                onChange={e => onUpdate(node.id, { saveResponseAs: e.target.value.replace(/\s/g, '_').toLowerCase() })} />
            </div>
          </>
        )}

        {/* WAIT */}
        {d.type === 'wait' && (
          <>
            <div>
              <label style={labelStyle}>Segundos</label>
              <input type="number" min="0" style={inputStyle} value={d.seconds ?? 0}
                onChange={e => onUpdate(node.id, { seconds: Number(e.target.value), minutes: 0, hours: 0 })} />
            </div>
            <div>
              <label style={labelStyle}>Minutos</label>
              <input type="number" min="0" style={inputStyle} value={d.minutes ?? 0}
                onChange={e => onUpdate(node.id, { minutes: Number(e.target.value), seconds: 0, hours: 0 })} />
            </div>
            <div>
              <label style={labelStyle}>Horas</label>
              <input type="number" min="0" style={inputStyle} value={d.hours ?? 0}
                onChange={e => onUpdate(node.id, { hours: Number(e.target.value), seconds: 0, minutes: 0 })} />
            </div>
          </>
        )}

        {/* TAGS */}
        {(d.type === 'add_tag' || d.type === 'remove_tag') && (
          <div>
            <label style={labelStyle}>{d.type === 'add_tag' ? 'Tag para adicionar' : 'Tag para remover'}</label>
            {tags.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#9ca3af' }}>Nenhuma tag cadastrada.</p>
            ) : (
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

        {/* UPDATE CONTACT */}
        {d.type === 'update_contact' && (
          <>
            <div>
              <label style={labelStyle}>Campo para atualizar</label>
              <select style={{ ...inputStyle, background: '#fff' }} value={d.field || 'name'}
                onChange={e => onUpdate(node.id, { field: e.target.value })}>
                <option value="name">Nome</option>
                <option value="phone">Telefone</option>
                <option value="custom">Campo personalizado</option>
              </select>
            </div>
            {d.field === 'custom' && (
              <div>
                <label style={labelStyle}>Nome do campo</label>
                <input style={inputStyle} placeholder="cargo, empresa, cidade..."
                  value={d.customField || ''}
                  onChange={e => onUpdate(node.id, { customField: e.target.value })} />
              </div>
            )}
            <div>
              <label style={labelStyle}>Novo valor</label>
              <input style={inputStyle} placeholder="{{nome}} ou texto fixo"
                value={d.value || ''}
                onChange={e => onUpdate(node.id, { value: e.target.value })} />
              <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Use variáveis como {'{{nome}}'}</p>
            </div>
          </>
        )}

        {/* PIPELINE */}
        {d.type === 'move_pipeline' && (
          <div>
            <label style={labelStyle}>Etapa do funil</label>
            <select style={{ ...inputStyle, background: '#fff' }} value={d.stage || 'lead'}
              onChange={e => onUpdate(node.id, { stage: e.target.value })}>
              {['lead', 'qualificacao', 'proposta', 'negociacao', 'ganho', 'perdido'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        )}

        {/* ASSIGN AGENT */}
        {d.type === 'assign_agent' && (
          <div>
            <label style={labelStyle}>Mensagem para o cliente (opcional)</label>
            <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as any }}
              placeholder="Ex: Aguarde, um atendente irá te responder."
              value={d.message || ''}
              onChange={e => onUpdate(node.id, { message: e.target.value })} />
          </div>
        )}

        {/* GO TO */}
        {d.type === 'go_to' && (
          <div>
            <label style={labelStyle}>Flow de destino</label>
            {flows.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#9ca3af' }}>Nenhum outro flow disponível.</p>
            ) : (
              <select style={{ ...inputStyle, background: '#fff' }} value={d.targetFlowId || ''}
                onChange={e => onUpdate(node.id, { targetFlowId: e.target.value })}>
                <option value="">Selecione um flow</option>
                {flows.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}
            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>O flow atual para e o flow selecionado começa</p>
          </div>
        )}

        {/* END */}
        {d.type === 'end' && (
          <div>
            <label style={labelStyle}>Mensagem de encerramento (opcional)</label>
            <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as any }}
              placeholder="Ex: Obrigado pelo contato! Até mais 👋"
              value={d.message || ''}
              onChange={e => onUpdate(node.id, { message: e.target.value })} />
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

export default function FlowEditorPage() {
  const { id } = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [flowName, setFlowName] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => { const { data } = await contactApi.get('/tags'); return data.data || [] },
  })

  const { data: allFlows = [] } = useQuery({
    queryKey: ['flows-list'],
    queryFn: async () => {
      const { data } = await messageApi.get('/flows')
      return (data.data || []).filter((f: any) => f.id !== id)
    },
  })

  const { data: flowData, isLoading } = useQuery({
    queryKey: ['flow', id],
    queryFn: async () => { const { data } = await messageApi.get(`/flows/${id}`); return data.data },
  })

  useEffect(() => {
    if (!flowData || initialized) return
    setFlowName(flowData.name || '')
    const loadedNodes: Node[] = (flowData.nodes || []).map((n: any) => ({
      id: n.id, type: 'flowNode',
      position: { x: n.position_x, y: n.position_y },
      data: { type: n.type, ...n.data },
    }))
    const loadedEdges: Edge[] = (flowData.edges || []).map((e: any) => ({
      id: e.id, source: e.source_node, target: e.target_node,
      sourceHandle: e.source_handle || 'success',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#d1d5db' },
      style: { stroke: '#d1d5db', strokeWidth: 2 },
    }))
    setNodes(loadedNodes)
    setEdges(loadedEdges)
    setInitialized(true)
  }, [flowData, initialized, setNodes, setEdges])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nodes: nodes.map(n => ({
          id: n.id, type: (n.data as any).type,
          position_x: n.position.x, position_y: n.position.y,
          data: { ...(n.data as any) },
        })),
        edges: edges.map(e => ({
          id: e.id, source_node: e.source, target_node: e.target,
          source_handle: e.sourceHandle || 'success',
        })),
      }
      await messageApi.put(`/flows/${id}/graph`, payload)
      if (flowName) await messageApi.patch(`/flows/${id}`, { name: flowName })
    },
    onSuccess: () => { toast.success('Flow salvo!'); setIsDirty(false); queryClient.invalidateQueries({ queryKey: ['flows'] }) },
    onError: () => toast.error('Erro ao salvar'),
  })

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed, color: '#d1d5db' }, style: { stroke: '#d1d5db', strokeWidth: 2 } }, eds))
    setIsDirty(true)
  }, [setEdges])

  const addNode = (type: string) => {
    const nodeId = `node_${Date.now()}`
    // Inicializa branches para nó de condição
    const extraData = type === 'condition' ? { branches: [defaultBranch('Caminho 1')] } : {}
    setNodes((nds: Node[]) => [...nds, {
      id: nodeId, type: 'flowNode',
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: { type, ...extraData },
    }])
    setIsDirty(true)
  }

  const updateNodeData = (nodeId: string, newData: any) => {
    setNodes((nds: Node[]) => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n))
    if (selectedNode?.id === nodeId) {
      setSelectedNode(prev => prev ? { ...prev, data: { ...prev.data, ...newData } } : prev)
    }
    setIsDirty(true)
  }

  const deleteNode = (nodeId: string) => {
    setNodes((nds: Node[]) => nds.filter(n => n.id !== nodeId))
    setEdges((eds: Edge[]) => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
    setSelectedNode(null)
    setIsDirty(true)
  }

  const TRIGGER_NODES = [
    { type: 'trigger_keyword',       label: 'Palavra-chave' },
    { type: 'trigger_first_message', label: 'Primeira mensagem' },
    { type: 'trigger_any_reply',     label: 'Qualquer resposta' },
    { type: 'trigger_outside_hours', label: 'Fora do horário' },
  ]

  const ACTION_NODES = [
    { type: 'send_message',   label: 'Enviar texto' },
    { type: 'send_image',     label: 'Enviar imagem' },
    { type: 'send_video',     label: 'Enviar vídeo' },
    { type: 'send_audio',     label: 'Enviar áudio' },
    { type: 'send_document',  label: 'Enviar documento' },
    { type: 'input',          label: 'Aguardar resposta' },
    { type: 'condition',      label: 'Condição (se/senão)' },
    { type: 'ai',             label: 'Inteligência Artificial' },
    { type: 'webhook',        label: 'Webhook' },
    { type: 'wait',           label: 'Espera' },
    { type: 'add_tag',        label: 'Adicionar tag' },
    { type: 'remove_tag',     label: 'Remover tag' },
    { type: 'update_contact', label: 'Atualizar contato' },
    { type: 'move_pipeline',  label: 'Mover no funil' },
    { type: 'assign_agent',   label: 'Atribuir agente' },
    { type: 'go_to',          label: 'Ir para outro flow' },
    { type: 'end',            label: 'Finalizar flow' },
  ]

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      <div style={{ height: '56px', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '12px', flexShrink: 0, zIndex: 20 }}>
        <button onClick={() => router.push('/dashboard/flows')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px', padding: '6px 8px', borderRadius: '6px' }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}>
          <ArrowLeft size={15} /> Flows
        </button>
        <div style={{ width: '1px', height: '20px', background: '#e5e7eb' }} />
        <Workflow size={16} color="#16a34a" />
        <input value={flowName} onChange={e => { setFlowName(e.target.value); setIsDirty(true) }}
          style={{ border: 'none', outline: 'none', fontSize: '15px', fontWeight: 600, color: '#111827', background: 'transparent', minWidth: '200px' }} />
        {isDirty && <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>● Não salvo</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
          style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {saveMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
          Salvar
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: '200px', background: '#fff', borderRight: '1px solid #e5e7eb', padding: '16px', overflowY: 'auto', flexShrink: 0, zIndex: 10 }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Gatilhos</p>
          {TRIGGER_NODES.map(n => {
            const Icon = NODE_ICONS[n.type] || Zap
            const color = NODE_COLORS[n.type]
            return (
              <button key={n.type} onClick={() => addNode(n.type)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', marginBottom: '6px', fontSize: '12px', fontWeight: 500, color: '#374151', textAlign: 'left' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = color; (e.currentTarget as HTMLButtonElement).style.background = `${color}10` }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb' }}>
                <Icon size={13} color={color} />{n.label}
              </button>
            )
          })}
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', marginTop: '16px' }}>Ações</p>
          {ACTION_NODES.map(n => {
            const Icon = NODE_ICONS[n.type] || Zap
            const color = NODE_COLORS[n.type]
            return (
              <button key={n.type} onClick={() => addNode(n.type)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', marginBottom: '6px', fontSize: '12px', fontWeight: 500, color: '#374151', textAlign: 'left' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = color; (e.currentTarget as HTMLButtonElement).style.background = `${color}10` }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb' }}>
                <Icon size={13} color={color} />{n.label}
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={(changes) => { onNodesChange(changes); setIsDirty(true) }}
            onEdgesChange={(changes) => { onEdgesChange(changes); setIsDirty(true) }}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNode(node)}
            onPaneClick={() => setSelectedNode(null)}
            nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.3 }}
            defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, color: '#d1d5db' }, style: { stroke: '#d1d5db', strokeWidth: 2 } }}>
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />
            <Controls />
            <MiniMap nodeColor={(n) => NODE_COLORS[(n.data as any)?.type] || '#e5e7eb'} />
            {nodes.length === 0 && (
              <Panel position="top-center">
                <div style={{ background: '#fff', border: '1px dashed #d1d5db', borderRadius: '12px', padding: '24px 40px', textAlign: 'center', marginTop: '60px' }}>
                  <Workflow size={32} color="#d1d5db" style={{ margin: '0 auto 10px' }} />
                  <p style={{ color: '#9ca3af', fontSize: '14px', fontWeight: 500 }}>Canvas vazio</p>
                  <p style={{ color: '#d1d5db', fontSize: '12px', marginTop: '4px' }}>Clique em um bloco na barra lateral para começar</p>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {selectedNode && (
          <NodeConfigPanel node={selectedNode} tags={tags} flows={allFlows}
            onUpdate={updateNodeData} onClose={() => setSelectedNode(null)} onDelete={deleteNode} />
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
