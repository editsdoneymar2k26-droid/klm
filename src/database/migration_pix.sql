-- -----------------------------------------
-- HYPERCUT STORE BOT -- Migration: Sistema PIX
-- Execute no SQL Editor do Supabase APOS os schemas anteriores
-- -----------------------------------------

-- Pagamentos pendentes (cobranças PIX abertas)
CREATE TABLE IF NOT EXISTS pending_payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id     BIGINT NOT NULL REFERENCES users(telegram_id),
  user_id         UUID NOT NULL REFERENCES users(id),
  transaction_id  TEXT NOT NULL UNIQUE,   -- txid do gateway
  amount_cents    INTEGER NOT NULL,        -- valor em centavos
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  qrcode          TEXT,                   -- imagem base64 do QR Code
  copy_paste      TEXT,                   -- codigo PIX copia-e-cola
  expires_at      TIMESTAMPTZ NOT NULL,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_payments_telegram
  ON pending_payments (telegram_id, status);

CREATE INDEX IF NOT EXISTS idx_pending_payments_txid
  ON pending_payments (transaction_id);

CREATE INDEX IF NOT EXISTS idx_pending_payments_expires
  ON pending_payments (status, expires_at)
  WHERE status = 'pending';

-- Webhooks ja processados (idempotencia)
CREATE TABLE IF NOT EXISTS processed_webhooks (
  transaction_id  TEXT PRIMARY KEY,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload         JSONB
);

-- Logs de transacoes financeiras
CREATE TABLE IF NOT EXISTS payment_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id     BIGINT NOT NULL,
  transaction_id  TEXT,
  event           TEXT NOT NULL,   -- 'pix_created' | 'pix_paid' | 'pix_expired' | 'webhook_duplicate'
  amount_cents    INTEGER,
  detail          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_logs_telegram
  ON payment_logs (telegram_id, created_at DESC);

-- Trigger updated_at para pending_payments
CREATE TRIGGER trg_pending_payments_updated_at
  BEFORE UPDATE ON pending_payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
