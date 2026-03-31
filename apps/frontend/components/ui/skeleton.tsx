export function Skeleton({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={{
      background: 'linear-gradient(90deg, #f4f4f5 25%, #e4e4e7 50%, #f4f4f5 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      borderRadius: '8px',
      ...style,
    }} />
  )
}

export function CardSkeleton() {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e4e4e7', padding: '16px' }}>
      <Skeleton style={{ height: '14px', width: '40%', marginBottom: '12px' }} />
      <Skeleton style={{ height: '28px', width: '60%', marginBottom: '8px' }} />
      <Skeleton style={{ height: '12px', width: '80%' }} />
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: '#fff', borderRadius: '10px', border: '1px solid #e4e4e7' }}>
          <Skeleton style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <Skeleton style={{ height: '13px', width: `${60 + Math.random() * 30}%`, marginBottom: '6px' }} />
            <Skeleton style={{ height: '11px', width: `${40 + Math.random() * 40}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function GridSkeleton({ cols = 4, rows = 1 }: { cols?: number; rows?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '12px' }}>
      {Array.from({ length: cols * rows }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}
