'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import { Download, Plus, Search, Loader2, User, Trash2, Pencil, X, Check, ChevronLeft, ChevronRight, FileSpreadsheet, Tag, Upload, AlertCircle, Settings2, GripVertical } from 'lucide-react'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useT } from '@/lib/i18n'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '13.5px', outline: 'none',
  color: 'var(--text)', fontFamily: 'inherit', transition: 'all 0.15s',
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600,
  color: 'var(--text-muted)', marginBottom: '5px', letterSpacing: '0.01em',
}

const TAG_COLORS = ['#16a34a','#2563eb','#7c3aed','#db2777','#d97706','#0891b2','#ea580c','#65a30d','#0284c7','#9333ea']

type CustomFieldType = 'text' | 'number' | 'date' | 'select'
interface CustomField { id: string; name: string; label: string; type: CustomFieldType; options: string[]; required: boolean; sort_order: number }

function getInitials(name: string | undefined | null) { return ((name || '??').trim().slice(0, 2)).toUpperCase() }
function getAvatarColor(name: string | undefined | null) {
  const colors = [{ bg: '#dbeafe', color: '#1d4ed8' },{ bg: '#dcfce7', color: '#15803d' },{ bg: '#fce7f3', color: '#be185d' },{ bg: '#ede9fe', color: '#6d28d9' },{ bg: '#ffedd5', color: '#c2410c' },{ bg: '#e0f2fe', color: '#0369a1' }]
  return colors[((name || '').charCodeAt(0) || 0) % colors.length]
}

