'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactApi } from '@/lib/api'
import { toast } from 'sonner'
import {
  ShoppingBag, Plus, Pencil, Trash2, Loader2, X, Package, BarChart3, Truck, TrendingUp, Tag, Receipt,
} from 'lucide-react'
import { useT } from '@/lib/i18n'

interface Product {
  id: string
  name: string
  description: string | null
  price: number
  sku: string | null
  category: string | null
  is_active: boolean
}

interface ProductStats {
  productId: string; name: string; unitPrice: number;
  totalQty: number; totalSales: number;
  subtotal: number; totalDiscount: number; totalSurcharge: number; totalShipping: number; totalRevenue: number;
  avgTicket: number;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '14px', outline: 'none', color: 'var(--text)',
}

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export default function ProductsPage() {
  const t = useT()
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formSku, setFormSku] = useState('')
  const [formCategory, setFormCategory] = useState('')

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => { const { data } = await contactApi.get('/products'); return data.data || [] },
  })

  const { data: stats = [] } = useQuery<ProductStats[]>({
    queryKey: ['purchases-summary'],
    queryFn: async () => { const { data } = await contactApi.get('/purchases/summary'); return data.data || [] },
  })

  const statsMap: Record<string, ProductStats> = {}
  for (const s of stats) statsMap[s.productId] = s

  const totalProducts = products.length
  const totalRevenue = stats.reduce((a, s) => a + s.totalRevenue, 0)
  const totalSold = stats.reduce((a, s) => a + s.totalQty, 0)
  const totalSales = stats.reduce((a, s) => a + s.totalSales, 0)
  const totalShipping = stats.reduce((a, s) => a + s.totalShipping, 0)
  const totalDiscount = stats.reduce((a, s) => a + s.totalDiscount, 0)

  const createMutation = useMutation({
    mutationFn: async (body: any) => { await contactApi.post('/products', body) },
    onSuccess: () => { toast.success('Produto criado'); queryClient.invalidateQueries({ queryKey: ['products'] }); closeModal() },
    onError: () => toast.error('Erro ao criar produto'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: any }) => { await contactApi.patch(`/products/${id}`, body) },
    onSuccess: () => { toast.success('Produto atualizado'); queryClient.invalidateQueries({ queryKey: ['products'] }); closeModal() },
    onError: () => toast.error('Erro ao atualizar'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await contactApi.delete(`/products/${id}`) },
    onSuccess: () => { toast.success('Produto removido'); queryClient.invalidateQueries({ queryKey: ['products'] }); queryClient.invalidateQueries({ queryKey: ['purchases-summary'] }) },
    onError: () => toast.error('Erro ao remover'),
  })

  function openCreateModal() {
    setEditingProduct(null)
    setFormName(''); setFormDescription(''); setFormPrice(''); setFormSku(''); setFormCategory('')
    setShowModal(true)
  }

  function openEditModal(p: Product) {
    setEditingProduct(p)
    setFormName(p.name); setFormDescription(p.description || ''); setFormPrice(String(p.price)); setFormSku(p.sku || ''); setFormCategory(p.category || '')
    setShowModal(true)
  }

  function closeModal() { setShowModal(false); setEditingProduct(null) }

  function handleSubmit() {
    if (!formName.trim()) { toast.error('Nome obrigatório'); return }
    const body = { name: formName.trim(), description: formDescription.trim() || null, price: parseFloat(formPrice) || 0, sku: formSku.trim() || null, category: formCategory.trim() || null }
    editingProduct ? updateMutation.mutate({ id: editingProduct.id, body }) : createMutation.mutate(body)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const summaryCards = [
    { icon: Package, color: 'var(--text-faint)', label: 'Produtos', value: String(totalProducts) },
    { icon: Receipt, color: '#22c55e', label: 'Receita total', value: fmt(totalRevenue), valueColor: '#22c55e' },
    { icon: BarChart3, color: '#6366f1', label: 'Unidades vendidas', value: String(totalSold) },
    { icon: TrendingUp, color: '#f59e0b', label: 'Pedidos', value: String(totalSales) },
    { icon: Truck, color: '#0891b2', label: 'Frete cobrado', value: fmt(totalShipping), valueColor: '#0891b2' },
    { icon: Tag, color: '#ef4444', label: 'Descontos dados', value: fmt(totalDiscount), valueColor: '#ef4444' },
  ]

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShoppingBag size={22} color="#22c55e" />
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Produtos</h1>
        </div>
        <button onClick={openCreateModal} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#16a34a')} onMouseLeave={e => (e.currentTarget.style.background = '#22c55e')}>
          <Plus size={15} /> Novo produto
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {summaryCards.map((c, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <c.icon size={14} color={c.color} />
              <span style={{ fontSize: '11px', color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</span>
            </div>
            <p style={{ fontSize: '22px', fontWeight: 700, color: c.valueColor || 'var(--text)', margin: 0 }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Product List */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Loader2 size={28} color="var(--text-faint)" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-faint)' }}>
          <ShoppingBag size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
          <p style={{ fontSize: '15px', fontWeight: 500 }}>Nenhum produto cadastrado</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 80px', gap: '12px', padding: '8px 16px', fontSize: '11px', fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Produto</span>
            <span style={{ textAlign: 'right' }}>Preço</span>
            <span style={{ textAlign: 'right' }}>Vendas</span>
            <span style={{ textAlign: 'right' }}>Receita</span>
            <span style={{ textAlign: 'right' }}>Frete</span>
            <span style={{ textAlign: 'right' }}>Descontos</span>
            <span></span>
          </div>

          {products.map((product) => {
            const s = statsMap[product.id]
            const isExpanded = expandedId === product.id

            return (
              <div key={product.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', transition: 'border-color 0.15s' }}>
                {/* Row principal */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : product.id)}
                  style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 80px', gap: '12px', padding: '14px 16px', alignItems: 'center', cursor: 'pointer' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {product.name}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '3px', alignItems: 'center' }}>
                      {product.category && (
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#6366f1', background: '#eef2ff', padding: '1px 6px', borderRadius: '99px' }}>{product.category}</span>
                      )}
                      {product.sku && <span style={{ fontSize: '10px', color: 'var(--text-faintest)' }}>SKU: {product.sku}</span>}
                    </div>
                  </div>
                  <span style={{ textAlign: 'right', fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{fmt(product.price)}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{s?.totalQty || 0} un</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{s?.totalSales || 0} pedidos</div>
                  </div>
                  <span style={{ textAlign: 'right', fontSize: '14px', fontWeight: 700, color: '#22c55e' }}>{fmt(s?.totalRevenue || 0)}</span>
                  <span style={{ textAlign: 'right', fontSize: '13px', color: s?.totalShipping ? '#0891b2' : 'var(--text-faintest)' }}>
                    {s?.totalShipping ? fmt(s.totalShipping) : '—'}
                  </span>
                  <span style={{ textAlign: 'right', fontSize: '13px', color: s?.totalDiscount ? '#ef4444' : 'var(--text-faintest)' }}>
                    {s?.totalDiscount ? `−${fmt(s.totalDiscount)}` : '—'}
                  </span>
                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                    <button onClick={(e) => { e.stopPropagation(); openEditModal(product) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-faint)', display: 'flex', borderRadius: '6px' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#2563eb')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); if (confirm('Remover produto?')) deleteMutation.mutate(product.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-faint)', display: 'flex', borderRadius: '6px' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Detalhes expandidos */}
                {isExpanded && s && (
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', paddingTop: '14px' }}>
                      <StatCard label="Subtotal (sem ajustes)" value={fmt(s.subtotal)} />
                      <StatCard label="Descontos concedidos" value={`−${fmt(s.totalDiscount)}`} color="#ef4444" />
                      <StatCard label="Acréscimos cobrados" value={`+${fmt(s.totalSurcharge)}`} color="#f59e0b" />
                      <StatCard label="Frete cobrado" value={fmt(s.totalShipping)} color="#0891b2" />
                      <StatCard label="Receita líquida" value={fmt(s.totalRevenue)} color="#22c55e" />
                      <StatCard label="Ticket médio" value={fmt(s.avgTicket)} color="#7c3aed" />
                    </div>
                    {product.description && (
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px', lineHeight: 1.5 }}>{product.description}</p>
                    )}
                  </div>
                )}

                {/* Se expandido mas sem vendas */}
                {isExpanded && !s && (
                  <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: '13px', color: 'var(--text-faint)' }}>
                    Nenhuma venda registrada para este produto.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={closeModal} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
          <div style={{ position: 'relative', background: 'var(--bg-card)', borderRadius: '16px', padding: '28px 32px', width: '100%', maxWidth: '480px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                {editingProduct ? 'Editar produto' : 'Novo produto'}
              </h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', padding: '4px' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Nome *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Nome do produto" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Preço (R$)</label>
                <input value={formPrice} onChange={e => setFormPrice(e.target.value)} placeholder="0.00" type="number" step="0.01" min="0" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Descrição</label>
                <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Descrição do produto" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>SKU</label>
                  <input value={formSku} onChange={e => setFormSku(e.target.value)} placeholder="SKU-001" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Categoria</label>
                  <input value={formCategory} onChange={e => setFormCategory(e.target.value)} placeholder="Ex: Serviço" style={inputStyle} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button onClick={closeModal} style={{ padding: '9px 18px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSubmit} disabled={isSaving} style={{ padding: '9px 22px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isSaving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                {editingProduct ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg)', borderRadius: '8px', padding: '10px 12px' }}>
      <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '15px', fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
    </div>
  )
}
