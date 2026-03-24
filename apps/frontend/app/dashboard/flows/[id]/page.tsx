'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  Panel,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { messageApi, channelApi, contactApi } from '@/lib/api'
import { toast } from 'sonner'
import {
  Save, ArrowLeft, Play, Loader2, Plus, Zap, MessageSquare,
  Clock, Tag, GitBranch, MoveRight, UserCheck, Workflow,
} from 'lucide-react'

// ─── Cores por tipo de nó ────────────────────────────────────────────────────
const NODE_COLORS: Record<string, string> = {
  trigger_keyword:       '#16a34a',
  trigger_first_message: '#16a34a',
  trigger_outside_hours: '#16a34a',
  send_message:          '#2563eb',
  wait:                  '#7c3aed',
  add_tag:               '#0891b2',
  move_pipeline:         '#d97706',
  assign_agent:          '#db2777',
  condition:             '#ea580c',
}

const NODE_ICONS: Record<string, any> = {
  trigger_keyword:       Zap,
  trigger_first_message: Zap,
  trigger_outside_hours: Clock,
  send_message:          MessageSquare,
  wait:                  Clock,
  add_tag:               Tag,
  move_pipeline:         MoveRight,
  assign_agent:          UserCheck,
  condition:             GitBranch,
}

const NODE_LABELS: Record<string, string> = {
  trigger_keyword:       'Palavra-chave',
  trigger_first_message: 'Primeira mensagem',
  trigger_outside_hours: 'Fora do horário',
  send_message:          'Enviar mensagem',
  wait:                  'Espera',
  add_tag:               'Adicionar tag',
  move_pipeline:         'Mover no funil',
  assign_agent:          'Atribuir agente',
  condition:             'Condição',
}

// ─── Componente de nó customizado ────────────────────────────────────────────
import { Handle, Position } from '@xyflow/react'

function FlowNode({ data, selected }: { data: any; selected: boolean }) {
  const color = NODE_COLORS[data.type] || '#6b7280'
  const Icon = NODE_ICONS[data.type] || Zap
  const isTrigger = data.type?.startsWith('trigger_')

  const subtitle = () => {
    if (data.type === 'trigger_keyword') return (data.keywords || []).join(', ') || 'Nenhuma palavra'
    if (data.type === 'trigger_first_message') return 'Primeira mensagem do contato'
    if (data.type === 'trigger_outside_hours') return `${data.start ?? 9}h – ${data.end ?? 18}h`
    if (data.type === 'send_message') return (data.message || '').slice(0, 50) || 'Sem mensagem'
    if (data.type === 'wait') {
      if (data.hours) return `Aguardar ${data.hours}h`
      if (data.minutes) return `Aguardar ${data.minutes} min`
      return `Aguardar ${data.seconds ?? 0}s`
    }
    if (data.type === 'add_tag') return data.tagName || 'Tag não selecionada'
    if (data.type === 'move_pipeline') return data.stage || 'Etapa não definida'
    if (data.type === 'assign_agent') return 'Atribuir ao próximo agente'
    if (data.type === 'condition') return data.label || 'Condição'
    return ''
  }

  return (
    <div style={{
      background: '#fff',
      border: `2px solid ${selected ? color : '#e5e7eb'}`,
      borderRadius: '12px',
      padding: '14px 16px',
      minWidth: '220px',
      maxWidth: '260px',
      boxShadow: selected ? `0 0 0 3px ${color}22` : '0 2px 8px rgba(0,0,0,.08)',
      transition: 'all 0.15s',
    }}>
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: '#d1d5db', width: 10, height: 10, border: '2px solid #fff' }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={14} color={color} />
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {isTrigger ? 'Gatilho' : 'Ação'}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>
            {NODE_LABELS[data.type] || data.type}
          </div>
        </div>
      </div>

      {subtitle() && (
        <div style={{ fontSize: '11px', color: '#9ca3af', background: '#f9fafb', borderRadius: '6px', padding: '5px 8px', wordBreak: 'break-word' }}>
          {subtitle()}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="success"
        style={{ background: color, width: 10, height: 10, border: '2px solid #fff' }}
      />

      {data.type === 'condition' && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="false"
          style={{ background: '#ef4444', width: 10, height: 10, border: '2px solid #fff' }}
        />
      )}
    </div>
  )
}

