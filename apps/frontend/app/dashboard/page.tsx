'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { campaignApi, conversationApi, contactApi, tenantApi, channelApi, authApi } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n'
import {
  Megaphone, Users, MessageSquare, Send, ArrowUpRight, TrendingUp,
  CheckCheck, Eye, Radio, FileText, Zap, ChevronRight, Check,
  Clock, UserCheck, Workflow, X, Trophy, Printer,
  AlertTriangle, Target, DollarSign,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth.store'
import { GridSkeleton } from '@/components/ui/skeleton'

function getGreeting(t: (key: string) => string) {
  const h = new Date().getHours()
  if (h < 12) return t('dashboard.goodMorning')
  if (h < 18) return t('dashboard.goodAfternoon')
  return t('dashboard.goodEvening')
}

function formatResponseTime(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function OnboardingBanner({ channels, templates, campaigns }: { channels: any[]; templates: any[]; campaigns: any[] }) {
  const router = useRouter()
  const t = useT()
  const steps = [
    { id: 'channel',  label: t('dashboard.onboarding.connectChannel'), desc: t('dashboard.onboarding.connectChannelDesc'), icon: Radio,    done: channels.length > 0,  href: '/dashboard/channels',  btnLabel: t('dashboard.onboarding.configureChannel') },
    { id: 'template', label: t('dashboard.onboarding.registerTemplate'),       desc: t('dashboard.onboarding.registerTemplateDesc'),        icon: FileText, done: templates.length > 0, href: '/dashboard/templates', btnLabel: t('dashboard.onboarding.registerTemplate') },
    { id: 'campaign', label: t('dashboard.onboarding.createFirstCampaign'), desc: t('dashboard.onboarding.createFirstCampaignDesc'), icon: Megaphone, done: campaigns.length > 0, href: '/dashboard/campaigns', btnLabel: t('dashboard.onboarding.createCampaign') },
  ]
  const completedCount = steps.filter(s => s.done).length
  if (completedCount === steps.length) return null
  const pct = Math.round((completedCount / steps.length) * 100)

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Zap size={15} color="#22c55e" fill="#22c55e" />
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>{t('dashboard.onboarding.title')}</h3>
            <span style={{ fontSize: '11px', fontWeight: 600, background: '#f0fdf4', color: '#15803d', padding: '2px 8px', borderRadius: '99px', border: '1px solid #bbf7d0' }}>{completedCount}/{steps.length} {t('dashboard.onboarding.completed')}</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-faint)' }}>{t('dashboard.onboarding.subtitle')}</p>
        </div>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#22c55e' }}>{pct}%</span>
      </div>
      <div style={{ height: '4px', background: 'var(--bg)', borderRadius: '99px', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#22c55e', borderRadius: '99px', transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
        {steps.map((step, idx) => {
          const Icon = step.icon
          const isNext = !step.done && steps.slice(0, idx).every(s => s.done)
          return (
            <div key={step.id} style={{ border: `1px solid ${step.done ? '#bbf7d0' : isNext ? '#22c55e' : 'var(--border)'}`, borderRadius: '10px', padding: '14px', background: step.done ? '#f0fdf4' : 'var(--bg-card)', opacity: !step.done && !isNext ? 0.55 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: step.done ? '#dcfce7' : isNext ? '#f0fdf4' : 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {step.done ? <Check size={15} color="#22c55e" /> : <Icon size={15} color={isNext ? '#22c55e' : 'var(--text-faint)'} />}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: step.done ? '#15803d' : 'var(--text)', margin: '0 0 2px', letterSpacing: '-0.01em' }}>{step.label}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '0 0 10px', lineHeight: 1.5 }}>{step.desc}</p>
                  {!step.done && (
                    <button onClick={() => router.push(step.href)} disabled={!isNext}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', background: isNext ? '#22c55e' : 'var(--bg)', color: isNext ? '#fff' : 'var(--text-faint)', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: isNext ? 'pointer' : 'not-allowed' }}>
                      {step.btnLabel} {isNext && <ChevronRight size={12} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function hexToRgba(hex: string, alpha: number) {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function MetricCard({ label, value, sub, icon: Icon, color, bg, href, onClick }: any) {
  const softShadow = `0 1px 3px ${hexToRgba(color, 0.06)}, 0 1px 2px rgba(0,0,0,.03)`
  const hoverShadow = `0 10px 24px ${hexToRgba(color, 0.12)}, 0 2px 4px ${hexToRgba(color, 0.06)}`
  return (
    <div onClick={onClick}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', cursor: 'pointer', transition: 'all 0.2s cubic-bezier(.4,0,.2,1)', boxShadow: softShadow, position: 'relative', overflow: 'hidden' }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = hoverShadow; el.style.transform = 'translateY(-2px)'; el.style.borderColor = hexToRgba(color, 0.3) }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = softShadow; el.style.transform = 'translateY(0)'; el.style.borderColor = 'var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div style={{
          width: '38px', height: '38px', borderRadius: '10px',
          background: `linear-gradient(135deg, ${hexToRgba(color, 0.12)}, ${hexToRgba(color, 0.22)})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `inset 0 0 0 1px ${hexToRgba(color, 0.15)}`,
        }}>
          <Icon size={18} color={color} strokeWidth={2.2} />
        </div>
        <ArrowUpRight size={13} color="var(--text-faintest)" />
      </div>
      <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: '4px', fontVariantNumeric: 'tabular-nums' }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{sub}</div>
    </div>
  )
}

function DonutChart({ segments, size = 160, thickness = 22, centerLabel, centerValue }: {
  segments: { label: string; value: number; color: string }[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string | number
}) {
  const nonZero = segments.filter(s => s.value > 0)
  const total = nonZero.reduce((s, seg) => s + seg.value, 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  // Gap pequeno entre fatias (só se tiver mais de 1 segmento)
  const gap = nonZero.length > 1 ? 3 : 0
  const totalGap = gap * nonZero.length
  const usable = circumference - totalGap
  let offset = 0

  if (total === 0) {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: `${thickness}px solid var(--bg-input)`, boxSizing: 'border-box', color: 'var(--text-faintest)', fontSize: '12px' }}>
        Sem dados
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--bg-input)" strokeWidth={thickness} />
        {nonZero.map((seg, i) => {
          const length = (seg.value / total) * usable
          const el = (
            <circle key={i}
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={seg.color} strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(.4,0,.2,1)' }}
            />
          )
          offset += length + gap
          return el
        })}
      </svg>
      {(centerValue !== undefined || centerLabel) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          {centerValue !== undefined && <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{centerValue}</div>}
          {centerLabel && <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: '5px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{centerLabel}</div>}
        </div>
      )}
    </div>
  )
}

function PieCard({ title, subtitle, segments, centerValue, centerLabel }: {
  title: string
  subtitle?: string
  segments: { label: string; value: number; color: string }[]
  centerValue?: string | number
  centerLabel?: string
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)' }}>
      <CardHeader title={title} subtitle={subtitle?.toUpperCase()} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <DonutChart segments={segments} centerValue={centerValue} centerLabel={centerLabel} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
          {segments.map(seg => {
            const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0
            return (
              <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: seg.color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seg.label}</span>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{seg.value}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-faint)', width: '32px', textAlign: 'right' }}>{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color, bg, onClick, delta }: any) {
  const softShadow = `0 1px 3px ${hexToRgba(color, 0.05)}, 0 1px 2px rgba(0,0,0,.03)`
  const hoverShadow = `0 8px 20px ${hexToRgba(color, 0.1)}, 0 2px 4px ${hexToRgba(color, 0.05)}`
  return (
    <div onClick={onClick} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: softShadow, cursor: onClick ? 'pointer' : 'default', transition: 'all 0.2s cubic-bezier(.4,0,.2,1)' }}
      onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLDivElement).style.boxShadow = hoverShadow; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)' } }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = softShadow; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}>
      <div style={{
        width: '42px', height: '42px', borderRadius: '11px',
        background: `linear-gradient(135deg, ${hexToRgba(color, 0.12)}, ${hexToRgba(color, 0.22)})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        boxShadow: `inset 0 0 0 1px ${hexToRgba(color, 0.15)}`,
      }}>
        <Icon size={19} color={color} strokeWidth={2.2} />
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
          {delta != null && delta !== 0 && <span style={{ fontSize: '11px', fontWeight: 700, color: delta > 0 ? '#16a34a' : '#dc2626', background: delta > 0 ? '#f0fdf4' : '#fef2f2', padding: '1px 6px', borderRadius: '99px' }}>{delta > 0 ? '+' : ''}{delta}%</span>}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '1px' }}>{label}</div>
      </div>
    </div>
  )
}

function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', gap: '12px' }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: '4px 0 0', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600 }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

function ComboBarLine({ data, barColor = '#14b8a6', lineColor = '#0f172a' }: {
  data: { label: string; value: number }[]
  barColor?: string
  lineColor?: string
}) {
  if (data.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-faint)', fontSize: '13px' }}>Sem dados no período</div>
  }
  const W = 1000, H = 220, PL = 36, PR = 16, PT = 12, PB = 28
  const innerW = W - PL - PR
  const innerH = H - PT - PB
  const maxVal = Math.max(...data.map(d => d.value), 1)
  const niceMax = (() => {
    const exp = Math.pow(10, Math.floor(Math.log10(maxVal)))
    return Math.ceil(maxVal / exp) * exp
  })()
  const barW = data.length > 0 ? (innerW / data.length) * 0.62 : 0
  const step = data.length > 0 ? innerW / data.length : 0
  const window = Math.min(7, data.length)
  const ma = data.map((_, i) => {
    const start = Math.max(0, i - window + 1)
    const slice = data.slice(start, i + 1)
    return slice.reduce((s, d) => s + d.value, 0) / slice.length
  })
  const xOf = (i: number) => PL + step * i + step / 2
  const yOf = (v: number) => PT + innerH - (v / niceMax) * innerH
  const linePath = ma.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)},${yOf(v)}`).join(' ')
  const gridLines = [0, 0.25, 0.5, 0.75, 1]
  const maxLabels = 12
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels))
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '240px', display: 'block' }}>
        {gridLines.map(p => {
          const y = PT + innerH * p
          const val = Math.round(niceMax * (1 - p))
          return (
            <g key={p}>
              <line x1={PL} x2={W - PR} y1={y} y2={y} stroke="var(--divider)" strokeDasharray="3 4" />
              <text x={PL - 6} y={y + 3} fontSize="10" textAnchor="end" fill="var(--text-faint)" fontFamily="inherit">{val.toLocaleString()}</text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const h = (d.value / niceMax) * innerH
          const x = xOf(i) - barW / 2
          const y = PT + innerH - h
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h} fill={barColor} rx={2}>
                <title>{`${d.label}: ${d.value.toLocaleString()}`}</title>
              </rect>
            </g>
          )
        })}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {ma.map((v, i) => (
          <circle key={i} cx={xOf(i)} cy={yOf(v)} r={2.5} fill="#fff" stroke={lineColor} strokeWidth="1.5">
            <title>{`Média 7d: ${v.toFixed(0)}`}</title>
          </circle>
        ))}
        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null
          return <text key={i} x={xOf(i)} y={H - 10} fontSize="10" textAnchor="middle" fill="var(--text-faint)" fontFamily="inherit">{d.label.slice(5)}</text>
        })}
      </svg>
    </div>
  )
}

function HBarChartPBI({ data, color = '#14b8a6', maxBars = 8 }: {
  data: { label: string; value: number }[]
  color?: string
  maxBars?: number
}) {
  if (data.length === 0) {
    return <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-faint)', fontSize: '13px' }}>Sem dados</div>
  }
  const sorted = [...data].sort((a, b) => b.value - a.value).slice(0, maxBars)
  const max = Math.max(...sorted.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {sorted.map(d => {
        const pct = (d.value / max) * 100
        return (
          <div key={d.label} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 44px', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={d.label}>{d.label}</span>
            <div style={{ position: 'relative', height: '18px', background: 'var(--bg-input)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.5s cubic-bezier(.4,0,.2,1)' }} />
            </div>
            <span style={{ fontWeight: 700, color: 'var(--text)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.value.toLocaleString()}</span>
          </div>
        )
      })}
    </div>
  )
}

function BigNumberTile({ title, subtitle, value, color = '#14b8a6', icon: Icon, onClick }: {
  title: string
  subtitle?: string
  value: string | number
  color?: string
  icon?: any
  onClick?: () => void
}) {
  return (
    <div onClick={onClick}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)', cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px', transition: 'all 0.2s' }}
      onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.borderColor = hexToRgba(color, 0.4) } }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '10px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600, marginTop: '4px' }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ fontSize: '48px', fontWeight: 300, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
        </div>
        {Icon && (
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: hexToRgba(color, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={18} color={color} strokeWidth={2.2} />
          </div>
        )}
      </div>
    </div>
  )
}

function AlertBanner({ alerts }: { alerts: { severity: 'critical' | 'warning'; icon: any; title: string; detail: string; href: string; cta: string }[] }) {
  if (alerts.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
      {alerts.map((a, i) => {
        const crit = a.severity === 'critical'
        const bg = crit ? '#fef2f2' : '#fffbeb'
        const border = crit ? '#fecaca' : '#fde68a'
        const fg = crit ? '#991b1b' : '#92400e'
        const accent = crit ? '#dc2626' : '#f59e0b'
        const Icon = a.icon
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', background: bg, border: `1px solid ${border}`, borderLeft: `4px solid ${accent}`, borderRadius: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={17} color={accent} strokeWidth={2.2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: fg, letterSpacing: '-0.01em' }}>{a.title}</div>
              <div style={{ fontSize: '12px', color: fg, opacity: 0.85, marginTop: '1px' }}>{a.detail}</div>
            </div>
            <a href={a.href} style={{ padding: '7px 14px', background: accent, color: '#fff', borderRadius: '6px', fontSize: '12px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              {a.cta} <ChevronRight size={12} />
            </a>
          </div>
        )
      })}
    </div>
  )
}

function RevenueTile({ value, dealsCount, onClick }: { value: number; dealsCount: number; onClick?: () => void }) {
  const formatBRL = (v: number) => {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`
    if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}k`
    return `R$ ${v.toFixed(0)}`
  }
  return (
    <div onClick={onClick}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', boxShadow: 'var(--shadow)', cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px', transition: 'all 0.2s' }}
      onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(20,184,166,0.4)' } }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Receita fechada</div>
        <div style={{ fontSize: '10px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600, marginTop: '3px' }}>NEGÓCIOS GANHOS</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <div style={{ fontSize: value >= 1_000_000 ? '36px' : '44px', fontWeight: 400, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {formatBRL(value)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '6px', fontWeight: 500 }}>
            {dealsCount} {dealsCount === 1 ? 'negócio ganho' : 'negócios ganhos'}
          </div>
        </div>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(20,184,166,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <DollarSign size={18} color="#0f766e" strokeWidth={2.2} />
        </div>
      </div>
    </div>
  )
}

function PlanUsageTile({ used, limit }: { used: number; limit: number | null }) {
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const daysElapsed = dayOfMonth
  const daysRemaining = daysInMonth - daysElapsed
  const dailyAvg = used / Math.max(daysElapsed, 1)
  const projected = Math.round(dailyAvg * daysInMonth)
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null
  const willExceed = limit !== null && limit > 0 && projected > limit
  const daysUntilLimit = limit && dailyAvg > 0 && willExceed ? Math.max(0, Math.ceil((limit - used) / dailyAvg)) : null
  const accent = limit === null ? '#14b8a6' : willExceed ? '#dc2626' : pct !== null && pct > 85 ? '#f59e0b' : '#14b8a6'
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '140px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Mensagens este mês</div>
          <div style={{ fontSize: '10px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600, marginTop: '3px' }}>USO DO PLANO</div>
        </div>
        <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: hexToRgba(accent, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Target size={15} color={accent} strokeWidth={2.2} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{used.toLocaleString('pt-BR')}</span>
        {limit !== null
          ? <span style={{ fontSize: '13px', color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>/ {limit.toLocaleString('pt-BR')}</span>
          : <span style={{ fontSize: '13px', color: 'var(--text-faint)' }}>· plano ilimitado</span>}
      </div>
      {limit !== null && limit > 0 && (
        <>
          <div style={{ height: '6px', background: 'var(--bg)', borderRadius: '99px', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: accent, borderRadius: '99px', transition: 'width 0.5s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <span style={{ color: 'var(--text-muted)' }}>{pct}% usado · dia {dayOfMonth}/{daysInMonth}</span>
            <span style={{ color: accent, fontWeight: 600 }} title={`Projeção fim do mês: ${projected.toLocaleString('pt-BR')}`}>
              {willExceed
                ? `estoura em ${daysUntilLimit}d ⚠`
                : `sobra pra ${daysRemaining}d ✓`}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function FunnelChart({ stages, color = '#14b8a6' }: { stages: { label: string; value: number; revenue?: number; probability?: number | null }[]; color?: string }) {
  if (stages.length === 0 || stages[0].value === 0) {
    return <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-faint)', fontSize: '13px' }}>Sem cards no pipeline</div>
  }
  const max = stages[0].value
  const hasRevenue = stages.some(s => (s.revenue || 0) > 0)
  const weightedTotal = stages.reduce((s, st) => s + (st.revenue || 0) * ((st.probability ?? 100) / 100), 0)
  const formatBRL = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `R$ ${v.toFixed(0)}`
  return (
    <div>
      {hasRevenue && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', padding: '8px 12px', background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)', borderRadius: '8px' }}>
          <DollarSign size={14} color="#0f766e" />
          <span style={{ fontSize: '11px', color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Projeção ponderada</span>
          <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 700, color: '#0f766e', letterSpacing: '-0.02em' }}>{formatBRL(weightedTotal)}</span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {stages.map((s, i) => {
          const pct = (s.value / max) * 100
          const dropPct = i === 0 ? null : Math.round(((stages[i - 1].value - s.value) / stages[i - 1].value) * 100)
          const width = Math.max(pct, 10)
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 70px', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, fontSize: '12px' }} title={s.label}>{s.label}</div>
                {s.probability != null && <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 500 }}>{s.probability}% conv.</div>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{
                  width: `${width}%`, minWidth: '80px', height: '30px',
                  background: `linear-gradient(90deg, ${hexToRgba(color, 0.9)}, ${hexToRgba(color, 0.65)})`,
                  borderRadius: '4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px',
                  color: '#fff', fontWeight: 700, fontSize: '12px',
                  fontVariantNumeric: 'tabular-nums',
                  transition: 'width 0.5s cubic-bezier(.4,0,.2,1)',
                }}>
                  <span>{s.value}</span>
                  {hasRevenue && <span style={{ fontSize: '11px', opacity: 0.95 }}>{formatBRL(s.revenue || 0)}</span>}
                </div>
              </div>
              <span style={{ textAlign: 'right', fontSize: '11px', color: dropPct && dropPct > 0 ? '#dc2626' : 'var(--text-faint)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {dropPct === null ? '—' : dropPct > 0 ? `-${dropPct}%` : '0%'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const t = useT()
  const { user } = useAuthStore()
  const role = (user as any)?.role || 'agent'

  const { data: campaigns, isLoading: loadingCampaigns } = useQuery({ queryKey: ['campaigns'], queryFn: async () => { const { data } = await campaignApi.get('/campaigns'); return data.data }, refetchInterval: 15000 })
  const { data: channels } = useQuery({ queryKey: ['channels'], queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data }, refetchInterval: 30000 })
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: async () => { const { data } = await campaignApi.get('/templates'); return data.data }, refetchInterval: 30000 })
  const { data: conversations } = useQuery({ queryKey: ['conversations', 'open'], queryFn: async () => { const { data } = await conversationApi.get('/conversations?status=open'); return data.data }, refetchInterval: 15000 })
  const { data: conversationsWaiting } = useQuery({ queryKey: ['conversations', 'waiting'], queryFn: async () => { const { data } = await conversationApi.get('/conversations?status=waiting&limit=1'); return data.meta }, refetchInterval: 30000 })
  const { data: conversationsClosed } = useQuery({ queryKey: ['conversations', 'closed'], queryFn: async () => { const { data } = await conversationApi.get('/conversations?status=closed&limit=1'); return data.meta }, refetchInterval: 60000 })
  const { data: contactsMeta, isLoading: loadingContacts } = useQuery({ queryKey: ['contacts-count'], queryFn: async () => { const { data } = await contactApi.get('/contacts?limit=1'); return data.meta }, refetchInterval: 15000 })
  const { data: usage } = useQuery({ queryKey: ['usage'], queryFn: async () => { const { data } = await tenantApi.get('/tenant/usage'); return data.data }, refetchInterval: 15000 })
  const { data: teamMembers } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => { const { data } = await authApi.get('/auth/team'); return data.data || [] },
  })

  // Pipeline funnel data
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('')

  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines-dash'],
    queryFn: async () => { const { data } = await conversationApi.get('/pipelines'); return data.data || [] },
    staleTime: 60000,
  })

  const { data: pipelineBoard } = useQuery({
    queryKey: ['pipeline-board-funnel', selectedPipelineId],
    queryFn: async () => {
      const params = selectedPipelineId ? `?pipelineId=${selectedPipelineId}` : ''
      const { data } = await conversationApi.get(`/conversations/pipeline${params}`)
      return data.data as Record<string, any[]>
    },
    staleTime: 30000, refetchInterval: 30000,
  })
  const { data: pipelineColumns } = useQuery({
    queryKey: ['pipeline-columns-funnel', selectedPipelineId],
    queryFn: async () => {
      const params = selectedPipelineId ? `?pipelineId=${selectedPipelineId}` : ''
      const { data } = await conversationApi.get(`/pipeline-columns${params}`)
      return data.data as any[]
    },
    staleTime: 60000,
  })

  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const [analyticsDays, setAnalyticsDays] = useState(30)

  const { data: activity = [] } = useQuery({
    queryKey: ['pipeline-activity'],
    queryFn: async () => {
      const { data } = await conversationApi.get('/pipeline/activity?limit=12')
      return data.data || []
    },
    refetchInterval: 30000,
  })

  const { data: analytics } = useQuery({
    queryKey: ['analytics', selectedAgent, analyticsDays],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedAgent) params.set('userId', selectedAgent)
      params.set('days', String(analyticsDays))
      const { data } = await tenantApi.get(`/tenant/analytics?${params}`)
      return data.data
    },
    refetchInterval: 10000,
  })

  const totalSent = analytics?.totalSent ?? 0
  const deliveryRate = analytics?.deliveryRate ?? 0
  const readRate = analytics?.readRate ?? 0
  const prev = analytics?.previous || {}
  const deltaFn = (curr: number, prevVal: number | undefined) => (!prevVal || prevVal === 0) ? null : Math.round(((curr - prevVal) / prevVal) * 100)
  const byDay = analytics?.byDay || {}
  const byAgent: { name: string; count: number }[] = analytics?.byAgent || []
  const agentRanking: { name: string; messagesResponded: number; avgResponseMinutes: number | null; conversationsClosed: number; openConversations: number }[] = analytics?.agentRanking || []
  const avgResponseMinutes: number | null = analytics?.avgResponseMinutes ?? null
  const activeFlowsToday: number = analytics?.activeFlowsToday ?? 0
  const flowExecutionsToday: number = analytics?.flowExecutionsToday ?? 0
  const agentConversations: number | null = analytics?.agentConversations ?? null
  const agentClosedLast7d: number | null = analytics?.agentClosedLast7d ?? null
  const days = Object.keys(byDay).sort()
  const maxVal = Math.max(...days.map(d => byDay[d]?.sent || 0), 1)

  function generateReport() {
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) { toast.error('Permita pop-ups para gerar o relatório'); return }

    const html = `
      <html>
      <head><title>Relatório AutoZap</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #18181b; }
        h1 { font-size: 24px; color: #22c55e; }
        .metric { display: inline-block; margin: 10px 20px 10px 0; }
        .metric-value { font-size: 28px; font-weight: 700; }
        .metric-label { font-size: 12px; color: #71717a; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e4e4e7; }
        th { font-size: 12px; color: #71717a; }
      </style>
      </head>
      <body>
        <h1>AutoZap — Relatório</h1>
        <p>Período: últimos ${analyticsDays} dias</p>
        <div>
          <div class="metric"><div class="metric-value">${totalSent}</div><div class="metric-label">Mensagens enviadas</div></div>
          <div class="metric"><div class="metric-value">${deliveryRate}%</div><div class="metric-label">Taxa de entrega</div></div>
          <div class="metric"><div class="metric-value">${readRate}%</div><div class="metric-label">Taxa de leitura</div></div>
          <div class="metric"><div class="metric-value">${conversations?.length || 0}</div><div class="metric-label">Conversas abertas</div></div>
          <div class="metric"><div class="metric-value">${contactsMeta?.total || 0}</div><div class="metric-label">Contatos</div></div>
        </div>
        ${agentRanking.length > 0 ? `
          <h2 style="margin-top:30px;font-size:18px;">Ranking de atendentes</h2>
          <table>
            <thead><tr><th>#</th><th>Agente</th><th>Mensagens</th><th>Tempo médio</th><th>Fechadas</th></tr></thead>
            <tbody>${agentRanking.map((a, i) => `<tr><td>${i+1}</td><td>${a.name}</td><td>${a.messagesResponded}</td><td>${a.avgResponseMinutes ? a.avgResponseMinutes + 'min' : '—'}</td><td>${a.conversationsClosed}</td></tr>`).join('')}</tbody>
          </table>
        ` : ''}
        <p style="margin-top:40px;font-size:11px;color:#a1a1aa;">Gerado em ${new Date().toLocaleString('pt-BR')} — AutoZap CRM</p>
      </body></html>
    `
    reportWindow.document.write(html)
    reportWindow.document.close()
    setTimeout(() => reportWindow.print(), 500)
  }

  const metricCards = [
    { label: t('dashboard.campaigns'),         value: campaigns?.length ?? 0,     sub: `${campaigns?.filter((c: any) => c.status === 'running').length || 0} ${t('dashboard.inProgress')}`, icon: Megaphone,    color: '#2563eb', bg: '#eff6ff', href: '/dashboard/campaigns' },
    { label: t('dashboard.contacts'),          value: contactsMeta?.total ?? 0,   sub: t('dashboard.inYourBase'),                                                                         icon: Users,        color: '#7c3aed', bg: '#f5f3ff', href: '/dashboard/contacts' },
    { label: t('dashboard.openConversations'), value: conversations?.length ?? 0, sub: `${conversations?.filter((c: any) => c.unread_count > 0).length || 0} ${t('dashboard.unread')}`,      icon: MessageSquare, color: '#22c55e', bg: '#f0fdf4', href: '/dashboard/inbox' },
    { label: t('dashboard.messagesThisMonth'), value: usage?.sent ?? 0,          sub: `${t('dashboard.of')} ${usage?.limit === null ? '∞' : (usage?.limit ?? 0).toLocaleString()} ${t('dashboard.available')}`, icon: Send,        color: '#ea580c', bg: '#fff7ed', href: '/dashboard/campaigns' },
  ]

  const funnelStages = (pipelineColumns || []).map((col: any) => {
    const cards = pipelineBoard?.[col.key] || []
    const revenue = cards.reduce((s: number, c: any) => s + Number(c.deal_value || 0), 0)
    return {
      label: col.label,
      value: cards.length,
      revenue,
      probability: col.probability ?? null,
    }
  })
  const pipelineCardCount = funnelStages.reduce((s: number, st: { value: number }) => s + st.value, 0)
  const pipelineTotalRevenue = funnelStages.reduce((s: number, st: { revenue: number }) => s + st.revenue, 0)

  // Receita fechada: cards em coluna com probabilidade 100% (ou label "fechad"/"ganho"/"won")
  const wonColumn = (pipelineColumns || []).find((c: any) =>
    c.probability === 100 || /fechad|ganho|won/i.test(c.label || '')
  )
  const wonCards: any[] = wonColumn ? (pipelineBoard?.[wonColumn.key] || []) : []
  const revenueValue = wonCards.reduce((s: number, c: any) => s + Number(c.deal_value || 0), 0)
  const revenueCount = wonCards.length

  const alerts: { severity: 'critical' | 'warning'; icon: any; title: string; detail: string; href: string; cta: string }[] = []
  const sla = analytics?.sla
  if (sla?.currentlyBreached > 0) {
    alerts.push({
      severity: 'critical',
      icon: AlertTriangle,
      title: `${sla.currentlyBreached} conversa${sla.currentlyBreached > 1 ? 's' : ''} com SLA estourado`,
      detail: `Meta de ${sla.targetMinutes} min excedida — responda agora pra não perder o lead.`,
      href: '/dashboard/inbox?sla=breached',
      cta: 'Responder',
    })
  }
  if (sla?.currentlyWaiting > 5 && (sla?.currentlyBreached || 0) === 0) {
    alerts.push({
      severity: 'warning',
      icon: Clock,
      title: `${sla.currentlyWaiting} conversa${sla.currentlyWaiting > 1 ? 's' : ''} aguardando resposta`,
      detail: 'Atenda antes que estourem o SLA.',
      href: '/dashboard/inbox?status=waiting',
      cta: 'Ver inbox',
    })
  }
  // Alerta de uso do plano — só quando tá perto de estourar
  if (usage?.limit && usage.limit > 0) {
    const usedNow = usage.sent || 0
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const dayOfMonth = now.getDate()
    const dailyAvg = usedNow / Math.max(dayOfMonth, 1)
    const projected = Math.round(dailyAvg * daysInMonth)
    const usedPct = (usedNow / usage.limit) * 100
    if (projected > usage.limit && usedPct > 50) {
      const daysUntilLimit = dailyAvg > 0 ? Math.max(0, Math.ceil((usage.limit - usedNow) / dailyAvg)) : 0
      alerts.push({
        severity: 'critical',
        icon: AlertTriangle,
        title: `Plano vai estourar em ${daysUntilLimit}d`,
        detail: `Usou ${Math.round(usedPct)}% de ${usage.limit.toLocaleString('pt-BR')} · projeção: ${projected.toLocaleString('pt-BR')} msgs no mês.`,
        href: '/dashboard/settings',
        cta: 'Fazer upgrade',
      })
    } else if (usedPct > 85) {
      alerts.push({
        severity: 'warning',
        icon: AlertTriangle,
        title: `Plano em ${Math.round(usedPct)}% do limite`,
        detail: `${usedNow.toLocaleString('pt-BR')} de ${usage.limit.toLocaleString('pt-BR')} msgs · avalie upgrade.`,
        href: '/dashboard/settings',
        cta: 'Ver planos',
      })
    }
  }

  return (
    <div className="mobile-page" style={{ padding: '24px 28px', maxWidth: '1400px' }}>

      {/* Saudação + filtros compactos no header */}
      <div className="mobile-header" style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' }}>Dashboard AutoZap</h1>
          <p style={{ color: 'var(--text-faint)', fontSize: '13px', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{getGreeting(t)} · Visão geral do seu CRM</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {(role === 'owner' || role === 'admin') && (teamMembers || []).length > 1 && (
            <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}
              style={{ padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)', outline: 'none', cursor: 'pointer', boxShadow: 'var(--shadow)' }}>
              <option value="">Toda a equipe</option>
              {(teamMembers || []).map((m: any) => (
                <option key={m.id} value={m.id}>{m.name || m.email}</option>
              ))}
            </select>
          )}
          {(role === 'owner' || role === 'admin') && (
            <button onClick={generateReport}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', boxShadow: 'var(--shadow)', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#22c55e'; (e.currentTarget as HTMLButtonElement).style.color = '#22c55e' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}>
              <Printer size={14} />
              Gerar relatório
            </button>
          )}
        </div>
      </div>

      {/* Barra "Hoje" */}
      {(() => {
        const todayKey = new Date().toISOString().split('T')[0]
        const msgsToday = byDay[todayKey]?.sent || 0
        const waiting = analytics?.sla?.currentlyWaiting || 0
        const breached = analytics?.sla?.currentlyBreached || 0
        const items = [
          { icon: Send, color: '#22c55e', bg: '#f0fdf4', value: msgsToday, label: 'mensagens enviadas' },
          { icon: MessageSquare, color: '#2563eb', bg: '#eff6ff', value: waiting, label: 'aguardando resposta' },
          { icon: Clock, color: breached > 0 ? '#dc2626' : '#94a3b8', bg: breached > 0 ? '#fef2f2' : '#f4f4f5', value: breached, label: 'estouradas agora' },
        ]
        return (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 20px', marginBottom: '20px', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>Hoje</div>
            {items.map((it, i) => {
              const I = it.icon
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: it.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <I size={14} color={it.color} />
                  </div>
                  <div>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{it.value}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-faint)', marginLeft: '6px' }}>{it.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}


      {/* Alertas acionáveis */}
      <AlertBanner alerts={alerts} />

      {/* Seletor de período */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Período de análise</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {[7, 14, 30, 90].map(d => (
            <button key={d} onClick={() => setAnalyticsDays(d)}
              style={{ padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: `1px solid ${analyticsDays === d ? '#14b8a6' : 'var(--border)'}`, cursor: 'pointer', background: analyticsDays === d ? 'rgba(20,184,166,0.08)' : 'transparent', color: analyticsDays === d ? '#0f766e' : 'var(--text-muted)', transition: 'all 0.1s' }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {selectedAgent && (
        <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserCheck size={12} />
          Filtrando desempenho por agente selecionado
          <button onClick={() => setSelectedAgent('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: 0 }}>
            <X size={11} /> limpar
          </button>
        </div>
      )}

      {/* GRID PBI 12 col */}
      {loadingCampaigns && loadingContacts ? (
        <GridSkeleton cols={4} />
      ) : (
      <div className="pbi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: '12px', gridAutoRows: 'minmax(10px, auto)' }}>

        {/* Row 1: Combo chart principal (span 8) + 2 tiles grandes (span 4) */}
        <div style={{ gridColumn: 'span 8', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)' }}>
          <CardHeader
            title="Mensagens enviadas"
            subtitle={`POR DIA · ÚLTIMOS ${analyticsDays} DIAS`}
            right={
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center', fontSize: '11px', color: 'var(--text-faint)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#14b8a6' }} /> Enviadas
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '12px', height: '2px', background: '#0f172a' }} /> Média 7d
                </span>
              </div>
            }
          />
          {totalSent === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-faint)', fontSize: '13px' }}>Nenhuma mensagem enviada nos últimos {analyticsDays} dias.</div>
          ) : (
            <ComboBarLine data={days.map(day => ({ label: day, value: byDay[day]?.sent || 0 }))} />
          )}
        </div>

        <div style={{ gridColumn: 'span 4', display: 'grid', gridTemplateRows: '1fr 1fr', gap: '12px' }}>
          <BigNumberTile title="Contatos" subtitle="NA SUA BASE" value={contactsMeta?.total ?? 0} color="#7c3aed" icon={Users} onClick={() => router.push('/dashboard/contacts')} />
          <RevenueTile value={revenueValue} dealsCount={revenueCount} onClick={() => router.push('/dashboard/pipeline')} />
        </div>

        {/* Row 2: Funil Pipeline (span 5) + HBar atendentes (span 4) + Pie status (span 3) */}
        <div style={{ gridColumn: 'span 5', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)' }}>
          <CardHeader
            title="Funil do pipeline"
            subtitle={pipelineCardCount > 0
              ? `${pipelineCardCount} CARDS${pipelineTotalRevenue > 0 ? ` · R$ ${pipelineTotalRevenue >= 1000 ? (pipelineTotalRevenue / 1000).toFixed(pipelineTotalRevenue >= 10000 ? 0 : 1) + 'K' : pipelineTotalRevenue.toFixed(0)} EM NEGOCIAÇÃO` : ''}`
              : 'SEM CARDS AINDA'}
            right={<button onClick={() => router.push('/dashboard/pipeline')} style={{ fontSize: '11px', color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Abrir</button>}
          />
          <FunnelChart stages={funnelStages} color="#14b8a6" />
        </div>

        <div style={{ gridColumn: 'span 4', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)' }}>
          <CardHeader title="Conversas por atendente" subtitle="TOP ATENDENTES" />
          {byAgent.length > 0 ? (
            <HBarChartPBI data={byAgent.map(a => ({ label: a.name, value: a.count }))} color="#14b8a6" maxBars={6} />
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-faint)', fontSize: '13px' }}>Sem atendentes ativos</div>
          )}
        </div>

        <div style={{ gridColumn: 'span 3' }}>
          <PieCard
            title="Conversas"
            subtitle="POR STATUS"
            centerValue={(conversations?.length || 0) + (conversationsWaiting?.total || 0)}
            centerLabel="abertas"
            segments={[
              { label: 'Em aberto', value: conversations?.length || 0, color: '#14b8a6' },
              { label: 'Aguardando', value: conversationsWaiting?.total || 0, color: '#f59e0b' },
              { label: 'Fechadas', value: conversationsClosed?.total || 0, color: '#334155' },
            ]}
          />
        </div>

        {/* Row 3: SLA (span 8) + Campanhas tile (span 4) */}
        {analytics?.sla && (
          <div style={{ gridColumn: 'span 8', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)' }}>
            <CardHeader
              title="SLA — Tempo de resposta"
              subtitle={`META ${analytics.sla.targetMinutes} MIN · ÚLTIMOS ${analyticsDays} DIAS`}
              right={<button onClick={() => router.push('/dashboard/settings')} style={{ fontSize: '11px', color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Configurar</button>}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <DonutChart size={140} thickness={22}
                segments={[
                  { label: 'Dentro', value: analytics.sla.withinCount || 0, color: '#14b8a6' },
                  { label: 'Fora', value: analytics.sla.breachedCount || 0, color: '#dc2626' },
                ]}
                centerValue={analytics.sla.withinPct !== null ? `${analytics.sla.withinPct}%` : '—'}
                centerLabel="no SLA"
              />
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ padding: '14px', background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.25)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f766e', letterSpacing: '-0.02em' }}>{analytics.sla.withinCount || 0}</div>
                  <div style={{ fontSize: '10px', color: '#0f766e', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>No prazo</div>
                </div>
                <div style={{ padding: '14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', cursor: 'pointer' }} onClick={() => router.push('/dashboard/inbox')}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#2563eb', letterSpacing: '-0.02em' }}>{analytics.sla.currentlyWaiting || 0}</div>
                  <div style={{ fontSize: '10px', color: '#1d4ed8', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Aguardando</div>
                </div>
                <div style={{ padding: '14px', background: (analytics.sla.currentlyBreached || 0) > 0 ? '#fef2f2' : 'var(--bg)', border: `1px solid ${(analytics.sla.currentlyBreached || 0) > 0 ? '#fecaca' : 'var(--border)'}`, borderRadius: '8px', cursor: 'pointer' }} onClick={() => router.push('/dashboard/inbox')}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: (analytics.sla.currentlyBreached || 0) > 0 ? '#dc2626' : 'var(--text-faint)', letterSpacing: '-0.02em' }}>{analytics.sla.currentlyBreached || 0}</div>
                  <div style={{ fontSize: '10px', color: (analytics.sla.currentlyBreached || 0) > 0 ? '#991b1b' : 'var(--text-faint)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Estouradas</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ gridColumn: 'span 4', display: 'grid', gridTemplateRows: '1fr 1fr', gap: '12px' }}>
          <BigNumberTile title="Campanhas" subtitle={`${campaigns?.filter((c: any) => c.status === 'running').length || 0} EM ANDAMENTO`} value={campaigns?.length ?? 0} color="#2563eb" icon={Megaphone} onClick={() => router.push('/dashboard/campaigns')} />
          <BigNumberTile title="Conversas abertas" subtitle={`${conversations?.filter((c: any) => c.unread_count > 0).length || 0} NÃO LIDAS`} value={conversations?.length ?? 0} color="#14b8a6" icon={MessageSquare} onClick={() => router.push('/dashboard/inbox')} />
        </div>

        {/* Row 4: KPI volume (4 + 4 + 4) */}
        <div style={{ gridColumn: 'span 4' }}>
          <StatCard label={`Mensagens (${analyticsDays}d)`} value={totalSent.toLocaleString('pt-BR')} icon={Send} color="#14b8a6" delta={deltaFn(totalSent, prev.totalSent)} />
        </div>
        <div style={{ gridColumn: 'span 4' }}>
          <StatCard label={t('dashboard.deliveryRate')} value={totalSent > 0 ? `${deliveryRate}%` : '—'} icon={CheckCheck} color="#22c55e" delta={totalSent > 0 && prev.deliveryRate != null ? deliveryRate - prev.deliveryRate : null} />
        </div>
        <div style={{ gridColumn: 'span 4' }}>
          <StatCard label={t('dashboard.readRate')} value={totalSent > 0 ? `${readRate}%` : '—'} icon={Eye} color="#7c3aed" delta={totalSent > 0 && prev.readRate != null ? readRate - prev.readRate : null} />
        </div>

        {/* Row agente selecionado (opcional) */}
        {selectedAgent && (
          <>
            <div style={{ gridColumn: 'span 4' }}><StatCard label={t('dashboard.assignedOpenConvs')} value={agentConversations ?? '—'} icon={MessageSquare} color="#14b8a6" /></div>
            <div style={{ gridColumn: 'span 4' }}><StatCard label={t('dashboard.closedConvs7d')} value={agentClosedLast7d ?? '—'} icon={CheckCheck} color="#2563eb" /></div>
            <div style={{ gridColumn: 'span 4' }}><StatCard label={t('dashboard.avgResponseTime7d')} value={formatResponseTime(avgResponseMinutes)} icon={Clock} color="#ea580c" /></div>
          </>
        )}

        {/* Row 5: Atividade (span 7) + Pipeline por etapa pie (span 5) */}
        {activity.length > 0 && (
          <div style={{ gridColumn: 'span 7', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)' }}>
            <CardHeader title="Atividade recente" subtitle="ÚLTIMOS EVENTOS NO PIPELINE" />
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {activity.slice(0, 7).map((ev: any) => {
                const contact = ev.card?.contacts || ev.conversation?.contacts
                const contactName = contact?.name || contact?.phone || 'Contato'
                const actor = ev.actor?.name || 'Sistema'
                const when = (() => {
                  const diff = Date.now() - new Date(ev.created_at).getTime()
                  const mins = Math.floor(diff / 60000)
                  if (mins < 1) return 'agora'
                  if (mins < 60) return `há ${mins}min`
                  const hrs = Math.floor(mins / 60)
                  if (hrs < 24) return `há ${hrs}h`
                  return `há ${Math.floor(hrs / 24)}d`
                })()
                let text = ''
                let color = '#64748b'
                switch (ev.event_type) {
                  case 'created': text = `${contactName} entrou em ${ev.to_column || '—'}`; color = '#7c3aed'; break
                  case 'moved': text = `${contactName} · ${ev.from_column || '—'} → ${ev.to_column || '—'}`; color = '#f59e0b'; break
                  case 'value_changed': text = `${contactName} · valor R$ ${Number(ev.from_value || 0).toFixed(0)} → R$ ${Number(ev.to_value || 0).toFixed(0)}`; color = '#14b8a6'; break
                  case 'assigned': text = `${contactName} · responsável alterado`; color = '#0891b2'; break
                  default: text = `${contactName} · ${ev.event_type}`
                }
                return (
                  <li key={ev.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px', borderRadius: '6px', background: 'var(--bg)', borderLeft: `3px solid ${color}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px' }}>{actor} · {when}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div style={{ gridColumn: activity.length > 0 ? 'span 5' : 'span 12' }}>
          {pipelineCardCount > 0 ? (
            <PieCard
              title="Pipeline por etapa"
              subtitle="CARDS EM CADA COLUNA"
              centerValue={pipelineCardCount}
              centerLabel="cards"
              segments={(pipelineColumns || []).map((col: any, i: number) => ({
                label: col.label,
                value: pipelineBoard?.[col.key]?.length || 0,
                color: col.color || ['#14b8a6', '#2563eb', '#7c3aed', '#db2777', '#f59e0b', '#dc2626'][i % 6],
              }))}
            />
          ) : (
            <div style={{ height: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column' }}>
              <CardHeader title="Pipeline por etapa" subtitle="CARDS EM CADA COLUNA" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(20,184,166,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                  <Workflow size={20} color="#14b8a6" />
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px' }}>Configure seu pipeline</p>
                <button onClick={() => router.push('/dashboard/pipeline')} style={{ padding: '6px 12px', background: '#14b8a6', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  Configurar <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Row 6: Ranking full width (admin) */}
        {(role === 'owner' || role === 'admin') && (
          <div style={{ gridColumn: 'span 12', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)' }}>
            <CardHeader title={t('dashboard.agentRanking')} subtitle="DESEMPENHO DA EQUIPE" right={<Trophy size={15} color="#f59e0b" />} />
            {agentRanking.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-faint)', fontSize: '13px' }}>{t('dashboard.noAgentRanking')}</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-faint)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>#</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-faint)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('dashboard.byAgent')}</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-faint)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('dashboard.messagesResponded')}</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-faint)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('dashboard.avgTime')}</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--text-faint)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('dashboard.closed')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentRanking.map((agent, i) => {
                      const medalColors = ['#f59e0b', '#9ca3af', '#b45309']
                      const avatarColors = [
                        { bg: '#dbeafe', fg: '#1d4ed8' }, { bg: '#ccfbf1', fg: '#0f766e' },
                        { bg: '#fce7f3', fg: '#be185d' }, { bg: '#ede9fe', fg: '#6d28d9' },
                        { bg: '#ffedd5', fg: '#c2410c' }, { bg: '#e0f2fe', fg: '#0369a1' },
                      ]
                      const hash = (agent.name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
                      const av = avatarColors[hash % avatarColors.length]
                      const initials = (agent.name || '??').trim().slice(0, 2).toUpperCase()
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--divider)', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg)'}
                          onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: i < 3 ? medalColors[i] : 'var(--text-faint)', width: '36px', fontVariantNumeric: 'tabular-nums' }}>{i < 3 ? '🏆' : i + 1}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: av.bg, color: av.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                              <span>{agent.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#14b8a6', fontVariantNumeric: 'tabular-nums' }}>{agent.messagesResponded}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{formatResponseTime(agent.avgResponseMinutes)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#2563eb', fontVariantNumeric: 'tabular-nums' }}>{agent.conversationsClosed}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
      )}

      <div style={{ height: '16px' }} />

      {/* Acesso rápido */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
          <TrendingUp size={14} color="#22c55e" />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>{t('dashboard.quickAccess')}</span>
        </div>
        <div className="mobile-header-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { label: t('dashboard.newCampaign'),     href: '/dashboard/campaigns', primary: true,  roles: ['owner', 'admin'] },
            { label: t('dashboard.importContacts'), href: '/dashboard/contacts',  primary: false, roles: ['owner', 'admin', 'supervisor'] },
            { label: t('dashboard.openInbox'),       href: '/dashboard/inbox',     primary: false, roles: ['owner', 'admin', 'supervisor', 'agent'] },
            { label: t('dashboard.viewPlan'),         href: '/dashboard/settings',  primary: false, roles: ['owner', 'admin'] },
          ].filter(item => item.roles.includes(role)).map(({ label, href, primary }) => (
            <button key={href} onClick={() => router.push(href)}
              style={{ padding: '8px 16px', background: primary ? '#22c55e' : 'var(--bg-input)', border: primary ? 'none' : '1px solid var(--border)', borderRadius: '8px', color: primary ? '#fff' : 'var(--text-muted)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = primary ? '#16a34a' : 'var(--bg)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = primary ? '#22c55e' : 'var(--bg-input)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
// deploy 1775501739