function TagEditor({ contactId, contactTags, allTags, onChanged }: { contactId: string; contactTags: any[]; allTags: any[]; onChanged: () => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLSpanElement>(null)
  const activeIds = new Set(contactTags.map((t: any) => t.id))

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (btnRef.current) { const rect = btnRef.current.getBoundingClientRect(); setDropdownPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX }) }
    setOpen(o => !o)
  }
  const toggle = async (tag: any) => {
    setLoading(tag.id)
    try {
      if (activeIds.has(tag.id)) await contactApi.delete(`/contacts/${contactId}/tags`, { data: { tagIds: [tag.id] } })
      else await contactApi.post(`/contacts/${contactId}/tags`, { tagIds: [tag.id] })
      onChanged()
    } catch { toast.error(t('contacts.errorUpdateTag')) }
    setLoading(null)
  }
  useEffect(() => { if (!open) return; const close = () => setOpen(false); window.addEventListener('click', close); return () => window.removeEventListener('click', close) }, [open])

  return (
    <div style={{ display: 'inline-block' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px', alignItems: 'center' }}>
        {contactTags.map((tag: any) => (
          <span key={tag.id} style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '99px', background: `${tag.color || '#6b7280'}18`, color: tag.color || '#6b7280', border: `1px solid ${tag.color || '#6b7280'}40`, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {tag.name}<span onClick={e => { e.stopPropagation(); toggle(tag) }} style={{ cursor: 'pointer', lineHeight: 1, opacity: 0.6 }}>×</span>
          </span>
        ))}
        <span ref={btnRef} onClick={handleOpen} style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '99px', background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          <Plus size={9} /> tag
        </span>
      </div>
      {open && typeof window !== 'undefined' && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'var(--shadow)', padding: '6px', minWidth: '160px' }}>
          {allTags.length === 0 ? <p style={{ fontSize: '12px', color: 'var(--text-faint)', padding: '6px 8px', margin: 0 }}>{t('contacts.noTagsCreated')}</p>
            : allTags.map((tag: any) => {
              const active = activeIds.has(tag.id)
              return (
                <div key={tag.id} onClick={() => toggle(tag)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', background: active ? `${tag.color}12` : 'transparent' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = active ? `${tag.color}20` : 'var(--bg)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = active ? `${tag.color}12` : 'transparent'}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: tag.color || '#6b7280', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--text)', flex: 1 }}>{tag.name}</span>
                  {loading === tag.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faint)' }} /> : active && <Check size={11} color={tag.color || '#16a34a'} />}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

function CustomFieldsModal({ onClose, onSaved, tenantId }: { onClose: () => void; onSaved: () => void; tenantId: string }) {
  const t = useT()
  const [fields, setFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [newField, setNewField] = useState({ label: '', type: 'text' as CustomFieldType, options: '', required: false })

  useEffect(() => { loadFields() }, [])
  const loadFields = async () => { setLoading(true); const { data, error } = await supabase.from('custom_fields').select('*').eq('tenant_id', tenantId).order('sort_order', { ascending: true }); if (!error && data) setFields(data); setLoading(false) }
  const handleAddField = async () => {
    if (!newField.label.trim()) return; setSaving(true)
    const name = newField.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    const options = newField.type === 'select' ? newField.options.split(',').map(o => o.trim()).filter(Boolean) : []
    const { error } = await supabase.from('custom_fields').insert({ tenant_id: tenantId, name, label: newField.label.trim(), type: newField.type, options, required: newField.required, sort_order: fields.length })
    if (error) toast.error(t('contacts.error') + ': ' + error.message)
    else { toast.success(t('contacts.fieldCreated')); setNewField({ label: '', type: 'text', options: '', required: false }); await loadFields(); onSaved() }
    setSaving(false)
  }
  const handleDeleteField = async (id: string, label: string) => {
    if (!confirm(`${t('contacts.confirmDeleteField')} "${label}"?`)) return; setDeleting(id)
    const { error } = await supabase.from('custom_fields').delete().eq('id', id).eq('tenant_id', tenantId)
    if (error) toast.error(t('contacts.errorDeleteField')); else { toast.success(t('contacts.fieldDeleted')); await loadFields(); onSaved() }
    setDeleting(null)
  }
  const handleDragStart = (index: number) => setDragging(index)
  const handleDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); if (dragging === null || dragging === index) return; const r = [...fields]; const [m] = r.splice(dragging, 1); r.splice(index, 0, m); setFields(r); setDragging(index) }
  const handleDragEnd = async () => { setDragging(null); await Promise.all(fields.map((f, i) => supabase.from('custom_fields').update({ sort_order: i }).eq('id', f.id).eq('tenant_id', tenantId))); onSaved() }
  const FIELD_TYPE_LABELS: Record<CustomFieldType, string> = { text: t('contacts.fieldTypeText'), number: t('contacts.fieldTypeNumber'), date: t('contacts.fieldTypeDate'), select: t('contacts.fieldTypeSelect') }
  const FIELD_TYPE_COLORS: Record<CustomFieldType, { bg: string; color: string }> = { text: { bg: '#eff6ff', color: '#2563eb' }, number: { bg: '#f0fdf4', color: '#16a34a' }, date: { bg: '#fef3c7', color: '#d97706' }, select: { bg: '#faf5ff', color: '#7c3aed' } }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('contacts.customFieldsTitle')}</h3><p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>{t('contacts.customFieldsSubtitle')}</p></div>
          <button onClick={onClose} style={{ background: 'var(--bg)', border: 'none', borderRadius: '7px', cursor: 'pointer', padding: '6px', display: 'flex', color: 'var(--text-muted)' }}><X size={15} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          <div style={{ background: 'var(--bg-input)', border: '1px solid var(--divider)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#52525b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('contacts.newField')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '10px', marginBottom: '10px' }}>
              <div><label style={lbl}>{t('contacts.fieldName')}</label><input style={inp} placeholder="Ex: CPF, Aniversário, Plano..." value={newField.label} onChange={e => setNewField({ ...newField, label: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') handleAddField() }} /></div>
              <div><label style={lbl}>{t('contacts.fieldType')}</label><select style={{ ...inp, cursor: 'pointer' }} value={newField.type} onChange={e => setNewField({ ...newField, type: e.target.value as CustomFieldType })}><option value="text">{t('contacts.fieldTypeText')}</option><option value="number">{t('contacts.fieldTypeNumber')}</option><option value="date">{t('contacts.fieldTypeDate')}</option><option value="select">{t('contacts.fieldTypeSelect')}</option></select></div>
            </div>
            {newField.type === 'select' && <div style={{ marginBottom: '10px' }}><label style={lbl}>{t('contacts.optionsLabel')}</label><input style={inp} placeholder={t('contacts.optionsPlaceholder')} value={newField.options} onChange={e => setNewField({ ...newField, options: e.target.value })} /></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#52525b' }}>
                <input type="checkbox" checked={newField.required} onChange={e => setNewField({ ...newField, required: e.target.checked })} style={{ accentColor: '#7c3aed', width: '14px', height: '14px' }} /> {t('contacts.requiredField')}
              </label>
              <button onClick={handleAddField} disabled={!newField.label.trim() || saving}
                style={{ padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !newField.label.trim() ? 0.5 : 1 }}>
                {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />} {t('contacts.addField')}
              </button>
            </div>
          </div>
          {loading ? <div style={{ textAlign: 'center', padding: '30px' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-faintest)' }} /></div>
            : fields.length === 0 ? <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-faint)', fontSize: '14px' }}>{t('contacts.noFields')}</div>
            : <div>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#52525b', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('contacts.activeFields')} ({fields.length})</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {fields.map((field, index) => {
                  const ts = FIELD_TYPE_COLORS[field.type]
                  return (
                    <div key={field.id} draggable onDragStart={() => handleDragStart(index)} onDragOver={e => handleDragOver(e, index)} onDragEnd={handleDragEnd}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: dragging === index ? '#f5f3ff' : 'var(--bg-card)', border: `1px solid ${dragging === index ? '#7c3aed' : 'var(--border)'}`, borderRadius: '8px', cursor: 'grab' }}>
                      <GripVertical size={14} color="var(--text-faintest)" style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--text)' }}>{field.label}</span>
                          {field.required && <span style={{ fontSize: '10px', color: '#dc2626', fontWeight: 700 }}>{t('contacts.requiredBadge')}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '3px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: ts.bg, color: ts.color }}>{FIELD_TYPE_LABELS[field.type]}</span>
                          {field.type === 'select' && field.options?.length > 0 && <span style={{ fontSize: '10px', color: 'var(--text-faint)' }}>{field.options.join(' · ')}</span>}
                          <span style={{ fontSize: '10px', color: 'var(--text-faintest)', fontFamily: 'monospace' }}>{field.name}</span>
                        </div>
                      </div>
                      <button onClick={() => handleDeleteField(field.id, field.label)} disabled={deleting === field.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faintest)', padding: '4px', display: 'flex', borderRadius: '5px' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faintest)' }}>
                        {deleting === field.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  )
                })}
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '10px' }}>{t('contacts.dragToReorder')}</p>
            </div>}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--divider)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px', cursor: 'pointer', color: '#52525b' }}>{t('contacts.close')}</button>
        </div>
      </div>
    </div>
  )
}

function ImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const t = useT()
  const [rows, setRows] = useState<any[]>([])
  const [error, setError] = useState('')
  const [step, setStep] = useState<'upload' | 'preview'>('upload')
  const [isDragging, setIsDragging] = useState(false)
  const [importTagId, setImportTagId] = useState<string>('')

  const { data: importTags = [] } = useQuery({
    queryKey: ['tags-import'],
    queryFn: async () => { const { data } = await contactApi.get('/tags'); return data.data || [] },
  })

  const importMutation = useMutation({
    mutationFn: async () => {
      const payload = rows.map(r => ({ phone: String(r.telefone || r.phone || r.Phone || r.Telefone || '').replace(/\D/g, ''), name: r.nome || r.name || r.Name || r.Nome || '', email: r.email || r.Email || '', company: r.empresa || r.company || r.Company || r.Empresa || '' })).filter(r => r.phone.length >= 8)
      const { data } = await contactApi.post('/contacts/import', { rows: payload, tagId: importTagId || undefined }); return data
    },
    onSuccess: (data) => { toast.success(`${data?.data?.imported || rows.length} ${t('contacts.contactsImported')}`); onSuccess(); onClose() },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message || t('contacts.errorImport')),
  })

  const parseFile = (file: File) => {
    setError('')
    const MAX_FILE_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) { toast.error(t('contacts.fileTooLarge')); return }
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) { toast.error(t('contacts.invalidFormat')); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!json.length) { setError(t('contacts.emptySpreadsheet')); return }
        setRows(json); setStep('preview')
      } catch { setError(t('contacts.errorReadFile')) }
    }
    reader.readAsArrayBuffer(file)
  }
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) parseFile(file) }
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) parseFile(file); e.target.value = '' }
  const validRows = rows.filter(r => String(r.telefone || r.phone || r.Phone || r.Telefone || '').replace(/\D/g, '').length >= 8)
  const invalidCount = rows.length - validRows.length

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(2px)' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '100%', maxWidth: '620px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('contacts.importTitle')}</h3><p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>{t('contacts.importSupport')}</p></div>
          <button onClick={onClose} style={{ background: 'var(--bg)', border: 'none', borderRadius: '7px', cursor: 'pointer', padding: '6px', display: 'flex', color: 'var(--text-muted)' }}><X size={15} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {step === 'upload' && (<>
            <div onDragOver={e => { e.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}
              onClick={() => document.getElementById('excel-input')?.click()}
              style={{ border: `2px dashed ${isDragging ? '#22c55e' : 'var(--border)'}`, borderRadius: '10px', padding: '40px 20px', textAlign: 'center', background: isDragging ? '#f0fdf4' : 'var(--bg-input)', cursor: 'pointer', transition: 'all 0.15s', marginBottom: '16px' }}>
              <FileSpreadsheet size={36} color={isDragging ? '#22c55e' : 'var(--text-faintest)'} style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>{isDragging ? t('contacts.dropHere') : t('contacts.dragOrClick')}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-faint)' }}>.xlsx, .xls ou .csv — até 10MB</p>
              <input id="excel-input" type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFile} />
            </div>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 14px', display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '14px' }}><AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: '1px' }} /><span style={{ fontSize: '13px', color: '#dc2626' }}>{error}</span></div>}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '14px 16px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#15803d', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('contacts.recognizedColumns')}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                {[['telefone / phone', t('contacts.columnRequired')],['nome / name', t('contacts.columnOptional')],['email', t('contacts.columnOptional')],['empresa / company', t('contacts.columnOptional')]].map(([col, req]) => (
                  <div key={col} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: '4px' }}>{col}</span>
                    <span style={{ fontSize: '11px', color: req === t('contacts.columnRequired') ? '#dc2626' : 'var(--text-faint)' }}>{req}</span>
                  </div>
                ))}
              </div>
            </div>
          </>)}
          {step === 'preview' && (<>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>{validRows.length}</div>
                <div style={{ fontSize: '12px', color: '#15803d', marginTop: '4px' }}>{t('contacts.validContacts')}</div>
              </div>
              <div style={{ background: invalidCount > 0 ? '#fef2f2' : 'var(--bg-input)', border: `1px solid ${invalidCount > 0 ? '#fecaca' : 'var(--border)'}`, borderRadius: '8px', padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 800, color: invalidCount > 0 ? '#ef4444' : 'var(--text-faint)', lineHeight: 1 }}>{invalidCount}</div>
                <div style={{ fontSize: '12px', color: invalidCount > 0 ? '#dc2626' : 'var(--text-faint)', marginTop: '4px' }}>{t('contacts.noPhone')}</div>
              </div>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 1fr', background: 'var(--bg-input)', borderBottom: '1px solid var(--divider)', padding: '8px 12px', gap: '8px' }}>
                {[t('contacts.phone'), t('contacts.name'), t('contacts.email'), t('contacts.company')].map(h => <span key={h} style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>)}
              </div>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {validRows.slice(0, 50).map((r, i) => {
                  const phone = String(r.telefone || r.phone || r.Phone || r.Telefone || '').replace(/\D/g, '')
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 1fr', padding: '8px 12px', gap: '8px', borderBottom: '1px solid var(--divider)', background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-input)' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text)', fontFamily: 'monospace' }}>{phone}</span>
                      <span style={{ fontSize: '12px', color: '#52525b' }}>{String(r.nome || r.name || r.Name || r.Nome || '—').slice(0,20)}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{String(r.email || r.Email || '—').slice(0,25)}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{String(r.empresa || r.company || r.Company || r.Empresa || '—').slice(0,20)}</span>
                    </div>
                  )
                })}
                {validRows.length > 50 && <div style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-faint)', textAlign: 'center' }}>+ {validRows.length - 50} {t('contacts.notDisplayed')}</div>}
              </div>
            </div>
          </>)}
          {step === 'preview' && importTags.length > 0 && (
            <div style={{ marginTop: '14px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('contacts.applyTag')}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {importTags.map((tag: any) => {
                  const sel = importTagId === tag.id
                  return (
                    <div key={tag.id} onClick={() => setImportTagId(sel ? '' : tag.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '99px', cursor: 'pointer', border: `1.5px solid ${sel ? (tag.color || '#22c55e') : 'var(--border)'}`, background: sel ? `${tag.color || '#22c55e'}12` : 'var(--bg-card)', fontSize: '12px', fontWeight: 500, transition: 'all 0.1s' }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: tag.color || '#6b7280' }} />
                      <span style={{ color: sel ? (tag.color || '#22c55e') : 'var(--text)' }}>{tag.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--divider)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          {step === 'preview' && <button onClick={() => { setStep('upload'); setRows([]) }} style={{ padding: '8px 14px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px', cursor: 'pointer', color: '#52525b' }}>{t('contacts.changeFile')}</button>}
          <button onClick={onClose} style={{ padding: '8px 14px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px', cursor: 'pointer', color: '#52525b' }}>{t('common.cancel')}</button>
          {step === 'preview' && validRows.length > 0 && (
            <button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}
              style={{ padding: '8px 18px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {importMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />}
              {importMutation.isPending ? t('contacts.importing') : `${t('contacts.import')} ${validRows.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ContactsPage() {
  const t = useT()
  const { user } = useAuthStore()
  const tenantId = user?.tenantId || ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [showTags, setShowTags] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showCustomFields, setShowCustomFields] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; email: string; company: string; metadata: Record<string, any> }>({ name: '', email: '', company: '', metadata: {} })
  const [form, setForm] = useState({ phone: '', name: '', email: '', company: '' })
  const [createMetadata, setCreateMetadata] = useState<Record<string, any>>({})
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const queryClient = useQueryClient()

  const loadCustomFields = async () => { const { data } = await supabase.from('custom_fields').select('*').eq('tenant_id', tenantId).order('sort_order', { ascending: true }); if (data) setCustomFields(data) }
  useEffect(() => { loadCustomFields() }, [])

  const { data, isLoading } = useQuery({ queryKey: ['contacts', search, page], queryFn: async () => { const params = new URLSearchParams({ page: String(page), limit: '20' }); if (search) params.set('search', search); const { data } = await contactApi.get(`/contacts?${params}`); return data } })
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: async () => { const { data } = await contactApi.get('/tags'); return data.data || [] } })

  const createTagMutation = useMutation({ mutationFn: async () => { await contactApi.post('/tags', { name: newTagName, color: newTagColor }) }, onSuccess: () => { toast.success(t('contacts.tagCreated')); queryClient.invalidateQueries({ queryKey: ['tags'] }); setNewTagName(''); setNewTagColor(TAG_COLORS[0]) }, onError: () => toast.error(t('contacts.errorCreateTag')) })
  const deleteTagMutation = useMutation({ mutationFn: async (id: string) => { await contactApi.delete(`/tags/${id}`) }, onSuccess: () => { toast.success(t('contacts.tagDeleted')); queryClient.invalidateQueries({ queryKey: ['tags'] }) }, onError: () => toast.error(t('contacts.errorDeleteTag')) })
  const createMutation = useMutation({ mutationFn: async () => { const { data } = await contactApi.post('/contacts', { ...form, metadata: createMetadata }); return data }, onSuccess: () => { toast.success(t('contacts.contactCreated')); queryClient.invalidateQueries({ queryKey: ['contacts'] }); setShowCreate(false); setForm({ phone: '', name: '', email: '', company: '' }); setCreateMetadata({}) }, onError: (err: any) => toast.error(err?.response?.data?.error?.message || t('contacts.error')) })
  const updateMutation = useMutation({ mutationFn: async ({ id, data }: { id: string; data: any }) => { await contactApi.patch(`/contacts/${id}`, data) }, onSuccess: () => { toast.success(t('contacts.updated')); queryClient.invalidateQueries({ queryKey: ['contacts'] }); setEditingId(null) }, onError: (err: any) => toast.error(err?.response?.data?.error?.message || t('contacts.error')) })
  const deleteMutation = useMutation({ mutationFn: async (ids: string[]) => { await Promise.all(ids.map(id => contactApi.delete(`/contacts/${id}`))) }, onSuccess: () => { toast.success(t('contacts.deleted')); setSelected(new Set()); queryClient.invalidateQueries({ queryKey: ['contacts'] }) }, onError: () => toast.error(t('contacts.errorDeleteContacts')) })
  const deleteAllMutation = useMutation({ mutationFn: async () => { await contactApi.delete('/contacts/all') }, onSuccess: () => { toast.success(t('contacts.allDeleted')); setSelected(new Set()); setPage(1); queryClient.invalidateQueries({ queryKey: ['contacts'] }) }, onError: () => toast.error(t('contacts.error')) })

  const handleExport = async () => { const { data } = await contactApi.get('/contacts/export', { responseType: 'blob' }); const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = 'contatos.csv'; a.click(); toast.success(t('contacts.csvExported')) }
  const handleExportExcel = async () => {
    try {
      let allContacts: any[] = []; let p = 1
      while (true) { const { data } = await contactApi.get(`/contacts?page=${p}&limit=100`); const rows = data?.data || []; allContacts = [...allContacts, ...rows]; if (!data?.meta?.hasMore) break; p++ }
      if (allContacts.length === 0) { toast.error(t('contacts.noContactsShort')); return }
      const rows = allContacts.map((c: any) => { const base: any = { telefone: c.phone || '', nome: c.name || '', email: c.email || '', empresa: c.company || '', tags: (c.contact_tags || []).map((ct: any) => ct.tags?.name).filter(Boolean).join(', '), ultima_interacao: c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleDateString('pt-BR') : '' }; customFields.forEach(cf => { base[cf.label] = c.metadata?.[cf.name] ?? '' }); return base })
      const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Contatos'); XLSX.writeFile(wb, 'contatos.xlsx'); toast.success(`${allContacts.length} ${t('contacts.exported')}`)
    } catch { toast.error(t('contacts.errorExport')) }
  }

  const handleDelete = (id: string, name: string) => { if (confirm(`${t('contacts.confirmDelete')} "${name}"?`)) deleteMutation.mutate([id]) }
  const handleDeleteSelected = () => { if (confirm(t('contacts.confirmDeleteSelected').replace('{count}', String(selected.size)))) deleteMutation.mutate(Array.from(selected)) }
  const handleDeleteAll = () => { if (confirm(t('contacts.confirmDeleteAll').replace('{count}', meta?.total?.toLocaleString() || '0'))) deleteAllMutation.mutate() }
  const startEdit = (c: any) => { setEditingId(c.id); setEditForm({ name: c.name || '', email: c.email || '', company: c.company || '', metadata: c.metadata || {} }) }
  const saveEdit = () => { if (!editingId) return; updateMutation.mutate({ id: editingId, data: editForm }) }
  const toggleSelect = (id: string) => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next) }
  const toggleAll = () => { if (selected.size === contacts.length) setSelected(new Set()); else setSelected(new Set(contacts.map((c: any) => c.id))) }

  const renderCustomFieldInput = (field: CustomField, value: any, onChange: (val: any) => void, compact = false) => {
    const style = compact ? { ...inp, padding: '6px 10px', fontSize: '13px' } : inp
    if (field.type === 'select') return <select style={{ ...style, cursor: 'pointer' }} value={value || ''} onChange={e => onChange(e.target.value)}><option value="">— selecionar —</option>{(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}</select>
    if (field.type === 'date') return <input type="date" style={style} value={value || ''} onChange={e => onChange(e.target.value)} />
    if (field.type === 'number') return <input type="number" style={style} value={value || ''} onChange={e => onChange(e.target.value)} placeholder="0" />
    return <input type="text" style={style} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={field.label} />
  }

  const contacts = data?.data || []
  const meta = data?.meta
  const allSelected = contacts.length > 0 && selected.size === contacts.length
  const totalPages = meta ? Math.ceil(meta.total / meta.limit) : 1
  const tableColumns = [{ key: 'name', label: t('contacts.name'), width: '2.5fr' },{ key: 'phone', label: t('contacts.phone'), width: '1.5fr' },{ key: 'email', label: t('contacts.email'), width: '1.5fr' },...customFields.map(cf => ({ key: `meta_${cf.name}`, label: cf.label, width: '1fr', customField: cf })),{ key: 'last_interaction', label: t('contacts.lastInteraction'), width: '1fr' }]
  const gridTemplateColumns = `40px ${tableColumns.map(c => c.width).join(' ')} 80px`

  return (
    <div className="mobile-page" style={{ padding: '28px 32px', maxWidth: '1400px', background: 'var(--bg)', minHeight: '100%' }}>
      {showImport && <ImportModal onClose={() => setShowImport(false)} onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['contacts'] }); setPage(1) }} />}
      {showCustomFields && <CustomFieldsModal tenantId={tenantId} onClose={() => setShowCustomFields(false)} onSaved={() => loadCustomFields()} />}

      {/* Header */}
      <div className="mobile-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', margin: 0 }}>{t('contacts.title')}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', marginTop: '4px' }}>
            {meta?.total ? `${meta.total.toLocaleString()} ${t('contacts.count')}` : `0 ${t('contacts.count')}`}
            {customFields.length > 0 && ` · ${customFields.length} ${customFields.length > 1 ? t('contacts.customFieldsCountPlural') : t('contacts.customFieldsCount')}`}
          </p>
        </div>
        <div className="mobile-header-actions" style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {selected.size > 0 && (
            <button onClick={handleDeleteSelected} disabled={deleteMutation.isPending}
              style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#ef4444', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Trash2 size={13} /> {t('common.delete')} {selected.size}
            </button>
          )}
          {meta?.total > 0 && (
            <button onClick={handleDeleteAll} disabled={deleteAllMutation.isPending}
              style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#ef4444', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
              {deleteAllMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />} {t('contacts.deleteAll')}
            </button>
          )}
          <button onClick={handleExport} style={{ padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', color: '#52525b', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: 'var(--shadow)' }}>
            <Download size={13} /> {t('contacts.csv')}
          </button>
          <button onClick={handleExportExcel} style={{ padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', color: '#16a34a', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: 'var(--shadow)' }}>
            <FileSpreadsheet size={13} /> {t('contacts.excel')}
          </button>
          <button onClick={() => setShowImport(true)} style={{ padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', color: '#2563eb', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Upload size={13} /> {t('contacts.import')}
          </button>
          <button onClick={() => setShowCustomFields(true)}
            style={{ padding: '8px 12px', background: customFields.length > 0 ? '#faf5ff' : 'var(--bg-card)', border: `1px solid ${customFields.length > 0 ? '#a855f7' : 'var(--border)'}`, borderRadius: '8px', color: customFields.length > 0 ? '#7c3aed' : '#52525b', fontSize: '13px', fontWeight: customFields.length > 0 ? 600 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Settings2 size={13} /> {t('contacts.fields')} {customFields.length > 0 && `(${customFields.length})`}
          </button>
          <button onClick={() => setShowTags(!showTags)}
            style={{ padding: '8px 12px', background: showTags ? '#f0fdf4' : 'var(--bg-card)', border: `1px solid ${showTags ? '#22c55e' : 'var(--border)'}`, borderRadius: '8px', color: showTags ? '#16a34a' : '#52525b', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Tag size={13} /> {t('contacts.tags')} {(tags as any[]).length > 0 && `(${(tags as any[]).length})`}
          </button>
          <button onClick={() => setShowCreate(!showCreate)}
            style={{ padding: '8px 14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 1px 3px rgba(34,197,94,0.3)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#16a34a' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#22c55e' }}>
            <Plus size={13} /> {t('contacts.newContact').replace('+ ', '')}
          </button>
        </div>
      </div>

      {/* Painel de tags */}
      {showTags && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', margin: 0 }}>{t('contacts.manageTags')}</h3>
            <button onClick={() => setShowTags(false)} style={{ background: 'var(--bg)', border: 'none', borderRadius: '7px', cursor: 'pointer', color: 'var(--text-muted)', padding: '5px', display: 'flex' }}><X size={15} /></button>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={lbl}>{t('contacts.tagName')}</label>
              <input style={inp} placeholder="Ex: Lead quente, Cliente VIP..." value={newTagName} onChange={e => setNewTagName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newTagName) createTagMutation.mutate() }}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#22c55e'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(34,197,94,0.1)' }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border)'; (e.target as HTMLInputElement).style.boxShadow = 'none' }} />
            </div>
            <div>
              <label style={lbl}>{t('contacts.color')}</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxWidth: '220px' }}>
                {TAG_COLORS.map(c => <div key={c} onClick={() => setNewTagColor(c)} style={{ width: '24px', height: '24px', borderRadius: '50%', background: c, cursor: 'pointer', border: `3px solid ${newTagColor === c ? 'var(--text)' : 'transparent'}`, transition: 'border 0.1s' }} />)}
              </div>
            </div>
            <button onClick={() => createTagMutation.mutate()} disabled={!newTagName || createTagMutation.isPending}
              style={{ padding: '9px 14px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !newTagName ? 0.5 : 1, whiteSpace: 'nowrap' }}>
              {createTagMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />} {t('contacts.createTag')}
            </button>
          </div>
          {(tags as any[]).length === 0 ? <p style={{ fontSize: '13px', color: 'var(--text-faint)' }}>{t('contacts.noTags')}</p> : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {(tags as any[]).map((tag: any) => (
                <div key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '99px', background: `${tag.color || '#6b7280'}12`, border: `1px solid ${tag.color || '#6b7280'}30` }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: tag.color || '#6b7280', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{tag.name}</span>
                  <button onClick={() => { if (confirm(`${t('contacts.confirmDeleteTag')} "${tag.name}"?`)) deleteTagMutation.mutate(tag.id) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', display: 'flex', color: 'var(--text-faintest)', marginLeft: '2px' }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faintest)'}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', margin: 0 }}>{t('contacts.newContactTitle')}</h3>
            <button onClick={() => setShowCreate(false)} style={{ background: 'var(--bg)', border: 'none', borderRadius: '7px', cursor: 'pointer', color: 'var(--text-muted)', padding: '5px', display: 'flex' }}><X size={15} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div><label style={lbl}>{t('contacts.phone')} *</label><input style={inp} placeholder="+5547999990001" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label style={lbl}>{t('contacts.name')}</label><input style={inp} placeholder="João Silva" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><label style={lbl}>{t('contacts.email')}</label><input style={inp} type="text" placeholder="joao@empresa.com (opcional)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><label style={lbl}>{t('contacts.company')}</label><input style={inp} placeholder="Minha Empresa" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
            {customFields.map(cf => (
              <div key={cf.id}>
                <label style={lbl}>{cf.label}{cf.required && <span style={{ color: '#dc2626', marginLeft: '2px' }}>*</span>}</label>
                {renderCustomFieldInput(cf, createMetadata[cf.name], val => setCreateMetadata({ ...createMetadata, [cf.name]: val }))}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => createMutation.mutate()} disabled={!form.phone || createMutation.isPending}
              style={{ padding: '8px 18px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !form.phone ? 0.5 : 1 }}>
              {createMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />} {t('contacts.createContact')}
            </button>
            <button onClick={() => setShowCreate(false)} style={{ padding: '8px 14px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#52525b' }}>{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: '14px', position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
        <input style={{ ...inp, paddingLeft: '36px' }} placeholder={t('contacts.search')} value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#22c55e'; (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(34,197,94,0.1)' }}
          onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border)'; (e.target as HTMLInputElement).style.boxShadow = 'none' }} />
      </div>

      {/* Table */}
      <div className="mobile-scroll-x" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', overflowX: 'auto', boxShadow: 'var(--shadow)' }}>
        {isLoading ? (
          <div style={{ padding: '20px' }}><ListSkeleton rows={8} /></div>
        ) : contacts.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <User size={22} color="var(--text-faintest)" />
            </div>
            <p style={{ color: 'var(--text-faint)', fontSize: '14px' }}>{t('contacts.noContacts')}</p>
          </div>
        ) : (
          <>
            <div className="mobile-full" style={{ display: 'grid', gridTemplateColumns, gap: '12px', padding: '11px 20px', background: 'var(--bg-input)', borderBottom: '1px solid var(--divider)', alignItems: 'center', minWidth: '700px' }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#22c55e' }} />
              {tableColumns.map(col => <span key={col.key} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{col.label}</span>)}
              <span></span>
            </div>
            {contacts.map((c: any) => {
              const isEditing = editingId === c.id
              const av = getAvatarColor(c.name)
              return (
                <div key={c.id} className="mobile-full" style={{ display: 'grid', gridTemplateColumns, gap: '12px', padding: isEditing ? '10px 20px' : '12px 20px', borderBottom: '1px solid var(--divider)', alignItems: 'center', background: selected.has(c.id) ? '#f0fdf4' : isEditing ? '#fafff6' : 'var(--bg-card)', transition: 'background 0.1s', minWidth: '700px' }}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#22c55e' }} />
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0, marginTop: '2px' }}>{getInitials(c.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing
                        ? <input style={{ ...inp, padding: '6px 10px', fontSize: '13px' }} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} autoFocus />
                        : <><div style={{ fontWeight: 500, fontSize: '14px', color: 'var(--text)' }}>{c.name || '—'}</div><TagEditor contactId={c.id} contactTags={(c.contact_tags || []).map((ct: any) => ct.tags).filter(Boolean)} allTags={tags} onChanged={() => { queryClient.invalidateQueries({ queryKey: ['contacts'] }); queryClient.invalidateQueries({ queryKey: ['contact', c.id] }) }} /></>}
                    </div>
                  </div>
                  <span style={{ color: '#52525b', fontSize: '13px' }}>{c.phone}</span>
                  {isEditing
                    ? <input style={{ ...inp, padding: '6px 10px', fontSize: '13px' }} placeholder="email@exemplo.com" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                    : <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{c.email || '—'}</span>}
                  {customFields.map(cf => (
                    isEditing
                      ? <div key={cf.id}>{renderCustomFieldInput(cf, editForm.metadata[cf.name], val => setEditForm({ ...editForm, metadata: { ...editForm.metadata, [cf.name]: val } }), true)}</div>
                      : <span key={cf.id} style={{ color: 'var(--text-muted)', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.metadata?.[cf.name] || '—'}</span>
                  ))}
                  <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>{c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleDateString('pt-BR') : '—'}</span>
                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                    {isEditing ? (
                      <>
                        <button onClick={saveEdit} disabled={updateMutation.isPending} style={{ background: '#22c55e', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#fff', padding: '5px', display: 'flex' }}>
                          {updateMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                        </button>
                        <button onClick={() => setEditingId(null)} style={{ background: 'var(--bg)', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-muted)', padding: '5px', display: 'flex' }}><X size={13} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(c)} style={{ background: 'none', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-faintest)', padding: '5px', display: 'flex' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLButtonElement).style.color = '#52525b' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faintest)' }}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(c.id, c.name || c.phone)} style={{ background: 'none', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-faintest)', padding: '5px', display: 'flex' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faintest)' }}>
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {meta && meta.total > 20 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{((page - 1) * 20) + 1}–{Math.min(page * 20, meta.total)} / {meta.total.toLocaleString()} {t('contacts.count')}</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '7px', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? 'var(--text-faintest)' : '#52525b', display: 'flex', alignItems: 'center' }}><ChevronLeft size={14} /></button>
            <span style={{ padding: '6px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px', color: '#52525b' }}>{page} / {totalPages}</span>
            <button disabled={!meta.hasMore} onClick={() => setPage(p => p + 1)} style={{ padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '7px', cursor: !meta.hasMore ? 'not-allowed' : 'pointer', color: !meta.hasMore ? 'var(--text-faintest)' : '#52525b', display: 'flex', alignItems: 'center' }}><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus, select:focus { border-color: #22c55e !important; box-shadow: 0 0 0 3px rgba(34,197,94,0.1) !important; }
      `}</style>
    </div>
  )
}
