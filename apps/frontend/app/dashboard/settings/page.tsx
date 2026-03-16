'use client'
import { useAuthStore } from '@/store/auth.store'
export default function SettingsPage() {
  const { user } = useAuthStore()
  return (
    <div style={{ padding: '32px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>Plano e Configurações</h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '28px' }}>Gerencie sua conta e uso do plano</p>
      <div style={{ maxWidth: '700px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ background: '#fff', border: '1px solid #e8edf3', borderRadius: '10px', padding: '24px' }}>
          <h2 style={{ fontWeight: 600, marginBottom: '16px' }}>👤 Perfil</h2>
          <p style={{ color: '#6b7280', fontSize: '14px' }}><strong>Email:</strong> {user?.email}</p>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '8px' }}><strong>Plano:</strong> Pro</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e8edf3', borderRadius: '10px', padding: '24px' }}>
          <h2 style={{ fontWeight: 600, marginBottom: '16px' }}>📊 Plano atual</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#6b7280', fontSize: '14px' }}>Mensagens este mês</span>
            <span style={{ fontSize: '14px', fontWeight: 500 }}>0 / 50.000</span>
          </div>
          <div style={{ height: '8px', background: '#f3f4f6', borderRadius: '4px' }}><div style={{ width: '0%', height: '100%', background: '#25d366', borderRadius: '4px' }} /></div>
          <p style={{ color: '#9ca3af', fontSize: '12px', marginTop: '6px' }}>0% utilizado</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e8edf3', borderRadius: '10px', padding: '24px' }}>
          <h2 style={{ fontWeight: 600, marginBottom: '16px' }}>💳 Planos disponíveis</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[{name:'Starter',msgs:'10.000 msgs',price:'R$ 299/mês'},{name:'Pro',msgs:'50.000 msgs',price:'R$ 699/mês'}].map(p => (
              <div key={p.name} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
                <p style={{ fontWeight: 600, marginBottom: '4px' }}>{p.name}</p>
                <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '8px' }}>{p.msgs}</p>
                <p style={{ fontWeight: 700, fontSize: '16px' }}>{p.price}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
