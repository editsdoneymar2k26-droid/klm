// -----------------------------------------
// HYPERCUT STORE BOT -- Middlewares Admin
// -----------------------------------------

import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../types';
import { env } from '../config/env';
import { getSupabaseClient } from '../database/client';
import { logger } from '../utils/logger';

// -----------------------------------------
// Guard: bloqueia acesso ao painel admin
// para usuarios nao autorizados
// -----------------------------------------
export const adminGuard: MiddlewareFn<BotContext> = async (ctx, next) => {
  const id = ctx.from?.id;
  if (!id || !env.ADMIN_IDS.includes(id)) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Sem permissao.', { show_alert: true });
    else await ctx.reply('Sem permissao.');
    return;
  }
  return next();
};

// -----------------------------------------
// Verifica se ID e admin
// -----------------------------------------
export function isAdmin(telegramId: number): boolean {
  return env.ADMIN_IDS.includes(telegramId);
}

// -----------------------------------------
// Modo manutencao: bloqueia usuarios normais
// -----------------------------------------
let _maintenanceCache: { active: boolean; message: string; cachedAt: number } | null = null;
const CACHE_TTL_MS = 10_000;

export async function getMaintenanceState(): Promise<{ active: boolean; message: string }> {
  const now = Date.now();
  if (_maintenanceCache && now - _maintenanceCache.cachedAt < CACHE_TTL_MS) {
    return { active: _maintenanceCache.active, message: _maintenanceCache.message };
  }

  try {
    const db = getSupabaseClient();
    const { data } = await db.from('maintenance_mode').select('*').eq('id', 1).single();
    const state = {
      active: (data as any)?.is_active ?? false,
      message: (data as any)?.message ?? 'Bot em manutencao. Voltamos em breve!',
    };
    _maintenanceCache = { ...state, cachedAt: now };
    return state;
  } catch {
    return { active: false, message: '' };
  }
}

export function invalidateMaintenanceCache(): void {
  _maintenanceCache = null;
}

export const maintenanceMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  if (isAdmin(ctx.from?.id ?? 0)) return next();

  const state = await getMaintenanceState();
  if (!state.active) return next();

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery(`🚨 ${state.message}`, { show_alert: true });
  } else if (ctx.message) {
    await ctx.reply(`🚨 <b>Manutencao</b>\n\n${state.message}`, { parse_mode: 'HTML' });
  }
};

// -----------------------------------------
// Log de acao admin no banco
// -----------------------------------------
export async function logAdminAction(params: {
  adminId: number;
  action: string;
  targetId?: string;
  detail?: string;
}): Promise<void> {
  try {
    const db = getSupabaseClient();
    await db.from('admin_logs').insert({
      admin_id: params.adminId,
      action: params.action,
      target_id: params.targetId ?? null,
      detail: params.detail ?? null,
    });
  } catch (err) {
    logger.error('[AdminLog] Erro:', err);
  }
}
