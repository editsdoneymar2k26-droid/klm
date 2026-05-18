-- -----------------------------------------
-- HYPERCUT STORE BOT -- Migration: Permissoes
-- Execute no Supabase SQL Editor
-- -----------------------------------------

-- Adiciona coluna role na tabela users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin', 'owner'));

-- Indice para busca por cargo
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- Atualiza usuarios que ja tinham is_admin = true para role = admin
UPDATE users SET role = 'admin' WHERE is_admin = TRUE AND role = 'user';
