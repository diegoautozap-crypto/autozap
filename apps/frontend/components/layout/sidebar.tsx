'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import { LayoutDashboard, Megaphone, Users, MessageSquare, Zap, Settings, LogOut, Zap as ZapIcon } from 'lucide-react'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/campaigns', label: 'Campanhas', icon: Megaphone },
  { href: '/dashboard/contacts', label: 'CRM', icon: Users },
  { href: '/dashboard/inbox', label: 'Inbox', icon: MessageSquare },
  { href: '/dashboard/automations', label: 'Automações', icon: Zap },
  { href: '/dashboard/settings', label: 'Plano', icon: Settings },
]

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
      width: '200px',
      background: 'var(--sidebar-bg)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #ffffff10',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ZapIcon size={20} color="#25d366" fill="#25d366" />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '16px' }}>AutoZap</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {nav.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link key={href} href={href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '6px',
                marginBottom: '2px', cursor: 'pointer',
                background: isActive ? '#25d366' : 'transparent',
                color: isActive ? '#fff' : 'var(--sidebar-text)',
                fontSize: '14px', fontWeight: isActive ? 600 : 400,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'var(--sidebar-hover)' }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <Icon size={16} />
                <span>{label}</span>
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div style={{ padding: '12px 8px', borderTop: '1px solid #ffffff10' }}>
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 12px', borderRadius: '6px',
            width: '100%', background: 'none', border: 'none',
            color: 'var(--sidebar-text)', fontSize: '14px', cursor: 'pointer',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--sidebar-hover)'}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
        >
          <LogOut size={16} />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  )
}
