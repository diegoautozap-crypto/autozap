-- ============================================================
-- AutoZap — Migration 004
-- Fase 4: Campanhas massivas
-- ============================================================

CREATE TYPE campaign_status AS ENUM (
  'draft', 'scheduled', 'running', 'paused', 'completed', 'failed'
);

-- ─── Campaigns ───────────────────────────────────────────────────────────────

CREATE TABLE campaigns (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id        UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  status            campaign_status NOT NULL DEFAULT 'draft',
  message_template  TEXT,
  content_type      VARCHAR(50) NOT NULL DEFAULT 'text',
  media_url         TEXT,
  scheduled_at      TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  total_contacts    INTEGER NOT NULL DEFAULT 0,
  sent_count        INTEGER NOT NULL DEFAULT 0,
  delivered_count   INTEGER NOT NULL DEFAULT 0,
  read_count        INTEGER NOT NULL DEFAULT 0,
  failed_count      INTEGER NOT NULL DEFAULT 0,
  batch_size        INTEGER NOT NULL DEFAULT 500,
  messages_per_min  INTEGER NOT NULL DEFAULT 20,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX idx_campaigns_status ON campaigns(tenant_id, status);

-- ─── Campaign Contacts ────────────────────────────────────────────────────────

CREATE TABLE campaign_contacts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id    UUID REFERENCES contacts(id) ON DELETE SET NULL,
  phone         VARCHAR(50) NOT NULL,
  name          VARCHAR(255),
  variables     JSONB NOT NULL DEFAULT '{}',
  message_uuid  UUID UNIQUE,
  status        VARCHAR(50) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaign_contacts_campaign ON campaign_contacts(campaign_id);
CREATE INDEX idx_campaign_contacts_status ON campaign_contacts(campaign_id, status);
CREATE INDEX idx_campaign_contacts_tenant ON campaign_contacts(tenant_id);

-- ─── Triggers ────────────────────────────────────────────────────────────────

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Atomic counters for campaign progress ────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_campaign_counter(
  p_campaign_id UUID,
  p_field TEXT,
  p_count INTEGER DEFAULT 1
) RETURNS void AS $$
BEGIN
  EXECUTE format('UPDATE campaigns SET %I = %I + $1 WHERE id = $2', p_field, p_field)
  USING p_count, p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_campaign_counter TO service_role;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE campaigns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON campaigns         TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON campaign_contacts TO service_role USING (true) WITH CHECK (true);
