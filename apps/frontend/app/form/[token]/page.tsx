'use client'
import { useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  phone: 'Telefone',
  email: 'Email',
  company: 'Empresa',
  message: 'Mensagem',
}

const FIELD_PLACEHOLDERS: Record<string, string> = {
  name: 'Seu nome',
  phone: '(11) 99999-9999',
  email: 'seu@email.com',
  company: 'Nome da empresa',
  message: 'Sua mensagem...',
}

const FIELD_TYPES: Record<string, string> = {
  name: 'text',
  phone: 'tel',
  email: 'email',
  company: 'text',
  message: 'textarea',
}

export default function LeadForm() {
  const { token } = useParams()
  const searchParams = useSearchParams()

  const title = searchParams.get('title') || 'Entre em contato'
  const buttonText = searchParams.get('button') || 'Enviar'
  const color = searchParams.get('color') || '22c55e'
  const fields = (searchParams.get('fields') || 'name,phone').split(',').filter(Boolean)
  const customFields: { label: string; type: string }[] = (() => {
    try { return JSON.parse(searchParams.get('custom') || '[]') } catch { return [] }
  })()

  const [form, setForm] = useState<Record<string, string>>({ name: '', phone: '', email: '', company: '', message: '' })
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const updateField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.phone.trim()) {
      setError('Telefone e obrigatorio.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_MESSAGE_SERVICE_URL}/webhook/lead/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: form.phone,
          name: form.name,
          email: form.email,
          company: form.company,
          message: form.message,
          source: 'web_form',
          custom_fields: customFields.reduce((acc, cf, i) => {
            if (form[`custom_${i}`]) acc[cf.label] = form[`custom_${i}`]
            return acc
          }, {} as Record<string, string>),
        }),
      })
      if (!res.ok) throw new Error('Erro ao enviar')
      setSent(true)
    } catch {
      setError('Erro ao enviar o formulario. Tente novamente.')
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f4f4f5',
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: '16px',
      }}>
        <div style={{
          background: '#fff',
          borderRadius: '16px',
          padding: '48px 32px',
          width: '100%',
          maxWidth: '420px',
          boxShadow: '0 4px 24px rgba(0,0,0,.08)',
          textAlign: 'center',
        }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            background: `#${color}1a`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 20px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={`#${color}`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#18181b', marginBottom: '8px' }}>
            Mensagem enviada!
          </h2>
          <p style={{ fontSize: '14px', color: '#71717a', lineHeight: 1.5 }}>
            Obrigado pelo contato. Retornaremos em breve.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f4f4f5',
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: '16px',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        padding: '32px 28px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 4px 24px rgba(0,0,0,.08)',
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#18181b', marginBottom: '24px', textAlign: 'center' }}>
          {title}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {fields.map(field => {
            const isRequired = field === 'phone' || field === 'name'
            return (
              <div key={field}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#3f3f46', display: 'block', marginBottom: '5px' }}>
                  {FIELD_LABELS[field] || field}
                  {isRequired && <span style={{ color: '#ef4444', marginLeft: '3px' }}>*</span>}
                </label>
                {FIELD_TYPES[field] === 'textarea' ? (
                  <textarea placeholder={FIELD_PLACEHOLDERS[field] || ''} value={form[field] || ''} onChange={e => updateField(field, e.target.value)} rows={3}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', color: '#18181b', background: '#fafafa', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                    onFocus={e => e.currentTarget.style.borderColor = `#${color}`} onBlur={e => e.currentTarget.style.borderColor = '#e4e4e7'} />
                ) : (
                  <input type={FIELD_TYPES[field] || 'text'} placeholder={FIELD_PLACEHOLDERS[field] || ''} value={form[field] || ''} onChange={e => updateField(field, e.target.value)} required={isRequired}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', color: '#18181b', background: '#fafafa', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                    onFocus={e => e.currentTarget.style.borderColor = `#${color}`} onBlur={e => e.currentTarget.style.borderColor = '#e4e4e7'} />
                )}
              </div>
            )
          })}
          {customFields.map((cf, i) => (
            <div key={`custom-${i}`}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#3f3f46', display: 'block', marginBottom: '5px' }}>{cf.label}</label>
              {cf.type === 'textarea' ? (
                <textarea placeholder={cf.label} value={form[`custom_${i}`] || ''} onChange={e => updateField(`custom_${i}`, e.target.value)} rows={3}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', color: '#18181b', background: '#fafafa', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                  onFocus={e => e.currentTarget.style.borderColor = `#${color}`} onBlur={e => e.currentTarget.style.borderColor = '#e4e4e7'} />
              ) : (
                <input type={cf.type || 'text'} placeholder={cf.label} value={form[`custom_${i}`] || ''} onChange={e => updateField(`custom_${i}`, e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', border: '1px solid #e4e4e7', borderRadius: '10px', fontSize: '14px', color: '#18181b', background: '#fafafa', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                  onFocus={e => e.currentTarget.style.borderColor = `#${color}`} onBlur={e => e.currentTarget.style.borderColor = '#e4e4e7'} />
              )}
            </div>
          ))}

          {error && (
            <p style={{ fontSize: '13px', color: '#ef4444', margin: 0, textAlign: 'center' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px',
              background: `#${color}`, color: '#fff',
              border: 'none', borderRadius: '10px',
              fontSize: '15px', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              marginTop: '4px',
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Enviando...' : buttonText}
          </button>
        </form>

        <p style={{ fontSize: '11px', color: '#a1a1aa', textAlign: 'center', marginTop: '20px' }}>
          Powered by AutoZap
        </p>
      </div>
    </div>
  )
}
