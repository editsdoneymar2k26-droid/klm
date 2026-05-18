-- -----------------------------------------
-- HYPERCUT STORE BOT -- Migration: Painel Admin
-- Execute no Supabase SQL Editor APOS migrations anteriores
-- -----------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_banned   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS banned_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ban_reason  TEXT;

ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS current_users  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_users      INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_delivery  TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS gifts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  code          TEXT NOT NULL UNIQUE,
  max_uses      INTEGER NOT NULL DEFAULT 1,
  used_count    INTEGER NOT NULL DEFAULT 0,
  balance_cents INTEGER NOT NULL,
  expires_at    TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gift_redemptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gift_id     UUID NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  telegram_id BIGINT NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (gift_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_gifts_code ON gifts (code);
CREATE INDEX IF NOT EXISTS idx_gift_redemptions_user ON gift_redemptions (telegram_id);

CREATE TABLE IF NOT EXISTS admin_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id   BIGINT NOT NULL,
  action     TEXT NOT NULL,
  target_id  TEXT,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs ON admin_logs (admin_id, created_at DESC);

CREATE TABLE IF NOT EXISTS maintenance_mode (
  id           INTEGER PRIMARY KEY DEFAULT 1,
  is_active    BOOLEAN NOT NULL DEFAULT FALSE,
  message      TEXT NOT NULL DEFAULT 'Bot em manutencao. Voltamos em breve!',
  activated_by BIGINT,
  activated_at TIMESTAMPTZ
);
INSERT INTO maintenance_mode (id, is_active) VALUES (1, FALSE) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS broadcast_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id    BIGINT NOT NULL,
  filter_type TEXT NOT NULL,
  message     TEXT NOT NULL,
  total_sent  INTEGER NOT NULL DEFAULT 0,
  total_fail  INTEGER NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TRIGGER trg_gifts_updated_at
  BEFORE UPDATE ON gifts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
