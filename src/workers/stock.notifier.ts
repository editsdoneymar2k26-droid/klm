// -----------------------------------------
// HYPERCUT STORE BOT -- Stock Notifier
// Avisa usuarios na waitlist quando estoque e adicionado
// -----------------------------------------

import { Telegraf } from 'telegraf';
import { BotContext } from '../types';
import { promotionService } from '../services/promotion.service';
import { productService } from '../services/product.service';
import { logger } from '../utils/logger';

export async function notifyWaitlistForProduct(
  bot: Telegraf<BotContext>,
  productId: string
): Promise<void> {
  const [subscribers, product] = await Promise.all([
    promotionService.getWaitlistForProduct(productId),
    productService.findById(productId),
  ]);

  if (!subscribers.length || !product) return;

  const msg = [
    `📦 <b>Estoque disponível!</b>`,
    ``,
    `<b>${product.name}</b> voltou ao estoque.`,
    ``,
    `Use /start → 🛒 Comprar → 📦 Contas para aproveitar!`,
  ].join('\n');

  let sent = 0;
  for (const id of subscribers) {
    try {
      await bot.telegram.sendMessage(id, msg, { parse_mode: 'HTML' });
      sent++;
    } catch { /* usuario bloqueou o bot */ }
    await new Promise(r => setTimeout(r, 50));
  }

  // Remove waitlist apos notificar
  await promotionService.clearWaitlistForProduct(productId);

  logger.info(`[StockNotifier] Notificados ${sent}/${subscribers.length} para produto=${productId}`);
}
