// -----------------------------------------
// HYPERCUT STORE BOT -- Sistema de Permissoes
// Cache + helpers reutilizaveis
// -----------------------------------------

import { getSupabaseClient } from '../database/client';
import { env } from '../config/env';
import { UserRole, Permission, ROLE_PERMISSIONS, RoleUser } from '../types/roles';
import { logger } from '../utils/logger';

// -----------------------------------------
// Cache de permissoes por telegram_id
// TTL de 60 segundos para manter consistencia
// -----------------------------------------
interface CacheEntry { role: UserRole; cachedAt: number }
const roleCache = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 60_000;

// -----------------------------------------
// Busca cargo do usuario (com cache)
// -----------------------------------------
export async function getUserRole(telegramId: number): Promise<UserRole> {
  // Owner via .env sempre tem prioridade
  if (env.OWNER_ID === telegramId) return 'owner';

  const now = Date.now();
  const cached = roleCache.get(telegramId);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.role;
  }

  try {
    const db = getSupabaseClient();
    const { data } = await db
      .from('users')
      .select('role')
      .eq('telegram_id', telegramId)
      .single();

    const role = ((data as any)?.role ?? 'user') as UserRole;
    roleCache.set(telegramId, { role, cachedAt: now });
    return role;
  } catch {
    return 'user';
  }
}

// -----------------------------------------
// Invalida cache de um usuario especifico
// Chamar apos alterar cargo
// -----------------------------------------
export function invalidateRoleCache(telegramId: number): void {
  roleCache.delete(telegramId);
}

// -----------------------------------------
// Verifica se usuario tem permissao
// -----------------------------------------
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

// -----------------------------------------
// Helpers de cargo booleanos
// -----------------------------------------
export function isOwner(telegramId: number): boolean {
  return env.OWNER_ID === telegramId;
}

export function isStaff(role: UserRole): boolean {
  return role === 'admin' || role === 'owner';
}

export function canAccessAdminPanel(role: UserRole): boolean {
  return hasPermission(role, 'view_admin_panel');
}

// -----------------------------------------
// Busca RoleUser completo
// -----------------------------------------
export async function getRoleUser(telegramId: number): Promise<RoleUser | null> {
  try {
    const db = getSupabaseClient();
    const { data } = await db
      .from('users')
      .select('id, telegram_id, username, first_name, role')
      .eq('telegram_id', telegramId)
      .single();

    if (!data) return null;
    const u = data as any;

    // Override de owner pelo .env
    const role: UserRole = env.OWNER_ID === telegramId ? 'owner' : (u.role ?? 'user');
    return { id: u.id, telegram_id: u.telegram_id, username: u.username, first_name: u.first_name, role };
  } catch {
    return null;
  }
}

// -----------------------------------------
// Promove ou rebaixa cargo no banco
// Apenas owner pode fazer isso
// -----------------------------------------
export async function setUserRole(
  adminId: number,
  targetTelegramId: number,
  newRole: UserRole
): Promise<{ success: boolean; error?: string }> {
  const adminRole = await getUserRole(adminId);

  if (adminRole !== 'owner') {
    return { success: false, error: 'Apenas owners podem alterar cargos.' };
  }

  // Nao pode rebaixar outro owner
  if (isOwner(targetTelegramId)) {
    return { success: false, error: 'Nao e possivel alterar cargo de outro owner.' };
  }

  try {
    const db = getSupabaseClient();
    await db.from('users').update({ role: newRole }).eq('telegram_id', targetTelegramId);
    invalidateRoleCache(targetTelegramId);
    return { success: true };
  } catch (err) {
    logger.error('[Permissions] setUserRole error:', err);
    return { success: false, error: 'Erro ao alterar cargo.' };
  }
}

// -----------------------------------------
// Timeout de sessao admin: 30 min de inatividade
// -----------------------------------------
const adminActivity = new Map<number, number>();
const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000;

export function touchAdminSession(telegramId: number): void {
  adminActivity.set(telegramId, Date.now());
}

export function isAdminSessionValid(telegramId: number): boolean {
  const last = adminActivity.get(telegramId);
  if (!last) return false;
  return Date.now() - last < ADMIN_SESSION_TTL_MS;
}

// Limpeza periodica do mapa de atividade
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of adminActivity.entries()) {
    if (now - ts > ADMIN_SESSION_TTL_MS * 2) adminActivity.delete(id);
  }
  for (const [id, entry] of roleCache.entries()) {
    if (now - entry.cachedAt > CACHE_TTL_MS * 5) roleCache.delete(id);
  }
}, 10 * 60 * 1000);
