'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { messageApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Workflow, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, ChevronRight, X, Check, Clock, FileText, Copy } from 'lucide-react'

const FLOW_TEMPLATES = [
  {
    id: 'welcome',
    name: '👋 Boas-vindas',
    desc: 'Saudação automática na primeira mensagem',
    category: 'Simples',
    nodes: [
      { id: 'n1', type: 'trigger_first_message', position_x: 100, position_y: 200, data: { type: 'trigger_first_message', keywords: [] } },
      { id: 'n2', type: 'send_message', position_x: 400, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Olá! 👋 Seja bem-vindo(a)! Como posso te ajudar hoje?' } },
    ],
    edges: [{ id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' }],
  },
  {
    id: 'outside_hours',
    name: '🕐 Fora do horário',
    desc: 'Mensagem automática fora do expediente',
    category: 'Simples',
    nodes: [
      { id: 'n1', type: 'trigger_outside_hours', position_x: 100, position_y: 200, data: { type: 'trigger_outside_hours', start: 9, end: 18 } },
      { id: 'n2', type: 'send_message', position_x: 400, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Olá! Nosso horário de atendimento é de segunda a sexta, das 9h às 18h. Deixe sua mensagem que responderemos assim que possível! 😊' } },
      { id: 'n3', type: 'end', position_x: 700, position_y: 200, data: { type: 'end' } },
    ],
    edges: [
      { id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' },
      { id: 'e2', source_node: 'n2', target_node: 'n3', source_handle: 'success' },
    ],
  },
  {
    id: 'lead_qualify',
    name: '🎯 Qualificação de lead',
    desc: 'Coleta nome, interesse e classifica o lead',
    category: 'Intermediário',
    nodes: [
      { id: 'n1', type: 'trigger_keyword', position_x: 50, position_y: 200, data: { type: 'trigger_keyword', keywords: ['oi', 'olá', 'info', 'quero'], matchType: 'contains' } },
      { id: 'n2', type: 'send_message', position_x: 320, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Olá! 😊 Para te atender melhor, qual é o seu nome?' } },
      { id: 'n3', type: 'input', position_x: 600, position_y: 200, data: { type: 'input', question: '', saveAs: 'nome' } },
      { id: 'n4', type: 'send_message', position_x: 880, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Prazer, {{nome}}! O que te interessa?\n\n1️⃣ Conhecer o produto\n2️⃣ Saber preços\n3️⃣ Suporte' } },
      { id: 'n5', type: 'input', position_x: 1160, position_y: 200, data: { type: 'input', question: '', saveAs: 'interesse' } },
      { id: 'n6', type: 'tag_contact', position_x: 1440, position_y: 100, data: { type: 'tag_contact', subtype: 'add' } },
      { id: 'n7', type: 'move_pipeline', position_x: 1440, position_y: 300, data: { type: 'move_pipeline', stage: 'qualificacao' } },
      { id: 'n8', type: 'assign_agent', position_x: 1720, position_y: 200, data: { type: 'assign_agent', message: 'Obrigado, {{nome}}! Um atendente já vai te ajudar. 🚀' } },
    ],
    edges: [
      { id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' },
      { id: 'e2', source_node: 'n2', target_node: 'n3', source_handle: 'success' },
      { id: 'e3', source_node: 'n3', target_node: 'n4', source_handle: 'success' },
      { id: 'e4', source_node: 'n4', target_node: 'n5', source_handle: 'success' },
      { id: 'e5', source_node: 'n5', target_node: 'n6', source_handle: 'success' },
      { id: 'e6', source_node: 'n5', target_node: 'n7', source_handle: 'success' },
      { id: 'e7', source_node: 'n7', target_node: 'n8', source_handle: 'success' },
    ],
  },
  {
    id: 'satisfaction',
    name: '⭐ Pesquisa de satisfação',
    desc: 'Pergunta nota, classifica e adiciona tag',
    category: 'Intermediário',
    nodes: [
      { id: 'n1', type: 'trigger_keyword', position_x: 50, position_y: 200, data: { type: 'trigger_keyword', keywords: ['pesquisa', 'avaliar', 'feedback'], matchType: 'contains' } },
      { id: 'n2', type: 'send_message', position_x: 320, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Olá! Gostaríamos de saber sua opinião. De 1 a 5, como avalia nosso atendimento?' } },
      { id: 'n3', type: 'input', position_x: 600, position_y: 200, data: { type: 'input', question: '', saveAs: 'nota' } },
      { id: 'n4', type: 'condition', position_x: 880, position_y: 200, data: { type: 'condition', branches: [{ id: 'b1', label: 'Nota alta (4-5)', logic: 'OR', rules: [{ id: 'r1', field: 'variable', fieldName: 'nota', operator: 'contains', value: '4, 5' }] }, { id: 'b2', label: 'Nota baixa (1-3)', logic: 'OR', rules: [{ id: 'r2', field: 'variable', fieldName: 'nota', operator: 'contains', value: '1, 2, 3' }] }] } },
      { id: 'n5', type: 'send_message', position_x: 1200, position_y: 100, data: { type: 'send_message', subtype: 'text', message: 'Muito obrigado! 🎉 Ficamos felizes com sua avaliação!' } },
      { id: 'n6', type: 'send_message', position_x: 1200, position_y: 350, data: { type: 'send_message', subtype: 'text', message: 'Obrigado pelo feedback. 🙏 Vamos melhorar! Um atendente vai entrar em contato.' } },
      { id: 'n7', type: 'assign_agent', position_x: 1500, position_y: 350, data: { type: 'assign_agent' } },
    ],
    edges: [
      { id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' },
      { id: 'e2', source_node: 'n2', target_node: 'n3', source_handle: 'success' },
      { id: 'e3', source_node: 'n3', target_node: 'n4', source_handle: 'success' },
      { id: 'e4', source_node: 'n4', target_node: 'n5', source_handle: 'branch_b1' },
      { id: 'e5', source_node: 'n4', target_node: 'n6', source_handle: 'branch_b2' },
      { id: 'e6', source_node: 'n6', target_node: 'n7', source_handle: 'success' },
    ],
  },
  {
    id: 'webhook_lead',
    name: '🔗 Lead via formulário',
    desc: 'Recebe lead do Make/Zapier, cria contato e envia mensagem',
    category: 'Avançado',
    nodes: [
      { id: 'n1', type: 'trigger_webhook', position_x: 50, position_y: 200, data: { type: 'trigger_webhook' } },
      { id: 'n2', type: 'create_contact', position_x: 350, position_y: 200, data: { type: 'create_contact', fields: [{ label: 'Telefone', variable: '{{webhook_phone}}', contactField: 'phone' }, { label: 'Nome', variable: '{{webhook_name}}', contactField: 'name' }, { label: 'Email', variable: '{{webhook_email}}', contactField: 'email' }] } },
      { id: 'n3', type: 'send_message', position_x: 650, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Olá {{webhook_name}}! Recebemos seu contato. Em breve um consultor vai te atender! 🚀' } },
      { id: 'n4', type: 'tag_contact', position_x: 950, position_y: 100, data: { type: 'tag_contact', subtype: 'add' } },
      { id: 'n5', type: 'move_pipeline', position_x: 950, position_y: 300, data: { type: 'move_pipeline', stage: 'lead' } },
    ],
    edges: [
      { id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' },
      { id: 'e2', source_node: 'n2', target_node: 'n3', source_handle: 'success' },
      { id: 'e3', source_node: 'n3', target_node: 'n4', source_handle: 'success' },
      { id: 'e4', source_node: 'n3', target_node: 'n5', source_handle: 'success' },
    ],
  },
  {
    id: 'ai_support',
    name: '🤖 Atendimento com IA',
    desc: 'IA responde automaticamente e escala para humano quando necessário',
    category: 'Avançado',
    nodes: [
      { id: 'n1', type: 'trigger_any_reply', position_x: 50, position_y: 200, data: { type: 'trigger_any_reply' } },
      { id: 'n2', type: 'ai', position_x: 350, position_y: 200, data: { type: 'ai', mode: 'classify', classifyOptions: 'duvida, comprar, suporte, reclamação, outro', saveAs: 'intencao' } },
      { id: 'n3', type: 'condition', position_x: 650, position_y: 200, data: { type: 'condition', branches: [{ id: 'b1', label: 'Quer comprar', logic: 'AND', rules: [{ id: 'r1', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'comprar' }] }, { id: 'b2', label: 'Reclamação', logic: 'AND', rules: [{ id: 'r2', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'reclamação' }] }] } },
      { id: 'n4', type: 'ai', position_x: 1000, position_y: 50, data: { type: 'ai', mode: 'respond', systemPrompt: 'Você é um consultor de vendas simpático. Apresente os produtos e benefícios.' } },
      { id: 'n5', type: 'assign_agent', position_x: 1000, position_y: 250, data: { type: 'assign_agent', message: 'Entendo sua preocupação. Vou te conectar com um atendente agora mesmo.' } },
      { id: 'n6', type: 'ai', position_x: 1000, position_y: 400, data: { type: 'ai', mode: 'respond', systemPrompt: 'Você é um assistente prestativo. Responda dúvidas de forma clara e objetiva.' } },
    ],
    edges: [
      { id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' },
      { id: 'e2', source_node: 'n2', target_node: 'n3', source_handle: 'success' },
      { id: 'e3', source_node: 'n3', target_node: 'n4', source_handle: 'branch_b1' },
      { id: 'e4', source_node: 'n3', target_node: 'n5', source_handle: 'branch_b2' },
      { id: 'e5', source_node: 'n3', target_node: 'n6', source_handle: 'fallback' },
    ],
  },
]

const COOLDOWN_OPTIONS = [
  { value: '24h',    label: '24 horas',   desc: 'Dispara no máximo 1x por dia por conversa' },
  { value: 'once',   label: 'Uma vez só', desc: 'Dispara apenas 1 vez por conversa, nunca mais' },
  { value: 'always', label: 'Sempre',     desc: 'Dispara toda vez que o gatilho for acionado' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: '#fafafa', border: '1px solid #e4e4e7',
  borderRadius: '8px', fontSize: '14px', outline: 'none', color: '#18181b',
  transition: 'border-color 0.15s, background 0.15s',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600,
  color: '#52525b', marginBottom: '5px',
}

function CooldownSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {COOLDOWN_OPTIONS.map(opt => (
        <div key={opt.value} onClick={() => onChange(opt.value)}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', border: `1.5px solid ${value === opt.value ? '#22c55e' : '#e4e4e7'}`, background: value === opt.value ? '#f0fdf4' : '#fafafa', transition: 'all 0.1s' }}>
          <div style={{ width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${value === opt.value ? '#22c55e' : '#d4d4d8'}`, background: value === opt.value ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {value === opt.value && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />}
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: value === opt.value ? '#15803d' : '#18181b' }}>{opt.label}</div>
            <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '1px' }}>{opt.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function FlowsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newChannelId, setNewChannelId] = useState('')
  const [newCooldown, setNewCooldown] = useState('24h')
  const [editingFlow, setEditingFlow] = useState<any | null>(null)
  const [editName, setEditName] = useState('')
  const [editChannelId, setEditChannelId] = useState('')
  const [editCooldown, setEditCooldown] = useState('24h')

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['flows'],
    queryFn: async () => { const { data } = await messageApi.get('/flows'); return data.data || [] },
  })

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data || [] },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await messageApi.post('/flows', { name: newName, channelId: newChannelId || null, cooldown_type: newCooldown })
      return data.data
    },
    onSuccess: (flow) => {
      toast.success('Flow criado!')
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      setShowNew(false); setNewName(''); setNewChannelId(''); setNewCooldown('24h')
      router.push(`/dashboard/flows/${flow.id}`)
    },
    onError: () => toast.error('Erro ao criar flow'),
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      await messageApi.patch(`/flows/${editingFlow.id}`, { name: editName, channelId: editChannelId || null, cooldown_type: editCooldown })
    },
    onSuccess: () => { toast.success('Flow atualizado!'); queryClient.invalidateQueries({ queryKey: ['flows'] }); setEditingFlow(null) },
    onError: () => toast.error('Erro ao atualizar'),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await messageApi.patch(`/flows/${id}`, { is_active: !isActive })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows'] }),
    onError: () => toast.error('Erro ao atualizar'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await messageApi.delete(`/flows/${id}`) },
    onSuccess: () => { toast.success('Flow excluído!'); queryClient.invalidateQueries({ queryKey: ['flows'] }) },
    onError: () => toast.error('Erro ao excluir'),
  })

  const openEdit = (f: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingFlow(f); setEditName(f.name); setEditChannelId(f.channel_id || ''); setEditCooldown(f.cooldown_type || '24h')
  }

  const channelName = (channelId: string) => channels.find((c: any) => c.id === channelId)?.name || 'Todos os canais'
  const cooldownLabel = (type: string) => COOLDOWN_OPTIONS.find(o => o.value === type)?.label || '24 horas'

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#18181b', letterSpacing: '-0.02em' }}>Flows</h1>
          <p style={{ color: '#a1a1aa', fontSize: '14px', marginTop: '3px' }}>Automações visuais com múltiplos passos</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowTemplates(true)}
            style={{ padding: '9px 16px', background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Copy size={14} /> Templates
          </button>
          <button onClick={() => setShowNew(true)}
            style={{ padding: '9px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.1s' }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#16a34a'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#22c55e'}>
            <Plus size={14} /> Novo flow
          </button>
        </div>
      </div>

      {/* Form novo flow */}
      {showNew && (
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#18181b', marginBottom: '14px', letterSpacing: '-0.01em' }}>Novo flow</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>Nome *</label>
              <input style={inputStyle} placeholder="Ex: Boas-vindas com qualificação" value={newName} onChange={e => setNewName(e.target.value)} autoFocus
                onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = '#fff' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#e4e4e7'; e.currentTarget.style.background = '#fafafa' }} />
            </div>
            <div>
              <label style={labelStyle}>Canal (opcional)</label>
              <select style={{ ...inputStyle }} value={newChannelId} onChange={e => setNewChannelId(e.target.value)}>
                <option value="">Todos os canais</option>
                {channels.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={12} /> Cooldown — com que frequência esse flow pode disparar?
            </label>
            <CooldownSelector value={newCooldown} onChange={setNewCooldown} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => createMutation.mutate()} disabled={!newName || createMutation.isPending}
              style={{ padding: '9px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !newName ? 0.5 : 1 }}>
              {createMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />}
              Criar e abrir editor
            </button>
            <button onClick={() => { setShowNew(false); setNewName('') }}
              style={{ padding: '9px 16px', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#52525b' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal de edição */}
      {editingFlow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setEditingFlow(null)}>
          <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', width: '480px', boxShadow: '0 24px 60px rgba(0,0,0,.12)', border: '1px solid #e4e4e7', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#18181b', letterSpacing: '-0.01em' }}>Editar flow</h3>
              <button onClick={() => setEditingFlow(null)} style={{ background: '#f4f4f5', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '6px', display: 'flex' }}>
                <X size={15} color="#71717a" />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={labelStyle}>Nome *</label>
                <input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                  onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = '#fff' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e4e4e7'; e.currentTarget.style.background = '#fafafa' }} />
              </div>
              <div>
                <label style={labelStyle}>Canal</label>
                <select style={{ ...inputStyle }} value={editChannelId} onChange={e => setEditChannelId(e.target.value)}>
                  <option value="">Todos os canais</option>
                  {channels.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Clock size={12} /> Cooldown
                </label>
                <CooldownSelector value={editCooldown} onChange={setEditCooldown} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => updateMutation.mutate()} disabled={!editName || updateMutation.isPending}
                style={{ padding: '10px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !editName ? 0.5 : 1 }}>
                {updateMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                Salvar
              </button>
              <button onClick={() => setEditingFlow(null)}
                style={{ padding: '10px 16px', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#52525b' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#d4d4d8' }} />
        </div>
      ) : flows.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '80px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Workflow size={24} color="#d4d4d8" />
          </div>
          <p style={{ color: '#71717a', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>Nenhum flow criado</p>
          <p style={{ color: '#a1a1aa', fontSize: '13px', marginBottom: '20px' }}>Crie seu primeiro flow para montar automações visuais com múltiplos passos</p>
          <button onClick={() => setShowNew(true)}
            style={{ padding: '9px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Criar primeiro flow
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {flows.map((f: any) => (
            <div key={f.id}
              style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}
              onClick={() => router.push(`/dashboard/flows/${f.id}`)}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#22c55e'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,.07)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e4e4e7'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,.04)' }}>

              <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: f.is_active ? '#f0fdf4' : '#f4f4f5', border: `1px solid ${f.is_active ? '#bbf7d0' : '#e4e4e7'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Workflow size={16} color={f.is_active ? '#22c55e' : '#d4d4d8'} />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#18181b', letterSpacing: '-0.01em' }}>{f.name}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: f.is_active ? '#dcfce7' : '#f4f4f5', color: f.is_active ? '#15803d' : '#a1a1aa', border: `1px solid ${f.is_active ? '#bbf7d0' : '#e4e4e7'}` }}>
                    {f.is_active ? 'Ativo' : 'Pausado'}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#a1a1aa' }}>
                  {f.node_count || 0} nós · {f.channel_id ? channelName(f.channel_id) : 'Todos os canais'} · {cooldownLabel(f.cooldown_type || '24h')}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                <button onClick={() => toggleMutation.mutate({ id: f.id, isActive: f.is_active })} title={f.is_active ? 'Pausar' : 'Ativar'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: f.is_active ? '#22c55e' : '#d4d4d8', borderRadius: '6px' }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#f4f4f5'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}>
                  {f.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                </button>
                <button onClick={e => openEdit(f, e)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: '#a1a1aa', borderRadius: '6px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f4f4f5'; (e.currentTarget as HTMLButtonElement).style.color = '#18181b' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa' }}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => { if (confirm(`Excluir "${f.name}"?`)) deleteMutation.mutate(f.id) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: '#a1a1aa', borderRadius: '6px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa' }}>
                  <Trash2 size={14} />
                </button>
                <ChevronRight size={15} color="#d4d4d8" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de templates */}
      {showTemplates && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '640px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f4f4f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#18181b', margin: 0 }}>Templates de Flow</h3>
                <p style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '3px' }}>Escolha um template pronto e personalize</p>
              </div>
              <button onClick={() => setShowTemplates(false)} style={{ background: '#f4f4f5', border: 'none', borderRadius: '7px', cursor: 'pointer', padding: '6px', display: 'flex' }}><X size={15} color="#71717a" /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {['Simples', 'Intermediário', 'Avançado'].map(cat => {
                const templates = FLOW_TEMPLATES.filter(t => t.category === cat)
                if (templates.length === 0) return null
                return (
                  <div key={cat} style={{ marginBottom: '20px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{cat}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {templates.map(t => (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', border: '1px solid #e4e4e7', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.1s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#7c3aed'; (e.currentTarget as HTMLDivElement).style.background = '#faf5ff' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e4e4e7'; (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                          onClick={async () => {
                            setCreatingTemplate(true)
                            try {
                              const { data: flowData } = await messageApi.post('/flows', { name: t.name.replace(/^.+\s/, ''), cooldown_type: 'always' })
                              const flowId = flowData.data.id
                              const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
                              const idMap: Record<string, string> = {}
                              const nodes = t.nodes.map(n => { const newId = uid(); idMap[n.id] = newId; return { ...n, id: newId } })
                              const edges = t.edges.map(e => ({ ...e, id: uid(), source_node: idMap[e.source_node], target_node: idMap[e.target_node] }))
                              await messageApi.put(`/flows/${flowId}/graph`, { nodes, edges })
                              toast.success(`Template "${t.name}" criado!`)
                              queryClient.invalidateQueries({ queryKey: ['flows'] })
                              setShowTemplates(false)
                              router.push(`/dashboard/flows/${flowId}`)
                            } catch { toast.error('Erro ao criar template') }
                            finally { setCreatingTemplate(false) }
                          }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                            {t.name.split(' ')[0]}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#18181b' }}>{t.name.split(' ').slice(1).join(' ')}</div>
                            <div style={{ fontSize: '12px', color: '#71717a', marginTop: '2px' }}>{t.desc}</div>
                            <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '3px' }}>{t.nodes.length} nós · {t.edges.length} conexões</div>
                          </div>
                          {creatingTemplate ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: '#7c3aed' }} /> : <ChevronRight size={16} color="#d4d4d8" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
