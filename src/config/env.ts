// -----------------------------------------
// HYPERCUT STORE BOT -- Variaveis de ambiente
// -----------------------------------------

import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`[Config] Obrigatoria: ${key}`);
  return value;
}

export const env = {
  BOT_TOKEN: requireEnv('BOT_TOKEN'),
  BOT_USERNAME: process.env.BOT_USERNAME ?? 'hypercutbot',
  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_SERVICE_KEY: requireEnv('SUPABASE_SERVICE_KEY'),
  CHANNEL_ID: process.env.CHANNEL_ID ?? '@hypercutstore',
  CHANNEL_INVITE_LINK: process.env.CHANNEL_INVITE_LINK ?? 'https://t.me/hypercutstore',
  PIX_GATEWAY_BASE_URL: process.env.PIX_GATEWAY_BASE_URL ?? 'https://api.miuse.app/v1/api',
  PIX_GATEWAY_API_KEY: process.env.PIX_GATEWAY_API_KEY ?? '',
  PIX_WEBHOOK_SECRET: process.env.PIX_WEBHOOK_SECRET ?? '',
  PIX_WALLET_ID: process.env.PIX_WALLET_ID ?? 'wallet_main',
  WEBHOOK_PORT: parseInt(process.env.WEBHOOK_PORT ?? '4000', 10),
  PIX_MIN_CENTS: parseInt(process.env.PIX_MIN_CENTS ?? '500', 10),
  PIX_MAX_CENTS: parseInt(process.env.PIX_MAX_CENTS ?? '5000', 10),
  PIX_TTL_MINUTES: parseInt(process.env.PIX_TTL_MINUTES ?? '20', 10),
  PIX_RATE_LIMIT_MAX: parseInt(process.env.PIX_RATE_LIMIT_MAX ?? '3', 10),
  PIX_RATE_LIMIT_WINDOW_MS: parseInt(process.env.PIX_RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '3000', 10),
  RESERVATION_TTL_MINUTES: parseInt(process.env.RESERVATION_TTL_MINUTES ?? '20', 10),
  WORKER_INTERVAL_SECONDS: parseInt(process.env.WORKER_INTERVAL_SECONDS ?? '60', 10),

  // Owner do bot — acesso total, definido via .env
  OWNER_ID: parseInt(process.env.OWNER_ID ?? '0', 10),

  // IDs de admins legados (compatibilidade — use OWNER_ID + banco de agora em diante)
  ADMIN_IDS: (process.env.ADMIN_IDS ?? '')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0),

  get isDev() { return this.NODE_ENV === 'development'; },
  get isProd() { return this.NODE_ENV === 'production'; },
} as const;
