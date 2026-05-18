-- ─────────────────────────────────────────
-- HYPERCUT STORE BOT — Migration: Módulo de Compra
-- Execute este arquivo APÓS o schema.sql original
-- ─────────────────────────────────────────

-- ── 1. Coluna delivery_message em orders ──
-- Armazena a mensagem de entrega para reenvio futuro
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_message TEXT;

-- ── 2. Tabela de entregas realizadas ──────
-- Garante antirrepetição: um mesmo user_id não recebe o mesmo stock_item duas vezes
CREATE TABLE IF NOT EXISTS deliveries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id),
  telegram_id   BIGINT NOT NULL,
  order_id      UUID NOT NULL REFERENCES orders(id),
  stock_item_id UUID NOT NULL REFERENCES stock_items(id),
  delivered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (telegram_id, stock_item_id)   -- índice de antirrepetição
);

CREATE INDEX IF NOT EXISTS idx_deliveries_telegram
  ON deliveries (telegram_id);

-- ── 3. RPC: reserve_stock_item (atômica) ──
-- Busca um item disponível para o produto, excluindo itens que o usuário
-- já recebeu anteriormente (antirrepetição), e reserva com TTL.
CREATE OR REPLACE FUNCTION reserve_stock_item(
  p_product_id  UUID,
  p_telegram_id BIGINT,
  p_order_id    UUID,
  p_expires_at  TIMESTAMPTZ
)
RETURNS SETOF stock_items
LANGUAGE plpgsql
AS $$
DECLARE
  v_item stock_items;
BEGIN
  -- Seleciona e bloqueia o primeiro item disponível que o usuário nunca recebeu
  SELECT s.*
    INTO v_item
    FROM stock_items s
   WHERE s.product_id = p_product_id
     AND s.status     = 'available'
     AND s.id NOT IN (
           SELECT d.stock_item_id
             FROM deliveries d
            WHERE d.telegram_id = p_telegram_id
         )
   ORDER BY s.created_at ASC
   LIMIT 1
     FOR UPDATE SKIP LOCKED;  -- lock atômico, ignora itens bloqueados por outras transações

  IF NOT FOUND THEN
    RETURN;  -- retorna vazio = sem estoque
  END IF;

  -- Reserva o item
  UPDATE stock_items
     SET status                 = 'reserved',
         reserved_by            = p_telegram_id,
         reservation_expires_at = p_expires_at,
         order_id               = p_order_id,
         updated_at             = NOW()
   WHERE id = v_item.id
  RETURNING * INTO v_item;

  RETURN NEXT v_item;
END;
$$;

-- ── 4. Produtos CapCut iniciais (seed) ────
-- Insere os 4 planos se não existirem
INSERT INTO products (id, name, description, price, category, is_active)
VALUES
  (
    'a1b2c3d4-0001-0001-0001-000000000001',
    'CapCut 7 Dias',
    'Acesso completo ao CapCut Pro por 7 dias.',
    9.90,
    'software',
    true
  ),
  (
    'a1b2c3d4-0002-0002-0002-000000000002',
    'CapCut 30 Dias',
    'Acesso completo ao CapCut Pro por 30 dias.',
    24.90,
    'software',
    true
  ),
  (
    'a1b2c3d4-0003-0003-0003-000000000003',
    'CapCut 3 Meses',
    'Acesso completo ao CapCut Pro por 3 meses.',
    59.90,
    'software',
    true
  ),
  (
    'a1b2c3d4-0004-0004-0004-000000000004',
    'CapCut 1 Ano',
    'Acesso completo ao CapCut Pro por 1 ano.',
    149.90,
    'software',
    true
  )
ON CONFLICT (id) DO NOTHING;

-- ── 5. Índice de busca por produto + status ──
CREATE INDEX IF NOT EXISTS idx_stock_items_product_status
  ON stock_items (product_id, status)
  WHERE status = 'available';
