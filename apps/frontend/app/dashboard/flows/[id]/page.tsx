'use client'

import { useCallback, useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, Connection, Edge, Node,
  Panel, BackgroundVariant, MarkerType, getBezierPath, BaseEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { messageApi, contactApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import { Save, ArrowLeft, Loader2, Workflow } from 'lucide-react'
import { FlowNode } from './components/FlowNode'
import { NodeConfigPanel } from './components/NodeConfigPanel'
import { NODE_COLORS, NODE_ICONS, defaultBranch } from './components/constants'

// ─── Custom Edge ──────────────────────────────────────────────────────────────
function CustomEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }: any) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const [hovered, setHovered] = useState(false)
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <path d={edgePath} style={{ stroke: 'transparent', strokeWidth: 20, fill: 'none', cursor: 'pointer' }}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} />
      {hovered && (
        <foreignObject width={28} height={28} x={labelX - 14} y={labelY - 14}
          style={{ overflow: 'visible', pointerEvents: 'all' }}
          onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
          <div onClick={() => data?.onDelete(id)}
            style={{ width: '28px', height: '28px', background: '#ef4444', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.2)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </div>
        </foreignObject>
      )}
    </>
  )
}

const nodeTypes = { flowNode: FlowNode }
const edgeTypes = { custom: CustomEdge }

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
  { type: 'loop_repeat',    label: 'Loop repetição' },
  { type: 'loop_retry',     label: 'Loop tentativas' },
  { type: 'loop_while',     label: 'Loop enquanto' },
  { type: 'end',            label: 'Finalizar flow' },
]

