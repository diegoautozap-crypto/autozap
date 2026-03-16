-- ============================================================
-- AutoZap — Migration 002
-- Funções auxiliares e índices adicionais
-- ============================================================

-- ─── Atomic message counter increment ────────────────────────────────────────
-- Used by tenant-service to increment usage atomically (no race condition)

CREATE OR REPLACE FUNCTION increment_message_count(p_tenant_id UUID, p_count INTEGER DEFAULT 1)
RETURNS void AS $$
BEGIN
  UPDATE tenants
  SET messages_sent_this_period = messages_sent_this_period + p_count
  WHERE id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Check if tenant can send messages ───────────────────────────────────────
-- Returns true if tenant is within their plan limit

CREATE OR REPLACE FUNCTION tenant_can_send(p_tenant_id UUID, p_count INTEGER DEFAULT 1)
RETURNS boolean AS $$
DECLARE
  v_plan_slug plan_slug;
  v_sent INTEGER;
  v_limit INTEGER;
BEGIN
  SELECT plan_slug, messages_sent_this_period
  INTO v_plan_slug, v_sent
  FROM tenants
  WHERE id = p_tenant_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- unlimited plan
  IF v_plan_slug = 'unlimited' THEN
    RETURN true;
  END IF;

  SELECT
    CASE v_plan_slug
      WHEN 'starter'    THEN 10000
      WHEN 'pro'        THEN 50000
      WHEN 'enterprise' THEN 100000
      ELSE NULL
    END
  INTO v_limit;

  RETURN (v_sent + p_count) <= v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Reset all counters (called by cron at billing period start) ──────────────

CREATE OR REPLACE FUNCTION reset_all_message_counts()
RETURNS void AS $$
BEGIN
  UPDATE tenants SET messages_sent_this_period = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Grant to service role ────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION increment_message_count TO service_role;
GRANT EXECUTE ON FUNCTION tenant_can_send TO service_role;
GRANT EXECUTE ON FUNCTION reset_all_message_counts TO service_role;
