-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 005: Production fixes
-- ═══════════════════════════════════════════════════════════════════════════════

-- Unique constraint para evitar contatos duplicados por tenant
-- (remove duplicatas antes de adicionar constraint)
DELETE FROM contacts a USING contacts b
WHERE a.id > b.id AND a.tenant_id = b.tenant_id AND a.phone = b.phone;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_tenant_phone_unique
ON contacts(tenant_id, phone);

-- Colunas de campanha (copies e extra_channel_ids)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS copies jsonb DEFAULT NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS extra_channel_ids jsonb DEFAULT NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS curl_template text DEFAULT NULL;

-- Colunas de campanha recorrente
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS recurrence_type text DEFAULT 'none';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS recurrence_filter jsonb DEFAULT NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS parent_campaign_id uuid DEFAULT NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS last_recurrence_at timestamptz DEFAULT NULL;

-- Cooldown padrão para 'always'
ALTER TABLE flows ALTER COLUMN cooldown_type SET DEFAULT 'always';

-- Index para flow_logs (performance de analytics)
CREATE INDEX IF NOT EXISTS idx_flow_logs_flow_tenant
ON flow_logs(flow_id, tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_flow_logs_conversation
ON flow_logs(flow_id, conversation_id, status);

-- Index para campaign_contacts (performance de batch)
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_pending
ON campaign_contacts(campaign_id, status) WHERE status = 'pending';

-- Tabela de tarefas/follow-ups
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_conversation ON tasks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(tenant_id, status, due_date);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON tasks TO service_role USING (true) WITH CHECK (true);

-- Reload schema cache do PostgREST
-- Permissão de edição por página
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS editable_pages TEXT[] DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
