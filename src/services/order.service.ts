// ─────────────────────────────────────────
// HYPERCUT STORE BOT — Order Service
// ─────────────────────────────────────────

import { getSupabaseClient } from '../database/client';
import { Order, ServiceResult } from '../types';
import { logger } from '../utils/logger';

export class OrderService {
  private get db() {
    return getSupabaseClient();
  }

  async create(params: {
    userId: string;
    productId: string;
    amount: number;
  }): Promise<ServiceResult<Order>> {
    try {
      const { data, error } = await this.db
        .from('orders')
        .insert({
          user_id: params.userId,
          product_id: params.productId,
          amount: params.amount,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      logger.error('[OrderService] create error:', err);
      return { success: false, error: 'Erro ao criar pedido.' };
    }
  }

  async findById(orderId: string): Promise<Order | null> {
    const { data, error } = await this.db
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error) {
      logger.error('[OrderService] findById error:', error);
      return null;
    }
    return data;
  }

  async findByTxid(txid: string): Promise<Order | null> {
    const { data } = await this.db
      .from('orders')
      .select('*')
      .eq('pix_txid', txid)
      .single();
    return data ?? null;
  }

  async updatePixInfo(
    orderId: string,
    params: { txid: string; qrcode: string; expiresAt: string }
  ): Promise<ServiceResult<Order>> {
    try {
      const { data, error } = await this.db
        .from('orders')
        .update({
          pix_txid: params.txid,
          pix_qrcode: params.qrcode,
          pix_expires_at: params.expiresAt,
        })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      logger.error('[OrderService] updatePixInfo error:', err);
      return { success: false, error: 'Erro ao atualizar pedido.' };
    }
  }

  async markAsPaid(orderId: string): Promise<ServiceResult<Order>> {
    try {
      const { data, error } = await this.db
        .from('orders')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      logger.error('[OrderService] markAsPaid error:', err);
      return { success: false, error: 'Erro ao confirmar pagamento.' };
    }
  }

  /**
   * Finaliza pedido como entregue, vincula o stock_item e salva a mensagem de entrega.
   */
  async markAsDelivered(
    orderId: string,
    stockItemId: string,
    deliveryMessage: string
  ): Promise<ServiceResult<Order>> {
    try {
      const { data, error } = await this.db
        .from('orders')
        .update({
          status: 'delivered',
          stock_item_id: stockItemId,
          delivered_at: new Date().toISOString(),
          delivery_message: deliveryMessage,
        })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      logger.error('[OrderService] markAsDelivered error:', err);
      return { success: false, error: 'Erro ao marcar como entregue.' };
    }
  }

  async expireOrder(orderId: string): Promise<void> {
    await this.db
      .from('orders')
      .update({ status: 'expired' })
      .eq('id', orderId)
      .eq('status', 'pending');
  }
}

export const orderService = new OrderService();
