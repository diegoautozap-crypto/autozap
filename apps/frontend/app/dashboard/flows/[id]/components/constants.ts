import {
  Zap, MessageSquare, Clock, Tag, MoveRight, UserCheck,
  Image, Video, Music, FileText, AlignLeft, GitBranch,
  Brain, Webhook, TagsIcon, UserCog, CornerDownRight, Square, Reply,
  RefreshCw, RotateCcw, Repeat,
} from 'lucide-react'

export const NODE_COLORS: Record<string, string> = {
  trigger_keyword:       '#16a34a',
  trigger_first_message: '#16a34a',
  trigger_any_reply:     '#16a34a',
  trigger_outside_hours: '#16a34a',
  send_message:          '#2563eb',
  send_image:            '#0891b2',
  send_video:            '#7c3aed',
  send_audio:            '#db2777',
  send_document:         '#d97706',
  input:                 '#0284c7',
  condition:             '#ea580c',
  ai:                    '#6d28d9',
  webhook:               '#0f172a',
  wait:                  '#6b7280',
  add_tag:               '#0891b2',
  remove_tag:            '#dc2626',
  update_contact:        '#0369a1',
  move_pipeline:         '#d97706',
  assign_agent:          '#db2777',
  go_to:                 '#16a34a',
  end:                   '#dc2626',
  loop_repeat:           '#7c3aed',
  loop_retry:            '#ea580c',
  loop_while:            '#0891b2',
}

export const NODE_ICONS: Record<string, any> = {
  trigger_keyword:       Zap,
  trigger_first_message: Zap,
  trigger_any_reply:     Reply,
  trigger_outside_hours: Clock,
  send_message:          MessageSquare,
  send_image:            Image,
  send_video:            Video,
  send_audio:            Music,
  send_document:         FileText,
  input:                 AlignLeft,
  condition:             GitBranch,
  ai:                    Brain,
  webhook:               Webhook,
  wait:                  Clock,
  add_tag:               Tag,
  remove_tag:            TagsIcon,
  update_contact:        UserCog,
  move_pipeline:         MoveRight,
  assign_agent:          UserCheck,
  go_to:                 CornerDownRight,
  end:                   Square,
  loop_repeat:           Repeat,
  loop_retry:            RotateCcw,
  loop_while:            RefreshCw,
}

export const NODE_LABELS: Record<string, string> = {
  trigger_keyword:       'Palavra-chave',
  trigger_first_message: 'Primeira mensagem',
  trigger_any_reply:     'Qualquer resposta',
  trigger_outside_hours: 'Fora do horário',
  send_message:          'Enviar texto',
  send_image:            'Enviar imagem',
  send_video:            'Enviar vídeo',
  send_audio:            'Enviar áudio',
  send_document:         'Enviar documento',
  input:                 'Aguardar resposta',
  condition:             'Condição (se/senão)',
  ai:                    'Inteligência Artificial',
  webhook:               'Webhook',
  wait:                  'Espera',
  add_tag:               'Adicionar tag',
  remove_tag:            'Remover tag',
  update_contact:        'Atualizar contato',
  move_pipeline:         'Mover no funil',
  assign_agent:          'Atribuir agente',
  go_to:                 'Ir para outro flow',
  end:                   'Finalizar flow',
  loop_repeat:           'Loop repetição',
  loop_retry:            'Loop tentativas',
  loop_while:            'Loop enquanto',
}

export const DEFAULT_STAGES = [
  { key: 'lead',         label: 'Lead' },
  { key: 'qualificacao', label: 'Qualificação' },
  { key: 'proposta',     label: 'Proposta' },
  { key: 'negociacao',   label: 'Negociação' },
  { key: 'ganho',        label: 'Ganho' },
  { key: 'perdido',      label: 'Perdido' },
]

export const BRANCH_COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#db2777', '#d97706', '#0891b2']

export const OPERATORS = [
  { value: 'contains',      label: 'Contém' },
  { value: 'not_contains',  label: 'Não contém' },
  { value: 'equals',        label: 'É igual a' },
  { value: 'not_equals',    label: 'É diferente de' },
  { value: 'starts_with',   label: 'Começa com' },
  { value: 'ends_with',     label: 'Termina com' },
  { value: 'is_empty',      label: 'Está vazio' },
  { value: 'is_not_empty',  label: 'Não está vazio' },
]

export interface ConditionRule {
  id: string
  field: string
  fieldName?: string
  operator: string
  value: string
}

export interface ConditionBranch {
  id: string
  label: string
  logic: 'AND' | 'OR'
  rules: ConditionRule[]
}

export function defaultBranch(label: string): ConditionBranch {
  return {
    id: `branch_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    label,
    logic: 'AND',
    rules: [{ id: `rule_${Date.now()}`, field: 'message', operator: 'contains', value: '' }],
  }
}
