-- ============================================================================
-- 008_sla_tracking.sql
-- Tempo de resposta / SLA tracking
-- Adiciona campos pra medir tempo entre msg do cliente e resposta do agente/bot
-- ============================================================================

-- Meta de SLA por tenant fica no settings JSONB (chave: slaTargetMinutes).
-- Sem coluna dedicada — mantém consistência com outras settings (webhookUrl etc).

-- Conversations: campos de response time
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_response_minutes INTEGER;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_waiting ON conversations(tenant_id, waiting_since) WHERE waiting_since IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_first_response ON conversations(tenant_id, first_response_at) WHERE first_response_at IS NOT NULL;
