// -----------------------------------------
// HYPERCUT STORE BOT -- Middlewares de Permissoes
// -----------------------------------------

import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../types';
import { getUserRole, hasPermission, isStaff, canAccessAdminPanel, touchAdminSession, isAdminSessionValid } from '../helpers/permissions';
import { Permission } from '../types/roles';
import { denyCallbackAccess } from '../helpers/context';
import { getSupabaseClient } from '../database/client';
import { logger } from '../utils/logger';

// -----------------------------------------
// Middleware GLOBAL: protecao de ownership de callback
//
// Impede que usuario B use menus abertos pelo usuario A.
// Funciona em grupos e DMs.
// Armazena o dono da sessao na primeira interacao.
// -----------------------------------------
export const callbackOwnershipMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  if (!ctx.callbackQuery) return next();

  const callerId = ctx.from?.id;
  if (!callerId) return next();

  // Acoes que qualquer um pode usar (ex: force join check nao tem dono)
  const freeActions = new Set(['forcejoin:check']);
  const cbData = (ctx.callbackQuery as any).data ?? '';
  if (freeActions.has(cbData)) return next();

  // Em DM: registra dono e prossegue
  if (ctx.chat?.type === 'private') {
    if (!ctx.session.ownerId) ctx.session.ownerId = callerId;
    if (ctx.session.ownerId !== callerId) {
      await denyCallbackAccess(ctx);
      return;
    }
    return next();
  }

  // Em grupos: valida dono da sessao
  const sessionOwner = ctx.session.ownerId;
  if (sessionOwner && callerId !== sessionOwner) {
    await denyCallbackAccess(ctx);
    return;
  }

  if (!sessionOwner) ctx.session.ownerId = callerId;

  return next();
};

// -----------------------------------------
// Middleware: verifica se usuario esta banido
// -----------------------------------------
export const banCheckMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return next();

  try {
    const db = getSupabaseClient();
    const { data } = await db
      .from('users')
      .select('is_banned, ban_reason')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if ((data as any)?.is_banned) {
      const reason = (data as any)?.ban_reason ?? 'Motivo nao informado.';
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery(`🚫 Conta banida: ${reason}`, { show_alert: true });
      } else if (ctx.message) {
        await ctx.reply(`🚫 <b>Conta banida</b>\n${reason}`, { parse_mode: 'HTML' });
      }
      return;
    }
  } catch { /* se falhar, deixa passar — nao bloqueia por erro de DB */ }

  return next();
};

// -----------------------------------------
// Fabrica de guard de permissao
// Uso: bot.action('adm:stock', requirePermission('manage_stock'), handler)
// -----------------------------------------
export function requirePermission(permission: Permission): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      if (ctx.callbackQuery) await ctx.answerCbQuery('Sem permissao.', { show_alert: true });
      return;
    }

    const role = await getUserRole(telegramId);
    if (!hasPermission(role, permission)) {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery('❌ Sem permissão para esta ação.', { show_alert: true });
      } else {
        await ctx.reply('❌ Sem permissão.');
      }
      return;
    }

    // Atualiza atividade para staff
    if (isStaff(role)) touchAdminSession(telegramId);

    return next();
  };
}

// -----------------------------------------
// Guard para painel admin (qualquer cargo com view_admin_panel)
// -----------------------------------------
export const adminPanelGuard: MiddlewareFn<BotContext> = async (ctx, next) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Sem permissao.', { show_alert: true });
    return;
  }

  const role = await getUserRole(telegramId);
  if (!canAccessAdminPanel(role)) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('❌ Sem permissao.', { show_alert: true });
    else await ctx.reply('❌ Sem permissao.');
    return;
  }

  // Valida timeout de sessao admin
  if (!isAdminSessionValid(telegramId)) {
    touchAdminSession(telegramId); // reinicia sessao
  }

  return next();
};

// -----------------------------------------
// Guard exclusivo para owner
// -----------------------------------------
export const ownerGuard: MiddlewareFn<BotContext> = async (ctx, next) => {
  const telegramId = ctx.from?.id;
  const role = telegramId ? await getUserRole(telegramId) : 'user';

  if (role !== 'owner') {
    if (ctx.callbackQuery) await ctx.answerCbQuery('❌ Apenas para owners.', { show_alert: true });
    else await ctx.reply('❌ Apenas para owners.');
    return;
  }

  return next();
};
