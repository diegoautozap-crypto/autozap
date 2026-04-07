'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { conversationApi, authApi } from '@/lib/api'
import { toast } from 'sonner'
import {
  CheckSquare, Plus, Trash2, Loader2, Calendar, AlertTriangle,
  User, Clock, X, Flag, Pencil, UserCheck,
} from 'lucide-react'
import { useT } from '@/lib/i18n'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Task {
  id: string
  tenant_id: string
  conversation_id: string | null
  contact_id: string | null
  assigned_to: string | null
  created_by: string | null
  title: string
  description: string | null
  due_date: string | null
  status: 'pending' | 'completed'
  priority: 'low' | 'medium' | 'high'
  completed_at: string | null
  created_at: string
  updated_at: string
  conversations?: { id: string; contacts: { id: string; name: string; phone: string } } | null
}

interface TaskSummary {
  pending: number
  overdue: number
  today: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDateLocal(dateStr: string): Date {
  // Parse as local date to avoid UTC timezone shift (e.g. "2026-04-02" parsed as UTC becomes Apr 1 in BRT)
  const parts = dateStr.slice(0, 10).split('-')
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  const due = parseDateLocal(dueDate)
  const now = new Date()
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return due < todayMidnight
}

function isToday(dueDate: string | null): boolean {
  if (!dueDate) return false
  const due = parseDateLocal(dueDate)
  const now = new Date()
  return due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function dueDateColor(dueDate: string | null, status: string): string {
  if (status === 'completed') return 'var(--text-faint)'
  if (!dueDate) return 'var(--text-faint)'
  if (isOverdue(dueDate)) return '#ef4444'
  if (isToday(dueDate)) return '#f59e0b'
  return 'var(--text-faint)'
}

function priorityConfig(p: string, t: (key: string) => string): { label: string; bg: string; color: string } {
  if (p === 'high') return { label: t('tasks.priorityHigh'), bg: '#fef2f2', color: '#dc2626' }
  if (p === 'medium') return { label: t('tasks.priorityMedium'), bg: '#fffbeb', color: '#d97706' }
  return { label: t('tasks.priorityLow'), bg: 'var(--bg)', color: 'var(--text-muted)' }
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '14px', outline: 'none', color: 'var(--text)',
  transition: 'border-color 0.15s, background 0.15s',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: 'pointer', appearance: 'auto' as any,
}

// ─── Filters ─────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'pending' | 'overdue' | 'today' | 'completed'

// ─── Component ───────────────────────────────────────────────────────────────

export default function TasksPage() {
  const t = useT()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<FilterTab>('all')

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: t('tasks.all') },
    { key: 'pending', label: t('tasks.pending') },
    { key: 'overdue', label: t('tasks.overdue') },
    { key: 'today', label: t('tasks.today') },
    { key: 'completed', label: t('tasks.completed') },
  ]
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Task form (create + edit)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [newAssignedTo, setNewAssignedTo] = useState('')

  const openCreateModal = () => { setEditingTask(null); setNewTitle(''); setNewDescription(''); setNewDueDate(''); setNewPriority('medium'); setNewAssignedTo(''); setShowModal(true) }
  const openEditModal = (task: Task) => { setEditingTask(task); setNewTitle(task.title); setNewDescription(task.description || ''); setNewDueDate(task.due_date ? task.due_date.slice(0, 10) : ''); setNewPriority(task.priority); setNewAssignedTo(task.assigned_to || ''); setShowModal(true) }

  // ── Queries ──────────────────────────────────────────────────────────────

