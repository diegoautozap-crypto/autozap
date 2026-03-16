-- ============================================================
-- AutoZap — Migration 003
-- Fase 2: Canais, Contatos, Conversas, Mensagens
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE channel_type AS ENUM (
  'gupshup', 'meta_cloud', 'twilio', 'evolution', 'zapi', 'instagram'
);

CREATE TYPE channel_status AS ENUM (
  'active', 'inactive', 'suspended', 'pending'
);

CREATE TYPE message_status AS ENUM (
  'queued', 'sent', 'delivered', 'read', 'failed', 'blocked', 'invalid_number'
);

CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

CREATE TYPE content_type AS ENUM (
  'text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'template'
);

CREATE TYPE conversation_status AS ENUM ('open', 'waiting', 'closed');

CREATE TYPE contact_status AS ENUM ('active', 'blocked', 'unsubscribed');

-- ─── Channels ────────────────────────────────────────────────────────────────

CREATE TABLE channels (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  type              channel_type NOT NULL,
  status            channel_status NOT NULL DEFAULT 'active',
  phone_number      VARCHAR(50),
  credentials       JSONB NOT NULL DEFAULT '{}',  -- encrypted in app layer
  settings          JSONB NOT NULL DEFAULT '{
    "messagesPerMinute": 20,
    "messagesPerHour": 200,
    "messagesPerDay": 1000,
    "delayMinMs": 1000,
    "delayMaxMs": 3000
  }',
  warmup_enabled    BOOLEAN NOT NULL DEFAULT false,
  warmup_day        INTEGER NOT NULL DEFAULT 1,
  warmup_limit      INTEGER NOT NULL DEFAULT 20,
  messages_today    INTEGER NOT NULL DEFAULT 0,
  last_reset_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channels_tenant ON channels(tenant_id);
CREATE INDEX idx_channels_type ON channels(type);
CREATE INDEX idx_channels_status ON channels(status);

-- ─── Contacts ────────────────────────────────────────────────────────────────

CREATE TABLE contacts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone             VARCHAR(50),
  name              VARCHAR(255),
  email             VARCHAR(255),
  company           VARCHAR(255),
  avatar_url        TEXT,
  status            contact_status NOT NULL DEFAULT 'active',
  origin            VARCHAR(100),         -- e.g. 'manual', 'csv_import', 'meta_ads'
  notes             TEXT,
  custom_fields     JSONB NOT NULL DEFAULT '{}',
  last_interaction_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT contacts_phone_tenant_unique UNIQUE (tenant_id, phone)
);

CREATE INDEX idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX idx_contacts_phone ON contacts(tenant_id, phone);
CREATE INDEX idx_contacts_status ON contacts(tenant_id, status);
CREATE INDEX idx_contacts_last_interaction ON contacts(tenant_id, last_interaction_at DESC);

-- ─── Tags ────────────────────────────────────────────────────────────────────

CREATE TABLE tags (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  color       VARCHAR(7) NOT NULL DEFAULT '#5a8dee',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT tags_name_tenant_unique UNIQUE (tenant_id, name)
);

CREATE TABLE contact_tags (
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (contact_id, tag_id)
);

CREATE INDEX idx_contact_tags_contact ON contact_tags(contact_id);
CREATE INDEX idx_contact_tags_tag ON contact_tags(tag_id);

-- ─── Conversations ───────────────────────────────────────────────────────────

CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  channel_type    channel_type NOT NULL,
  status          conversation_status NOT NULL DEFAULT 'open',
  assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
  pipeline_stage  VARCHAR(100) NOT NULL DEFAULT 'lead',
  unread_count    INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_message    TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_contact ON conversations(tenant_id, contact_id);
CREATE INDEX idx_conversations_status ON conversations(tenant_id, status);
CREATE INDEX idx_conversations_last_message ON conversations(tenant_id, last_message_at DESC);
CREATE INDEX idx_conversations_assigned ON conversations(assigned_to) WHERE assigned_to IS NOT NULL;

-- ─── Messages ────────────────────────────────────────────────────────────────
-- This table will grow to millions of rows — indexes are critical

CREATE TABLE messages (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_uuid     UUID NOT NULL UNIQUE,           -- dedup key
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  channel_id       UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  contact_id       UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  direction        message_direction NOT NULL,
  content_type     content_type NOT NULL DEFAULT 'text',
  body             TEXT,
  media_url        TEXT,
  media_mime_type  VARCHAR(100),
  status           message_status NOT NULL DEFAULT 'queued',
  external_id      VARCHAR(255),                   -- Gupshup/provider message ID
  error_message    TEXT,
  retry_count      INTEGER NOT NULL DEFAULT 0,
  campaign_id      UUID,                           -- set if sent from campaign
  metadata         JSONB NOT NULL DEFAULT '{}',
  sent_at          TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  read_at          TIMESTAMPTZ,
  failed_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Critical indexes for inbox queries and campaign analytics
CREATE INDEX idx_messages_tenant_conv ON messages(tenant_id, conversation_id, created_at DESC);
CREATE INDEX idx_messages_tenant_status ON messages(tenant_id, status);
CREATE INDEX idx_messages_external_id ON messages(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_messages_campaign ON messages(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX idx_messages_pending ON messages(tenant_id, status, sent_at)
  WHERE status IN ('queued', 'sent');

-- ─── Triggers ────────────────────────────────────────────────────────────────

CREATE TRIGGER trg_channels_updated_at
  BEFORE UPDATE ON channels FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_messages_updated_at
  BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE channels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tags  ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON channels      TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON contacts      TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON tags          TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON contact_tags  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON conversations TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON messages      TO service_role USING (true) WITH CHECK (true);
