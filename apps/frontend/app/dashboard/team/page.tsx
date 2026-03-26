'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi, channelApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import {
  Users, Plus, Pencil, Trash2, X, Check, Loader2,
  Shield, UserCheck, Eye, RotateCcw, ToggleLeft, ToggleRight, Settings,
  ChevronLeft,
} from 'lucide-react'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: '#f9fafb', border: '1px solid #e5e7eb',
  borderRadius: '8px', fontSize: '14px', outline: 'none', color: '#111827',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600,
  color: '#374151', marginBottom: '5px',
}

const ROLES = [
  { value: 'admin',      label: 'Admin',      desc: 'Acesso total',                              color: '#7c3aed', bg: '#f5f3ff', icon: Shield },
  { value: 'supervisor', label: 'Supervisor', desc: 'Vê relatórios, não altera configurações',   color: '#0891b2', bg: '#ecfeff', icon: Eye },
  { value: 'agent',      label: 'Atendente',  desc: 'Apenas inbox e conversas atribuídas',      color: '#16a34a', bg: '#f0fdf4', icon: UserCheck },
]

const ALL_PAGES = [
  { href: '/dashboard',           label: 'Dashboard' },
  { href: '/dashboard/campaigns', label: 'Campanhas' },
  { href: '/dashboard/templates', label: 'Templates' },
  { href: '/dashboard/contacts',  label: 'CRM' },
  { href: '/dashboard/inbox',     label: 'Inbox' },
  { href: '/dashboard/pipeline',  label: 'Pipeline' },
  { href: '/dashboard/flows',     label: 'Flows' },
  { href: '/dashboard/channels',  label: 'Canais' },
]

const CAMPAIGN_ACCESS_OPTIONS = [
  { value: 'none',   label: 'Sem acesso',    desc: 'Não vê campanhas' },
  { value: 'view',   label: 'Visualizar',    desc: 'Só leitura' },
  { value: 'create', label: 'Criar',         desc: 'Pode criar, não disparar' },
  { value: 'manage', label: 'Gerenciar',     desc: 'Criar e disparar' },
]

const CONVERSATION_ACCESS_OPTIONS = [
  { value: 'assigned', label: 'Atribuídas',  desc: 'Só as conversas atribuídas a ele' },
  { value: 'all',      label: 'Todas',       desc: 'Todas as conversas do canal' },
]

function getRoleInfo(role: string) { return ROLES.find(r => r.value === role) || ROLES[2] }
function getInitials(name: string) { return (name || '??').trim().split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() }
function getAvatarColor(name: string) {
  const colors = [
    { bg: '#dbeafe', color: '#1d4ed8' }, { bg: '#dcfce7', color: '#15803d' },
    { bg: '#fce7f3', color: '#be185d' }, { bg: '#ede9fe', color: '#6d28d9' },
    { bg: '#ffedd5', color: '#c2410c' }, { bg: '#e0f2fe', color: '#0369a1' },
  ]
  return colors[((name || '').charCodeAt(0) || 0) % colors.length]
}

