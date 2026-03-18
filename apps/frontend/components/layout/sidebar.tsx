'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { tenantApi } from '@/lib/api'
import { toast } from 'sonner'
import { LayoutDashboard, Megaphone, Users, MessageSquare, Zap, Settings, LogOut, Zap as ZapIcon } from 'lucide-react'

const nav = [
  { href: '/dashboard',             label: 'Dashboard',  icon: LayoutDashboard, color: '#25d366' },
  { href: '/dashboard/campaigns',   label: 'Campanhas',  icon: Megaphone,        color: '#3b82f6' },
  { href: '/dashboard/contacts',    label: 'CRM',        icon: Users,            color: '#7c3aed' },
  { href: '/dashboard/inbox',       label: 'Inbox',      icon: MessageSquare,    color: '#25d366' },
  { href: '/dashboard/automations', label: 'Automações', icon: Zap,              color: '#ec4899' },
  { href: '/dashboard/settings',    label: 'Plano',      icon: Settings,         color: '#f59e0b' },
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

  const barColor = pct > 80 ? '#f97316' : '#25d366'
  const glowColor = pct > 80 ? 'rgba(249,115,22,0.4)' : 'rgba(37,211,102,0.4)'

  return (
    <div style={{
      margin: '8px 12px',
      padding: '12px 14px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '10px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Uso do mês
        </span>
        <span style={{ color: barColor, fontSize: '11px', fontWeight: 700 }}>
          {pct}%
        </span>
      </div>
      <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
          borderRadius: '2px',
          boxShadow: `0 0 8px ${glowColor}`,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px' }}>
          {sent.toLocaleString()} enviadas
        </span>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px' }}>
          {limit ? limit.toLocaleString() : '∞'}
        </span>
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
      width: '220px',
      background: '#080810',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      flexShrink: 0,
      position: 'relative',
    }}>

      {/* Glow top */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(37,211,102,0.4), transparent)',
      }} />

      {/* Logo */}
      <div style={{
        padding: '20px 16px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{
          width: '32px', height: '32px',
          background: 'linear-gradient(135deg, #25d366, #1fba58)',
          borderRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 16px rgba(37,211,102,0.4)',
          flexShrink: 0,
        }}>
          <ZapIcon size={16} color="#fff" fill="#fff" />
        </div>
        <div>
          <div style={{
            color: '#fff',
            fontWeight: 700,
            fontSize: '15px',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}>
            Auto<span style={{
              background: 'linear-gradient(135deg, #25d366, #7c3aed)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>Zap</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', marginTop: '2px', letterSpacing: '0.05em' }}>
            PLATAFORMA
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
        {nav.map(({ href, label, icon: Icon, color }) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link key={href} href={href} style={{ textDecoration: 'none', display: 'block', marginBottom: '2px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                position: 'relative',
                background: isActive
                  ? `linear-gradient(135deg, ${color}18, ${color}08)`
                  : 'transparent',
                border: isActive
                  ? `1px solid ${color}30`
                  : '1px solid transparent',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.45)',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)'
                  ;(e.currentTarget as HTMLDivElement).style.color = 'rgba(255,255,255,0.8)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                  ;(e.currentTarget as HTMLDivElement).style.color = 'rgba(255,255,255,0.45)'
                }
              }}
              >
                {/* Active indicator */}
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    left: 0, top: '50%',
                    transform: 'translateY(-50%)',
                    width: '3px', height: '16px',
                    background: color,
                    borderRadius: '0 2px 2px 0',
                    boxShadow: `0 0 8px ${color}`,
                  }} />
                )}

                {/* Icon with glow when active */}
                <div style={{
                  width: '28px', height: '28px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '6px',
                  background: isActive ? `${color}20` : 'transparent',
                  flexShrink: 0,
                }}>
                  <Icon size={15} color={isActive ? color : 'currentColor'} />
                </div>

                <span>{label}</span>
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Usage bar */}
      <UsageBar />

      {/* Logout */}
      <div style={{ padding: '8px 10px 16px' }}>
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 12px', borderRadius: '8px',
            width: '100%', background: 'none',
            border: '1px solid transparent',
            color: 'rgba(255,255,255,0.35)',
            fontSize: '13px', cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.2)'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#ef4444'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'none'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'
            ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.35)'
          }}
        >
          <div style={{
            width: '28px', height: '28px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '6px',
            flexShrink: 0,
          }}>
            <LogOut size={15} />
          </div>
          <span>Sair</span>
        </button>
      </div>
    </aside>
  )
}
