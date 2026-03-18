'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { tenantApi } from '@/lib/api'
import { toast } from 'sonner'
import { LayoutDashboard, Megaphone, Users, MessageSquare, Zap, Settings, LogOut, Zap as ZapIcon } from 'lucide-react'

const nav = [
  { href: '/dashboard',             label: 'Dashboard',  icon: LayoutDashboard, neon: '#00ff88', glow: 'rgba(0,255,136,0.3)' },
  { href: '/dashboard/campaigns',   label: 'Campanhas',  icon: Megaphone,       neon: '#00c3ff', glow: 'rgba(0,195,255,0.3)' },
  { href: '/dashboard/contacts',    label: 'CRM',        icon: Users,           neon: '#bf5fff', glow: 'rgba(191,95,255,0.3)' },
  { href: '/dashboard/inbox',       label: 'Inbox',      icon: MessageSquare,   neon: '#00ff88', glow: 'rgba(0,255,136,0.3)' },
  { href: '/dashboard/automations', label: 'Automações', icon: Zap,             neon: '#ff3cac', glow: 'rgba(255,60,172,0.3)' },
  { href: '/dashboard/settings',    label: 'Plano',      icon: Settings,        neon: '#ff9900', glow: 'rgba(255,153,0,0.3)' },
]

function UsageBar() {
  const [sent, setSent] = useState(0)
  const [limit, setLimit] = useState<number | null>(null)
  const [pct, setPct] = useState(0)

  useEffect(() => {
    tenantApi.get('/tenant/usage').then(({ data }) => {
      const { sent, limit, percentUsed } = data.data
      setSent(sent)
      setLimit(limit)
      setPct(percentUsed || 0)
    }).catch(() => {})
  }, [])

  const neon = pct > 80 ? '#ff9900' : '#00ff88'
  const glow = pct > 80 ? 'rgba(255,153,0,0.4)' : 'rgba(0,255,136,0.4)'

  return (
    <div style={{
      margin: '6px 10px',
      padding: '12px 14px',
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${neon}22`,
      borderRadius: '12px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle top glow line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
        background: `linear-gradient(90deg, transparent, ${neon}60, transparent)`,
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Syne, sans-serif' }}>
          Uso do mês
        </span>
        <span style={{ color: neon, fontSize: '11px', fontWeight: 700, textShadow: `0 0 8px ${glow}` }}>
          {pct}%
        </span>
      </div>

      <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: `linear-gradient(90deg, ${neon}, ${neon}aa)`,
          borderRadius: '2px',
          boxShadow: `0 0 10px ${glow}, 0 0 20px ${glow}`,
          transition: 'width 0.6s ease',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px' }}>{sent.toLocaleString()} msgs</span>
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px' }}>{limit ? limit.toLocaleString() : '∞'}</span>
      </div>
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { logout } = useAuthStore()
  const [hoveredHref, setHoveredHref] = useState<string | null>(null)

  const handleLogout = async () => {
    await logout()
    toast.success('Até logo!')
    router.push('/login')
  }

  return (
    <aside style={{
      width: '220px',
      background: 'linear-gradient(180deg, #07071a 0%, #05050f 100%)',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      flexShrink: 0,
      position: 'relative',
      zIndex: 10,
    }}>

      {/* Animated top border */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
        background: 'linear-gradient(90deg, transparent 0%, #00ff88 50%, transparent 100%)',
        animation: 'pulse-glow 3s ease-in-out infinite',
      }} />

      {/* Logo */}
      <div style={{
        padding: '22px 16px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Animated logo icon */}
          <div style={{
            width: '36px', height: '36px',
            background: 'linear-gradient(135deg, #00ff88, #00c3ff)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(0,255,136,0.5), 0 0 40px rgba(0,255,136,0.2)',
            flexShrink: 0,
            animation: 'float 4s ease-in-out infinite',
          }}>
            <ZapIcon size={18} color="#000" fill="#000" />
          </div>

          <div>
            <div style={{
              fontFamily: 'Syne, sans-serif',
              fontWeight: 800,
              fontSize: '17px',
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}>
              <span style={{ color: '#fff' }}>Auto</span>
              <span style={{
                background: 'linear-gradient(135deg, #00ff88, #00c3ff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>Zap</span>
            </div>
            <div style={{
              color: 'rgba(255,255,255,0.25)',
              fontSize: '9px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginTop: '2px',
              fontFamily: 'Syne, sans-serif',
            }}>
              WhatsApp CRM
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
        {nav.map(({ href, label, icon: Icon, neon, glow }) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          const isHovered = hoveredHref === href

          return (
            <Link key={href} href={href} style={{ textDecoration: 'none', display: 'block', marginBottom: '3px' }}>
              <div
                onMouseEnter={() => setHoveredHref(href)}
                onMouseLeave={() => setHoveredHref(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  background: isActive
                    ? `${neon}12`
                    : isHovered ? 'rgba(255,255,255,0.05)' : 'transparent',
                  border: isActive
                    ? `1px solid ${neon}35`
                    : '1px solid transparent',
                  color: isActive ? '#fff' : isHovered ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.2s ease',
                  boxShadow: isActive ? `0 0 16px ${neon}15, inset 0 0 16px ${neon}05` : 'none',
                }}
              >
                {/* Active neon left bar */}
                {isActive && (
                  <div style={{
                    position: 'absolute', left: 0, top: '50%',
                    transform: 'translateY(-50%)',
                    width: '3px', height: '18px',
                    background: neon,
                    borderRadius: '0 3px 3px 0',
                    boxShadow: `0 0 10px ${glow}, 0 0 20px ${glow}`,
                  }} />
                )}

                {/* Hover shimmer */}
                {(isActive || isHovered) && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: `radial-gradient(ellipse at 0% 50%, ${neon}08, transparent 70%)`,
                    pointerEvents: 'none',
                  }} />
                )}

                {/* Icon */}
                <div style={{
                  width: '30px', height: '30px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '8px',
                  background: isActive ? `${neon}20` : 'transparent',
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                  boxShadow: isActive ? `0 0 12px ${glow}` : 'none',
                }}>
                  <Icon size={15} color={isActive ? neon : isHovered ? 'rgba(255,255,255,0.7)' : 'currentColor'} />
                </div>

                <span style={{ position: 'relative', zIndex: 1 }}>{label}</span>

                {/* Active dot */}
                {isActive && (
                  <div style={{
                    marginLeft: 'auto',
                    width: '5px', height: '5px',
                    borderRadius: '50%',
                    background: neon,
                    boxShadow: `0 0 6px ${glow}`,
                    animation: 'pulse-glow 2s ease-in-out infinite',
                  }} />
                )}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Usage */}
      <UsageBar />

      {/* Logout */}
      <div style={{ padding: '6px 8px 20px' }}>
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 12px', borderRadius: '10px',
            width: '100%', background: 'none',
            border: '1px solid transparent',
            color: 'rgba(255,255,255,0.3)',
            fontSize: '13px', cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'rgba(255,60,60,0.08)'
            el.style.borderColor = 'rgba(255,60,60,0.25)'
            el.style.color = '#ff4444'
            el.style.boxShadow = '0 0 12px rgba(255,60,60,0.1)'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'none'
            el.style.borderColor = 'transparent'
            el.style.color = 'rgba(255,255,255,0.3)'
            el.style.boxShadow = 'none'
          }}
        >
          <div style={{
            width: '30px', height: '30px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '8px', flexShrink: 0,
          }}>
            <LogOut size={15} />
          </div>
          <span>Sair</span>
        </button>
      </div>
    </aside>
  )
}
