// -----------------------------------------
// HYPERCUT STORE BOT -- Entry Point
// -----------------------------------------

import 'dotenv/config';
import { createBot } from './bot/bot';
import { startExpirationWorker, stopExpirationWorker } from './workers/expiration.worker';
import { startWebhookServer } from './workers/webhook.server';
import { logger, sendLog } from './utils/logger';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  logger.info('====================================');
  logger.info('  HyperCut Store BOT -- Iniciando');
  logger.info(`  Ambiente: ${env.NODE_ENV}`);
  logger.info('====================================');

  const bot = createBot();

  startExpirationWorker();
  const webhookServer = startWebhookServer(bot);

  const shutdown = async (signal: string) => {
    logger.info(`[Shutdown] ${signal} recebido.`);
    sendLog({ type: 'bot_stop' });
    stopExpirationWorker();
    webhookServer.close();
    bot.stop(signal);
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  await bot.launch();

  logger.info(`Bot @${env.BOT_USERNAME} online.`);
  logger.info(`Webhook: POST http://localhost:${env.WEBHOOK_PORT}/webhook/pix`);

  // Log de inicio no grupo
  sendLog({ type: 'bot_start' });
}

bootstrap().catch((err) => {
  logger.error('[Bootstrap] Erro fatal:', err);
  sendLog({ type: 'error', context: 'Bootstrap', message: String(err), stack: err?.stack });
  process.exit(1);
});
