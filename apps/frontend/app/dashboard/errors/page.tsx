'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, AlertCircle, Trash2 } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const ERROR_LABELS: Record<string, string> = {
  '131026': 'Número não existe no WhatsApp',
  '131047': 'Mensagem fora da janela de 24h',
  '131051': 'Template não suportado',
  '131052': 'Mídia inválida',
  '131000': 'Erro genérico',
  '500':    'Erro interno',
  '400':    'Requisição inválida',
}

export default function ErrorDashboard() {
  const [clearing, setClearing] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['message_errors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_errors')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data || []
    },
    refetchInterval: 30000,
  })

  const errors = data || []

  // Agrupa por código de erro
  const byCode = errors.reduce((acc: Record<string, number>, e: any) => {
    const code = e.error_code || 'unknown'
    acc[code] = (acc[code] || 0) + 1
    return acc
  }, {})

  // Número com mais erros
  const byPhone = errors.reduce((acc: Record<string, number>, e: any) => {
    if (e.phone) acc[e.phone] = (acc[e.phone] || 0) + 1
    return acc
  }, {})
  const topPhone = Object.entries(byPhone).sort((a, b) => b[1] - a[1])[0]

  const lastError = errors[0]

  async function clearErrors() {
    if (!confirm('Limpar todos os erros? Esta ação não pode ser desfeita.')) return
    setClearing(true)
    await supabase.from('message_errors').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await refetch()
    setClearing(false)
  }

  return (
    <div style={{ padding: '32px', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: 0 }}>Dashboard de Erros WhatsApp</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>Visualização de erros do sistema de disparo</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => refetch()}
            style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', color: '#6b7280', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={13} /> Atualizar Dados
          </button>
          <button onClick={clearErrors} disabled={clearing}
            style={{ padding: '8px 14px', background: '#ef4444', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: clearing ? 0.5 : 1 }}>
            <Trash2 size={13} /> Limpar Erros
          </button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px' }}>Total de Erros</p>
          <p style={{ fontSize: '32px', fontWeight: 700, color: '#2563eb', margin: 0 }}>{errors.length.toLocaleString()}</p>
          {lastError && <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Atualizado em: {new Date(lastError.created_at).toLocaleString('pt-BR')}</p>}
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px' }}>Último Erro</p>
          <p style={{ fontSize: '32px', fontWeight: 700, color: '#2563eb', margin: 0 }}>{lastError?.error_code || '—'}</p>
          {lastError && <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Data do último erro</p>}
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px' }}>Número com Mais Erros</p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: '#2563eb', margin: 0 }}>{topPhone?.[0] || '—'}</p>
          {topPhone && <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>{topPhone[1]} registros</p>}
        </div>
      </div>

      {/* Resumo por código */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', margin: '0 0 16px' }}>Erros por código</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {Object.entries(byCode).sort((a, b) => b[1] - a[1]).map(([code, count]) => (
            <div key={code} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#dc2626' }}>{code}</span>
              <span style={{ fontSize: '11px', color: '#6b7280' }}>{ERROR_LABELS[code] || 'Erro desconhecido'}</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{count} ocorrências</span>
            </div>
          ))}
          {Object.keys(byCode).length === 0 && (
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Nenhum erro registrado</p>
          )}
        </div>
      </div>

      {/* Tabela de erros */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', margin: 0 }}>Registros de Erro</h2>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Carregando...</div>
        ) : errors.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <AlertCircle size={28} color="#e5e7eb" style={{ margin: '0 auto 8px' }} />
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Nenhum erro registrado</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 140px 1fr 200px 160px', gap: '8px', padding: '10px 20px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
              {['Código', 'Número', 'Mensagem', 'Message ID', 'Data/Hora'].map(h => (
                <span key={h} style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
              ))}
            </div>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {errors.map((e: any) => (
                <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '100px 140px 1fr 200px 160px', gap: '8px', padding: '12px 20px', borderBottom: '1px solid #f9fafb', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: '4px', display: 'inline-block' }}>
                    {e.error_code || '—'}
                  </span>
                  <span style={{ fontSize: '13px', color: '#374151', fontFamily: 'monospace' }}>{e.phone || '—'}</span>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>{ERROR_LABELS[e.error_code] || e.error_message || '—'}</span>
                  <span style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.message_id || '—'}</span>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>{new Date(e.created_at).toLocaleString('pt-BR')}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
