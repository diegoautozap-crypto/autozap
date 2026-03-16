'use client'
import { Zap } from 'lucide-react'
export default function AutomationsPage() {
  return (
    <div style={{ padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div><h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>Automações</h1><p style={{ color: '#6b7280', fontSize: '14px' }}>Respostas automáticas baseadas em eventos</p></div>
        <button style={{ padding: '9px 16px', background: '#25d366', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>+ Nova automação</button>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e8edf3', borderRadius: '10px', padding: '80px', textAlign: 'center' }}>
        <Zap size={36} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
        <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '16px' }}>Nenhuma automação ainda</p>
        <a href="#" style={{ color: '#25d366', fontSize: '14px' }}>Criar primeira automação</a>
      </div>
    </div>
  )
}
