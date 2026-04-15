'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { contactApi, messageApi, conversationApi } from '@/lib/api'
import { Search, Users, Workflow, Layout, MessageSquare, Megaphone, Tag, Settings as SettingsIcon, Zap, Command } from 'lucide-react'

type Item = {
  id: string
  icon: any
  label: string
  sub?: string
  href: string
  group: 'page' | 'contact' | 'flow' | 'campaign'
}

const STATIC_PAGES: Item[] = [
  { id: 'p-dash',      icon: Layout,         label: 'Dashboard',   href: '/dashboard',             group: 'page' },
  { id: 'p-inbox',     icon: MessageSquare,  label: 'Inbox',       href: '/dashboard/inbox',       group: 'page' },
  { id: 'p-pipeline',  icon: Workflow,       label: 'Pipeline',    href: '/dashboard/pipeline',    group: 'page' },
  { id: 'p-contacts',  icon: Users,          label: 'Contatos',    href: '/dashboard/contacts',    group: 'page' },
  { id: 'p-campaigns', icon: Megaphone,      label: 'Campanhas',   href: '/dashboard/campaigns',   group: 'page' },
  { id: 'p-flows',     icon: Zap,            label: 'Flows',       href: '/dashboard/flows',       group: 'page' },
  { id: 'p-tasks',     icon: Tag,            label: 'Tarefas',     href: '/dashboard/tasks',       group: 'page' },
  { id: 'p-team',      icon: Users,          label: 'Equipe',      href: '/dashboard/team',        group: 'page' },
  { id: 'p-settings',  icon: SettingsIcon,   label: 'Configurações', href: '/dashboard/settings',  group: 'page' },
]

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Item[]>(STATIC_PAGES)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Atalho global
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus ao abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setActiveIdx(0)
    } else {
      setQ('')
    }
  }, [open])

  // Busca dinâmica
  useEffect(() => {
    if (!open) return
    const query = q.trim().toLowerCase()
    if (!query) {
      setItems(STATIC_PAGES)
      return
    }
    const pages = STATIC_PAGES.filter(p => p.label.toLowerCase().includes(query))
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const [contactsRes, flowsRes, campaignsRes] = await Promise.allSettled([
          contactApi.get(`/contacts?search=${encodeURIComponent(query)}&limit=5`),
          messageApi.get('/flows'),
          conversationApi.get('/campaigns').catch(() => ({ data: { data: [] } })),
        ])
        if (cancelled) return
        const contactItems: Item[] = []
        if (contactsRes.status === 'fulfilled') {
          const list = (contactsRes.value.data?.data || []) as any[]
          for (const c of list.slice(0, 5)) {
            contactItems.push({
              id: `c-${c.id}`, icon: Users,
              label: c.name || c.phone || 'Contato',
              sub: c.phone,
              href: `/dashboard/inbox?contactId=${c.id}`,
              group: 'contact',
            })
          }
        }
        const flowItems: Item[] = []
        if (flowsRes.status === 'fulfilled') {
          const list = (flowsRes.value.data?.data || []) as any[]
          for (const f of list) {
            if ((f.name || '').toLowerCase().includes(query)) {
              flowItems.push({ id: `f-${f.id}`, icon: Zap, label: f.name, sub: f.is_active ? 'Ativo' : 'Inativo', href: `/dashboard/flows/${f.id}`, group: 'flow' })
            }
          }
        }
        const campItems: Item[] = []
        if (campaignsRes.status === 'fulfilled') {
          const list = ((campaignsRes.value as any).data?.data || []) as any[]
          for (const c of list) {
            if ((c.name || '').toLowerCase().includes(query)) {
              campItems.push({ id: `camp-${c.id}`, icon: Megaphone, label: c.name, sub: c.status, href: `/dashboard/campaigns`, group: 'campaign' })
            }
          }
        }
        if (!cancelled) setItems([...pages, ...contactItems.slice(0, 5), ...flowItems.slice(0, 5), ...campItems.slice(0, 3)])
      } catch { if (!cancelled) setItems(pages) }
    }, 180)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, open])

  // Navegação teclado
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, items.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[activeIdx]
        if (item) { router.push(item.href); setOpen(false) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, items, activeIdx, router])

  if (!open) return null

  const groupLabels: Record<string, string> = {
    page: 'Páginas',
    contact: 'Contatos',
    flow: 'Fluxos',
    campaign: 'Campanhas',
  }
  const grouped: Record<string, Item[]> = {}
  items.forEach(it => { (grouped[it.group] ||= []).push(it) })
  const groupOrder: Array<'page' | 'contact' | 'flow' | 'campaign'> = ['page', 'contact', 'flow', 'campaign']
  let runningIdx = -1

  return (
    <div onClick={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 9999, paddingTop: '15vh' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '560px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Search size={16} color="var(--text-faint)" />
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setActiveIdx(0) }}
            placeholder="Buscar contatos, flows, páginas..."
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '15px', color: 'var(--text)' }} />
          <span style={{ fontSize: '10px', color: 'var(--text-faint)', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'monospace' }}>ESC</span>
        </div>
        <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '6px' }}>
          {items.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px' }}>Nada encontrado</div>
          ) : (
            groupOrder.map(group => {
              const list = grouped[group] || []
              if (list.length === 0) return null
              return (
                <div key={group} style={{ marginBottom: '6px' }}>
                  <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {groupLabels[group]}
                  </div>
                  {list.map(it => {
                    runningIdx++
                    const isActive = runningIdx === activeIdx
                    const Icon = it.icon
                    return (
                      <div key={it.id}
                        onClick={() => { router.push(it.href); setOpen(false) }}
                        onMouseEnter={() => setActiveIdx(runningIdx)}
                        style={{ padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', background: isActive ? 'var(--bg-input)' : 'transparent' }}>
                        <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon size={13} color="var(--text-muted)" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</div>
                          {it.sub && <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{it.sub}</div>}
                        </div>
                        {isActive && <span style={{ fontSize: '10px', color: 'var(--text-faint)', padding: '2px 6px', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'monospace' }}>↵</span>}
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: '14px', fontSize: '10px', color: 'var(--text-faint)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Command size={10} /> K pra abrir
          </span>
          <span>↑↓ navegar</span>
          <span>↵ selecionar</span>
        </div>
      </div>
    </div>
  )
}