const nodeTypes = { flowNode: FlowNode }

// ─── Painel lateral de configuração ──────────────────────────────────────────
function NodeConfigPanel({
  node,
  tags,
  onUpdate,
  onClose,
  onDelete,
}: {
  node: Node
  tags: any[]
  onUpdate: (id: string, data: any) => void
  onClose: () => void
  onDelete: (id: string) => void
}) {
  const d = node.data as any
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px',
    background: '#f9fafb', border: '1px solid #e5e7eb',
    borderRadius: '7px', fontSize: '13px', outline: 'none', color: '#111827',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 600,
    color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em',
  }

  const color = NODE_COLORS[d.type] || '#6b7280'

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, width: '300px', height: '100%',
      background: '#fff', borderLeft: '1px solid #e5e7eb', zIndex: 10,
      display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 16px rgba(0,0,0,.06)',
    }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
            {d.type?.startsWith('trigger_') ? 'Gatilho' : 'Ação'}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{NODE_LABELS[d.type] || d.type}</div>
        </div>
        <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '6px', fontSize: '16px', lineHeight: 1 }}>✕</button>
      </div>

      {/* Config */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* trigger_keyword */}
        {d.type === 'trigger_keyword' && (
          <div>
            <label style={labelStyle}>Palavras-chave (separadas por vírgula)</label>
            <input style={inputStyle} placeholder="preço, valor, info"
              value={(d.keywords || []).join(', ')}
              onChange={e => onUpdate(node.id, { keywords: e.target.value.split(',').map((k: string) => k.trim()).filter(Boolean) })} />
            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Dispara se a mensagem contiver qualquer uma das palavras</p>
          </div>
        )}

        {/* trigger_first_message */}
        {d.type === 'trigger_first_message' && (
          <div>
            <label style={labelStyle}>Filtrar por palavra-chave (opcional)</label>
            <input style={inputStyle} placeholder="Deixe vazio para qualquer mensagem"
              value={(d.keywords || []).join(', ')}
              onChange={e => onUpdate(node.id, { keywords: e.target.value.split(',').map((k: string) => k.trim()).filter(Boolean) })} />
          </div>
        )}

        {/* trigger_outside_hours */}
        {d.type === 'trigger_outside_hours' && (
          <>
            <div>
              <label style={labelStyle}>Início do expediente (hora)</label>
              <input type="number" min="0" max="23" style={inputStyle}
                value={d.start ?? 9}
                onChange={e => onUpdate(node.id, { start: Number(e.target.value) })} />
            </div>
            <div>
              <label style={labelStyle}>Fim do expediente (hora)</label>
              <input type="number" min="0" max="23" style={inputStyle}
                value={d.end ?? 18}
                onChange={e => onUpdate(node.id, { end: Number(e.target.value) })} />
            </div>
          </>
        )}

        {/* send_message */}
        {d.type === 'send_message' && (
          <>
            <div>
              <label style={labelStyle}>Mensagem</label>
              <textarea style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' as any }}
                placeholder="Olá! Use {{phone}} para o número do contato."
                value={d.message || ''}
                onChange={e => onUpdate(node.id, { message: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Delay antes de enviar (segundos)</label>
              <input type="number" min="0" max="300" style={{ ...inputStyle, maxWidth: '120px' }}
                value={d.delay ?? 0}
                onChange={e => onUpdate(node.id, { delay: Number(e.target.value) })} />
            </div>
          </>
        )}

        {/* wait */}
        {d.type === 'wait' && (
          <>
            <div>
              <label style={labelStyle}>Segundos</label>
              <input type="number" min="0" style={inputStyle}
                value={d.seconds ?? 0}
                onChange={e => onUpdate(node.id, { seconds: Number(e.target.value), minutes: 0, hours: 0 })} />
            </div>
            <div>
              <label style={labelStyle}>Minutos</label>
              <input type="number" min="0" style={inputStyle}
                value={d.minutes ?? 0}
                onChange={e => onUpdate(node.id, { minutes: Number(e.target.value), seconds: 0, hours: 0 })} />
            </div>
            <div>
              <label style={labelStyle}>Horas</label>
              <input type="number" min="0" style={inputStyle}
                value={d.hours ?? 0}
                onChange={e => onUpdate(node.id, { hours: Number(e.target.value), seconds: 0, minutes: 0 })} />
            </div>
          </>
        )}

        {/* add_tag */}
        {d.type === 'add_tag' && (
          <div>
            <label style={labelStyle}>Tag</label>
            {tags.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#9ca3af' }}>Nenhuma tag cadastrada. Acesse Contatos para criar tags.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {tags.map((tag: any) => (
                  <div key={tag.id}
                    onClick={() => onUpdate(node.id, { tagId: tag.id, tagName: tag.name })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '5px 10px', borderRadius: '99px', cursor: 'pointer',
                      border: `2px solid ${d.tagId === tag.id ? (tag.color || '#0891b2') : '#e5e7eb'}`,
                      background: d.tagId === tag.id ? `${tag.color || '#0891b2'}15` : '#fff',
                      fontSize: '12px', fontWeight: 500,
                    }}>
                    <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: tag.color || '#6b7280' }} />
                    <span style={{ color: d.tagId === tag.id ? (tag.color || '#0891b2') : '#374151' }}>{tag.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* move_pipeline */}
        {d.type === 'move_pipeline' && (
          <div>
            <label style={labelStyle}>Etapa do funil</label>
            <select style={{ ...inputStyle, background: '#fff' }}
              value={d.stage || 'lead'}
              onChange={e => onUpdate(node.id, { stage: e.target.value })}>
              {['lead', 'qualificacao', 'proposta', 'negociacao', 'ganho', 'perdido'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
        )}

        {/* assign_agent */}
        {d.type === 'assign_agent' && (
          <div>
            <label style={labelStyle}>Mensagem para o cliente (opcional)</label>
            <textarea style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' as any }}
              placeholder="Ex: Aguarde, um atendente irá te responder."
              value={d.message || ''}
              onChange={e => onUpdate(node.id, { message: e.target.value })} />
          </div>
        )}

      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb' }}>
        <button onClick={() => onDelete(node.id)}
          style={{ width: '100%', padding: '8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px', color: '#ef4444', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          Remover nó
        </button>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function FlowEditorPage() {
  const { id } = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [flowName, setFlowName] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const { data } = await contactApi.get('/tags')
      return data.data || []
    },
  })

  // Carrega o flow
  const { isLoading } = useQuery({
    queryKey: ['flow', id],
    queryFn: async () => {
      const { data } = await messageApi.get(`/flows/${id}`)
      return data.data
    },
    onSuccess: (flow: any) => {
      setFlowName(flow.name)
      const loadedNodes: Node[] = (flow.nodes || []).map((n: any) => ({
        id: n.id,
        type: 'flowNode',
        position: { x: n.position_x, y: n.position_y },
        data: { type: n.type, ...n.data },
      }))
      const loadedEdges: Edge[] = (flow.edges || []).map((e: any) => ({
        id: e.id,
        source: e.source_node,
        target: e.target_node,
        sourceHandle: e.source_handle || 'success',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#d1d5db' },
        style: { stroke: '#d1d5db', strokeWidth: 2 },
      }))
      setNodes(loadedNodes)
      setEdges(loadedEdges)
    },
  } as any)

  // Salva o flow
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nodes: nodes.map(n => ({
          id: n.id,
          type: (n.data as any).type,
          position_x: n.position.x,
          position_y: n.position.y,
          data: { ...(n.data as any) },
        })),
        edges: edges.map(e => ({
          id: e.id,
          source_node: e.source,
          target_node: e.target,
          source_handle: e.sourceHandle || 'success',
        })),
      }
      await messageApi.put(`/flows/${id}/graph`, payload)
      if (flowName) await messageApi.patch(`/flows/${id}`, { name: flowName })
    },
    onSuccess: () => {
      toast.success('Flow salvo!')
      setIsDirty(false)
      queryClient.invalidateQueries({ queryKey: ['flows'] })
    },
    onError: () => toast.error('Erro ao salvar'),
  })

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({
      ...params,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#d1d5db' },
      style: { stroke: '#d1d5db', strokeWidth: 2 },
    }, eds))
    setIsDirty(true)
  }, [setEdges])

  const addNode = (type: string) => {
    const id = `node_${Date.now()}`
    const newNode: Node = {
      id,
      type: 'flowNode',
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: { type },
    }
    setNodes(nds => [...nds, newNode])
    setIsDirty(true)
  }

  const updateNodeData = (nodeId: string, newData: any) => {
    setNodes(nds => nds.map(n =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n
    ))
    if (selectedNode?.id === nodeId) {
      setSelectedNode(prev => prev ? { ...prev, data: { ...prev.data, ...newData } } : prev)
    }
    setIsDirty(true)
  }

  const deleteNode = (nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId))
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
    setSelectedNode(null)
    setIsDirty(true)
  }

  const TRIGGER_NODES = [
    { type: 'trigger_keyword', label: 'Palavra-chave' },
    { type: 'trigger_first_message', label: 'Primeira mensagem' },
    { type: 'trigger_outside_hours', label: 'Fora do horário' },
  ]

  const ACTION_NODES = [
    { type: 'send_message', label: 'Enviar mensagem' },
    { type: 'wait', label: 'Espera' },
    { type: 'add_tag', label: 'Adicionar tag' },
    { type: 'move_pipeline', label: 'Mover no funil' },
    { type: 'assign_agent', label: 'Atribuir agente' },
  ]

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>

      {/* Topbar */}
      <div style={{ height: '56px', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '12px', flexShrink: 0, zIndex: 20 }}>
        <button onClick={() => router.push('/dashboard/flows')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px', padding: '6px 8px', borderRadius: '6px' }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}>
          <ArrowLeft size={15} /> Flows
        </button>

        <div style={{ width: '1px', height: '20px', background: '#e5e7eb' }} />

        <Workflow size={16} color="#16a34a" />
        <input
          value={flowName}
          onChange={e => { setFlowName(e.target.value); setIsDirty(true) }}
          style={{ border: 'none', outline: 'none', fontSize: '15px', fontWeight: 600, color: '#111827', background: 'transparent', minWidth: '200px' }}
        />

        {isDirty && <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>● Não salvo</span>}

        <div style={{ flex: 1 }} />

        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {saveMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
          Salvar
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* Sidebar esquerda — blocos */}
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
                <Icon size={13} color={color} />
                {n.label}
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
                <Icon size={13} color={color} />
                {n.label}
              </button>
            )
          })}
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={(changes) => { onNodesChange(changes); setIsDirty(true) }}
            onEdgesChange={(changes) => { onEdgesChange(changes); setIsDirty(true) }}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNode(node)}
            onPaneClick={() => setSelectedNode(null)}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            defaultEdgeOptions={{
              markerEnd: { type: MarkerType.ArrowClosed, color: '#d1d5db' },
              style: { stroke: '#d1d5db', strokeWidth: 2 },
            }}
          >
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

        {/* Painel de configuração do nó selecionado */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            tags={tags}
            onUpdate={updateNodeData}
            onClose={() => setSelectedNode(null)}
            onDelete={deleteNode}
          />
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