export default function FlowEditorPage() {
  const { id } = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const tenantId = (user as any)?.tenantId || (user as any)?.tid || process.env.NEXT_PUBLIC_TENANT_ID || ''

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [flowName, setFlowName] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [copiedNodes, setCopiedNodes] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('autozap_flow_clipboard')
      if (saved) setCopiedNodes(JSON.parse(saved))
    } catch { }
  }, [])

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => { const { data } = await contactApi.get('/tags'); return data.data || [] },
  })
  const { data: allFlows = [] } = useQuery({
    queryKey: ['flows-list'],
    queryFn: async () => { const { data } = await messageApi.get('/flows'); return (data.data || []).filter((f: any) => f.id !== id) },
  })
  const { data: flowData, isLoading } = useQuery({
    queryKey: ['flow', id],
    queryFn: async () => { const { data } = await messageApi.get(`/flows/${id}`); return data.data },
  })

  useEffect(() => {
    if (!flowData || initialized) return
    setFlowName(flowData.name || '')
    setNodes((flowData.nodes || []).map((n: any) => ({ id: n.id, type: 'flowNode', position: { x: n.position_x, y: n.position_y }, data: { type: n.type, ...n.data } })))
    setEdges((flowData.edges || []).map((e: any) => ({ id: e.id, source: e.source_node, target: e.target_node, sourceHandle: e.source_handle || 'success', markerEnd: { type: MarkerType.ArrowClosed, color: '#d1d5db' }, style: { stroke: '#d1d5db', strokeWidth: 2 } })))
    setInitialized(true)
  }, [flowData, initialized, setNodes, setEdges])

  const saveMutation = useMutation({
    mutationFn: async () => {
      await messageApi.put(`/flows/${id}/graph`, {
        nodes: nodes.map(n => ({ id: n.id, type: (n.data as any).type, position_x: n.position.x, position_y: n.position.y, data: { ...(n.data as any) } })),
        edges: edges.map(e => ({ id: e.id, source_node: e.source, target_node: e.target, source_handle: e.sourceHandle || 'success' })),
      })
      if (flowName) await messageApi.patch(`/flows/${id}`, { name: flowName })
    },
    onSuccess: () => { toast.success('Flow salvo!'); setIsDirty(false); queryClient.invalidateQueries({ queryKey: ['flows'] }) },
    onError: () => toast.error('Erro ao salvar'),
  })

  const BRANCH_COLORS_MAP = ['#16a34a', '#2563eb', '#7c3aed', '#db2777', '#d97706', '#0891b2']

  const onConnect = useCallback((params: Connection) => {
    let edgeColor = '#d1d5db'
    if (params.sourceHandle === 'fallback') edgeColor = '#9ca3af'
    else if (params.sourceHandle?.startsWith('branch_')) {
      const src = nodes.find(n => n.id === params.source)
      const branches = (src?.data as any)?.branches || []
      const idx = branches.findIndex((b: any) => b.id === params.sourceHandle!.replace('branch_', ''))
      if (idx >= 0) edgeColor = BRANCH_COLORS_MAP[idx % BRANCH_COLORS_MAP.length]
    } else if (params.sourceHandle === 'true') edgeColor = '#16a34a'
    else if (params.sourceHandle === 'false') edgeColor = '#ef4444'
    setEdges(eds => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor }, style: { stroke: edgeColor, strokeWidth: 2 } }, eds))
    setIsDirty(true)
  }, [setEdges, nodes])

  const addNode = (type: string) => {
    const nodeId = `node_${Date.now()}`
    setNodes((nds: Node[]) => [...nds, { id: nodeId, type: 'flowNode', position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 }, data: { type, ...(type === 'condition' ? { branches: [defaultBranch('Caminho 1')] } : {}) } }])
    setIsDirty(true)
  }

  const updateNodeData = (nodeId: string, newData: any) => {
    setNodes((nds: Node[]) => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n))
    if (selectedNode?.id === nodeId) setSelectedNode(prev => prev ? { ...prev, data: { ...prev.data, ...newData } } : prev)
    setIsDirty(true)
  }

  const deleteNode = (nodeId: string) => {
    setNodes((nds: Node[]) => nds.filter(n => n.id !== nodeId))
    setEdges((eds: Edge[]) => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
    setSelectedNode(null)
    setIsDirty(true)
  }

  const copySelected = () => {
    const sel = nodes.filter(n => n.selected)
    if (sel.length === 0) { toast.error('Selecione pelo menos um nó (shift+click ou arraste)'); return }
    const ids = new Set(sel.map(n => n.id))
    const cb = { nodes: sel, edges: edges.filter(e => ids.has(e.source) && ids.has(e.target)) }
    setCopiedNodes(cb)
    try { sessionStorage.setItem('autozap_flow_clipboard', JSON.stringify(cb)) } catch { }
    toast.success(`${sel.length} nó${sel.length > 1 ? 's' : ''} copiado${sel.length > 1 ? 's' : ''}!`)
  }

  const pasteNodes = () => {
    if (!copiedNodes?.nodes.length) return
    const idMap = new Map<string, string>()
    const offset = 60 + Math.random() * 40
    const newNodes: Node[] = copiedNodes.nodes.map(n => {
      const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2)}`
      idMap.set(n.id, newId)
      return { ...n, id: newId, selected: true, position: { x: n.position.x + offset, y: n.position.y + offset }, data: { ...n.data } }
    })
    const newEdges: Edge[] = copiedNodes.edges.map(e => ({ ...e, id: `edge_${Date.now()}_${Math.random().toString(36).slice(2)}`, source: idMap.get(e.source) || e.source, target: idMap.get(e.target) || e.target }))
    setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), ...newNodes])
    setEdges(eds => [...eds, ...newEdges])
    setIsDirty(true)
    toast.success(`${newNodes.length} nó${newNodes.length > 1 ? 's' : ''} colado${newNodes.length > 1 ? 's' : ''}!`)
  }

  const nodesWithDelete = nodes.map(n => ({ ...n, data: { ...n.data, nodeId: n.id, onDelete: deleteNode } }))

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      {/* Header */}
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

        {copiedNodes && copiedNodes.nodes.length > 0 && (
          <button onClick={pasteNodes} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '7px', fontSize: '13px', fontWeight: 600, color: '#16a34a', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#dcfce7'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#f0fdf4'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Colar ({copiedNodes.nodes.length})
          </button>
        )}

        <button onClick={copySelected} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', fontWeight: 500, color: '#6b7280', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copiar selecionados
        </button>

        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
          style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {saveMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
          Salvar
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Sidebar */}
        <div style={{ width: '200px', background: '#fff', borderRight: '1px solid #e5e7eb', padding: '16px', overflowY: 'auto', flexShrink: 0, zIndex: 10 }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Gatilhos</p>
          {TRIGGER_NODES.map(n => {
            const Icon = NODE_ICONS[n.type]
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
            const Icon = NODE_ICONS[n.type]
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

        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative', background: '#f8fafc' }}>
          <ReactFlow
            nodes={nodesWithDelete}
            edges={edges.map(e => ({ ...e, type: 'custom', data: { ...((e.data as any) || {}), onDelete: (eid: string) => { setEdges(eds => eds.filter(ed => ed.id !== eid)); setIsDirty(true) } } }))}
            onNodesChange={ch => { onNodesChange(ch); setIsDirty(true) }}
            onEdgesChange={ch => { onEdgesChange(ch); setIsDirty(true) }}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNode(node)}
            onPaneClick={() => setSelectedNode(null)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView fitViewOptions={{ padding: 0.3 }}
            deleteKeyCode={['Backspace', 'Delete']}
            multiSelectionKeyCode="Shift"
            selectionOnDrag
            defaultEdgeOptions={{ type: 'custom', markerEnd: { type: MarkerType.ArrowClosed, color: '#d1d5db' }, style: { stroke: '#d1d5db', strokeWidth: 2 } }}>
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
            <Controls />
            <MiniMap nodeColor={(n) => NODE_COLORS[(n.data as any)?.type] || '#e5e7eb'} />
            <Panel position="top-left" style={{ pointerEvents: 'none', userSelect: 'none', position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <svg width="72" height="72" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.18 }}>
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#16a34a" />
                </svg>
                <span style={{ fontSize: '88px', fontWeight: 800, letterSpacing: '-0.05em', fontFamily: 'system-ui, sans-serif', lineHeight: 1, color: 'transparent', WebkitTextStroke: '2px #16a34a', opacity: 0.18 }}>AutoZap</span>
              </div>
            </Panel>
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
          <NodeConfigPanel node={selectedNode} tags={tags} flows={allFlows} tenantId={tenantId}
            onUpdate={updateNodeData} onClose={() => setSelectedNode(null)} onDelete={deleteNode} />
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
