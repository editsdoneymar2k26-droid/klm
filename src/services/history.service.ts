// -----------------------------------------
// HYPERCUT STORE BOT -- History Service
// -----------------------------------------

import { getSupabaseClient } from '../database/client';
import { logger } from '../utils/logger';

export interface OrderHistoryItem {
  id: string;
  product_name: string;
  amount: number;
  delivered_at: string | null;
  login: string;
  senha: string;
}

export class HistoryService {
  private get db() {
    return getSupabaseClient();
  }

  /**
   * Busca todas as compras entregues do usuario.
   * Puxa as credenciais direto do stock_item vinculado ao pedido.
   * As credenciais ficam no formato "login|senha" na coluna credentials.
   */
  async getAllOrders(userId: string): Promise<OrderHistoryItem[]> {
    try {
      const { data, error } = await this.db
        .from('orders')
        .select(`
          id,
          amount,
          delivered_at,
          products ( name ),
          stock_items ( credentials )
        `)
        .eq('user_id', userId)
        .eq('status', 'delivered')
        .order('delivered_at', { ascending: false });

      if (error) throw error;

      return (data ?? []).map((row: any) => {
        const raw: string = row.stock_items?.credentials ?? '';
        const parts = raw.split('|');
        return {
          id: row.id,
          product_name: row.products?.name ?? 'Produto',
          amount: row.amount,
          delivered_at: row.delivered_at,
          login: parts[0]?.trim() ?? '',
          senha: parts[1]?.trim() ?? '',
        };
      });
    } catch (err) {
      logger.error('[HistoryService] getAllOrders error:', err);
      return [];
    }
  }

  async getTotalOrderCount(userId: string): Promise<number> {
    try {
      const { count, error } = await this.db
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'delivered');

      if (error) throw error;
      return count ?? 0;
    } catch (err) {
      logger.error('[HistoryService] getTotalOrderCount error:', err);
      return 0;
    }
  }
}

export const historyService = new HistoryService();
