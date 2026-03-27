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
  { href: '/dashboard/templates', label: 'Templates',  icon: FileText },
  { href: '/dashboard/contacts',  label: 'CRM',        icon: Users },
  { href: '/dashboard/inbox',     label: 'Inbox',      icon: MessageSquare },
  { href: '/dashboard/pipeline',  label: 'Pipeline',   icon: Kanban },
  { href: '/dashboard/flows',     label: 'Flows',      icon: Workflow },
  { href: '/dashboard/channels',  label: 'Canais',     icon: Radio },
  { href: '/dashboard/team',      label: 'Equipe',     icon: UserCog },
  { href: '/dashboard/errors',    label: 'Erros',      icon: AlertCircle },
  { href: '/dashboard/settings',  label: 'Plano',      icon: Settings },
]

const ADMIN_PAGES = ALL_NAV.map(n => n.href)

const ROLE_LABEL: Record<string, string> = {
  owner:      'WhatsApp CRM',
  admin:      'WhatsApp CRM',
  supervisor: 'Supervisor',
  agent:      'Atendente',
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
  const color     = isWarning ? '#f97316' : '#16a34a'

  return (
    <div style={{ padding: '14px 16px', borderTop: '1px solid #F1F3F7' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: '#9CA5B3', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Uso mensal</span>
        <span style={{ fontSize: '12px', color, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: '3px', background: '#F1F3F7', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${color}, ${color}dd)`, borderRadius: '99px', transition: 'width 0.6s cubic-bezier(.4,0,.2,1)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
        <span style={{ fontSize: '11px', color: '#BCC3CE' }}>{sent.toLocaleString()} msgs</span>
        <span style={{ fontSize: '11px', color: '#BCC3CE' }}>{limit ? limit.toLocaleString() : '∞'}</span>
      </div>
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const { logout, user, updateUser } = useAuthStore()
  const roleFromStore = (user as any)?.role || 'agent'

  const [allowedPages, setAllowedPages]   = useState<string[] | null>(null)
  const [currentRole, setCurrentRole]     = useState<string>(roleFromStore)
  const currentRoleRef                    = useRef<string>(roleFromStore)

  const isAdmin = currentRole === 'admin' || currentRole === 'owner'

  const fetchPermissions = useCallback(async () => {
    if (!user) return
    try {
      const token = localStorage.getItem('accessToken')
      const res   = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { setAllowedPages(prev => prev ?? ['/dashboard/inbox']); return }
      const json      = await res.json()
      const freshRole = json?.data?.role || roleFromStore
      if (freshRole !== currentRoleRef.current) {
        currentRoleRef.current = freshRole
        updateUser({ role: freshRole })
        window.location.reload()
        return
      }
      if (freshRole === 'admin' || freshRole === 'owner') { setAllowedPages(ADMIN_PAGES); return }
      const perms = json?.data?.permissions
      if (perms?.allowed_pages?.length > 0) {
        const pages = perms.allowed_pages.includes('/dashboard/inbox')
          ? perms.allowed_pages
          : ['/dashboard/inbox', ...perms.allowed_pages]
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
    const currentAllowed = allowedPages.some(page => {
      if (page === '/dashboard') return pathname === '/dashboard'
      return pathname === page || pathname.startsWith(page + '/')
    })
    if (!currentAllowed) {
      toast.error('Você não tem permissão para acessar essa página')
      router.replace('/dashboard/inbox')
    }
  }, [allowedPages, isAdmin, router, pathname])

  const nav = ALL_NAV.filter(item => isAdmin ? true : (allowedPages || []).includes(item.href))

  const handleLogout = async () => {
    await logout()
    toast.success('Até logo!')
    router.push('/login')
  }

  const userName = (user as any)?.name || (user as any)?.email?.split('@')[0] || 'Usuário'
  const userInitial = userName.charAt(0).toUpperCase()

  return (
    <aside style={{
      width: '224px',
      background: '#FFFFFF',
      borderRight: '1px solid #ECEEF2',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      flexShrink: 0,
      boxShadow: '1px 0 0 0 #ECEEF2',
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 18px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px', height: '34px',
            background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 8px rgba(22,163,74,0.3)',
          }}>
            <ZapIcon size={16} color="#fff" fill="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '15px', color: '#0F1623', letterSpacing: '-0.02em', lineHeight: 1.1 }}>AutoZap</div>
            <div style={{ fontSize: '10.5px', color: '#9CA5B3', marginTop: '2px', fontWeight: 500, letterSpacing: '0.01em' }}>
              {ROLE_LABEL[currentRole] || 'WhatsApp CRM'}
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: '#F1F3F7', margin: '0 18px 8px' }} />

      {/* Nav */}
      <nav style={{ flex: 1, padding: '4px 10px', overflowY: 'auto' }}>
        {!isAdmin && allowedPages === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px 0' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: '36px', borderRadius: '8px', background: '#F4F5F8', opacity: 1 - i * 0.15 }} className="skeleton-pulse" />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {nav.map(({ href, label, icon: Icon }) => {
              const isActive  = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
              const isErrors  = href === '/dashboard/errors'
              const activeClr = isErrors ? '#dc2626' : '#16a34a'
              const activeBg  = isErrors ? '#FEF2F2' : '#F0FDF4'

              return (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '9px',
                    padding: '8px 10px', borderRadius: '8px',
                    width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: isActive ? activeBg : 'transparent',
                    color: isActive ? activeClr : '#5C6474',
                    fontSize: '13px',
                    fontWeight: isActive ? 600 : 450,
                    transition: 'all 0.12s ease',
                    position: 'relative',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.background = '#F4F5F8'
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#0F1623'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#5C6474'
                    }
                  }}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div style={{
                      position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                      width: '3px', height: '18px', background: activeClr,
                      borderRadius: '0 3px 3px 0',
                    }} />
                  )}
                  <Icon
                    size={15}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    style={{ flexShrink: 0 }}
                  />
                  <span style={{ letterSpacing: '-0.005em' }}>{label}</span>
                </button>
              )
            })}
          </div>
        )}
      </nav>

      {/* Usage bar (admin only) */}
      {isAdmin && <UsageBar />}

      {/* User + Logout */}
      <div style={{ padding: '10px 10px 14px', borderTop: '1px solid #F1F3F7' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 8px', borderRadius: '8px', marginBottom: '2px', background: '#F8F9FC' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'linear-gradient(135deg, #16a34a22, #16a34a44)',
            border: '1px solid #16a34a33',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: 700, color: '#16a34a', flexShrink: 0,
          }}>
            {userInitial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F1623', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</div>
            <div style={{ fontSize: '10.5px', color: '#9CA5B3', fontWeight: 500, marginTop: '1px' }}>{ROLE_LABEL[currentRole] || 'Usuário'}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: '9px',
            padding: '7px 10px', borderRadius: '8px',
            width: '100%', border: 'none', cursor: 'pointer',
            background: 'transparent', color: '#9CA5B3',
            fontSize: '12.5px', fontWeight: 500,
            transition: 'all 0.12s ease',
          }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#dc2626'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#9CA5B3'
          }}
        >
          <LogOut size={14} strokeWidth={1.8} />
          <span>Sair</span>
        </button>
      </div>

      <style>{`
        .skeleton-pulse { animation: skeletonPulse 1.6s ease-in-out infinite; }
        @keyframes skeletonPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 0.25; } }
      `}</style>
    </aside>
  )
}
