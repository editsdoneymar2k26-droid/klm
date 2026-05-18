// ─────────────────────────────────────────
// HYPERCUT STORE BOT — Middleware Force Join
// ─────────────────────────────────────────

import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../types';
import { env } from '../config/env';
import { forceJoinKeyboard } from '../keyboards/main';
import { logger } from '../utils/logger';

const BYPASS_ACTIONS = ['forcejoin:check'];

export const forceJoinMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  // Não bloqueia verificação de entrada
  if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
    if (BYPASS_ACTIONS.includes(ctx.callbackQuery.data)) return next();
  }

  try {
    const member = await ctx.telegram.getChatMember(env.CHANNEL_ID, userId);
    const allowedStatuses = ['member', 'administrator', 'creator'];

    if (!allowedStatuses.includes(member.status)) {
      await ctx.reply(
        `🔒 <b>Acesso restrito</b>\n\nPara usar o bot, você precisa entrar em nosso canal oficial primeiro.`,
        {
          parse_mode: 'HTML',
          ...forceJoinKeyboard(env.CHANNEL_INVITE_LINK),
          reply_parameters: { message_id: ctx.message.message_id }
        }
      );
      return;
    }
  } catch (err) {
    // Se não conseguir verificar (ex: canal privado), deixa passar
    logger.warn('[ForceJoin] Não foi possível verificar membro:', err);
  }

  return next();
};
