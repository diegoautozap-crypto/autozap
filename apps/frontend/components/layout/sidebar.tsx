'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { tenantApi } from '@/lib/api'
import { toast } from 'sonner'
import {
  LayoutDashboard, Megaphone, Users, MessageSquare, Settings,
  LogOut, Zap as ZapIcon, Radio, FileText, Workflow, Kanban, UserCog, AlertCircle,
} from 'lucide-react'

const ALL_NAV = [
  { href: '/dashboard',           label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/campaigns', label: 'Campanhas', icon: Megaphone },
  { href: '/dashboard/templates', label: 'Templates', icon: FileText },
  { href: '/dashboard/contacts',  label: 'CRM',       icon: Users },
  { href: '/dashboard/inbox',     label: 'Inbox',     icon: MessageSquare },
  { href: '/dashboard/pipeline',  label: 'Pipeline',  icon: Kanban },
  { href: '/dashboard/flows',     label: 'Flows',     icon: Workflow },
  { href: '/dashboard/channels',  label: 'Canais',    icon: Radio },
  { href: '/dashboard/team',      label: 'Equipe',    icon: UserCog },
  { href: '/dashboard/errors',    label: 'Erros',     icon: AlertCircle },
  { href: '/dashboard/settings',  label: 'Plano',     icon: Settings },
]

const ADMIN_PAGES = ALL_NAV.map(n => n.href)

const ROLE_LABEL: Record<string, string> = {
  owner: 'WhatsApp CRM',
  admin: 'WhatsApp CRM',
  supervisor: 'Supervisor',
  agent: 'Atendente',
}

function UsageBar() {
  const [sent, setSent] = useState(0)
  const [limit, setLimit] = useState<number | null>(null)
  const [pct, setPct] = useState(0)

  useEffect(() => {
    tenantApi.get('/tenant/usage').then(({ data }) => {
      const { sent, limit, percentUsed } = data.data
      setSent(sent); setLimit(limit); setPct(percentUsed || 0)
    }).catch(() => {})
  }, [])

  const isWarning = pct > 80
  const color = isWarning ? '#f97316' : '#16a34a'

  return (
    <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 500 }}>Uso do mês</span>
        <span style={{ fontSize: '12px', color, fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{ height: '4px', background: '#f3f4f6', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
        <span style={{ fontSize: '11px', color: '#d1d5db' }}>{sent.toLocaleString()} Mensagens</span>
        <span style={{ fontSize: '11px', color: '#d1d5db' }}>{limit ? limit.toLocaleString() : '∞'}</span>
      </div>
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { logout, user } = useAuthStore()
  const roleFromStore = (user as any)?.role || 'agent'

  const [allowedPages, setAllowedPages] = useState<string[] | null>(null)
  const [currentRole, setCurrentRole] = useState<string>(roleFromStore)
  const currentRoleRef = useRef<string>(roleFromStore)

  const isAdmin = currentRole === 'admin' || currentRole === 'owner'

  const fetchPermissions = useCallback(async () => {
    if (!user) return

    try {
      const token = localStorage.getItem('accessToken')
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        setAllowedPages(prev => prev ?? ['/dashboard/inbox'])
        return
      }

      const json = await res.json()
      const freshRole = json?.data?.role || roleFromStore

      // Se o role mudou, recarrega a página automaticamente
      if (freshRole !== currentRoleRef.current) {
        currentRoleRef.current = freshRole
        setCurrentRole(freshRole)
        window.location.reload()
        return
      }

      // Admin e owner têm acesso total
      if (freshRole === 'admin' || freshRole === 'owner') {
        setAllowedPages(ADMIN_PAGES)
        return
      }

      const perms = json?.data?.permissions
      if (perms?.allowed_pages?.length > 0) {
        const pages = perms.allowed_pages.includes('/dashboard/inbox')
          ? perms.allowed_pages
          : ['/dashboard/inbox', ...perms.allowed_pages]
        setAllowedPages(pages)
      } else {
        setAllowedPages(['/dashboard/inbox'])
      }
    } catch {
      setAllowedPages(prev => prev ?? ['/dashboard/inbox'])
    }
  }, [user, roleFromStore])

  useEffect(() => {
    fetchPermissions()
    const interval = setInterval(fetchPermissions, 5_000)
    return () => clearInterval(interval)
  }, [fetchPermissions])

  // Guard — bloqueia acesso a páginas não permitidas
  useEffect(() => {
    if (allowedPages === null || isAdmin) return
    const currentAllowed = allowedPages.some(page => {
      if (page === '/dashboard') return pathname === '/dashboard'
      return pathname === page || pathname.startsWith(page + '/')
    })
    if (!currentAllowed) {
      toast.error('Você não tem permissão para acessar essa página')
      router.replace('/dashboard/inbox')
    }
  }, [allowedPages, isAdmin, router, pathname])

  const nav = ALL_NAV.filter(item =>
    isAdmin ? true : (allowedPages || []).includes(item.href)
  )

  const handleLogout = async () => {
    await logout()
    toast.success('Até logo!')
    router.push('/login')
  }

  return (
    <aside style={{
      width: '220px', background: '#ffffff',
      borderRight: '1px solid #e5e7eb', display: 'flex',
      flexDirection: 'column', height: '100%', flexShrink: 0,
    }}>
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', background: '#16a34a', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ZapIcon size={16} color="#fff" fill="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#111827', letterSpacing: '-0.01em' }}>AutoZap</div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '1px' }}>{ROLE_LABEL[currentRole] || 'WhatsApp CRM'}</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
        {!isAdmin && allowedPages === null ? (
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: '36px', borderRadius: '6px', background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        ) : (
          nav.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            const isErrors = href === '/dashboard/errors'
            return (
              <button key={href} onClick={() => router.push(href)}
                style={{ display: 'block', marginBottom: '1px', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 10px', borderRadius: '6px', background: isActive ? (isErrors ? '#fef2f2' : '#f0fdf4') : 'transparent', color: isActive ? (isErrors ? '#ef4444' : '#16a34a') : (isErrors ? '#ef4444' : '#6b7280'), fontSize: '13.5px', fontWeight: isActive ? 600 : 400, transition: 'all 0.1s ease' }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = isErrors ? '#fef2f2' : '#f9fafb' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                >
                  <Icon size={15} strokeWidth={isActive ? 2.5 : 1.8} />
                  <span>{label}</span>
                  {isActive && <div style={{ marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', background: isErrors ? '#ef4444' : '#16a34a' }} />}
                </div>
              </button>
            )
          })
        )}
      </nav>

      {isAdmin && <UsageBar />}

      <div style={{ padding: '8px 8px 16px', borderTop: '1px solid #f3f4f6' }}>
        <button
          onClick={handleLogout}
          style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 10px', borderRadius: '6px', width: '100%', background: 'none', border: 'none', color: '#9ca3af', fontSize: '13.5px', cursor: 'pointer', transition: 'all 0.1s ease' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af' }}
        >
          <LogOut size={15} strokeWidth={1.8} />
          <span>Sair</span>
        </button>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </aside>
  )
}
