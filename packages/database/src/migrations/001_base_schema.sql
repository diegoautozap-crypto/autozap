-- ============================================================
-- AutoZap — Migration 001
-- Fase 1: Infraestrutura base
-- plans · tenants · users · subscriptions · refresh_tokens
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enum types ──────────────────────────────────────────────────────────────

CREATE TYPE plan_slug AS ENUM ('starter', 'pro', 'enterprise', 'unlimited');
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'agent', 'viewer');
CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled');

-- ─── Plans ───────────────────────────────────────────────────────────────────

CREATE TABLE plans (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug             plan_slug NOT NULL UNIQUE,
  name             VARCHAR(100) NOT NULL,
  message_limit    INTEGER,                       -- NULL = unlimited
  price_monthly    NUMERIC(10,2) NOT NULL DEFAULT 0,
  features         JSONB NOT NULL DEFAULT '[]',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (slug, name, message_limit, price_monthly, features) VALUES
  ('starter',    'Starter',    10000,  97.00,  '["1 número WhatsApp","10k mensagens/mês","Inbox conversacional","CRM básico"]'),
  ('pro',        'Pro',        50000,  197.00, '["3 números WhatsApp","50k mensagens/mês","Campanhas massivas","Automações","Analytics"]'),
  ('enterprise', 'Enterprise', 100000, 397.00, '["10 números WhatsApp","100k mensagens/mês","API access","Suporte prioritário","Instagram"]'),
  ('unlimited',  'Unlimited',  NULL,   797.00, '["Ilimitado","Canais ilimitados","Tráfego pago integrado","SLA dedicado"]');

-- ─── Tenants ─────────────────────────────────────────────────────────────────

CREATE TABLE tenants (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                        VARCHAR(255) NOT NULL,
  slug                        VARCHAR(100) NOT NULL UNIQUE,
  plan_slug                   plan_slug NOT NULL DEFAULT 'starter',
  messages_sent_this_period   INTEGER NOT NULL DEFAULT 0,
  is_active                   BOOLEAN NOT NULL DEFAULT true,
  settings                    JSONB NOT NULL DEFAULT '{
    "timezone": "America/Sao_Paulo",
    "defaultLanguage": "pt-BR"
  }',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_plan ON tenants(plan_slug);

-- ─── Users ───────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email                VARCHAR(255) NOT NULL,
  name                 VARCHAR(255) NOT NULL,
  password_hash        VARCHAR(255) NOT NULL,
  role                 user_role NOT NULL DEFAULT 'agent',
  avatar_url           TEXT,
  email_verified       BOOLEAN NOT NULL DEFAULT false,
  email_verify_token   VARCHAR(255),
  two_factor_enabled   BOOLEAN NOT NULL DEFAULT false,
  two_factor_secret    VARCHAR(255),           -- encrypted TOTP secret
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMPTZ,
  last_login_at        TIMESTAMPTZ,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_tenant_unique UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_email_verify_token ON users(email_verify_token) WHERE email_verify_token IS NOT NULL;
CREATE INDEX idx_users_password_reset_token ON users(password_reset_token) WHERE password_reset_token IS NOT NULL;

-- ─── Refresh Tokens ──────────────────────────────────────────────────────────

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,   -- stored hashed
  family      UUID NOT NULL,                  -- rotation family (detect reuse)
  user_agent  TEXT,
  ip_address  INET,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family);

-- ─── Subscriptions ───────────────────────────────────────────────────────────

CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id                UUID NOT NULL REFERENCES plans(id),
  status                 subscription_status NOT NULL DEFAULT 'trialing',
  current_period_start   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT false,
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id     VARCHAR(255),
  trial_ends_at          TIMESTAMPTZ,
  canceled_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ─── Audit Log ───────────────────────────────────────────────────────────────

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,  -- e.g. 'user.login', 'tenant.update'
  resource    VARCHAR(100),           -- e.g. 'user', 'campaign'
  resource_id UUID,
  metadata    JSONB DEFAULT '{}',
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- ─── Updated_at trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_plans_updated_at        BEFORE UPDATE ON plans        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tenants_updated_at      BEFORE UPDATE ON tenants      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at        BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Row Level Security (Supabase) ───────────────────────────────────────────

ALTER TABLE tenants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by our backend services)
-- These policies allow the service_role to do everything,
-- and block direct client access entirely (all data goes through the API)

CREATE POLICY "service_role_all" ON tenants        TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON users          TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON subscriptions  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON audit_logs     TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON refresh_tokens TO service_role USING (true) WITH CHECK (true);
