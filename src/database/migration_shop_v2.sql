-- -----------------------------------------
-- HYPERCUT STORE BOT -- Migration: Shop v2
-- Execute no Supabase SQL Editor
-- -----------------------------------------

-- Colunas extras em users para perfil rico
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_seen_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gift_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS topup_count    INTEGER NOT NULL DEFAULT 0;

-- -----------------------------------------
-- Promocoes de planos
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS promotions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  promo_price     NUMERIC(10, 2) NOT NULL,
  original_price  NUMERIC(10, 2) NOT NULL,
  max_uses        INTEGER,                  -- NULL = ilimitado
  used_count      INTEGER NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,              -- NULL = sem validade
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      BIGINT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_product ON promotions (product_id, is_active);

-- -----------------------------------------
-- Notificacoes de promocoes (opt-in)
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS promo_notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------
-- Fila de aviso de estoque por plano
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS stock_waitlist (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT NOT NULL,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (telegram_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_waitlist_product ON stock_waitlist (product_id);

-- Trigger updated_at para promotions
CREATE TRIGGER trg_promotions_updated_at
  BEFORE UPDATE ON promotions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
