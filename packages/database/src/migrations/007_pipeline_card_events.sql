-- ============================================================================
-- 007_pipeline_card_events.sql
-- Histórico de movimentação de cards do pipeline (CRM feature)
-- Loga eventos tanto de pipeline_cards (cards independentes) quanto de
-- conversations (quando a conversa muda de stage no kanban).
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipeline_card_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  card_id UUID REFERENCES pipeline_cards(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL, -- 'created' | 'moved' | 'value_changed' | 'assigned' | 'deleted'
  from_column VARCHAR(100),
  to_column VARCHAR(100),
  from_value NUMERIC(12,2),
  to_value NUMERIC(12,2),
  from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pipeline_card_events_target_check CHECK (
    card_id IS NOT NULL OR conversation_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_pipeline_card_events_tenant ON pipeline_card_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_card_events_card ON pipeline_card_events(card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_card_events_conversation ON pipeline_card_events(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_card_events_pipeline ON pipeline_card_events(pipeline_id, created_at DESC);

ALTER TABLE pipeline_card_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON pipeline_card_events TO service_role USING (true) WITH CHECK (true);
