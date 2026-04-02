'use client'

interface AutoZapLogoProps {
  variant?: 'dark' | 'light' | 'green' | 'white'
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
}

const sizes = {
  sm: { icon: 24, text: 18, gap: 6 },
  md: { icon: 32, text: 24, gap: 8 },
  lg: { icon: 44, text: 32, gap: 10 },
}

const variants = {
  dark: { icon: '#4ADE80', text: '#ffffff' },
  light: { icon: '#15803D', text: '#14532D' },
  green: { icon: '#14532D', text: '#14532D' },
  white: { icon: '#16A34A', text: '#0D0D0D' },
}

export function AutoZapLogo({ variant = 'dark', size = 'md', showText = true }: AutoZapLogoProps) {
  const s = sizes[size]
  const v = variants[variant]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: s.gap }}>
      <svg viewBox="0 0 44 52" fill="none" style={{ height: s.icon, width: 'auto' }}>
        <path d="M4 44 L18 8 L26 8 L32 26 L25 26 L28 44Z" fill={v.icon} opacity="0.15"/>
        <path d="M18 8 L26 8 L34 44 L27 44Z" fill={v.icon} opacity="0.25"/>
        <path d="M23 26 L28 8 L34 26Z" fill={v.icon}/>
        <path d="M28 8 L34 26 L34 44 L40 44Z" fill={v.icon} opacity="0.5"/>
      </svg>
      {showText && (
        <span style={{ fontSize: s.text, fontWeight: 700, color: v.text, letterSpacing: '-0.02em' }}>
          AutoZap
        </span>
      )}
    </div>
  )
}
