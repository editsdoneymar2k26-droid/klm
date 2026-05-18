// -----------------------------------------
// HYPERCUT STORE BOT -- Rate Limiter PIX
// Anti-flood: max 3 tentativas por minuto por usuario
// -----------------------------------------

import { env } from '../config/env';
import { logger } from '../utils/logger';

interface RateEntry {
  count: number;
  windowStart: number;
}

const store = new Map<number, RateEntry>();

export function checkPixRateLimit(telegramId: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const windowMs = env.PIX_RATE_LIMIT_WINDOW_MS;
  const maxAttempts = env.PIX_RATE_LIMIT_MAX;

  const entry = store.get(telegramId);

  if (!entry || now - entry.windowStart > windowMs) {
    // Nova janela
    store.set(telegramId, { count: 1, windowStart: now });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= maxAttempts) {
    const retryAfterMs = windowMs - (now - entry.windowStart);
    logger.warn(`[RateLimit] Bloqueado | user=${telegramId} | tentativas=${entry.count}`);
    return { allowed: false, retryAfterMs };
  }

  entry.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

// Limpa entradas antigas da memória a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (now - entry.windowStart > env.PIX_RATE_LIMIT_WINDOW_MS * 2) {
      store.delete(id);
    }
  }
}, 5 * 60 * 1000);
