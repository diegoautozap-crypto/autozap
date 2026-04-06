'use client'
import { useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { NODE_COLORS, NODE_ICONS, BRANCH_COLORS, getNodeLabels, getSendSubtypes, getTagSubtypes, getLoopSubtypes } from './constants'
import type { ConditionBranch } from './constants'
import { useT } from '@/lib/i18n'

export function FlowNode({ data, selected }: { data: any; selected: boolean }) {
  const t = useT()
  const nodeLabels = getNodeLabels(t)
  const sendSubtypes = getSendSubtypes(t)
  const tagSubtypes = getTagSubtypes(t)
  const loopSubtypes = getLoopSubtypes(t)
  const color = NODE_COLORS[data.type] || '#6b7280'
  const Icon = NODE_ICONS[data.type] || NODE_ICONS.trigger_keyword
  const isTrigger = data.type?.startsWith('trigger_')
  const isCondition = data.type === 'condition'
  const isLoop = data.type === 'loop'
  const [hovered, setHovered] = useState(false)
  const branches: ConditionBranch[] = data.branches || []

  // Label do subtipo para nodes consolidados
  const subtypeLabel = () => {
    if (data.type === 'send_message') {
      const st = sendSubtypes.find(s => s.value === (data.subtype || 'text'))
      return st ? `${st.emoji} ${st.label}` : `💬 ${t('nodes.sendText')}`
    }
    if (data.type === 'tag_contact') {
      const st = tagSubtypes.find(s => s.value === (data.subtype || 'add'))
      return st ? `${st.emoji} ${st.label}` : `➕ ${t('nodes.tagAdd')}`
    }
    if (data.type === 'loop') {
      const st = loopSubtypes.find(s => s.value === (data.subtype || 'repeat'))
      return st ? `${st.emoji} ${st.label}` : `🔁 ${t('nodes.loopRepeat')}`
    }
    return null
  }

  const subtitle = () => {
    if (data.type === 'trigger_keyword') return (data.keywords || []).join(', ') || t('nodes.noKeyword')
    if (data.type === 'trigger_first_message') return t('nodes.firstMessageSubtitle')
    if (data.type === 'trigger_any_reply') return t('nodes.anyReplySubtitle')
    if (data.type === 'trigger_outside_hours') return `${data.start ?? 9}h – ${data.end ?? 18}h`
    if (data.type === 'trigger_manual') {
      const count = (data.tagIds || []).length
      return `${count} tag${count !== 1 ? 's' : ''} ${count !== 1 ? t('nodes.tagsSelectedPlural') : t('nodes.tagsSelected')}`
    }
    if (data.type === 'send_message') {
      const sub = data.subtype || 'text'
      if (sub === 'text') return (data.message || '').slice(0, 50) || t('nodes.noMessage')
      if (sub === 'image') return data.mediaUrl ? `✓ ${t('nodes.imageLoaded')}` : t('nodes.noImage')
      if (sub === 'video') return data.mediaUrl ? `✓ ${t('nodes.videoLoaded')}` : t('nodes.noVideo')
      if (sub === 'audio') return data.mediaUrl ? `✓ ${t('nodes.audioLoaded')}` : t('nodes.noAudio')
      if (sub === 'document') return data.mediaUrl ? `✓ ${t('nodes.documentLoaded')}` : t('nodes.noDocument')
    }
    if (data.type === 'input') return data.question ? data.question.slice(0, 40) : t('nodes.waitingResponse')
    if (data.type === 'condition') {
      if (branches.length > 0) return `${branches.length} ${branches.length > 1 ? t('nodes.conditionsCountPlural') : t('nodes.conditionsCount')} ${t('nodes.plusFallback')}`
      return t('nodes.configureConditions')
    }
    if (data.type === 'ai') return data.mode === 'classify' ? t('nodes.classifyIntent') : data.mode === 'extract' ? t('nodes.extractData') : data.mode === 'summarize' ? t('nodes.summarize') : t('nodes.respondWithAi')
    if (data.type === 'webhook') return data.url ? data.url.slice(0, 40) : t('nodes.urlNotConfigured')
    if (data.type === 'wait') {
      const parts: string[] = []
      if (data.days) parts.push(`${data.days}d`)
      if (data.hours) parts.push(`${data.hours}h`)
      if (data.minutes) parts.push(`${data.minutes}min`)
      if (data.seconds) parts.push(`${data.seconds}s`)
      return parts.length > 0 ? `${t('nodes.waitPrefix')} ${parts.join(' ')}` : `${t('nodes.waitPrefix')} 0s`
    }
    if (data.type === 'tag_contact') return data.tagName || t('nodes.tagNotSelected')
    if (data.type === 'update_contact') {
      const uf = data.updateFields || (data.field ? [data] : [])
      if (uf.length === 0) return t('nodes.fieldNotDefined')
      const labels = uf.map((f: any) => f.field === 'custom' ? (f.customField || 'custom') : f.field).filter(Boolean)
      return labels.length > 2 ? `${labels.slice(0, 2).join(', ')} +${labels.length - 2}` : labels.join(', ') || t('nodes.fieldNotDefined')
    }
    if (data.type === 'move_pipeline') return data.stageLabel || data.stage || t('nodes.stageNotDefined')
    if (data.type === 'assign_agent') return t('nodes.transferToAgent')
    if (data.type === 'go_to') return t('nodes.goToAnotherFlow')
    if (data.type === 'loop') {
      const sub = data.subtype || 'repeat'
      if (sub === 'repeat') return t('nodes.repeatTimes').replace('{n}', String(data.times ?? 1))
      if (sub === 'retry') return t('nodes.upToRetries').replace('{n}', String(data.maxRetries ?? 3))
      if (sub === 'while') return data.conditionFieldName ? `${t('nodes.whilePrefix')} ${data.conditionFieldName}` : t('nodes.configureCondition')
    }
    if (data.type === 'schedule_appointment') return data.schedulingConfigId ? `✓ ${t('nodes.scheduleAppointment')}` : t('nodes.schedulingConfigSelect')
    if (data.type === 'end') return data.message ? data.message.slice(0, 40) : t('nodes.finalize')
    return ''
  }

  const sl = subtypeLabel()

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        border: `2px solid ${selected ? color : '#e5e7eb'}`,
        borderRadius: '12px',
        padding: '14px 16px',
        minWidth: '220px',
        maxWidth: '260px',
        minHeight: isCondition && branches.length > 0 ? `${16 + (branches.length + 1) * 36 + 20}px` : 'auto',
        boxShadow: selected ? `0 0 0 3px ${color}22` : '0 2px 8px rgba(0,0,0,.08)',
        transition: 'all 0.15s',
        position: 'relative',
      }}>

      {/* Delete button */}
      {data.onDelete && <div
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); data.onDelete?.(data.nodeId) }}
        title={t('nodes.deleteNode')}
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
      </div>}

      {!isTrigger && (
        <Handle type="target" position={Position.Left}
          style={{ background: '#d1d5db', width: 10, height: 10, border: '2px solid #fff' }} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: sl ? '6px' : '6px' }}>
        <div style={{
          width: '30px', height: '30px', borderRadius: '8px',
          background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={15} color={color} />
        </div>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isTrigger ? t('nodes.sectionTrigger') : data.type === 'end' ? t('nodes.sectionEnd') : t('nodes.sectionAction')}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', lineHeight: 1.2 }}>
            {nodeLabels[data.type] || data.type}
          </div>
        </div>
      </div>

      {/* Subtipo badge para nodes consolidados */}
      {sl && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          fontSize: '11px', fontWeight: 600, color,
          background: `${color}12`, border: `1px solid ${color}30`,
          borderRadius: '99px', padding: '2px 8px', marginBottom: '6px',
        }}>
          {sl}
        </div>
      )}

      {/* Preview de imagem */}
      {data.type === 'send_message' && data.subtype === 'image' && data.mediaUrl && (
        <img src={data.mediaUrl} alt="preview" style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '6px', marginBottom: '6px' }} />
      )}

      {/* Subtitle */}
      {subtitle() && (
        <div style={{ fontSize: '11px', color: '#9ca3af', background: '#f9fafb', borderRadius: '6px', padding: '5px 8px', wordBreak: 'break-word' }}>
          {subtitle()}
        </div>
      )}

      {/* Condition branches */}
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
            <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600 }}>· {t('nodes.fallbackLabel')}</span>
          </div>
        </>
      )}

      {isCondition && branches.length === 0 && (
        <>
          <Handle type="source" position={Position.Right} id="true" style={{ background: '#16a34a', width: 10, height: 10, border: '2px solid #fff', top: '35%' }} />
          <Handle type="source" position={Position.Right} id="false" style={{ background: '#ef4444', width: 10, height: 10, border: '2px solid #fff', top: '65%' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', marginTop: '8px' }}>
            <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>✓ {t('nodes.yesLabel')}</span>
            <span style={{ fontSize: '10px', color: '#6b7280' }}>·</span>
            <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 600 }}>✗ {t('nodes.noLabel')}</span>
          </div>
        </>
      )}

      {/* Loop handles */}
      {isLoop && (
        <>
          <Handle type="source" position={Position.Right} id="loop"
            style={{ background: color, width: 10, height: 10, border: '2px solid #fff', top: '35%' }} />
          <Handle type="source" position={Position.Right} id="done"
            style={{ background: '#9ca3af', width: 10, height: 10, border: '2px solid #fff', top: '65%' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', marginTop: '8px' }}>
            <span style={{ fontSize: '10px', color, fontWeight: 600 }}>↺ {t('nodes.loopLabel')}</span>
            <span style={{ fontSize: '10px', color: '#6b7280' }}>·</span>
            <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600 }}>✓ {t('nodes.doneLabel')}</span>
          </div>
        </>
      )}

      {/* Input com timeout: 2 saídas */}
      {data.type === 'input' && data.timeoutHours > 0 ? (
        <>
          <Handle type="source" position={Position.Right} id="success"
            style={{ background: color, width: 10, height: 10, border: '2px solid #fff', top: '35%' }} />
          <Handle type="source" position={Position.Right} id="timeout"
            style={{ background: '#ef4444', width: 10, height: 10, border: '2px solid #fff', top: '65%' }} />
          <div style={{ position: 'absolute', right: -70, top: '28%', fontSize: '9px', color: '#6b7280', fontWeight: 600 }}>✓ {t('nodes.responseLabel')}</div>
          <div style={{ position: 'absolute', right: -62, top: '58%', fontSize: '9px', color: '#ef4444', fontWeight: 600 }}>⏰ {t('nodes.timeoutLabel')}</div>
        </>
      ) : (data.type === 'split_ab' || data.type === 'random_path') ? (
        <>
          {/* Split/Random: múltiplas saídas */}
          {(data.type === 'split_ab'
            ? (data.splitPaths || [{ label: 'A', weight: 50 }, { label: 'B', weight: 50 }])
            : (data.randomPaths || ['A', 'B']).map((p: string, i: number) => ({ label: p, i }))
          ).map((p: any, i: number) => (
            <Handle key={i} type="source" position={Position.Right}
              id={data.type === 'split_ab' ? `split_${i}` : `random_${i}`}
              style={{ background: BRANCH_COLORS[i % BRANCH_COLORS.length], width: 10, height: 10, border: '2px solid #fff', top: `${20 + i * (60 / Math.max((data.splitPaths || data.randomPaths || ['A', 'B']).length - 1, 1))}%` }} />
          ))}
          <div style={{ position: 'absolute', right: -50, top: '10%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {(data.type === 'split_ab'
              ? (data.splitPaths || [{ label: 'A', weight: 50 }, { label: 'B', weight: 50 }])
              : (data.randomPaths || ['A', 'B']).map((p: string) => ({ label: p }))
            ).map((p: any, i: number) => (
              <span key={i} style={{ fontSize: '9px', fontWeight: 700, color: BRANCH_COLORS[i % BRANCH_COLORS.length] }}>
                {p.label}{data.type === 'split_ab' ? ` ${p.weight}%` : ''}
              </span>
            ))}
          </div>
        </>
      ) : !isCondition && !isLoop && data.type !== 'end' ? (
        <Handle type="source" position={Position.Right} id="success"
          style={{ background: color, width: 10, height: 10, border: '2px solid #fff' }} />
      ) : null}

      {data._execCount > 0 && (
        <div style={{ position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '3px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '99px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
            ✓ {data._execCount}
          </span>
          {data._errorCount > 0 && (
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '99px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              ✗ {data._errorCount}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
