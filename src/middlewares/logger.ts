// -----------------------------------------
// HYPERCUT STORE BOT -- Middleware de Log
// Apenas loga comandos no terminal
// Telegram e gerenciado pelo sendLog em cada handler
// -----------------------------------------

import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../types';
import { logger } from '../utils/logger';

export const loggerMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();

  // Loga comandos no terminal (apenas para debug local)
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text ?? '';
    if (text.startsWith('/')) {
      logger.debug(`[CMD] ${from.id} → ${text.split(' ')[0]}`);
    }
  }

  return next();
};
