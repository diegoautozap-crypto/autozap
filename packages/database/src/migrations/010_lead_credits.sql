-- Tabela de créditos de prospecção (Google Maps via Outscraper)
-- Cada tenant tem um saldo de créditos. 1 crédito = 1 lead retornado.
-- Validação WhatsApp = +1 crédito por número.

CREATE TABLE IF NOT EXISTS tenant_lead_credits (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  total_purchased INTEGER NOT NULL DEFAULT 0,
  total_consumed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Histórico de operações (compras + consumo)
CREATE TABLE IF NOT EXISTS lead_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- positivo = compra, negativo = consumo
  type TEXT NOT NULL CHECK (type IN ('purchase', 'consumption', 'manual_adjustment', 'refund')),
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_credit_tx_tenant ON lead_credit_transactions(tenant_id, created_at DESC);

-- RPC pra debitar créditos atomicamente (evita race condition)
CREATE OR REPLACE FUNCTION debit_lead_credits(
  p_tenant_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  current_balance INTEGER;
BEGIN
  -- Pega saldo com lock
  SELECT balance INTO current_balance FROM tenant_lead_credits
    WHERE tenant_id = p_tenant_id FOR UPDATE;

  IF current_balance IS NULL THEN
    -- Cria registro com saldo 0 se não existir
    INSERT INTO tenant_lead_credits (tenant_id, balance) VALUES (p_tenant_id, 0)
      ON CONFLICT DO NOTHING;
    current_balance := 0;
  END IF;

  -- Verifica saldo suficiente
  IF current_balance < p_amount THEN
    RETURN FALSE;
  END IF;

  -- Debita
  UPDATE tenant_lead_credits
    SET balance = balance - p_amount,
        total_consumed = total_consumed + p_amount,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id;

  -- Loga transação
  INSERT INTO lead_credit_transactions (tenant_id, amount, type, description, metadata)
    VALUES (p_tenant_id, -p_amount, 'consumption', p_description, p_metadata);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- RPC pra creditar (compra ou ajuste manual)
CREATE OR REPLACE FUNCTION credit_lead_credits(
  p_tenant_id UUID,
  p_amount INTEGER,
  p_type TEXT DEFAULT 'purchase',
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  INSERT INTO tenant_lead_credits (tenant_id, balance, total_purchased)
    VALUES (p_tenant_id, p_amount, CASE WHEN p_type = 'purchase' THEN p_amount ELSE 0 END)
    ON CONFLICT (tenant_id) DO UPDATE
      SET balance = tenant_lead_credits.balance + p_amount,
          total_purchased = tenant_lead_credits.total_purchased + CASE WHEN p_type = 'purchase' THEN p_amount ELSE 0 END,
          updated_at = NOW()
    RETURNING balance INTO new_balance;

  INSERT INTO lead_credit_transactions (tenant_id, amount, type, description, metadata)
    VALUES (p_tenant_id, p_amount, p_type, p_description, p_metadata);

  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;
