'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { tenantApi } from '@/lib/api'
import { toast } from 'sonner'
import { LayoutDashboard, Megaphone, Users, MessageSquare, Zap, Settings, LogOut, Zap as ZapIcon } from 'lucide-react'

const nav = [
  { href: '/dashboard',             label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/dashboard/campaigns',   label: 'Campanhas',  icon: Megaphone },
  { href: '/dashboard/contacts',    label: 'CRM',        icon: Users },
  { href: '/dashboard/inbox',       label: 'Inbox',      icon: MessageSquare },
  { href: '/dashboard/automations', label: 'Automações', icon: Zap },
  { href: '/dashboard/settings',    label: 'Plano',      icon: Settings },
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

  const isWarning = pct > 80
  const barColor = isWarning ? '#f97316' : '#a3e635'
  const glowColor = isWarning ? 'rgba(249,115,22,0.5)' : 'rgba(163,230,53,0.5)'

  return (
    <div style={{
      margin: '6px 10px 4px',
      padding: '12px',
      background: 'rgba(163,230,53,0.04)',
      border: '1px solid rgba(163,230,53,0.12)',
      borderRadius: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '7px' }}>
        <span style={{
          color: 'rgba(232,255,224,0.4)', fontSize: '10px',
          fontFamily: 'Rajdhani, sans-serif',
          letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600,
        }}>
          USO DO MÊS
        </span>
        <span style={{ color: barColor, fontSize: '11px', fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: barColor,
          borderRadius: '2px',
          boxShadow: `0 0 6px ${glowColor}`,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
        <span style={{ color: 'rgba(232,255,224,0.3)', fontSize: '10px' }}>{sent.toLocaleString()}</span>
        <span style={{ color: 'rgba(232,255,224,0.3)', fontSize: '10px' }}>{limit ? limit.toLocaleString() : '∞'}</span>
      </div>
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { logout } = useAuthStore()

  const handleLogout = async () => {
    await logout()
    toast.success('Até logo!')
    router.push('/login')
  }

  return (
    <aside style={{
      width: '215px',
      background: 'linear-gradient(180deg, #040d07 0%, #050e08 100%)',
      borderRight: '1px solid rgba(163,230,53,0.1)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      flexShrink: 0,
      position: 'relative',
      zIndex: 10,
    }}>

      {/* Top neon line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
        background: 'linear-gradient(90deg, transparent 0%, #a3e635 50%, transparent 100%)',
        boxShadow: '0 0 8px rgba(163,230,53,0.6)',
      }} />

      {/* Vertical light ray */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: 0, width: '1px',
        background: 'linear-gradient(180deg, rgba(163,230,53,0.3) 0%, rgba(163,230,53,0.05) 50%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* Logo */}
      <div style={{
        padding: '18px 14px 16px',
        borderBottom: '1px solid rgba(163,230,53,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Logo icon */}
          <div style={{
            width: '36px', height: '36px',
            background: 'linear-gradient(135deg, #a3e635, #4d7c0f)',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px rgba(163,230,53,0.5), 0 0 32px rgba(163,230,53,0.2)',
            flexShrink: 0,
            animation: 'float 4s ease-in-out infinite',
          }}>
            <ZapIcon size={18} color="#050e08" fill="#050e08" />
          </div>

          <div>
            <div style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 700,
              fontSize: '18px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              lineHeight: 1,
              color: '#a3e635',
              textShadow: '0 0 12px rgba(163,230,53,0.6)',
            }}>
              AutoZap
            </div>
            <div style={{
              color: 'rgba(163,230,53,0.4)',
              fontSize: '9px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginTop: '2px',
              fontFamily: 'Rajdhani, sans-serif',
            }}>
              WhatsApp CRM
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
        {nav.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link key={href} href={href} style={{ textDecoration: 'none', display: 'block', marginBottom: '2px' }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  background: isActive ? 'rgba(163,230,53,0.1)' : 'transparent',
                  border: isActive ? '1px solid rgba(163,230,53,0.25)' : '1px solid transparent',
                  color: isActive ? '#a3e635' : 'rgba(232,255,224,0.45)',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? 'inset 0 0 20px rgba(163,230,53,0.05)' : 'none',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(163,230,53,0.06)'
                    ;(e.currentTarget as HTMLDivElement).style.color = 'rgba(232,255,224,0.8)'
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                    ;(e.currentTarget as HTMLDivElement).style.color = 'rgba(232,255,224,0.45)'
                  }
                }}
              >
                {/* Active left bar */}
                {isActive && (
                  <div style={{
                    position: 'absolute', left: 0, top: '50%',
                    transform: 'translateY(-50%)',
                    width: '3px', height: '16px',
                    background: '#a3e635',
                    borderRadius: '0 2px 2px 0',
                    boxShadow: '0 0 8px rgba(163,230,53,0.8), 0 0 16px rgba(163,230,53,0.4)',
                  }} />
                )}

                {/* Icon */}
                <div style={{
                  width: '28px', height: '28px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '6px',
                  background: isActive ? 'rgba(163,230,53,0.15)' : 'transparent',
                  flexShrink: 0,
                }}>
                  <Icon size={15} color={isActive ? '#a3e635' : 'currentColor'} />
                </div>

                <span>{label}</span>

                {/* Active pulsing dot */}
                {isActive && (
                  <div style={{
                    marginLeft: 'auto',
                    width: '5px', height: '5px',
                    borderRadius: '50%',
                    background: '#a3e635',
                    animation: 'pulse-neon 2s ease-in-out infinite',
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
      <div style={{ padding: '6px 8px 18px' }}>
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 12px', borderRadius: '8px',
            width: '100%', background: 'none',
            border: '1px solid transparent',
            color: 'rgba(232,255,224,0.3)',
            fontSize: '13px', cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'rgba(239,68,68,0.08)'
            el.style.borderColor = 'rgba(239,68,68,0.2)'
            el.style.color = '#f87171'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'none'
            el.style.borderColor = 'transparent'
            el.style.color = 'rgba(232,255,224,0.3)'
          }}
        >
          <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', flexShrink: 0 }}>
            <LogOut size={15} />
          </div>
          <span>Sair</span>
        </button>
      </div>
    </aside>
  )
}
