// ─────────────────────────────────────────
// HYPERCUT STORE BOT — Middleware de Erros
// ─────────────────────────────────────────

import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../types';
import { logger } from '../utils/logger';
import { MESSAGES } from '../config/constants';

export const errorHandlerMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    logger.error('[ErrorHandler] Erro não tratado:', err);
    try {
      await ctx.reply(MESSAGES.ERROR_GENERIC);
    } catch {
      // Ignora erro ao tentar responder
    }
  }
};
