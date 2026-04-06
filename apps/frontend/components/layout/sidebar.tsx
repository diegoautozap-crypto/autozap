'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { tenantApi } from '@/lib/api'
import { toast } from 'sonner'
import {
  LayoutDashboard, Megaphone, Users, MessageSquare, Settings,
  LogOut, Radio, FileText, Workflow, Kanban, UserCog, AlertCircle, CheckSquare, Menu, X as XIcon, ShoppingBag, Calendar,
} from 'lucide-react'
import { AutoZapLogo } from '@/components/ui/AutoZapLogo'
import { useI18nStore, useT, LOCALES } from '@/lib/i18n'

const ALL_NAV = [
  { href: '/dashboard',           labelKey: 'nav.dashboard',  icon: LayoutDashboard },
  { href: '/dashboard/campaigns', labelKey: 'nav.campaigns',  icon: Megaphone },
  { href: '/dashboard/templates', labelKey: 'nav.templates',  icon: FileText },
  { href: '/dashboard/contacts',  labelKey: 'nav.contacts',   icon: Users },
  { href: '/dashboard/inbox',     labelKey: 'nav.inbox',      icon: MessageSquare },
  { href: '/dashboard/pipeline',    labelKey: 'nav.pipeline',    icon: Kanban },
  { href: '/dashboard/scheduling', labelKey: 'nav.scheduling', icon: Calendar },
  { href: '/dashboard/products',   labelKey: 'nav.products',   icon: ShoppingBag },
  { href: '/dashboard/flows',     labelKey: 'nav.flows',      icon: Workflow },
  { href: '/dashboard/tasks',     labelKey: 'nav.tasks',      icon: CheckSquare },
  { href: '/dashboard/channels',  labelKey: 'nav.channels',   icon: Radio },
  { href: '/dashboard/team',      labelKey: 'nav.team',       icon: UserCog },
  { href: '/dashboard/errors',    labelKey: 'nav.errors',     icon: AlertCircle },
  { href: '/dashboard/settings',  labelKey: 'nav.settings',   icon: Settings },
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
  const t = useT()
  const { locale, setLocale } = useI18nStore()

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
    const interval = setInterval(fetchPermissions, 30_000)
    return () => clearInterval(interval)
  }, [fetchPermissions])

  useEffect(() => {
    if (allowedPages === null || isAdmin) return
    const ok = allowedPages.some(p => p === '/dashboard' ? pathname === '/dashboard' : pathname === p || pathname.startsWith(p + '/'))
    if (!ok) { toast.error('Você não tem permissão para acessar essa página'); router.replace('/dashboard/inbox') }
  }, [allowedPages, isAdmin, router, pathname])

  const nav = ALL_NAV.filter(item => isAdmin ? true : (allowedPages || []).includes(item.href))

  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = async () => {
    await logout(); toast.success('Até logo!'); router.push('/login')
  }

  // Fecha sidebar ao navegar no mobile
  useEffect(() => { setMobileOpen(false) }, [pathname])

  return (
    <>
    {/* Botão hamburger mobile */}
    <button className="sidebar-hamburger" onClick={() => setMobileOpen(true)}
      style={{ position: 'fixed', top: '12px', left: '12px', zIndex: 1100, background: '#161b27', border: 'none', borderRadius: '8px', padding: '8px', cursor: 'pointer', display: 'none', color: '#fff' }}>
      <Menu size={20} />
    </button>
    {/* Overlay mobile */}
    {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1199, display: 'none' }} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`} style={{
      width: '220px',
      background: '#161b27',
      borderRight: 'none',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <AutoZapLogo variant="dark" size="md" showText={false} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '6px' }}>
          <span style={{ fontSize: '16px', fontWeight: 500, color: '#fff', letterSpacing: '-0.3px' }}>AutoZap</span>
          <span style={{ fontSize: '10px', fontWeight: 400, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.05em', marginTop: '1px' }}>WhatsApp CRM</span>
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
            {nav.map(({ href, labelKey, icon: Icon }) => {
              const label = t(labelKey)
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

      {/* Idioma */}
      <div style={{ padding: '4px 8px' }}>
        <select value={locale} onChange={e => setLocale(e.target.value as any)}
          style={{ width: '100%', padding: '7px 4px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: 500, outline: 'none', appearance: 'none', textAlign: 'center' }}>
          {LOCALES.map(l => <option key={l.code} value={l.code} style={{ background: '#161b27', color: '#fff' }}>{l.label}</option>)}
        </select>
      </div>

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
          <span>{t('nav.logout')}</span>
        </button>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:.2} }
        @media (max-width: 768px) {
          .sidebar-hamburger { display: flex !important; }
          .sidebar-overlay { display: block !important; }
          .sidebar {
            position: fixed !important;
            left: -260px;
            top: 0;
            z-index: 1200;
            transition: left 0.25s ease;
            height: 100vh !important;
          }
          .sidebar.sidebar-open { left: 0; }
        }
      `}</style>
    </aside>
    </>
  )
}
