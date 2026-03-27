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

const T = {
  bg:       '#0A0A0B',
  surface:  '#111113',
  surface2: '#18181B',
  border:   '#1F1F23',
  border2:  '#2A2A30',
  text:     '#FAFAFA',
  muted:    '#71717A',
  subtle:   '#3F3F46',
  accent:   '#22C55E',
  accentGlow: 'rgba(34,197,94,0.15)',
}

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
  owner: 'Owner', admin: 'Admin', supervisor: 'Supervisor', agent: 'Atendente',
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
  const color = isWarning ? '#F59E0B' : T.accent

  return (
    <div style={{ padding: '12px 14px', borderTop: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '7px', alignItems: 'center' }}>
        <span style={{ fontSize: '10px', color: T.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Uso mensal</span>
        <span style={{ fontSize: '11px', color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
      </div>
      <div style={{ height: '2px', background: T.border2, borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.6s ease', boxShadow: `0 0 6px ${color}66` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
        <span style={{ fontSize: '10px', color: T.subtle, fontVariantNumeric: 'tabular-nums' }}>{sent.toLocaleString()}</span>
        <span style={{ fontSize: '10px', color: T.subtle }}>{limit ? limit.toLocaleString() : '∞'}</span>
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
    if (!ok) { toast.error('Sem permissão'); router.replace('/dashboard/inbox') }
  }, [allowedPages, isAdmin, router, pathname])

  const nav = ALL_NAV.filter(item => isAdmin ? true : (allowedPages || []).includes(item.href))

  const handleLogout = async () => {
    await logout(); toast.success('Até logo!'); router.push('/login')
  }

  const userName    = (user as any)?.name || (user as any)?.email?.split('@')[0] || 'Usuário'
  const userInitial = userName.charAt(0).toUpperCase()

  return (
    <aside style={{
      width: '220px',
      background: T.surface,
      borderRight: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column',
      height: '100%', flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '30px', height: '30px',
            background: T.accent,
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: `0 0 12px ${T.accentGlow}`,
          }}>
            <ZapIcon size={15} color="#000" fill="#000" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', color: T.text, letterSpacing: '-0.03em', lineHeight: 1.1 }}>AutoZap</div>
            <div style={{ fontSize: '10px', color: T.muted, marginTop: '2px', fontWeight: 500, letterSpacing: '0.01em' }}>
              {ROLE_LABEL[currentRole] || 'WhatsApp CRM'}
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
        {!isAdmin && allowedPages === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '4px 0' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: '34px', borderRadius: '7px', background: T.surface2, opacity: 1 - i * 0.25 }} className="sk" />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {nav.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
              const isError  = href === '/dashboard/errors'
              const activeClr = isError ? '#F87171' : T.accent
              const activeBg  = isError ? 'rgba(239,68,68,0.08)' : T.accentGlow

              return (
                <button key={href} onClick={() => router.push(href)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '9px',
                    padding: '8px 10px', borderRadius: '7px',
                    width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: isActive ? activeBg : 'transparent',
                    color: isActive ? activeClr : T.muted,
                    fontSize: '13px', fontWeight: isActive ? 600 : 400,
                    transition: 'all 0.1s ease', letterSpacing: '-0.01em',
                    position: 'relative',
                  }}
                  onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = T.surface2; (e.currentTarget as HTMLButtonElement).style.color = T.text } }}
                  onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = T.muted } }}
                >
                  {isActive && (
                    <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: '2px', height: '16px', background: activeClr, borderRadius: '0 2px 2px 0', boxShadow: `0 0 6px ${activeClr}88` }} />
                  )}
                  <Icon size={14} strokeWidth={isActive ? 2.2 : 1.8} style={{ flexShrink: 0 }} />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        )}
      </nav>

      {isAdmin && <UsageBar />}

      {/* Footer */}
      <div style={{ padding: '8px 8px 12px', borderTop: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px', borderRadius: '8px', background: T.surface2, border: `1px solid ${T.border}`, marginBottom: '4px' }}>
          <div style={{
            width: '26px', height: '26px', borderRadius: '7px',
            background: T.accentGlow, border: `1px solid ${T.accent}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700, color: T.accent, flexShrink: 0,
          }}>
            {userInitial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{userName}</div>
            <div style={{ fontSize: '10px', color: T.muted, fontWeight: 500, marginTop: '1px' }}>{ROLE_LABEL[currentRole] || 'Usuário'}</div>
          </div>
        </div>
        <button onClick={handleLogout}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', width: '100%', border: 'none', cursor: 'pointer', background: 'transparent', color: T.subtle, fontSize: '12.5px', fontWeight: 500, transition: 'all 0.1s ease', letterSpacing: '-0.01em' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = '#F87171' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = T.subtle }}>
          <LogOut size={13} strokeWidth={1.8} />
          <span>Sair</span>
        </button>
      </div>

      <style>{`
        .sk { animation: skp 1.4s ease-in-out infinite; }
        @keyframes skp { 0%,100%{opacity:.5} 50%{opacity:.15} }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.border2}; border-radius: 99px; }
      `}</style>
    </aside>
  )
}
