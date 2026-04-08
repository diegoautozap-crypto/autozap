'use client'

import { useCallback, useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, Connection, Edge, Node,
  Panel, BackgroundVariant, MarkerType, getSmoothStepPath, BaseEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { messageApi, contactApi, channelApi, tenantApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import { Save, ArrowLeft, Loader2, Workflow, BarChart2 } from 'lucide-react'
import { subscribeTenant } from '@/lib/pusher'
import { FlowNode } from './components/FlowNode'
import { NodeConfigPanel } from './components/NodeConfigPanel'
import { NODE_COLORS, NODE_ICONS, LEGACY_TYPE_MAP, defaultBranch } from './components/constants'
import { useT } from '@/lib/i18n'
import { usePermissions } from '@/store/permissions.store'

function CustomEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }: any) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 12, offset: 25 })
  const [hovered, setHovered] = useState(false)
  const count = data?._count
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <path d={edgePath} style={{ stroke: 'transparent', strokeWidth: 20, fill: 'none', cursor: 'pointer' }}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} />
      {count > 0 && !hovered && (
        <foreignObject width={80} height={20} x={labelX - 40} y={labelY - 10} style={{ overflow: 'visible', pointerEvents: 'none' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '99px', padding: '1px 6px', textAlign: 'center', whiteSpace: 'nowrap', width: 'fit-content', margin: '0 auto' }}>
            {count} item{count !== 1 ? 's' : ''}
          </div>
        </foreignObject>
      )}
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

function getTriggerNodes(t: (key: string) => string) {
  return [
    { type: 'trigger_keyword',       label: t('nodes.triggerKeyword') },
    { type: 'trigger_first_message', label: t('nodes.triggerFirstMessage') },
    { type: 'trigger_any_reply',     label: t('nodes.triggerAnyReply') },
    { type: 'trigger_outside_hours', label: t('nodes.triggerOutsideHours') },
    { type: 'trigger_webhook',       label: t('nodes.triggerWebhook') },
    { type: 'trigger_manual',        label: t('nodes.triggerManual') },
  ]
}

function getActionNodes(t: (key: string) => string) {
  return [
    { type: 'map_fields',        label: t('nodes.mapFields') },
    { type: 'create_contact',    label: t('nodes.createContact') },
    { type: 'send_message',      label: t('nodes.sendMessage') },
    { type: 'input',             label: t('nodes.input') },
    { type: 'condition',         label: t('nodes.condition') },
    { type: 'ai',                label: t('nodes.ai') },
    { type: 'webhook',           label: t('nodes.webhook') },
    { type: 'wait',              label: t('nodes.wait') },
    { type: 'tag_contact',       label: t('nodes.tagContact') },
    { type: 'update_contact',    label: t('nodes.updateContact') },
    { type: 'move_pipeline',     label: t('nodes.movePipeline') },
    { type: 'transcribe_audio',  label: t('nodes.transcribeAudio') },
    { type: 'create_task',       label: t('nodes.createTask') },
    { type: 'send_notification', label: t('nodes.sendNotification') },
    { type: 'split_ab',          label: t('nodes.splitAb') },
    { type: 'random_path',       label: t('nodes.randomPath') },
    { type: 'assign_agent',      label: t('nodes.assignAgent') },
    { type: 'go_to',             label: t('nodes.goTo') },
    { type: 'loop',              label: t('nodes.loop') },
    // { type: 'schedule_appointment', label: t('nodes.scheduleAppointment') },
    { type: 'end',               label: t('nodes.end') },
  ]
}

