export interface FlowContext {
  tenantId: string
  channelId: string
  contactId: string
  conversationId: string
  phone: string
  messageBody: string
  isFirstMessage: boolean
  webhookData?: Record<string, string>
}

export interface FlowRow {
  id: string
  tenant_id: string
  channel_id: string | null
  campaign_id?: string | null
  is_active: boolean
  cooldown_type?: 'always' | '24h' | 'once'
  sort_order: number
  created_at: string
}

export interface FlowNodeData {
  subtype?: string
  channelId?: string
  keywords?: string[]
  matchType?: 'equals' | 'contains'
  message?: string
  delay?: number
  mediaUrl?: string
  caption?: string
  filename?: string
  question?: string
  saveAs?: string
  url?: string
  method?: string
  body?: string
  saveResponseAs?: string
  responseField?: string
  branches?: ConditionBranch[]
  conditionType?: string
  field?: string
  operator?: string
  value?: string
  tagId?: string
  tagIds?: string[]
  customField?: string
  stage?: string
  pipelineId?: string
  targetFlowId?: string
  times?: number
  maxRetries?: number
  maxIterations?: number
  conditionField?: string
  conditionOperator?: string
  conditionValue?: string
  conditionFieldName?: string
  apiKey?: string
  mode?: 'respond' | 'classify' | 'extract' | 'summarize'
  userMessage?: string
  historyMessages?: number
  systemPrompt?: string
  classifyOptions?: string
  extractField?: string
  model?: string
  maxTokens?: number
  temperature?: number
  timeoutHours?: number
  timeoutMinutes?: number
  headers?: { key: string; value: string }[]
  timezone?: string
  agentId?: string
  transcribeSaveAs?: string
  transcribeLanguage?: string
  schedulingConfigId?: string
  askDateMessage?: string
  askTimeMessage?: string
  noSlotsMessage?: string
  confirmMessage?: string
  calendarMode?: 'google' | 'internal'
  calendarAction?: 'schedule' | 'cancel'
  googleCalendarId?: string
  eventDuration?: number
  workStart?: string
  workEnd?: string
  workDays?: Record<string, boolean>
  advanceDays?: number
  eventTitle?: string
  showBackButton?: boolean
  showBackDays?: boolean
  listButtonDays?: string
  listButtonSlots?: string
  priceTable?: Record<string, number>
  msgAskDate?: string
  msgAskTime?: string
  msgConfirm?: string
  msgNoSlots?: string
  variableName?: string
  variableValue?: string
  mathVariable?: string
  mathOperator?: '+' | '-' | '*' | '/'
  mathValue?: string
  taskTitle?: string
  taskDueHours?: number
  taskAssignTo?: string
  notificationMessage?: string
  notifyAgentId?: string
  splitPaths?: { label: string; weight: number }[]
  randomPaths?: string[]
  seconds?: number
  minutes?: number
  hours?: number
  days?: number | number[]
  start?: number
  end?: number
  fields?: { label: string; variable: string; contactField: string }[]
  mappings?: { from: string; to: string }[]
  updateFields?: { field: string; customField?: string; value: string }[]
  ignoredPhones?: string
  [key: string]: any
}

export interface FlowNodeRow {
  id: string
  flow_id: string
  type: string
  data: FlowNodeData
}

export interface FlowEdgeRow {
  source_node: string
  source_handle: string | null
  target_node: string
}

export interface NodeResult {
  success: boolean
  paused?: boolean
  ended?: boolean
  delayed?: boolean
  nextHandle?: string
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
