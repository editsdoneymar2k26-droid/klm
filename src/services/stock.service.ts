// ─────────────────────────────────────────
// HYPERCUT STORE BOT — Stock Service
// ─────────────────────────────────────────

import { getSupabaseClient } from '../database/client';
import { StockItem, ServiceResult } from '../types';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { addMinutes } from '../utils/format';

export class StockService {
  private get db() {
    return getSupabaseClient();
  }

  /**
   * Reserva atômica via RPC (ACID, antirrepetição incluída).
   * Requer a função reserve_stock_item criada na migration.
   */
  async reserveItem(
    productId: string,
    telegramId: number,
    orderId: string
  ): Promise<ServiceResult<StockItem>> {
    try {
      const expiresAt = addMinutes(new Date(), env.RESERVATION_TTL_MINUTES).toISOString();

      const { data, error } = await this.db.rpc('reserve_stock_item', {
        p_product_id: productId,
        p_telegram_id: telegramId,
        p_order_id: orderId,
        p_expires_at: expiresAt,
      });

      if (error) throw error;

      // RPC retorna array; pega o primeiro elemento
      const item = Array.isArray(data) ? data[0] : data;
      if (!item) return { success: false, error: 'Sem estoque disponível para este plano.' };

      return { success: true, data: item as StockItem };
    } catch (err) {
      logger.error('[StockService] reserveItem error:', err);
      return { success: false, error: 'Erro ao reservar item de estoque.' };
    }
  }

  async findById(stockItemId: string): Promise<StockItem | null> {
    try {
      const { data, error } = await this.db
        .from('stock_items')
        .select('*')
        .eq('id', stockItemId)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      logger.error('[StockService] findById error:', err);
      return null;
    }
  }

  /**
   * Marca item como vendido e remove reserva.
   */
  async markAsSold(stockItemId: string): Promise<ServiceResult<StockItem>> {
    try {
      const { data, error } = await this.db
        .from('stock_items')
        .update({
          status: 'sold',
          reservation_expires_at: null,
        })
        .eq('id', stockItemId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      logger.error('[StockService] markAsSold error:', err);
      return { success: false, error: 'Erro ao confirmar venda no estoque.' };
    }
  }

  /**
   * Libera reservas expiradas — chamado pelo worker a cada 60s.
   */
  async releaseExpiredReservations(): Promise<number> {
    try {
      const { data, error } = await this.db
        .from('stock_items')
        .update({
          status: 'available',
          reserved_by: null,
          reservation_expires_at: null,
          order_id: null,
        })
        .eq('status', 'reserved')
        .lt('reservation_expires_at', new Date().toISOString())
        .select('id');

      if (error) throw error;

      const count = data?.length ?? 0;
      if (count > 0) {
        logger.info(`[StockService] ${count} reserva(s) expirada(s) liberada(s).`);
      }
      return count;
    } catch (err) {
      logger.error('[StockService] releaseExpiredReservations error:', err);
      return 0;
    }
  }

  async countAvailable(productId: string): Promise<number> {
    const { count } = await this.db
      .from('stock_items')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId)
      .eq('status', 'available');

    return count ?? 0;
  }
}

export const stockService = new StockService();
