// -----------------------------------------
// HYPERCUT STORE BOT -- Purchase Service v2
// Suporta forcedStockItemId para compra direta
// -----------------------------------------

import { getSupabaseClient } from '../database/client';
import { Order, StockItem, ServiceResult } from '../types';
import { userService } from './user.service';
import { stockService } from './stock.service';
import { orderService } from './order.service';
import { logger } from '../utils/logger';
import { formatDeliveryMessage } from '../utils/format';

export interface PurchaseResult {
  order: Order;
  stockItem: StockItem;
  deliveryMessage: string;
  testMode: boolean;
}

export class PurchaseService {
  private get db() { return getSupabaseClient(); }

  async executePurchase(params: {
    telegramId: number;
    productId: string;
    productName: string;
    price: number;
    forcedStockItemId?: string;  // compra direta de item especifico (paginas)
  }): Promise<ServiceResult<PurchaseResult>> {
    const { telegramId, productId, productName, price, forcedStockItemId } = params;

    const user = await userService.findByTelegramId(telegramId);
    if (!user) return { success: false, error: 'Usuário não encontrado. Use /start.' };
    if (user.balance < price) {
      return { success: false, error: `Saldo insuficiente. Seu saldo: ${formatBRL(user.balance)} | Necessário: ${formatBRL(price)}` };
    }

    const orderResult = await orderService.create({ userId: user.id, productId, amount: price });
    if (!orderResult.success || !orderResult.data) {
      return { success: false, error: orderResult.error ?? 'Erro ao criar pedido.' };
    }
    const order = orderResult.data;

    // Reserva: usa item especifico se forcedStockItemId, senão reserva atomica
    let reserveResult: ServiceResult<StockItem>;
    if (forcedStockItemId) {
      reserveResult = await this.reserveSpecificItem(forcedStockItemId, telegramId, order.id);
    } else {
      reserveResult = await stockService.reserveItem(productId, telegramId, order.id);
    }

    if (!reserveResult.success || !reserveResult.data) {
      await orderService.expireOrder(order.id);
      return { success: false, error: reserveResult.error ?? 'Sem estoque disponível.' };
    }
    const stockItem = reserveResult.data;

    const debitResult = await userService.deductBalance(telegramId, price);
    if (!debitResult.success) {
      await this.revertReservation(stockItem.id, order.id);
      return { success: false, error: debitResult.error ?? 'Erro ao debitar saldo.' };
    }

    const deliveryOk = await this.registerDelivery({ userId: user.id, telegramId, orderId: order.id, stockItemId: stockItem.id });
    if (!deliveryOk) {
      await userService.addBalance(telegramId, price);
      await this.revertReservation(stockItem.id, order.id);
      return { success: false, error: 'Erro ao registrar entrega.' };
    }

    await stockService.markAsSold(stockItem.id);

    const deliveryMessage = formatDeliveryMessage({ credentials: stockItem.credentials, productName, orderId: order.id });
    await orderService.markAsDelivered(order.id, stockItem.id, deliveryMessage);

    // Incrementa topup_count nao — apenas compra_count via gift_count fica separado
    await this.db.from('users').rpc
      ? null
      : await this.db.from('users').select('id').eq('id', user.id); // noop — contagem via orders

    logger.info(`[PurchaseService] Compra | user=${telegramId} | produto=${productName}`);

    return { success: true, data: { order, stockItem, deliveryMessage, testMode: false } };
  }

  private async reserveSpecificItem(
    stockItemId: string,
    telegramId: number,
    orderId: string
  ): Promise<ServiceResult<StockItem>> {
    try {
      const db = getSupabaseClient();
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();

      const { data, error } = await db
        .from('stock_items')
        .update({
          status: 'reserved',
          reserved_by: telegramId,
          reservation_expires_at: expiresAt,
          order_id: orderId,
        })
        .eq('id', stockItemId)
        .eq('status', 'available')  // garante atomicidade
        .select()
        .single();

      if (error || !data) {
        return { success: false, error: 'Esta conta acabou de ser reservada por outro usuário.' };
      }
      return { success: true, data: data as StockItem };
    } catch (err) {
      logger.error('[PurchaseService] reserveSpecificItem error:', err);
      return { success: false, error: 'Erro ao reservar item.' };
    }
  }

  private async revertReservation(stockItemId: string, orderId: string): Promise<void> {
    try {
      const db = getSupabaseClient();
      await db.from('stock_items').update({ status: 'available', reserved_by: null, reservation_expires_at: null, order_id: null }).eq('id', stockItemId);
      await orderService.expireOrder(orderId);
    } catch (err) {
      logger.error('[PurchaseService] revertReservation error:', err);
    }
  }

  private async registerDelivery(params: { userId: string; telegramId: number; orderId: string; stockItemId: string }): Promise<boolean> {
    try {
      const { error } = await this.db.from('deliveries').insert({
        user_id: params.userId,
        telegram_id: params.telegramId,
        order_id: params.orderId,
        stock_item_id: params.stockItemId,
      });
      if (error) { logger.error('[PurchaseService] registerDelivery error:', error); return false; }
      return true;
    } catch (err) {
      logger.error('[PurchaseService] registerDelivery exception:', err);
      return false;
    }
  }
}

function formatBRL(v: number): string { return 'R$ ' + v.toFixed(2).replace('.', ','); }

export const purchaseService = new PurchaseService();
