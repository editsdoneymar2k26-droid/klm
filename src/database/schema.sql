-- ─────────────────────────────────────────
-- HYPERCUT STORE BOT — Schema do banco de dados
-- Execute no SQL Editor do Supabase
-- ─────────────────────────────────────────

-- Extensão para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Usuários ──────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id     BIGINT UNIQUE NOT NULL,
  username        TEXT,
  first_name      TEXT NOT NULL,
  balance         NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_spent     NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  level           TEXT NOT NULL DEFAULT 'bronze'
                    CHECK (level IN ('bronze', 'silver', 'gold', 'vip')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Produtos ──────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  price       NUMERIC(10, 2) NOT NULL,
  category    TEXT NOT NULL DEFAULT 'other'
                CHECK (category IN ('streaming', 'software', 'games', 'other')),
  image_url   TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Estoque ───────────────────────────────
CREATE TABLE IF NOT EXISTS stock_items (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id              UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  credentials             TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'available'
                            CHECK (status IN ('available', 'reserved', 'sold')),
  reserved_by             BIGINT REFERENCES users(telegram_id),
  reservation_expires_at  TIMESTAMPTZ,
  order_id                UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para o worker de expiração
CREATE INDEX IF NOT EXISTS idx_stock_items_reserved_expired
  ON stock_items (status, reservation_expires_at)
  WHERE status = 'reserved';

-- ── Pedidos ───────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id),
  product_id      UUID NOT NULL REFERENCES products(id),
  stock_item_id   UUID REFERENCES stock_items(id),
  amount          NUMERIC(10, 2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'delivered', 'expired', 'cancelled')),
  pix_txid        TEXT UNIQUE,
  pix_qrcode      TEXT,
  pix_expires_at  TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para webhook (busca por txid)
CREATE INDEX IF NOT EXISTS idx_orders_pix_txid
  ON orders (pix_txid)
  WHERE pix_txid IS NOT NULL;

-- ── View: Estoque disponível por produto ──
CREATE OR REPLACE VIEW product_stock_count AS
SELECT
  p.id,
  p.name,
  p.price,
  p.is_active,
  COUNT(s.id) FILTER (WHERE s.status = 'available') AS available_count
FROM products p
LEFT JOIN stock_items s ON s.product_id = p.id
GROUP BY p.id, p.name, p.price, p.is_active;

-- ── Trigger: updated_at automático ────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_stock_items_updated_at
  BEFORE UPDATE ON stock_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