  const apiStatus = activeTab === 'completed' ? 'completed' : activeTab === 'all' ? 'all' : 'pending'

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', apiStatus],
    queryFn: async () => {
      const { data } = await conversationApi.get(`/tasks?status=${apiStatus}`)
      return data.data || []
    },
  })

  const { data: summary } = useQuery<TaskSummary>({
    queryKey: ['tasks-summary'],
    queryFn: async () => {
      const { data } = await conversationApi.get('/tasks/summary')
      return data.data || { pending: 0, overdue: 0, today: 0 }
    },
  })

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => { const { data } = await authApi.get('/auth/team'); return data.data || [] },
  })

  // ── Client-side filtering ────────────────────────────────────────────────

  const filteredTasks = tasks.filter((t) => {
    if (activeTab === 'all') return true
    if (activeTab === 'pending') return t.status === 'pending'
    if (activeTab === 'completed') return t.status === 'completed'
    if (activeTab === 'overdue') return t.status === 'pending' && isOverdue(t.due_date)
    if (activeTab === 'today') return t.status === 'pending' && isToday(t.due_date)
    return true
  })

  // ── Mutations ────────────────────────────────────────────────────────────

  const toggleMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === 'pending' ? 'completed' : 'pending'
      await conversationApi.patch(`/tasks/${id}`, { status: newStatus })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-summary'] })
    },
    onError: () => toast.error(t('tasks.toastUpdateError')),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await conversationApi.delete(`/tasks/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-summary'] })
      toast.success(t('tasks.toastRemoved'))
    },
    onError: () => toast.error(t('tasks.toastRemoveError')),
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: any = { title: newTitle, priority: newPriority }
      if (newDescription.trim()) body.description = newDescription
      if (newDueDate) body.dueDate = new Date(newDueDate + 'T23:59:00').toISOString()
      if (newAssignedTo) body.assignedTo = newAssignedTo
      await conversationApi.post('/tasks', body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-summary'] })
      toast.success(t('tasks.toastCreated'))
      setShowModal(false)
    },
    onError: () => toast.error(t('tasks.toastCreateError')),
  })

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingTask) return
      const body: any = { title: newTitle, priority: newPriority, assignedTo: newAssignedTo || null }
      if (newDescription.trim()) body.description = newDescription
      else body.description = null
      if (newDueDate) body.dueDate = new Date(newDueDate + 'T23:59:00').toISOString()
      else body.dueDate = null
      await conversationApi.patch(`/tasks/${editingTask.id}`, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['tasks-summary'] })
      toast.success('Tarefa atualizada')
      setShowModal(false)
    },
    onError: () => toast.error('Erro ao atualizar tarefa'),
  })

  // ── Tab counts ───────────────────────────────────────────────────────────

  function tabCount(key: FilterTab): number | undefined {
    if (!summary) return undefined
    if (key === 'all') return (summary.pending || 0) + (tasks.filter(t => t.status === 'completed').length || 0)
    if (key === 'pending') return summary.pending
    if (key === 'overdue') return summary.overdue
    if (key === 'today') return summary.today
    return undefined
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="mobile-page" style={{ padding: '28px 32px', maxWidth: '960px', margin: '0 auto' }}>

      {/* Header */}
      <div className="mobile-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckSquare size={20} color="#22c55e" />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('tasks.title')}</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-faint)', margin: 0 }}>
              {t('tasks.subtitle')}
            </p>
          </div>
        </div>
        <button
          className="mobile-header-actions"
          onClick={openCreateModal}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '9px 18px', borderRadius: '10px',
            background: '#22c55e', color: '#fff',
            border: 'none', fontSize: '14px', fontWeight: 600,
            cursor: 'pointer', transition: 'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#16a34a')}
          onMouseLeave={e => (e.currentTarget.style.background = '#22c55e')}
        >
          <Plus size={16} /> {t('tasks.new')}
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '20px',
        background: 'var(--bg)', borderRadius: '10px', padding: '4px',
      }}>
        {filterTabs.map(tab => {
          const active = activeTab === tab.key
          const count = tabCount(tab.key)
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: '8px',
                border: 'none', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
                background: active ? 'var(--bg-card)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--text-muted)',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {tab.label}
              {count !== undefined && (
                <span style={{
                  marginLeft: '6px', fontSize: '11px', fontWeight: 700,
                  padding: '1px 6px', borderRadius: '10px',
                  background: active ? '#f0fdf4' : 'var(--border)',
                  color: active ? '#22c55e' : 'var(--text-muted)',
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Task list */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: '14px',
        border: '1px solid var(--border)', overflow: 'hidden',
      }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '60px 0', color: 'var(--text-faint)' }}>
            <Loader2 size={20} className="animate-spin" /> {t('tasks.loading')}
          </div>
        ) : filteredTasks.length === 0 ? (
          /* Empty state */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text-faint)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <CheckSquare size={26} color="var(--text-faintest)" />
            </div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 4px' }}>
              {activeTab === 'completed' ? t('tasks.completedNone') :
               activeTab === 'overdue' ? t('tasks.overdueNone') :
               activeTab === 'today' ? t('tasks.todayNone') :
               t('tasks.noTasks')}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-faint)', margin: 0 }}>
              {activeTab === 'overdue' ? t('tasks.allClear') : t('tasks.createFirst')}
            </p>
          </div>
        ) : (
          filteredTasks.map((task, idx) => {
            const completed = task.status === 'completed'
            const overdue = !completed && isOverdue(task.due_date)
            const todayTask = !completed && isToday(task.due_date)
            const prio = priorityConfig(task.priority, t)
            const contactName = task.conversations?.contacts?.name || null
            const hovered = hoveredId === task.id

            return (
              <div
                key={task.id}
                onMouseEnter={() => setHoveredId(task.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '14px 20px',
                  borderBottom: idx < filteredTasks.length - 1 ? '1px solid var(--divider)' : 'none',
                  background: hovered ? 'var(--bg-card-hover)' : completed ? 'var(--bg-input)' : overdue ? '#fffbfb' : 'var(--bg-card)',
                  transition: 'background 0.1s',
                }}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleMutation.mutate({ id: task.id, status: task.status })}
                  style={{
                    width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                    border: `2px solid ${completed ? '#22c55e' : overdue ? '#ef4444' : 'var(--text-faintest)'}`,
                    background: completed ? '#22c55e' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', padding: 0, transition: 'all 0.15s',
                  }}
                >
                  {completed && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '14px', fontWeight: 500, color: completed ? 'var(--text-faint)' : 'var(--text)',
                      textDecoration: completed ? 'line-through' : 'none',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: '400px',
                    }}>
                      {task.title}
                    </span>

                    {/* Priority badge */}
                    <span style={{
                      fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                      borderRadius: '6px', background: prio.bg, color: prio.color,
                    }}>
                      {prio.label}
                    </span>

                    {/* Overdue badge */}
                    {overdue && (
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: '3px',
                        fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                        borderRadius: '6px', background: '#fef2f2', color: '#dc2626',
                      }}>
                        <AlertTriangle size={11} /> {t('tasks.overdueBadge')}
                      </span>
                    )}
                  </div>

                  {/* Meta row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '4px' }}>
                    {contactName && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        <User size={12} /> {contactName}
                      </span>
                    )}
                    {task.due_date && (
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        fontSize: '12px', color: dueDateColor(task.due_date, task.status),
                        fontWeight: (overdue || todayTask) ? 600 : 400,
                      }}>
                        <Calendar size={12} />
                        {todayTask ? t('tasks.todayBadge') : formatDate(task.due_date)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions (on hover) */}
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {task.assigned_to && (
                    <span style={{ fontSize: '11px', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: '3px', marginRight: '4px' }}>
                      <UserCheck size={11} /> {(teamMembers as any[]).find((m: any) => m.id === task.assigned_to)?.name?.split(' ')[0] || ''}
                    </span>
                  )}
                  <button onClick={() => openEditModal(task)}
                    style={{ padding: '6px', borderRadius: '6px', border: 'none', background: hovered ? '#eff6ff' : 'transparent', color: hovered ? '#2563eb' : 'transparent', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => { if (confirm(t('tasks.confirmDelete'))) deleteMutation.mutate(task.id) }}
                    style={{ padding: '6px', borderRadius: '6px', border: 'none', background: hovered ? '#fef2f2' : 'transparent', color: hovered ? '#ef4444' : 'transparent', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── New Task Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            className="mobile-modal"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', borderRadius: '16px', padding: '28px',
              width: '460px', maxWidth: '95vw',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            }}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{editingTask ? 'Editar tarefa' : t('tasks.modalTitle')}</h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ padding: '4px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '6px', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Title */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#52525b', marginBottom: '5px' }}>
                {t('tasks.titleLabel')}
              </label>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder={t('tasks.titlePlaceholder')}
                style={inputStyle}
                autoFocus
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#52525b', marginBottom: '5px' }}>
                {t('tasks.descriptionLabel')}
              </label>
              <textarea
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                placeholder={t('tasks.descriptionPlaceholder')}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            {/* Due date + priority row */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '22px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#52525b', marginBottom: '5px' }}>
                  {t('tasks.dueDate')}
                </label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={e => setNewDueDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#52525b', marginBottom: '5px' }}>
                  {t('tasks.priority')}
                </label>
                <select
                  value={newPriority}
                  onChange={e => setNewPriority(e.target.value as any)}
                  style={selectStyle}
                >
                  <option value="low">{t('tasks.priorityLow')}</option>
                  <option value="medium">{t('tasks.priorityMedium')}</option>
                  <option value="high">{t('tasks.priorityHigh')}</option>
                </select>
              </div>
            </div>

            {/* Assign to */}
            <div style={{ marginBottom: '22px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#52525b', marginBottom: '5px' }}>
                Delegar a
              </label>
              <select value={newAssignedTo} onChange={e => setNewAssignedTo(e.target.value)} style={selectStyle}>
                <option value="">Sem responsável</option>
                {(teamMembers as any[]).filter((m: any) => m.is_active).map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: '9px 18px', borderRadius: '10px',
                  background: 'var(--bg)', color: '#52525b',
                  border: 'none', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                disabled={!newTitle.trim() || createMutation.isPending || editMutation.isPending}
                onClick={() => editingTask ? editMutation.mutate() : createMutation.mutate()}
                style={{
                  padding: '9px 24px', borderRadius: '10px',
                  background: !newTitle.trim() ? 'var(--text-faintest)' : '#22c55e',
                  color: '#fff', border: 'none', fontSize: '14px', fontWeight: 600,
                  cursor: !newTitle.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'background 0.15s', opacity: createMutation.isPending ? 0.7 : 1,
                }}
              >
                {(createMutation.isPending || editMutation.isPending) && <Loader2 size={14} className="animate-spin" />}
                {editingTask ? 'Salvar' : t('tasks.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
