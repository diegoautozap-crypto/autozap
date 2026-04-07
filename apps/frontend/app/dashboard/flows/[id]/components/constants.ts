import {
  Zap, MessageSquare, Clock, Tag, MoveRight, UserCheck,
  GitBranch, Brain, Webhook, UserCog, CornerDownRight, Square, Reply,
  RefreshCw, AlignLeft, Link, Play, Mic, ClipboardList, Bell, Split, Shuffle,
  Calendar,
} from 'lucide-react'

export const NODE_COLORS: Record<string, string> = {
  trigger_keyword:       '#16a34a',
  trigger_first_message: '#16a34a',
  trigger_any_reply:     '#16a34a',
  trigger_outside_hours: '#16a34a',
  trigger_webhook:       '#0891b2',
  trigger_manual:        '#7c3aed',
  map_fields:            '#7c3aed',
  create_contact:        '#16a34a',
  send_message:          '#2563eb',
  input:                 '#0284c7',
  condition:             '#ea580c',
  ai:                    '#6d28d9',
  webhook:               '#0f172a',
  wait:                  '#6b7280',
  tag_contact:           '#0891b2',
  update_contact:        '#0369a1',
  move_pipeline:         '#d97706',
  assign_agent:          '#db2777',
  go_to:                 '#16a34a',
  end:                   '#dc2626',
  loop:                  '#7c3aed',
  transcribe_audio:      '#7c3aed',
  create_task:           '#d97706',
  send_notification:     '#db2777',
  split_ab:              '#ea580c',
  random_path:           '#ea580c',
  schedule_appointment:  '#16a34a',
}

export const NODE_ICONS: Record<string, any> = {
  trigger_keyword:       Zap,
  trigger_first_message: Zap,
  trigger_any_reply:     Reply,
  trigger_outside_hours: Clock,
  trigger_webhook:       Link,
  trigger_manual:        Play,
  map_fields:            GitBranch,
  create_contact:        UserCheck,
  send_message:          MessageSquare,
  input:                 AlignLeft,
  condition:             GitBranch,
  ai:                    Brain,
  webhook:               Webhook,
  wait:                  Clock,
  tag_contact:           Tag,
  update_contact:        UserCog,
  move_pipeline:         MoveRight,
  assign_agent:          UserCheck,
  go_to:                 CornerDownRight,
  end:                   Square,
  loop:                  RefreshCw,
  transcribe_audio:      Mic,
  create_task:           ClipboardList,
  send_notification:     Bell,
  split_ab:              Split,
  random_path:           Shuffle,
  schedule_appointment:  Calendar,
}

// Fallback hardcoded labels (used when t() is not available)
export const NODE_LABELS: Record<string, string> = {
  trigger_keyword:       'Palavra-chave',
  trigger_first_message: 'Primeira mensagem',
  trigger_any_reply:     'Qualquer resposta',
  trigger_outside_hours: 'Fora do horário',
  trigger_webhook:       'Webhook de entrada',
  trigger_manual:        'Execução manual',
  send_message:          'Enviar mensagem',
  input:                 'Aguardar resposta',
  condition:             'Condição',
  ai:                    'Inteligência Artificial',
  webhook:               'Webhook',
  wait:                  'Espera',
  tag_contact:           'Tags',
  update_contact:        'Atualizar contato',
  move_pipeline:         'Mover no funil',
  assign_agent:          'Atribuir agente',
  go_to:                 'Ir para outro flow',
  end:                   'Finalizar flow',
  loop:                  'Loop',
  transcribe_audio:      'Transcrever áudio',
  create_task:           'Criar tarefa',
  send_notification:     'Notificar agente',
  split_ab:              'Teste A/B',
  random_path:           'Caminho aleatório',
  schedule_appointment:  'Agendar horário',
}

const NODE_LABEL_KEYS: Record<string, string> = {
  trigger_keyword:       'nodes.triggerKeyword',
  trigger_first_message: 'nodes.triggerFirstMessage',
  trigger_any_reply:     'nodes.triggerAnyReply',
  trigger_outside_hours: 'nodes.triggerOutsideHours',
  trigger_webhook:       'nodes.triggerWebhook',
  trigger_manual:        'nodes.triggerManual',
  map_fields:            'nodes.mapFields',
  create_contact:        'nodes.createContact',
  send_message:          'nodes.sendMessage',
  input:                 'nodes.input',
  condition:             'nodes.condition',
  ai:                    'nodes.ai',
  webhook:               'nodes.webhook',
  wait:                  'nodes.wait',
  tag_contact:           'nodes.tagContact',
  update_contact:        'nodes.updateContact',
  move_pipeline:         'nodes.movePipeline',
  assign_agent:          'nodes.assignAgent',
  go_to:                 'nodes.goTo',
  end:                   'nodes.end',
  loop:                  'nodes.loop',
  transcribe_audio:      'nodes.transcribeAudio',
  create_task:           'nodes.createTask',
  send_notification:     'nodes.sendNotification',
  split_ab:              'nodes.splitAb',
  random_path:           'nodes.randomPath',
  schedule_appointment:  'nodes.scheduleAppointment',
}

export function getNodeLabels(t: (key: string) => string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [nodeType, i18nKey] of Object.entries(NODE_LABEL_KEYS)) {
    result[nodeType] = t(i18nKey)
  }
  return result
}

