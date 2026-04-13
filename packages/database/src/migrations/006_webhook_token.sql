-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 006: Webhook token columns
-- ═══════════════════════════════════════════════════════════════════════════════

-- Coluna de webhook token para tenants (lead capture)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS webhook_token TEXT DEFAULT NULL;

-- Coluna de webhook token para flows (trigger webhook)
ALTER TABLE flows ADD COLUMN IF NOT EXISTS webhook_token TEXT DEFAULT NULL;
ALTER TABLE flows ADD COLUMN IF NOT EXISTS webhook_field_map JSONB DEFAULT NULL;

-- Coluna metadata para tenants (usada em mapRow)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