export default function FlowEditorPage() {
  const { id } = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const tenantId = user?.tenantId || ''
  const t = useT()
  const { canEdit } = usePermissions()
  const canEditFlows = canEdit('/dashboard/flows')

  const { data: planLimits } = useQuery({
    queryKey: ['flow-plan-limits'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant/limits'); return data.data },
  })

  const TRIGGER_NODES = getTriggerNodes(t)
  const allActionNodes = getActionNodes(t)
  // Filtra nós baseado no plano
  const ACTION_NODES = allActionNodes.filter(n => {
    if (n.type === 'transcribe_audio' && planLimits?.limits?.transcription === false) return false
    return true
  })

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [flowName, setFlowName] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [copiedNodes, setCopiedNodes] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [doneNodes, setDoneNodes] = useState<Record<string, 'success' | 'error'>>({})

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('autozap_flow_clipboard')
      if (saved) setCopiedNodes(JSON.parse(saved))
    } catch { }
  }, [])

  // Pusher — execution animation
  useEffect(() => {
    if (!tenantId) return
    const channel = subscribeTenant(tenantId)
    if (!channel) return

    const onStart = (ev: any) => {
      if (ev.flowId !== id) return
      setActiveNodeId(ev.nodeId)
      setNodes(nds => nds.map(n => n.id === ev.nodeId ? { ...n, className: 'flow-node-active' } : n))
    }
    const onDone = (ev: any) => {
      if (ev.flowId !== id) return
      const cls = ev.status === 'success' ? 'flow-node-success' : 'flow-node-error'
      setNodes(nds => nds.map(n => n.id === ev.nodeId ? { ...n, className: cls } : n))
      setTimeout(() => setActiveNodeId(null), 300)
      // Limpa classe depois de 8s
      setTimeout(() => setNodes(nds => nds.map(n => n.id === ev.nodeId ? { ...n, className: '' } : n)), 8000)
    }
    channel.bind('flow.node.start', onStart)
    channel.bind('flow.node.done', onDone)

    return () => { channel.unbind('flow.node.start', onStart); channel.unbind('flow.node.done', onDone) }
  }, [tenantId, id])

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => { const { data } = await contactApi.get('/tags'); return data.data || [] },
  })
  const { data: allFlows = [] } = useQuery({
    queryKey: ['flows-list'],
    queryFn: async () => { const { data } = await messageApi.get('/flows'); return (data.data || []).filter((f: any) => f.id !== id) },
  })
  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data || [] },
  })
  const BRANCH_COLORS_MAP = ['#16a34a', '#2563eb', '#7c3aed', '#db2777', '#d97706', '#0891b2']
  const [showAnalytics, setShowAnalytics] = useState(false)
  const { data: analytics } = useQuery({
    queryKey: ['flow-analytics', id],
    queryFn: async () => { const { data } = await messageApi.get(`/flows/${id}/analytics?days=7`); return data.data },
    enabled: showAnalytics,
    refetchInterval: showAnalytics ? 15000 : false,
  })

  const { data: flowData, isLoading } = useQuery({
    queryKey: ['flow', id],
    queryFn: async () => { const { data } = await messageApi.get(`/flows/${id}`); return data.data },
  })

  useEffect(() => {
    if (!flowData || initialized) return
    setFlowName(flowData.name || '')
    setNodes((flowData.nodes || []).map((n: any) => {
      const legacy = LEGACY_TYPE_MAP[n.type]
      const nodeType = legacy ? legacy.type : n.type
      const nodeSubtype = legacy ? legacy.subtype : (n.data?.subtype || undefined)
      return {
        id: n.id, type: 'flowNode',
        position: { x: n.position_x, y: n.position_y },
        data: {
          type: nodeType,
          ...n.data,
          ...(nodeSubtype ? { subtype: nodeSubtype } : {}),
          ...(['trigger_webhook', 'trigger_manual'].includes(nodeType) ? { flowId: id } : {}),
        },
      }
    }))
    setEdges((flowData.edges || []).map((e: any) => {
      let edgeColor = '#d1d5db'
      const handle = e.source_handle || 'success'
      if (handle === 'fallback') edgeColor = '#9ca3af'
      else if (handle === 'true') edgeColor = '#16a34a'
      else if (handle === 'false') edgeColor = '#ef4444'
      else if (handle === 'timeout') edgeColor = '#d97706'
      else if (handle.startsWith('branch_')) {
        const srcNode = (flowData.nodes || []).find((n: any) => n.id === e.source_node)
        const branches = srcNode?.data?.branches || []
        const idx = branches.findIndex((b: any) => b.id === handle.replace('branch_', ''))
        if (idx >= 0) edgeColor = BRANCH_COLORS_MAP[idx % BRANCH_COLORS_MAP.length]
      }
      return {
        id: e.id, source: e.source_node, target: e.target_node,
        sourceHandle: handle,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
        style: { stroke: edgeColor, strokeWidth: 2 },
      }
    }))
    setInitialized(true)
  }, [flowData, initialized, setNodes, setEdges])

  const saveMutation = useMutation({
    mutationFn: async () => {
      await messageApi.put(`/flows/${id}/graph`, {
        nodes: nodes.map(n => { const { _execCount, _errorCount, ...cleanData } = (n.data as any); return { id: n.id, type: cleanData.type, position_x: n.position.x, position_y: n.position.y, data: cleanData } }),
        edges: edges.map(e => ({ id: e.id, source_node: e.source, target_node: e.target, source_handle: e.sourceHandle || 'success' })),
      })
      if (flowName) await messageApi.patch(`/flows/${id}`, { name: flowName })
    },
    onSuccess: () => { toast.success(t('nodes.flowSaved')); setIsDirty(false); queryClient.invalidateQueries({ queryKey: ['flow', id] }); queryClient.invalidateQueries({ queryKey: ['flows'] }) },
    onError: () => toast.error(t('nodes.flowSaveError')),
  })

  // Injeta contadores do analytics nos nós e edges
  useEffect(() => {
    if (!analytics?.nodeStats) {
      // Limpa contadores quando analytics desativa
      if (!showAnalytics) {
        setNodes(nds => nds.map(n => { const { _execCount, _errorCount, ...cleanData } = (n.data as any); return { ...n, data: cleanData } }))
        setEdges(eds => eds.map(e => { const { _count, ...cleanData } = (e.data || {} as any); return { ...e, data: cleanData } }))
      }
      return
    }
    const stats = analytics.nodeStats as Record<string, { success: number; error: number; total: number }>
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...(n.data as any), _execCount: stats[n.id]?.success || 0, _errorCount: stats[n.id]?.error || 0 },
    })))
    // Contagem nas edges = total do nó de origem (quantos passaram)
    setEdges(eds => eds.map(e => ({
      ...e,
      data: { ...(e.data || {}), _count: stats[e.source]?.total || 0 },
    })))
  }, [analytics?.nodeStats, showAnalytics])

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
    setNodes((nds: Node[]) => [...nds, {
      id: nodeId, type: 'flowNode',
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: {
        type,
        ...(['trigger_webhook', 'trigger_manual'].includes(type) ? { flowId: id } : {}),
        ...(type === 'condition' ? { branches: [defaultBranch(`${t('nodes.paths')} 1`)] } : {}),
      },
    }])
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
    if (sel.length === 0) { toast.error(t('nodes.selectAtLeastOne')); return }
    const ids = new Set(sel.map(n => n.id))
    const cb = { nodes: sel, edges: edges.filter(e => ids.has(e.source) && ids.has(e.target)) }
    setCopiedNodes(cb)
    try { sessionStorage.setItem('autozap_flow_clipboard', JSON.stringify(cb)) } catch { }
    toast.success(`${sel.length} ${t('nodes.nodesCopied')}!`)
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
    const newEdges: Edge[] = copiedNodes.edges.map(e => ({
      ...e,
      id: `edge_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      source: idMap.get(e.source) || e.source,
      target: idMap.get(e.target) || e.target,
    }))
    setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), ...newNodes])
    setEdges(eds => [...eds, ...newEdges])
    setIsDirty(true)
    toast.success(`${newNodes.length} ${t('nodes.nodesPasted')}!`)
  }

  const nodesWithDelete = nodes.map(n => ({ ...n, data: { ...n.data, nodeId: n.id, onDelete: canEditFlows ? deleteNode : undefined } }))

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div className="mobile-page" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
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
        {isDirty && <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>● {t('nodes.notSaved')}</span>}
        <div style={{ flex: 1 }} />
        {copiedNodes && copiedNodes.nodes.length > 0 && (
          <button onClick={pasteNodes} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '7px', fontSize: '13px', fontWeight: 600, color: '#16a34a', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#dcfce7'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#f0fdf4'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            {t('nodes.pasteCount')} ({copiedNodes.nodes.length})
          </button>
        )}
        {canEditFlows && <button onClick={copySelected} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', fontWeight: 500, color: '#6b7280', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          {t('nodes.copySelected')}
        </button>}
        {canEditFlows && <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
          style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {saveMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
          {t('nodes.save')}
        </button>}
        <button onClick={() => setShowAnalytics(p => !p)}
          style={{ padding: '7px 14px', background: showAnalytics ? '#f5f3ff' : '#f9fafb', border: `1px solid ${showAnalytics ? '#ddd6fe' : '#e5e7eb'}`, borderRadius: '7px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: showAnalytics ? '#7c3aed' : '#6b7280' }}>
          <BarChart2 size={13} /> Analytics
        </button>
      </div>

      {showAnalytics && analytics && (
        <div style={{ background: '#faf5ff', borderBottom: '1px solid #ede9fe', padding: '10px 20px', display: 'flex', gap: '20px', alignItems: 'center', fontSize: '13px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#7c3aed', display: 'inline-block' }} />
            <span style={{ color: '#6d28d9' }}><strong>{analytics.totalFlowRuns}</strong> {t('nodes.executions')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563eb', display: 'inline-block' }} />
            <span style={{ color: '#1d4ed8' }}><strong>{analytics.uniqueContacts}</strong> {t('nodes.contacts')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
            <span style={{ color: '#15803d' }}><strong>{analytics.totalExecutions}</strong> {t('nodes.nodesProcessed')}</span>
          </div>
          {analytics.totalErrors > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
              <span style={{ color: '#dc2626' }}><strong>{analytics.totalErrors}</strong> {t('nodes.errors')}</span>
            </div>
          )}
          <span style={{ fontSize: '11px', color: '#a78bfa', marginLeft: 'auto' }}>{t('nodes.last7days')}</span>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {canEditFlows && <div className="flow-sidebar mobile-hide" style={{ width: '200px', background: '#fff', borderRight: '1px solid #e5e7eb', padding: '16px', overflowY: 'auto', flexShrink: 0, zIndex: 10 }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{t('nodes.sectionTriggers')}</p>
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
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', marginTop: '16px' }}>{t('nodes.sectionActions')}</p>
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
        </div>}

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
            minZoom={0.05}
            maxZoom={2}
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
                  <p style={{ color: '#9ca3af', fontSize: '14px', fontWeight: 500 }}>{t('nodes.emptyCanvas')}</p>
                  <p style={{ color: '#d1d5db', fontSize: '12px', marginTop: '4px' }}>{t('nodes.emptyCanvasHint')}</p>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            tags={tags}
            flows={allFlows}
            channels={channels}
            tenantId={tenantId}
            onUpdate={updateNodeData}
            onClose={() => setSelectedNode(null)}
            onDelete={deleteNode}
          />
        )}
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes flowPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); } 50% { box-shadow: 0 0 0 8px rgba(34,197,94,0); } }
        .flow-node-active > div { border-color: #22c55e !important; animation: flowPulse 0.8s ease-in-out infinite; }
        .flow-node-success > div { border-color: #22c55e !important; box-shadow: 0 0 0 3px rgba(34,197,94,0.15); transition: all 0.3s; }
        .flow-node-error > div { border-color: #ef4444 !important; box-shadow: 0 0 0 3px rgba(239,68,68,0.15); transition: all 0.3s; }
      `}</style>
    </div>
  )
}
