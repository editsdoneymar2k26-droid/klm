// -----------------------------------------
// HYPERCUT STORE BOT -- Worker de Expiracao
// Libera reservas de estoque + cobranças PIX vencidas
// -----------------------------------------

import { stockService } from '../services/stock.service';
import { orderService } from '../services/order.service';
import { pixService } from '../services/pix.service';
import { getSupabaseClient } from '../database/client';
import { logger } from '../utils/logger';
import { env } from '../config/env';

let _timer: NodeJS.Timeout | null = null;

async function runExpirationCycle(): Promise<void> {
  try {
    // 1. Libera reservas de estoque expiradas
    await stockService.releaseExpiredReservations();

    // 2. Expira pedidos PIX de compra nao pagos
    const db = getSupabaseClient();
    const { data: expiredOrders } = await db
      .from('orders')
      .select('id')
      .eq('status', 'pending')
      .lt('pix_expires_at', new Date().toISOString());

    if (expiredOrders && expiredOrders.length > 0) {
      for (const order of expiredOrders) {
        await orderService.expireOrder(order.id);
      }
      logger.info(`[ExpirationWorker] ${expiredOrders.length} pedido(s) expirado(s).`);
    }

    // 3. Expira pedidos abandonados sem PIX
    const ttlAgo = new Date(
      Date.now() - env.RESERVATION_TTL_MINUTES * 60 * 1000
    ).toISOString();

    const { data: abandonedOrders } = await db
      .from('orders')
      .select('id')
      .eq('status', 'pending')
      .is('pix_expires_at', null)
      .lt('created_at', ttlAgo);

    if (abandonedOrders && abandonedOrders.length > 0) {
      for (const order of abandonedOrders) {
        await orderService.expireOrder(order.id);
      }
    }

    // 4. Libera cobranças de recarga PIX expiradas
    const freedCharges = await pixService.releaseExpiredCharges();
    if (freedCharges > 0) {
      logger.info(`[ExpirationWorker] ${freedCharges} cobrança(s) PIX de recarga expirada(s).`);
    }
  } catch (err) {
    logger.error('[ExpirationWorker] Erro no ciclo:', err);
  }
}

export function startExpirationWorker(): void {
  const intervalMs = env.WORKER_INTERVAL_SECONDS * 1000;
  logger.info(`[ExpirationWorker] Iniciado (intervalo: ${env.WORKER_INTERVAL_SECONDS}s).`);
  runExpirationCycle();
  _timer = setInterval(runExpirationCycle, intervalMs);
}

export function stopExpirationWorker(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    logger.info('[ExpirationWorker] Parado.');
  }
}
