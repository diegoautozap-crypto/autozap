'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { tenantApi } from '@/lib/api'
import { toast } from 'sonner'
import {
  LayoutDashboard, Megaphone, Users, MessageSquare, Settings,
  LogOut, Zap as ZapIcon, Radio, FileText, Workflow, Kanban, UserCog, AlertCircle, CheckSquare,
} from 'lucide-react'

const ALL_NAV = [
  { href: '/dashboard',           label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/campaigns', label: 'Campanhas', icon: Megaphone },
  { href: '/dashboard/templates', label: 'Templates',  icon: FileText },
  { href: '/dashboard/contacts',  label: 'CRM',        icon: Users },
  { href: '/dashboard/inbox',     label: 'Inbox',      icon: MessageSquare },
  { href: '/dashboard/pipeline',  label: 'Pipeline',   icon: Kanban },
  { href: '/dashboard/flows',     label: 'Flows',      icon: Workflow },
  { href: '/dashboard/tasks',     label: 'Tarefas',    icon: CheckSquare },
  { href: '/dashboard/channels',  label: 'Canais',     icon: Radio },
  { href: '/dashboard/team',      label: 'Equipe',     icon: UserCog },
  { href: '/dashboard/errors',    label: 'Erros',      icon: AlertCircle },
  { href: '/dashboard/settings',  label: 'Plano',      icon: Settings },
]

const ADMIN_PAGES = ALL_NAV.map(n => n.href)

const ROLE_LABEL: Record<string, string> = {
  owner: 'WhatsApp CRM', admin: 'WhatsApp CRM', supervisor: 'Supervisor', agent: 'Atendente',
}

function UsageBar() {
  const [sent, setSent]   = useState(0)
  const [limit, setLimit] = useState<number | null>(null)
  const [pct, setPct]     = useState(0)

  useEffect(() => {
    tenantApi.get('/tenant/usage').then(({ data }) => {
      const { sent, limit, percentUsed } = data.data
      setSent(sent); setLimit(limit); setPct(percentUsed || 0)
    }).catch(() => {})
  }, [])

  const isWarning = pct > 80
  const color = isWarning ? '#f97316' : '#22c55e'

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>Uso do mês</span>
        <span style={{ fontSize: '11px', color, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>{sent.toLocaleString()} msgs</span>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>{limit ? limit.toLocaleString() : '∞'}</span>
      </div>
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const { logout, user, updateUser } = useAuthStore()
  const roleFromStore = (user as any)?.role || 'agent'

  const [allowedPages, setAllowedPages] = useState<string[] | null>(null)
  const [currentRole, setCurrentRole]   = useState<string>(roleFromStore)
  const currentRoleRef                  = useRef<string>(roleFromStore)
  const isAdmin = currentRole === 'admin' || currentRole === 'owner'

  const fetchPermissions = useCallback(async () => {
    if (!user) return
    try {
      const token = localStorage.getItem('accessToken')
      const res   = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { setAllowedPages(prev => prev ?? ['/dashboard/inbox']); return }
      const json      = await res.json()
      const freshRole = json?.data?.role || roleFromStore
      if (freshRole !== currentRoleRef.current) {
        currentRoleRef.current = freshRole; updateUser({ role: freshRole }); window.location.reload(); return
      }
      if (freshRole === 'admin' || freshRole === 'owner') { setAllowedPages(ADMIN_PAGES); return }
      const perms = json?.data?.permissions
      if (perms?.allowed_pages?.length > 0) {
        const pages = perms.allowed_pages.includes('/dashboard/inbox') ? perms.allowed_pages : ['/dashboard/inbox', ...perms.allowed_pages]
        setAllowedPages(pages)
      } else { setAllowedPages(['/dashboard/inbox']) }
    } catch { setAllowedPages(prev => prev ?? ['/dashboard/inbox']) }
  }, [user, roleFromStore])

  useEffect(() => {
    fetchPermissions()
    const interval = setInterval(fetchPermissions, 5_000)
    return () => clearInterval(interval)
  }, [fetchPermissions])

  useEffect(() => {
    if (allowedPages === null || isAdmin) return
    const ok = allowedPages.some(p => p === '/dashboard' ? pathname === '/dashboard' : pathname === p || pathname.startsWith(p + '/'))
    if (!ok) { toast.error('Você não tem permissão para acessar essa página'); router.replace('/dashboard/inbox') }
  }, [allowedPages, isAdmin, router, pathname])

  const nav = ALL_NAV.filter(item => isAdmin ? true : (allowedPages || []).includes(item.href))

  const handleLogout = async () => {
    await logout(); toast.success('Até logo!'); router.push('/login')
  }

  return (
    <aside style={{
      width: '220px',
      background: '#161b27',
      borderRight: 'none',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px',
            background: '#22c55e',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <ZapIcon size={16} color="#fff" fill="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff', letterSpacing: '-0.02em' }}>AutoZap</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '1px' }}>
              {ROLE_LABEL[currentRole] || 'WhatsApp CRM'}
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '4px 8px', overflowY: 'auto' }}>
        {!isAdmin && allowedPages === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: '36px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', opacity: 1 - i * 0.2 }} />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {nav.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
              const isError  = href === '/dashboard/errors'

              return (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '9px 12px', borderRadius: '8px',
                    width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: isActive
                      ? isError ? 'rgba(239,68,68,0.15)' : '#22c55e'
                      : 'transparent',
                    color: isActive
                      ? isError ? '#f87171' : '#fff'
                      : isError ? '#f87171' : 'rgba(255,255,255,0.5)',
                    fontSize: '13.5px',
                    fontWeight: isActive ? 600 : 400,
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      const el = e.currentTarget as HTMLButtonElement
                      el.style.background = 'rgba(255,255,255,0.06)'
                      el.style.color = isError ? '#f87171' : 'rgba(255,255,255,0.85)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      const el = e.currentTarget as HTMLButtonElement
                      el.style.background = 'transparent'
                      el.style.color = isError ? '#f87171' : 'rgba(255,255,255,0.5)'
                    }
                  }}
                >
                  <Icon size={15} strokeWidth={isActive ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        )}
      </nav>

      {isAdmin && <UsageBar />}

      {/* Logout */}
      <div style={{ padding: '8px 8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 12px', borderRadius: '8px',
            width: '100%', border: 'none', cursor: 'pointer',
            background: 'transparent',
            color: 'rgba(255,255,255,0.35)',
            fontSize: '13.5px', fontWeight: 400,
            transition: 'all 0.12s ease',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'rgba(239,68,68,0.1)'
            el.style.color = '#f87171'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'transparent'
            el.style.color = 'rgba(255,255,255,0.35)'
          }}
        >
          <LogOut size={15} strokeWidth={1.8} />
          <span>Sair</span>
        </button>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:.2} }
      `}</style>
    </aside>
  )
}
