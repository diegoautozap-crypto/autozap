'use client'
import { useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { NODE_COLORS, NODE_ICONS, NODE_LABELS, BRANCH_COLORS } from './constants'
import type { ConditionBranch } from './constants'

export function FlowNode({ data, selected }: { data: any; selected: boolean }) {
  const color = NODE_COLORS[data.type] || '#6b7280'
  const Icon = NODE_ICONS[data.type] || NODE_ICONS.trigger_keyword
  const isTrigger = data.type?.startsWith('trigger_')
  const isCondition = data.type === 'condition'
  const [hovered, setHovered] = useState(false)
  const branches: ConditionBranch[] = data.branches || []

  const subtitle = () => {
    if (data.type === 'trigger_keyword') return (data.keywords || []).join(', ') || 'Nenhuma palavra'
    if (data.type === 'trigger_first_message') return 'Primeira mensagem do contato'
    if (data.type === 'trigger_any_reply') return 'Qualquer mensagem recebida'
    if (data.type === 'trigger_outside_hours') return `${data.start ?? 9}h – ${data.end ?? 18}h`
    if (data.type === 'send_message') return (data.message || '').slice(0, 50) || 'Sem mensagem'
    if (data.type === 'send_image') return data.mediaUrl ? '✓ Imagem carregada' : 'Nenhuma imagem'
    if (data.type === 'send_video') return data.mediaUrl ? '✓ Vídeo carregado' : 'Nenhum vídeo'
    if (data.type === 'send_audio') return data.mediaUrl ? '✓ Áudio carregado' : 'Nenhum áudio'
    if (data.type === 'send_document') return data.mediaUrl ? '✓ Documento carregado' : 'Nenhum documento'
    if (data.type === 'input') return data.question ? data.question.slice(0, 40) : 'Aguardando resposta...'
    if (data.type === 'condition') {
      if (branches.length > 0) return `${branches.length} condição${branches.length > 1 ? 'ões' : ''} + fallback`
      return 'Configurar condições'
    }
    if (data.type === 'ai') return data.mode === 'classify' ? 'Classificar intenção' : data.mode === 'extract' ? 'Extrair dados' : data.mode === 'summarize' ? 'Resumir' : 'Responder com IA'
    if (data.type === 'webhook') return data.url ? data.url.slice(0, 40) : 'URL não configurada'
    if (data.type === 'wait') {
      if (data.days) return `Aguardar ${data.days} dia${data.days > 1 ? 's' : ''}`
      if (data.hours) return `Aguardar ${data.hours}h`
      if (data.minutes) return `Aguardar ${data.minutes} min`
      return `Aguardar ${data.seconds ?? 0}s`
    }
    if (data.type === 'add_tag') return data.tagName || 'Tag não selecionada'
    if (data.type === 'remove_tag') return data.tagName || 'Tag não selecionada'
    if (data.type === 'update_contact') return data.field ? `Atualizar ${data.field}` : 'Campo não definido'
    if (data.type === 'move_pipeline') return data.stageLabel || data.stage || 'Etapa não definida'
    if (data.type === 'assign_agent') return 'Transferir para atendente'
    if (data.type === 'go_to') return 'Ir para outro flow'
    if (data.type === 'loop_repeat') return `Repetir ${data.times ?? 1}x`
    if (data.type === 'loop_retry') return `Até ${data.maxRetries ?? 3} tentativas`
    if (data.type === 'loop_while') return data.conditionFieldName ? `Enquanto ${data.conditionFieldName}` : 'Configurar condição'
    if (data.type === 'end') return data.message ? data.message.slice(0, 40) : 'Finalizar'
    return ''
  }

  const isLoop = data.type === 'loop_repeat' || data.type === 'loop_retry' || data.type === 'loop_while'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff', border: `2px solid ${selected ? color : '#e5e7eb'}`,
        borderRadius: '12px', padding: '14px 16px', minWidth: '220px', maxWidth: '260px',
        minHeight: isCondition && branches.length > 0 ? `${16 + (branches.length + 1) * 36 + 20}px` : 'auto',
        boxShadow: selected ? `0 0 0 3px ${color}22` : '0 2px 8px rgba(0,0,0,.08)',
        transition: 'all 0.15s', position: 'relative',
      }}>

      {/* Delete button — transparent until hover */}
      <div
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); data.onDelete?.(data.nodeId) }}
        title="Deletar nó"
        style={{
          position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
          width: '22px', height: '22px',
          background: hovered ? '#ef4444' : 'transparent',
          border: hovered ? 'none' : '2px solid #e5e7eb',
          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: hovered ? '0 2px 5px rgba(0,0,0,.2)' : 'none',
          zIndex: 20, transition: 'all 0.15s',
        }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={hovered ? '#fff' : '#d1d5db'} strokeWidth="2.5">
          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </div>

      {!isTrigger && (
        <Handle type="target" position={Position.Left}
          style={{ background: '#d1d5db', width: 10, height: 10, border: '2px solid #fff' }} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={14} color={color} />
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {isTrigger ? 'Gatilho' : data.type === 'end' ? 'Fim' : 'Ação'}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>
            {NODE_LABELS[data.type] || data.type}
          </div>
        </div>
      </div>

      {data.type === 'send_image' && data.mediaUrl && (
        <img src={data.mediaUrl} alt="preview" style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '6px', marginBottom: '6px' }} />
      )}

      {subtitle() && (
        <div style={{ fontSize: '11px', color: '#9ca3af', background: '#f9fafb', borderRadius: '6px', padding: '5px 8px', wordBreak: 'break-word' }}>
          {subtitle()}
        </div>
      )}

      {isCondition && branches.length > 0 && (
        <>
          {branches.map((branch, i) => {
            const bc = BRANCH_COLORS[i % BRANCH_COLORS.length]
            return (
              <Handle key={branch.id} type="source" position={Position.Right}
                id={`branch_${branch.id}`}
                style={{ background: bc, width: 14, height: 14, border: '3px solid #fff', position: 'absolute', right: -8, top: 16 + i * 36, transform: 'none', zIndex: 10 }} />
            )
          })}
          <Handle type="source" position={Position.Right} id="fallback"
            style={{ background: '#9ca3af', width: 14, height: 14, border: '3px solid #fff', position: 'absolute', right: -8, top: 16 + branches.length * 36, transform: 'none', zIndex: 10 }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
            {branches.map((branch, i) => (
              <span key={branch.id} style={{ fontSize: '10px', color: BRANCH_COLORS[i % BRANCH_COLORS.length], fontWeight: 600 }}>{branch.label}</span>
            ))}
            <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600 }}>· Fallback</span>
          </div>
        </>
      )}

      {isCondition && branches.length === 0 && (
        <>
          <Handle type="source" position={Position.Right} id="true" style={{ background: '#16a34a', width: 10, height: 10, border: '2px solid #fff', top: '35%' }} />
          <Handle type="source" position={Position.Right} id="false" style={{ background: '#ef4444', width: 10, height: 10, border: '2px solid #fff', top: '65%' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', marginTop: '8px' }}>
            <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>✓ Sim</span>
            <span style={{ fontSize: '10px', color: '#6b7280' }}>·</span>
            <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 600 }}>✗ Não</span>
          </div>
        </>
      )}

      {!isCondition && data.type !== 'end' && (
        <Handle type="source" position={Position.Right} id="success"
          style={{ background: color, width: 10, height: 10, border: '2px solid #fff' }} />
      )}
    </div>
  )
}
