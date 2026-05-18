// -----------------------------------------
// HYPERCUT STORE BOT -- Promotion Service
// -----------------------------------------

import { getSupabaseClient } from '../database/client';
import { logger } from '../utils/logger';

export interface Promotion {
  id: string;
  product_id: string;
  promo_price: number;
  original_price: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_by: number;
  created_at: string;
}

export interface PromoWithProduct extends Promotion {
  product_name: string;
  available_stock: number;
}

export class PromotionService {
  private get db() { return getSupabaseClient(); }

  async listActive(): Promise<PromoWithProduct[]> {
    try {
      const { data } = await this.db
        .from('promotions')
        .select('*, products(name)')
        .eq('is_active', true)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .order('created_at', { ascending: false });

      if (!data) return [];

      const result: PromoWithProduct[] = [];
      for (const row of data as any[]) {
        const { count } = await this.db
          .from('stock_items')
          .select('*', { count: 'exact', head: true })
          .eq('product_id', row.product_id)
          .eq('status', 'available');

        // Verifica limite de usos
        if (row.max_uses !== null && row.used_count >= row.max_uses) continue;

        result.push({
          ...row,
          product_name: row.products?.name ?? 'Produto',
          available_stock: count ?? 0,
        });
      }
      return result;
    } catch (err) {
      logger.error('[PromotionService] listActive error:', err);
      return [];
    }
  }

  async findByProduct(productId: string): Promise<Promotion | null> {
    const { data } = await this.db
      .from('promotions')
      .select('*')
      .eq('product_id', productId)
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .maybeSingle();
    return (data as Promotion) ?? null;
  }

  async findById(promoId: string): Promise<Promotion | null> {
    const { data } = await this.db
      .from('promotions')
      .select('*')
      .eq('id', promoId)
      .single();
    return (data as Promotion) ?? null;
  }

  async create(params: {
    productId: string;
    promoPrice: number;
    originalPrice: number;
    maxUses?: number;
    expiresAt?: string;
    createdBy: number;
  }): Promise<{ success: boolean; promo?: Promotion; error?: string }> {
    try {
      const { data, error } = await this.db
        .from('promotions')
        .insert({
          product_id: params.productId,
          promo_price: params.promoPrice,
          original_price: params.originalPrice,
          max_uses: params.maxUses ?? null,
          expires_at: params.expiresAt ?? null,
          is_active: true,
          created_by: params.createdBy,
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, promo: data as Promotion };
    } catch (err) {
      logger.error('[PromotionService] create error:', err);
      return { success: false, error: 'Erro ao criar promoção.' };
    }
  }

  async setActive(promoId: string, active: boolean): Promise<void> {
    await this.db.from('promotions').update({ is_active: active }).eq('id', promoId);
  }

  async delete(promoId: string): Promise<void> {
    await this.db.from('promotions').delete().eq('id', promoId);
  }

  async incrementUsed(promoId: string): Promise<void> {
    const { data } = await this.db.from('promotions').select('used_count').eq('id', promoId).single();
    if (data) {
      await this.db.from('promotions')
        .update({ used_count: (data as any).used_count + 1 })
        .eq('id', promoId);
    }
  }

  // Notificacoes de promos
  async subscribePromoNotif(telegramId: number): Promise<boolean> {
    const { error } = await this.db.from('promo_notifications').insert({ telegram_id: telegramId });
    return !error;
  }

  async unsubscribePromoNotif(telegramId: number): Promise<void> {
    await this.db.from('promo_notifications').delete().eq('telegram_id', telegramId);
  }

  async isSubscribedPromo(telegramId: number): Promise<boolean> {
    const { data } = await this.db.from('promo_notifications').select('id').eq('telegram_id', telegramId).maybeSingle();
    return !!data;
  }

  async getPromoSubscribers(): Promise<number[]> {
    const { data } = await this.db.from('promo_notifications').select('telegram_id');
    return (data ?? []).map((r: any) => r.telegram_id);
  }

  // Fila de estoque (waitlist)
  async joinWaitlist(telegramId: number, productId: string): Promise<boolean> {
    const { error } = await this.db.from('stock_waitlist').insert({ telegram_id: telegramId, product_id: productId });
    return !error;
  }

  async leaveWaitlist(telegramId: number, productId: string): Promise<void> {
    await this.db.from('stock_waitlist').delete().eq('telegram_id', telegramId).eq('product_id', productId);
  }

  async isOnWaitlist(telegramId: number, productId: string): Promise<boolean> {
    const { data } = await this.db.from('stock_waitlist').select('id').eq('telegram_id', telegramId).eq('product_id', productId).maybeSingle();
    return !!data;
  }

  async getWaitlistForProduct(productId: string): Promise<number[]> {
    const { data } = await this.db.from('stock_waitlist').select('telegram_id').eq('product_id', productId);
    return (data ?? []).map((r: any) => r.telegram_id);
  }

  async clearWaitlistForProduct(productId: string): Promise<void> {
    await this.db.from('stock_waitlist').delete().eq('product_id', productId);
  }
}

export const promotionService = new PromotionService();
