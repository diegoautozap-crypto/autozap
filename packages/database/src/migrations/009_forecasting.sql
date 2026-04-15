-- ============================================================================
-- 009_forecasting.sql
-- Forecasting de vendas — probabilidade por etapa e override por card
-- ============================================================================

-- Probabilidade (0-100) da etapa fechar negócio. Default null = sem previsão.
ALTER TABLE pipeline_columns ADD COLUMN IF NOT EXISTS probability INTEGER;

-- Override opcional no card individual. Se preenchido, tem precedência sobre
-- a probabilidade da coluna.
ALTER TABLE pipeline_cards ADD COLUMN IF NOT EXISTS probability_override INTEGER;

-- Constraints de range (0-100)
DO $$ BEGIN
  ALTER TABLE pipeline_columns ADD CONSTRAINT pipeline_columns_probability_range CHECK (probability IS NULL OR (probability >= 0 AND probability <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE pipeline_cards ADD CONSTRAINT pipeline_cards_probability_range CHECK (probability_override IS NULL OR (probability_override >= 0 AND probability_override <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
