'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactApi } from '@/lib/api'
import { toast } from 'sonner'
import {
  ShoppingBag, Plus, Pencil, Trash2, Loader2, X, Package, DollarSign, BarChart3,
} from 'lucide-react'
import { useT } from '@/lib/i18n'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: string
  tenant_id: string
  name: string
  description: string | null
  price: number
  sku: string | null
  category: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface PurchaseSummary {
  name: string
  totalQty: number
  totalRevenue: number
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '14px', outline: 'none', color: 'var(--text)',
  transition: 'border-color 0.15s, background 0.15s',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const t = useT()
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formSku, setFormSku] = useState('')
  const [formCategory, setFormCategory] = useState('')

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await contactApi.get('/products')
      return data.data || []
    },
  })

  const { data: summary = [] } = useQuery<PurchaseSummary[]>({
    queryKey: ['purchases-summary'],
    queryFn: async () => {
      const { data } = await contactApi.get('/purchases/summary')
      return data.data || []
    },
  })

  const totalProducts = products.length
  const totalRevenue = summary.reduce((acc, s) => acc + s.totalRevenue, 0)
  const totalSold = summary.reduce((acc, s) => acc + s.totalQty, 0)

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const { data } = await contactApi.post('/products', body)
      return data.data
    },
    onSuccess: () => {
      toast.success('Produto criado')
      queryClient.invalidateQueries({ queryKey: ['products'] })
      closeModal()
    },
    onError: () => toast.error('Erro ao criar produto'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: any }) => {
      const { data } = await contactApi.patch(`/products/${id}`, body)
      return data.data
    },
    onSuccess: () => {
      toast.success('Produto atualizado')
      queryClient.invalidateQueries({ queryKey: ['products'] })
      closeModal()
    },
    onError: () => toast.error('Erro ao atualizar produto'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await contactApi.delete(`/products/${id}`)
    },
    onSuccess: () => {
      toast.success('Produto removido')
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['purchases-summary'] })
    },
    onError: () => toast.error('Erro ao remover produto'),
  })

  // ── Helpers ────────────────────────────────────────────────────────────────

  function openCreateModal() {
    setEditingProduct(null)
    setFormName(''); setFormDescription(''); setFormPrice(''); setFormSku(''); setFormCategory('')
    setShowModal(true)
  }

  function openEditModal(product: Product) {
    setEditingProduct(product)
    setFormName(product.name)
    setFormDescription(product.description || '')
    setFormPrice(String(product.price))
    setFormSku(product.sku || '')
    setFormCategory(product.category || '')
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingProduct(null)
  }

  function handleSubmit() {
    if (!formName.trim()) { toast.error('Nome obrigatorio'); return }
    const body = {
      name: formName.trim(),
      description: formDescription.trim() || null,
      price: parseFloat(formPrice) || 0,
      sku: formSku.trim() || null,
      category: formCategory.trim() || null,
    }
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, body })
    } else {
      createMutation.mutate(body)
    }
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShoppingBag size={22} color="#22c55e" />
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Produtos</h1>
        </div>
        <button onClick={openCreateModal} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '9px 18px', background: '#22c55e', color: '#fff',
          border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
          cursor: 'pointer', transition: 'background 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = '#16a34a')}
          onMouseLeave={e => (e.currentTarget.style.background = '#22c55e')}>
          <Plus size={15} /> Novo produto
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Package size={16} color="var(--text-faint)" />
            <span style={{ fontSize: '12px', color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Produtos cadastrados</span>
          </div>
          <p style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{totalProducts}</p>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <DollarSign size={16} color="#22c55e" />
            <span style={{ fontSize: '12px', color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Receita total</span>
          </div>
          <p style={{ fontSize: '26px', fontWeight: 700, color: '#22c55e', margin: 0 }}>{formatCurrency(totalRevenue)}</p>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <BarChart3 size={16} color="#6366f1" />
            <span style={{ fontSize: '12px', color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unidades vendidas</span>
          </div>
          <p style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{totalSold}</p>
        </div>
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
          <p style={{ fontSize: '13px', color: 'var(--text-faintest)' }}>Clique em "Novo produto" para comecar</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
          {products.map((product) => {
            const prodSummary = summary.find(s => s.name === product.name)
            return (
              <div
                key={product.id}
                onMouseEnter={() => setHoveredId(product.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  background: 'var(--bg-card)', border: `1px solid ${hoveredId === product.id ? '#22c55e40' : 'var(--border)'}`,
                  borderRadius: '12px', padding: '18px 20px',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  boxShadow: hoveredId === product.id ? '0 2px 12px rgba(34,197,94,0.08)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</h3>
                    {product.category && (
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#6366f1', background: '#eef2ff', border: '1px solid #c7d2fe', padding: '2px 8px', borderRadius: '99px', display: 'inline-block' }}>
                        {product.category}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '18px', fontWeight: 700, color: '#22c55e', margin: 0, whiteSpace: 'nowrap', marginLeft: '12px' }}>
                    {formatCurrency(product.price)}
                  </p>
                </div>

                {product.description && (
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {product.description}
                  </p>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--divider)' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {product.sku && <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>SKU: {product.sku}</span>}
                    {prodSummary && <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>{prodSummary.totalQty} vendas</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => openEditModal(product)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-faint)', display: 'flex', borderRadius: '6px', transition: 'color 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#2563eb')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => { if (confirm('Remover produto?')) deleteMutation.mutate(product.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-faint)', display: 'flex', borderRadius: '6px', transition: 'color 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
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
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', padding: '4px' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Nome *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Nome do produto" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Preco (R$)</label>
                <input value={formPrice} onChange={e => setFormPrice(e.target.value)} placeholder="0.00" type="number" step="0.01" min="0" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Descricao</label>
                <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Descricao do produto" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>SKU</label>
                  <input value={formSku} onChange={e => setFormSku(e.target.value)} placeholder="SKU-001" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '5px' }}>Categoria</label>
                  <input value={formCategory} onChange={e => setFormCategory(e.target.value)} placeholder="Ex: Servico" style={inputStyle} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button onClick={closeModal} style={{ padding: '9px 18px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleSubmit} disabled={isSaving} style={{
                padding: '9px 22px', background: '#22c55e', color: '#fff',
                border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.6 : 1,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                {isSaving && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
                {editingProduct ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