export const SEND_SUBTYPES = [
  { value: 'text',     label: 'Texto',      emoji: '💬' },
  { value: 'image',    label: 'Imagem',     emoji: '🖼️' },
  { value: 'video',    label: 'Vídeo',      emoji: '🎥' },
  { value: 'audio',    label: 'Áudio',      emoji: '🎵' },
  { value: 'document', label: 'Documento',  emoji: '📄' },
]

export function getSendSubtypes(t: (key: string) => string) {
  return [
    { value: 'text',     label: t('nodes.sendText'),     emoji: '💬' },
    { value: 'image',    label: t('nodes.sendImage'),    emoji: '🖼️' },
    { value: 'video',    label: t('nodes.sendVideo'),    emoji: '🎥' },
    { value: 'audio',    label: t('nodes.sendAudio'),    emoji: '🎵' },
    { value: 'document', label: t('nodes.sendDocument'), emoji: '📄' },
  ]
}

export const TAG_SUBTYPES = [
  { value: 'add',    label: 'Adicionar tag', emoji: '➕' },
  { value: 'remove', label: 'Remover tag',   emoji: '➖' },
]

export function getTagSubtypes(t: (key: string) => string) {
  return [
    { value: 'add',    label: t('nodes.tagAdd'),    emoji: '➕' },
    { value: 'remove', label: t('nodes.tagRemove'), emoji: '➖' },
  ]
}

export const LOOP_SUBTYPES = [
  { value: 'repeat', label: 'Repetição',   emoji: '🔁', desc: 'Repete N vezes' },
  { value: 'retry',  label: 'Tentativas',  emoji: '🔄', desc: 'Tenta até N vezes' },
  { value: 'while',  label: 'Enquanto',    emoji: '♾️', desc: 'Repete enquanto condição' },
]

export function getLoopSubtypes(t: (key: string) => string) {
  return [
    { value: 'repeat', label: t('nodes.loopRepeat'), emoji: '🔁', desc: t('nodes.loopRepeatDesc') },
    { value: 'retry',  label: t('nodes.loopRetry'),  emoji: '🔄', desc: t('nodes.loopRetryDesc') },
    { value: 'while',  label: t('nodes.loopWhile'),  emoji: '♾️', desc: t('nodes.loopWhileDesc') },
  ]
}

export const LEGACY_TYPE_MAP: Record<string, { type: string; subtype: string }> = {
  send_image:    { type: 'send_message', subtype: 'image' },
  send_video:    { type: 'send_message', subtype: 'video' },
  send_audio:    { type: 'send_message', subtype: 'audio' },
  send_document: { type: 'send_message', subtype: 'document' },
  add_tag:       { type: 'tag_contact',  subtype: 'add' },
  remove_tag:    { type: 'tag_contact',  subtype: 'remove' },
  loop_repeat:   { type: 'loop',         subtype: 'repeat' },
  loop_retry:    { type: 'loop',         subtype: 'retry' },
  loop_while:    { type: 'loop',         subtype: 'while' },
}

export const DEFAULT_STAGES = [
  { key: 'novo',         label: 'Novo' },
  { key: 'em_contato',   label: 'Em contato' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'aguardando',   label: 'Aguardando' },
  { key: 'concluido',    label: 'Concluído' },
  { key: 'cancelado',    label: 'Cancelado' },
]

export function getDefaultStages(t: (key: string) => string) {
  return [
    { key: 'lead',         label: t('nodes.stageLead') },
    { key: 'qualificacao', label: t('nodes.stageQualification') },
    { key: 'proposta',     label: t('nodes.stageProposal') },
    { key: 'negociacao',   label: t('nodes.stageNegotiation') },
    { key: 'ganho',        label: t('nodes.stageWon') },
    { key: 'perdido',      label: t('nodes.stageLost') },
  ]
}

export const BRANCH_COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#db2777', '#d97706', '#0891b2']

export const OPERATORS = [
  { value: 'contains',      label: 'Contém' },
  { value: 'not_contains',  label: 'Não contém' },
  { value: 'equals',        label: 'É igual a' },
  { value: 'not_equals',    label: 'É diferente de' },
  { value: 'starts_with',   label: 'Começa com' },
  { value: 'ends_with',     label: 'Termina com' },
  { value: 'greater_than',  label: 'Maior que' },
  { value: 'less_than',     label: 'Menor que' },
  { value: 'greater_equal', label: 'Maior ou igual' },
  { value: 'less_equal',    label: 'Menor ou igual' },
  { value: 'is_empty',      label: 'Está vazio' },
  { value: 'is_not_empty',  label: 'Não está vazio' },
]

export function getOperators(t: (key: string) => string) {
  return [
    { value: 'contains',      label: t('nodes.opContains') },
    { value: 'not_contains',  label: t('nodes.opNotContains') },
    { value: 'equals',        label: t('nodes.opEquals') },
    { value: 'not_equals',    label: t('nodes.opNotEquals') },
    { value: 'starts_with',   label: t('nodes.opStartsWith') },
    { value: 'ends_with',     label: t('nodes.opEndsWith') },
    { value: 'greater_than',  label: t('nodes.opGreaterThan') },
    { value: 'less_than',     label: t('nodes.opLessThan') },
    { value: 'greater_equal', label: t('nodes.opGreaterEqual') },
    { value: 'less_equal',    label: t('nodes.opLessEqual') },
    { value: 'is_empty',      label: t('nodes.opIsEmpty') },
    { value: 'is_not_empty',  label: t('nodes.opIsNotEmpty') },
  ]
}

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
