'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi, channelApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import {
  Users, Plus, Pencil, Trash2, X, Check, Loader2,
  UserCheck, Eye, RotateCcw, ToggleLeft, ToggleRight, Settings,
  ChevronLeft,
} from 'lucide-react'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: '#fafafa', border: '1px solid #e4e4e7',
  borderRadius: '8px', fontSize: '14px', outline: 'none', color: '#18181b',
  transition: 'border-color 0.15s',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600,
  color: '#52525b', marginBottom: '5px', letterSpacing: '0.01em',
}

const ROLES = [
  { value: 'supervisor', label: 'Supervisor', desc: 'Acesso configurável a páginas e canais', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', icon: Eye },
  { value: 'agent',      label: 'Atendente',  desc: 'Acesso configurável a páginas e canais', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: UserCheck },
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
  { value: 'none',   label: 'Sem acesso',  desc: 'Não vê campanhas' },
  { value: 'view',   label: 'Visualizar',  desc: 'Só leitura' },
  { value: 'create', label: 'Criar',       desc: 'Pode criar, não disparar' },
  { value: 'manage', label: 'Gerenciar',   desc: 'Criar e disparar' },
]

const CONVERSATION_ACCESS_OPTIONS = [
  { value: 'assigned', label: 'Atribuídas', desc: 'Só as conversas atribuídas a ele' },
  { value: 'all',      label: 'Todas',      desc: 'Todas as conversas do canal' },
]

function getRoleInfo(role: string) {
  return ROLES.find(r => r.value === role) || { value: role, label: role === 'admin' ? 'Admin' : role === 'owner' ? 'Owner' : role, desc: '', color: '#71717a', bg: '#fafafa', border: '#e4e4e7', icon: Eye }
}
function getInitials(name: string) { return (name || '??').trim().split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() }
function getAvatarColor(name: string) {
  const colors = [
    { bg: '#dbeafe', color: '#1d4ed8' }, { bg: '#dcfce7', color: '#15803d' },
    { bg: '#fce7f3', color: '#be185d' }, { bg: '#ede9fe', color: '#6d28d9' },
    { bg: '#ffedd5', color: '#c2410c' }, { bg: '#e0f2fe', color: '#0369a1' },
  ]
  return colors[((name || '').charCodeAt(0) || 0) % colors.length]
}

function PermissionsPanel({ member, onClose }: { member: any; onClose: () => void }) {
  const queryClient = useQueryClient()

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data || [] },
  })

  const { data: savedPerms, isLoading } = useQuery({
    queryKey: ['member-permissions', member.id],
    queryFn: async () => { const { data } = await authApi.get(`/auth/team/${member.id}/permissions`); return data.data },
  })

  const [perms, setPerms] = useState<any>(null)
  const effectivePerms = perms || savedPerms || {
    allowed_pages: ['/dashboard/inbox'],
    allowed_channels: [],
    campaign_access: 'none',
    conversation_access: 'assigned',
  }

  const saveMutation = useMutation({
    mutationFn: async () => { await authApi.patch(`/auth/team/${member.id}/permissions`, effectivePerms) },
    onSuccess: () => {
      toast.success('Permissões salvas!')
      setPerms(null)
      queryClient.invalidateQueries({ queryKey: ['member-permissions', member.id] })
      queryClient.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || 'Erro ao salvar'),
  })

  const update = (key: string, value: any) => setPerms({ ...effectivePerms, [key]: value })
  const togglePage = (href: string) => {
    const current = effectivePerms.allowed_pages || []
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
  const av = getAvatarColor(member.name)

  return (
    <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f4f4f5', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: '#a1a1aa', display: 'flex', borderRadius: '6px' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f4f4f5'; (e.currentTarget as HTMLButtonElement).style.color = '#18181b' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa' }}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>
          {getInitials(member.name)}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '14px', color: '#18181b', letterSpacing: '-0.01em' }}>{member.name}</div>
          <div style={{ fontSize: '12px', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
            <RoleIcon size={11} color={roleInfo.color} /> {roleInfo.label}
          </div>
        </div>
        {hasChanges && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button onClick={() => setPerms(null)} style={{ padding: '6px 12px', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', color: '#52525b' }}>
              Cancelar
            </button>
            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
              style={{ padding: '6px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
              {saveMutation.isPending ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
              Salvar
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#d4d4d8' }} /></div>
      ) : (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Páginas */}
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>📄 Páginas permitidas</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {ALL_PAGES.map(page => {
                const isChecked = (effectivePerms.allowed_pages || []).includes(page.href)
                const isLocked = page.href === '/dashboard/inbox'
                return (
                  <div key={page.href} onClick={() => togglePage(page.href)}
                    style={{ padding: '9px 12px', borderRadius: '8px', cursor: isLocked ? 'not-allowed' : 'pointer', border: `1.5px solid ${isChecked ? '#22c55e' : '#e4e4e7'}`, background: isChecked ? '#f0fdf4' : '#fafafa', display: 'flex', alignItems: 'center', gap: '7px', transition: 'all 0.15s', opacity: isLocked ? 0.7 : 1 }}>
                    <div style={{ width: '15px', height: '15px', borderRadius: '4px', flexShrink: 0, background: isChecked ? '#22c55e' : '#e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isChecked && <Check size={9} color="#fff" strokeWidth={3} />}
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: isChecked ? 600 : 400, color: isChecked ? '#15803d' : '#71717a' }}>{page.label}</span>
                    {isLocked && <span style={{ fontSize: '9px', color: '#a1a1aa' }}>fixo</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Canais */}
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>📡 Canais permitidos</p>
            <p style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '10px' }}>Sem seleção = acesso a todos os canais</p>
            {channels.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#a1a1aa' }}>Nenhum canal cadastrado</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {channels.map((ch: any) => {
                  const isChecked = (effectivePerms.allowed_channels || []).includes(ch.id)
                  return (
                    <div key={ch.id} onClick={() => toggleChannel(ch.id)}
                      style={{ padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', border: `1.5px solid ${isChecked ? '#22c55e' : '#e4e4e7'}`, background: isChecked ? '#f0fdf4' : '#fafafa', display: 'flex', alignItems: 'center', gap: '7px', transition: 'all 0.15s' }}>
                      <div style={{ width: '15px', height: '15px', borderRadius: '4px', flexShrink: 0, background: isChecked ? '#22c55e' : '#e4e4e7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isChecked && <Check size={9} color="#fff" strokeWidth={3} />}
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: isChecked ? 600 : 400, color: isChecked ? '#15803d' : '#18181b' }}>{ch.name}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Conversas */}
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>💬 Acesso a conversas</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {CONVERSATION_ACCESS_OPTIONS.map(opt => {
                const isSelected = effectivePerms.conversation_access === opt.value
                return (
                  <div key={opt.value} onClick={() => update('conversation_access', opt.value)}
                    style={{ padding: '12px 14px', borderRadius: '8px', cursor: 'pointer', border: `1.5px solid ${isSelected ? '#22c55e' : '#e4e4e7'}`, background: isSelected ? '#f0fdf4' : '#fafafa', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#15803d' : '#18181b', marginBottom: '3px' }}>{opt.label}</div>
                    <div style={{ fontSize: '11px', color: '#a1a1aa' }}>{opt.desc}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Campanhas */}
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>📦 Acesso a campanhas</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {CAMPAIGN_ACCESS_OPTIONS.map(opt => {
                const isSelected = effectivePerms.campaign_access === opt.value
                return (
                  <div key={opt.value} onClick={() => update('campaign_access', opt.value)}
                    style={{ padding: '12px', borderRadius: '8px', cursor: 'pointer', border: `1.5px solid ${isSelected ? '#f97316' : '#e4e4e7'}`, background: isSelected ? '#fff7ed' : '#fafafa', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#ea580c' : '#18181b', marginBottom: '3px' }}>{opt.label}</div>
                    <div style={{ fontSize: '11px', color: '#a1a1aa' }}>{opt.desc}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {hasChanges && (
            <div style={{ paddingTop: '8px', borderTop: '1px solid #f4f4f5', display: 'flex', gap: '8px' }}>
              <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                style={{ padding: '10px 24px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {saveMutation.isPending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                Salvar permissões
              </button>
              <button onClick={() => setPerms(null)} style={{ padding: '10px 16px', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', color: '#52525b' }}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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

  if (configuringMember) {
    return (
      <div style={{ padding: '32px', maxWidth: '900px' }}>
        <PermissionsPanel member={configuringMember} onClose={() => setConfiguringMember(null)} />
      </div>
    )
  }

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#18181b', letterSpacing: '-0.02em' }}>Equipe</h1>
          <p style={{ color: '#a1a1aa', fontSize: '13px', marginTop: '3px' }}>
            {members.length} {members.length === 1 ? 'membro' : 'membros'} na equipe
          </p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(!showForm)}
            style={{ padding: '9px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#16a34a'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#22c55e'}>
            <Plus size={14} /> Adicionar membro
          </button>
        )}
      </div>

      {/* Cards de roles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {ROLES.map(r => {
          const Icon = r.icon
          return (
            <div key={r.value} style={{ background: r.bg, border: `1px solid ${r.border}`, borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                <Icon size={14} color={r.color} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: r.color }}>{r.label}</span>
              </div>
              <p style={{ fontSize: '12px', color: '#71717a', lineHeight: 1.5 }}>{r.desc}</p>
            </div>
          )
        })}
      </div>

      {/* Formulário de adição */}
      {showForm && canManage && (
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '22px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#18181b', letterSpacing: '-0.01em' }}>Adicionar membro</h3>
            <button onClick={() => setShowForm(false)} style={{ background: '#f4f4f5', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '5px', display: 'flex', color: '#71717a' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Nome completo *</label>
              <input style={inputStyle} placeholder="João Silva" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                onFocus={e => e.currentTarget.style.borderColor = '#22c55e'} onBlur={e => e.currentTarget.style.borderColor = '#e4e4e7'} />
            </div>
            <div>
              <label style={labelStyle}>Email *</label>
              <input style={inputStyle} type="email" placeholder="joao@empresa.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                onFocus={e => e.currentTarget.style.borderColor = '#22c55e'} onBlur={e => e.currentTarget.style.borderColor = '#e4e4e7'} />
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Tipo de acesso</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {ROLES.map(r => {
                const Icon = r.icon
                return (
                  <div key={r.value} onClick={() => setForm({ ...form, role: r.value })}
                    style={{ border: `1.5px solid ${form.role === r.value ? r.color : '#e4e4e7'}`, borderRadius: '8px', padding: '12px', cursor: 'pointer', background: form.role === r.value ? r.bg : '#fff', transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <Icon size={13} color={form.role === r.value ? r.color : '#a1a1aa'} />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: form.role === r.value ? r.color : '#18181b' }}>{r.label}</span>
                    </div>
                    <p style={{ fontSize: '11px', color: '#a1a1aa', lineHeight: 1.4 }}>{r.desc}</p>
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
              style={{ padding: '9px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: (!form.name || !form.email) ? 0.5 : 1 }}>
              {inviteMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
              Adicionar e enviar email
            </button>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 16px', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#52525b' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista de membros */}
      {isLoading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}><Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: '#d4d4d8' }} /></div>
      ) : members.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '60px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Users size={22} color="#d4d4d8" />
          </div>
          <p style={{ color: '#a1a1aa', fontSize: '14px', fontWeight: 500 }}>Nenhum membro na equipe ainda</p>
          <p style={{ color: '#d4d4d8', fontSize: '13px', marginTop: '4px' }}>Adicione membros para começar</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {members.map((m: any) => {
            const roleInfo = getRoleInfo(m.role)
            const RoleIcon = roleInfo.icon
            const av = getAvatarColor(m.name)
            const isEditing = editingId === m.id
            const isEditableRole = m.role === 'agent' || m.role === 'supervisor'

            return (
              <div key={m.id} style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', opacity: m.is_active ? 1 : 0.55, boxShadow: '0 1px 3px rgba(0,0,0,.04)', transition: 'box-shadow 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,.07)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,.04)'}>

                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: m.is_active ? av.bg : '#f4f4f5', color: m.is_active ? av.color : '#a1a1aa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
                  {getInitials(m.name)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input style={{ ...inputStyle, maxWidth: '200px', padding: '6px 10px', fontSize: '13px' }} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} autoFocus
                        onFocus={e => e.currentTarget.style.borderColor = '#22c55e'} onBlur={e => e.currentTarget.style.borderColor = '#e4e4e7'} />
                      <select style={{ ...inputStyle, maxWidth: '150px', padding: '6px 10px', fontSize: '13px' }} value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px', color: '#18181b', letterSpacing: '-0.01em' }}>{m.name}</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: roleInfo.bg, color: roleInfo.color, border: `1px solid ${roleInfo.border}`, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <RoleIcon size={10} /> {roleInfo.label}
                        </span>
                        {!m.is_active && <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: '#f4f4f5', color: '#a1a1aa', border: '1px solid #e4e4e7' }}>Inativo</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', color: '#a1a1aa' }}>{m.email}</span>
                        {m.last_login_at && <span style={{ fontSize: '11px', color: '#d4d4d8' }}>Último acesso: {new Date(m.last_login_at).toLocaleDateString('pt-BR')}</span>}
                      </div>
                    </>
                  )}
                </div>

                {canManage && isEditableRole && (
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                    {isEditing ? (
                      <>
                        <button onClick={() => updateMutation.mutate({ id: m.id, data: editForm })} disabled={updateMutation.isPending}
                          style={{ padding: '6px 14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {updateMutation.isPending ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />} Salvar
                        </button>
                        <button onClick={() => setEditingId(null)} style={{ padding: '6px 10px', background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', color: '#52525b', display: 'flex' }}><X size={12} /></button>
                      </>
                    ) : (
                      <>
                        {/* Toggle ativo/inativo */}
                        <button onClick={() => updateMutation.mutate({ id: m.id, data: { is_active: !m.is_active } })} title={m.is_active ? 'Desativar' : 'Reativar'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: m.is_active ? '#22c55e' : '#d4d4d8', borderRadius: '6px' }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#f4f4f5'}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}>
                          {m.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                        </button>
                        {/* Permissões */}
                        <button onClick={() => setConfiguringMember(m)} title="Configurar permissões"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', color: '#a1a1aa', borderRadius: '6px' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f0fdf4'; (e.currentTarget as HTMLButtonElement).style.color = '#22c55e' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa' }}>
                          <Settings size={14} />
                        </button>
                        {/* Editar */}
                        <button onClick={() => startEdit(m)} title="Editar"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', color: '#a1a1aa', borderRadius: '6px' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f4f4f5'; (e.currentTarget as HTMLButtonElement).style.color = '#18181b' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa' }}>
                          <Pencil size={14} />
                        </button>
                        {/* Reset senha */}
                        <button onClick={() => { if (confirm(`Redefinir senha de ${m.name}?`)) resetPasswordMutation.mutate(m.id) }} title="Redefinir senha"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', color: '#a1a1aa', borderRadius: '6px' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fffbeb'; (e.currentTarget as HTMLButtonElement).style.color = '#d97706' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa' }}>
                          <RotateCcw size={14} />
                        </button>
                        {/* Remover */}
                        <button onClick={() => { if (confirm(`Remover ${m.name}?`)) deleteMutation.mutate(m.id) }} title="Remover"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', color: '#a1a1aa', borderRadius: '6px' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#a1a1aa' }}>
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
