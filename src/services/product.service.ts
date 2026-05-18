// ─────────────────────────────────────────
// HYPERCUT STORE BOT — Product Service
// ─────────────────────────────────────────

import { getSupabaseClient } from '../database/client';
import { Product, ProductWithStock, ServiceResult } from '../types';
import { logger } from '../utils/logger';

export class ProductService {
  private get db() {
    return getSupabaseClient();
  }

  /**
   * Lista todos os produtos ativos com contagem de estoque disponível.
   * Usa a view product_stock_count definida no schema.
   */
  async listActive(): Promise<ProductWithStock[]> {
    try {
      const { data, error } = await this.db
        .from('product_stock_count')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

      if (error) throw error;
      return (data ?? []) as ProductWithStock[];
    } catch (err) {
      logger.error('[ProductService] listActive error:', err);
      return [];
    }
  }

  async findById(productId: string): Promise<Product | null> {
    try {
      const { data, error } = await this.db
        .from('products')
        .select('*')
        .eq('id', productId)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      logger.error('[ProductService] findById error:', err);
      return null;
    }
  }

  async getAvailableCount(productId: string): Promise<number> {
    try {
      const { count, error } = await this.db
        .from('stock_items')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', productId)
        .eq('status', 'available');

      if (error) throw error;
      return count ?? 0;
    } catch (err) {
      logger.error('[ProductService] getAvailableCount error:', err);
      return 0;
    }
  }
}

export const productService = new ProductService();
