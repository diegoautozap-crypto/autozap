'use client'
import { useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { Loader2, Upload, X, Plus, Trash2 } from 'lucide-react'
import { BRANCH_COLORS, OPERATORS } from './constants'
import type { ConditionBranch, ConditionRule } from './constants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── MediaUpload ──────────────────────────────────────────────────────────────
export function MediaUpload({ accept, label, currentUrl, onUploaded }: {
  accept: string; label: string; currentUrl?: string; onUploaded: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { toast.error('Arquivo muito grande. Máximo 20MB'); return }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'bin'
      const path = `flows/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      const { data } = supabase.storage.from('media').getPublicUrl(path)
      onUploaded(data.publicUrl)
      toast.success('Arquivo carregado!')
    } catch (err: any) {
      toast.error('Erro ao fazer upload: ' + err.message)
    } finally { setUploading(false) }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={handleFile} />
      {currentUrl ? (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '7px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, fontSize: '12px', color: '#15803d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ✓ {currentUrl.split('/').pop()}
          </div>
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>Trocar</button>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          style={{ width: '100%', padding: '12px', background: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: '7px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#6b7280' }}>
          {uploading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={18} />}
          <span style={{ fontSize: '12px', fontWeight: 500 }}>{uploading ? 'Enviando...' : label}</span>
        </button>
      )}
    </div>
  )
}

// ─── ConditionPanel ───────────────────────────────────────────────────────────
export function ConditionPanel({ d, nodeId, inputStyle, onUpdate }: {
  d: any; nodeId: string; inputStyle: React.CSSProperties
  onUpdate: (id: string, data: any) => void
}) {
  const branches: ConditionBranch[] = d.branches || []
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }

  const updateBranches = (b: ConditionBranch[]) => onUpdate(nodeId, { branches: b })
  const addBranch = () => updateBranches([...branches, { id: `branch_${Date.now()}_${Math.random().toString(36).slice(2)}`, label: `Caminho ${branches.length + 1}`, logic: 'AND', rules: [{ id: `rule_${Date.now()}`, field: 'message', operator: 'contains', value: '' }] }])
  const removeBranch = (id: string) => updateBranches(branches.filter(b => b.id !== id))
  const updateBranch = (id: string, ch: Partial<ConditionBranch>) => updateBranches(branches.map(b => b.id === id ? { ...b, ...ch } : b))
  const addRule = (bid: string) => updateBranches(branches.map(b => b.id === bid ? { ...b, rules: [...b.rules, { id: `rule_${Date.now()}`, field: 'message', operator: 'contains', value: '' }] } : b))
  const removeRule = (bid: string, rid: string) => updateBranches(branches.map(b => b.id === bid ? { ...b, rules: b.rules.filter(r => r.id !== rid) } : b))
  const updateRule = (bid: string, rid: string, ch: Partial<ConditionRule>) => updateBranches(branches.map(b => b.id === bid ? { ...b, rules: b.rules.map(r => r.id === rid ? { ...r, ...ch } : r) } : b))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#15803d' }}>
        Cada caminho tem suas condições. Se nenhuma bater, vai para o <strong>Fallback</strong>.
      </div>

      {branches.map((branch, bi) => {
        const bc = BRANCH_COLORS[bi % BRANCH_COLORS.length]
        return (
          <div key={branch.id} style={{ border: `2px solid ${bc}40`, borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ background: `${bc}10`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: `1px solid ${bc}30` }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: bc, flexShrink: 0 }} />
              <input value={branch.label} onChange={e => updateBranch(branch.id, { label: e.target.value })}
                style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: '13px', fontWeight: 700, color: bc, outline: 'none' }} placeholder="Nome do caminho" />
              <select value={branch.logic} onChange={e => updateBranch(branch.id, { logic: e.target.value as 'AND' | 'OR' })}
                style={{ fontSize: '11px', fontWeight: 700, border: `1px solid ${bc}50`, borderRadius: '4px', padding: '2px 4px', background: '#fff', color: bc, cursor: 'pointer', outline: 'none', flexShrink: 0 }}>
                <option value="AND">E (AND)</option>
                <option value="OR">OU (OR)</option>
              </select>
              <button onMouseDown={e => { e.stopPropagation(); e.preventDefault() }} onClick={e => { e.stopPropagation(); e.preventDefault(); removeBranch(branch.id) }}
                style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', padding: '3px 5px', color: '#ef4444', display: 'flex', flexShrink: 0 }}>
                <X size={13} />
              </button>
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {branch.rules.map((rule, ri) => (
                <div key={rule.id}>
                  {ri > 0 && <div style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, color: bc, marginBottom: '6px' }}>{branch.logic}</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f9fafb', borderRadius: '8px', padding: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <select value={rule.field} onChange={e => updateRule(branch.id, rule.id, { field: e.target.value, fieldName: '' })}
                        style={{ ...inputStyle, flex: 1, padding: '5px 8px', fontSize: '12px' }}>
                        <option value="message">Mensagem</option>
                        <option value="variable">Variável</option>
                        <option value="phone">Telefone</option>
                        <option value="webhook_status">Status webhook</option>
                      </select>
                      <button onClick={() => {
                        if (branch.rules.length === 1) { updateRule(branch.id, rule.id, { field: 'message', fieldName: '', operator: 'contains', value: '' }) }
                        else { removeRule(branch.id, rule.id) }
                      }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#9ca3af', display: 'flex', flexShrink: 0 }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {rule.field === 'variable' && (
                      <input value={rule.fieldName || ''} onChange={e => updateRule(branch.id, rule.id, { fieldName: e.target.value })}
                        style={{ ...inputStyle, padding: '5px 8px', fontSize: '12px' }} placeholder="nome da variável" />
                    )}
                    <select value={rule.operator} onChange={e => updateRule(branch.id, rule.id, { operator: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', fontSize: '12px' }}>
                      {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                    </select>
                    {!['is_empty', 'is_not_empty'].includes(rule.operator) && (
                      <input value={rule.value} onChange={e => updateRule(branch.id, rule.id, { value: e.target.value })}
                        style={{ ...inputStyle, padding: '5px 8px', fontSize: '12px' }} placeholder="valor..." />
                    )}
                  </div>
                </div>
              ))}
              <button onClick={() => addRule(branch.id)}
                style={{ width: '100%', padding: '5px', background: 'transparent', border: `1px dashed ${bc}50`, borderRadius: '6px', color: bc, fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <Plus size={11} /> Adicionar regra
              </button>
            </div>
          </div>
        )
      })}

      <div style={{ border: '2px dashed #d1d5db', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#9ca3af', flexShrink: 0 }} />
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af' }}>Fallback</span>
        <span style={{ fontSize: '11px', color: '#d1d5db' }}>— quando nenhuma condição bater</span>
      </div>

      <button onClick={addBranch}
        style={{ width: '100%', padding: '8px', background: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: '8px', color: '#6b7280', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        <Plus size={13} /> Adicionar caminho
      </button>
    </div>
  )
}