// ─── Painel de permissões individuais ────────────────────────────────────────
function PermissionsPanel({ member, onClose }: { member: any; onClose: () => void }) {
  const queryClient = useQueryClient()

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data || [] },
  })

  const { data: savedPerms, isLoading } = useQuery({
    queryKey: ['member-permissions', member.id],
    queryFn: async () => {
      const { data } = await authApi.get(`/auth/team/${member.id}/permissions`)
      return data.data
    },
  })

  const [perms, setPerms] = useState<any>(null)
  const effectivePerms = perms || savedPerms || {
    allowed_pages: ['/dashboard/inbox'],
    allowed_channels: [],
    campaign_access: 'none',
    conversation_access: 'assigned',
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      await authApi.patch(`/auth/team/${member.id}/permissions`, effectivePerms)
    },
    onSuccess: () => {
      toast.success('Permissões salvas! O membro precisará fazer login novamente.')
      setPerms(null)
      queryClient.invalidateQueries({ queryKey: ['member-permissions', member.id] })
      queryClient.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao salvar'),
  })

  const update = (key: string, value: any) => setPerms({ ...effectivePerms, [key]: value })

  const togglePage = (href: string) => {
    const current = effectivePerms.allowed_pages || []
    // Inbox sempre obrigatório
    if (href === '/dashboard/inbox') return
    const next = current.includes(href) ? current.filter((h: string) => h !== href) : [...current, href]
    update('allowed_pages', next)
  }

  const toggleChannel = (channelId: string) => {
    const current = effectivePerms.allowed_channels || []
    const next = current.includes(channelId) ? current.filter((c: string) => c !== channelId) : [...current, channelId]
    update('allowed_channels', next)
  }

  const roleInfo = getRoleInfo(member.role)
  const RoleIcon = roleInfo.icon
  const hasChanges = perms !== null

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#9ca3af', display: 'flex' }}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: getAvatarColor(member.name).bg, color: getAvatarColor(member.name).color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>
          {getInitials(member.name)}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#111827' }}>{member.name}</div>
          <div style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <RoleIcon size={11} color={roleInfo.color} /> {roleInfo.label}
          </div>
        </div>
        {hasChanges && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button onClick={() => setPerms(null)} style={{ padding: '6px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#374151' }}>
              Cancelar
            </button>
            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
              style={{ padding: '6px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
              {saveMutation.isPending ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
              Salvar
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} /></div>
      ) : (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Páginas */}
          <div>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>📄 Páginas permitidas</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {ALL_PAGES.map(page => {
                const isChecked = (effectivePerms.allowed_pages || []).includes(page.href)
                const isLocked = page.href === '/dashboard/inbox'
                return (
                  <div key={page.href} onClick={() => togglePage(page.href)}
                    style={{ padding: '10px 12px', borderRadius: '8px', cursor: isLocked ? 'not-allowed' : 'pointer', border: `2px solid ${isChecked ? '#16a34a' : '#e5e7eb'}`, background: isChecked ? '#f0fdf4' : '#f9fafb', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.15s', opacity: isLocked ? 0.7 : 1 }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0, background: isChecked ? '#16a34a' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isChecked && <Check size={10} color="#fff" strokeWidth={3} />}
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: isChecked ? 600 : 400, color: isChecked ? '#15803d' : '#6b7280' }}>{page.label}</span>
                    {isLocked && <span style={{ fontSize: '9px', color: '#9ca3af' }}>fixo</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Canais */}
          <div>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>📡 Canais permitidos</p>
            <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '10px' }}>Sem seleção = acesso a todos os canais</p>
            {channels.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#9ca3af' }}>Nenhum canal cadastrado</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {channels.map((ch: any) => {
                  const isChecked = (effectivePerms.allowed_channels || []).includes(ch.id)
                  return (
                    <div key={ch.id} onClick={() => toggleChannel(ch.id)}
                      style={{ padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', border: `2px solid ${isChecked ? '#2563eb' : '#e5e7eb'}`, background: isChecked ? '#eff6ff' : '#f9fafb', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.15s' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0, background: isChecked ? '#2563eb' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isChecked && <Check size={10} color="#fff" strokeWidth={3} />}
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: isChecked ? 600 : 400, color: isChecked ? '#1d4ed8' : '#374151' }}>{ch.name}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Conversas */}
          <div>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>💬 Acesso a conversas</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {CONVERSATION_ACCESS_OPTIONS.map(opt => {
                const isSelected = effectivePerms.conversation_access === opt.value
                return (
                  <div key={opt.value} onClick={() => update('conversation_access', opt.value)}
                    style={{ padding: '12px 14px', borderRadius: '8px', cursor: 'pointer', border: `2px solid ${isSelected ? '#16a34a' : '#e5e7eb'}`, background: isSelected ? '#f0fdf4' : '#f9fafb', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#15803d' : '#374151', marginBottom: '3px' }}>{opt.label}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>{opt.desc}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Campanhas */}
          <div>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>📦 Acesso a campanhas</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {CAMPAIGN_ACCESS_OPTIONS.map(opt => {
                const isSelected = effectivePerms.campaign_access === opt.value
                return (
                  <div key={opt.value} onClick={() => update('campaign_access', opt.value)}
                    style={{ padding: '12px', borderRadius: '8px', cursor: 'pointer', border: `2px solid ${isSelected ? '#f97316' : '#e5e7eb'}`, background: isSelected ? '#fff7ed' : '#f9fafb', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#ea580c' : '#374151', marginBottom: '3px' }}>{opt.label}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>{opt.desc}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {hasChanges && (
            <div style={{ paddingTop: '8px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '8px' }}>
              <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                style={{ padding: '10px 24px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {saveMutation.isPending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                Salvar permissões
              </button>
              <button onClick={() => setPerms(null)} style={{ padding: '10px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', color: '#374151' }}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function TeamPage() {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', role: 'agent' })
  const [form, setForm] = useState({ name: '', email: '', role: 'agent' })
  const [configuringMember, setConfiguringMember] = useState<any>(null)
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const currentRole = (user as any)?.role
  const canManage = currentRole === 'admin' || currentRole === 'owner'

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: async () => { const { data } = await authApi.get('/auth/team'); return data.data || [] },
  })

  const inviteMutation = useMutation({
    mutationFn: async () => { const { data } = await authApi.post('/auth/team/invite', form); return data },
    onSuccess: () => {
      toast.success('Membro adicionado! Email com credenciais enviado.')
      queryClient.invalidateQueries({ queryKey: ['team'] })
      setShowForm(false); setForm({ name: '', email: '', role: 'agent' })
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao adicionar'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => { await authApi.patch(`/auth/team/${id}`, data) },
    onSuccess: () => { toast.success('Atualizado!'); queryClient.invalidateQueries({ queryKey: ['team'] }); setEditingId(null) },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao atualizar'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await authApi.delete(`/auth/team/${id}`) },
    onSuccess: () => { toast.success('Membro removido'); queryClient.invalidateQueries({ queryKey: ['team'] }) },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao remover'),
  })

  const resetPasswordMutation = useMutation({
    mutationFn: async (id: string) => { await authApi.post(`/auth/team/${id}/reset-password`, {}) },
    onSuccess: () => toast.success('Nova senha enviada por email'),
    onError: () => toast.error('Erro ao redefinir senha'),
  })

  const startEdit = (m: any) => { setEditingId(m.id); setEditForm({ name: m.name, role: m.role }) }

  // Se está configurando um membro, mostra o painel de permissões
  if (configuringMember) {
    return (
      <div style={{ padding: '32px', maxWidth: '900px' }}>
        <PermissionsPanel member={configuringMember} onClose={() => setConfiguringMember(null)} />
      </div>
    )
  }

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>Equipe</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '3px' }}>
            {members.length} {members.length === 1 ? 'membro' : 'membros'} na equipe
          </p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(!showForm)}
            style={{ padding: '9px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> Adicionar membro
          </button>
        )}
      </div>

      {/* Cards roles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {ROLES.map(r => {
          const Icon = r.icon
          return (
            <div key={r.value} style={{ background: r.bg, border: `1px solid ${r.color}30`, borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                <Icon size={14} color={r.color} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: r.color }}>{r.label}</span>
              </div>
              <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>{r.desc}</p>
            </div>
          )
        })}
      </div>

      {/* Formulário */}
      {showForm && canManage && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '22px', marginBottom: '20px', boxShadow: '0 4px 16px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>Adicionar membro</h3>
            <button onClick={() => setShowForm(false)} style={{ background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '5px', display: 'flex', color: '#6b7280' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
            <div><label style={labelStyle}>Nome completo *</label><input style={inputStyle} placeholder="João Silva" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><label style={labelStyle}>Email *</label><input style={inputStyle} type="email" placeholder="joao@empresa.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Permissão inicial</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {ROLES.map(r => {
                const Icon = r.icon
                return (
                  <div key={r.value} onClick={() => setForm({ ...form, role: r.value })}
                    style={{ border: `2px solid ${form.role === r.value ? r.color : '#e5e7eb'}`, borderRadius: '8px', padding: '12px', cursor: 'pointer', background: form.role === r.value ? r.bg : '#fff', transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <Icon size={13} color={form.role === r.value ? r.color : '#9ca3af'} />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: form.role === r.value ? r.color : '#374151' }}>{r.label}</span>
                    </div>
                    <p style={{ fontSize: '11px', color: '#9ca3af', lineHeight: 1.4 }}>{r.desc}</p>
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#15803d' }}>
            📧 Email com login e senha temporária será enviado. Você pode ajustar as permissões individuais depois.
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => inviteMutation.mutate()} disabled={!form.name || !form.email || inviteMutation.isPending}
              style={{ padding: '9px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: (!form.name || !form.email) ? 0.5 : 1 }}>
              {inviteMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
              Adicionar e enviar email
            </button>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}><Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#d1d5db' }} /></div>
      ) : members.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '60px', textAlign: 'center' }}>
          <Users size={32} color="#e5e7eb" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: '#9ca3af', fontSize: '14px' }}>Nenhum membro na equipe ainda</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {members.map((m: any) => {
            const roleInfo = getRoleInfo(m.role)
            const RoleIcon = roleInfo.icon
            const av = getAvatarColor(m.name)
            const isEditing = editingId === m.id

            return (
              <div key={m.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px', opacity: m.is_active ? 1 : 0.6 }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: m.is_active ? av.bg : '#f3f4f6', color: m.is_active ? av.color : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
                  {getInitials(m.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input style={{ ...inputStyle, maxWidth: '200px', padding: '6px 10px', fontSize: '13px' }} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} autoFocus />
                      <select style={{ ...inputStyle, maxWidth: '150px', padding: '6px 10px', fontSize: '13px' }} value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>{m.name}</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 8px', borderRadius: '99px', background: roleInfo.bg, color: roleInfo.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <RoleIcon size={10} /> {roleInfo.label}
                        </span>
                        {!m.is_active && <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 8px', borderRadius: '99px', background: '#f3f4f6', color: '#9ca3af' }}>Inativo</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <span style={{ fontSize: '12px', color: '#9ca3af' }}>{m.email}</span>
                        {m.last_login_at && <span style={{ fontSize: '11px', color: '#d1d5db' }}>Último acesso: {new Date(m.last_login_at).toLocaleDateString('pt-BR')}</span>}
                      </div>
                    </>
                  )}
                </div>
                {canManage && (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                    {isEditing ? (
                      <>
                        <button onClick={() => updateMutation.mutate({ id: m.id, data: editForm })} disabled={updateMutation.isPending}
                          style={{ padding: '6px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {updateMutation.isPending ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />} Salvar
                        </button>
                        <button onClick={() => setEditingId(null)} style={{ padding: '6px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#374151', display: 'flex' }}><X size={12} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => updateMutation.mutate({ id: m.id, data: { is_active: !m.is_active } })} title={m.is_active ? 'Desativar' : 'Reativar'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: m.is_active ? '#16a34a' : '#d1d5db' }}>
                          {m.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                        </button>
                        {/* Botão de permissões — só para agent e supervisor */}
                        {(m.role === 'agent' || m.role === 'supervisor') && (
                          <button onClick={() => setConfiguringMember(m)} title="Configurar permissões"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: '#9ca3af', borderRadius: '6px' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#eff6ff'; (e.currentTarget as HTMLButtonElement).style.color = '#2563eb' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}>
                            <Settings size={14} />
                          </button>
                        )}
                        <button onClick={() => startEdit(m)} title="Editar"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: '#9ca3af', borderRadius: '6px' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6'; (e.currentTarget as HTMLButtonElement).style.color = '#374151' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => { if (confirm(`Redefinir senha de ${m.name}?`)) resetPasswordMutation.mutate(m.id) }} title="Redefinir senha"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: '#9ca3af', borderRadius: '6px' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fffbeb'; (e.currentTarget as HTMLButtonElement).style.color = '#d97706' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}>
                          <RotateCcw size={14} />
                        </button>
                        <button onClick={() => { if (confirm(`Remover ${m.name}?`)) deleteMutation.mutate(m.id) }} title="Remover"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: '#9ca3af', borderRadius: '6px' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
