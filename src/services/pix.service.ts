// -----------------------------------------
// HYPERCUT STORE BOT -- PIX Service
// Gateway: api.miuse.app/v1/api
// -----------------------------------------

import { getSupabaseClient } from '../database/client';
import { PendingPayment, ServiceResult, PixWebhookPayload } from '../types';
import { env } from '../config/env';
import { logger, sendLog } from '../utils/logger';
import crypto from 'crypto';

interface MiusePaymentResponse {
  id: string;
  status: string;
  pix_total: number;
  created_at: string;
  updated_at: string;
  liquidator?: {
    pix_qr?: string;
    e2e_id?: string;
  };
  qr_image?: string;
  paid_at?: string;
}

export class PixService {
  private readonly baseUrl = env.PIX_GATEWAY_BASE_URL;

  private get db() {
    return getSupabaseClient();
  }

  private newIdempotencyKey(): string {
    return crypto.randomUUID();
  }

  async createCharge(params: {
    telegramId: number;
    userId: string;
    amountCents: number;
    username?: string | null;
  }): Promise<ServiceResult<PendingPayment>> {
    const { telegramId, userId, amountCents, username } = params;

    try {
      const idempotencyKey = this.newIdempotencyKey();
      const walletId = env.PIX_WALLET_ID;

      const body = {
        owner: { wallet_id: walletId },
        customer: {
          id: `tg_${telegramId}`,
          name: 'Cliente HyperCut',
        },
        items: [
          {
            id: `recharge_${telegramId}_${Date.now()}`,
            name: 'Recarga HyperCut Store',
            value: amountCents,
          },
        ],
        recipients: [
          {
            wallet_id: walletId,
            amount: amountCents,
            participate_gateway_fees: true,
          },
        ],
        qr: true,
      };

      logger.debug(`[PixService] POST /payments: ${JSON.stringify(body)}`);

      const response = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.PIX_GATEWAY_API_KEY}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text();
        logger.error(`[PixService] Gateway ${response.status}: ${errBody}`);
        if (response.status === 429) return { success: false, error: 'Muitas requisicoes. Aguarde.' };
        if (response.status === 422) return { success: false, error: 'Valor invalido.' };
        if (response.status === 409) return { success: false, error: 'Cobranca duplicada.' };
        return { success: false, error: 'Erro ao criar PIX. Tente novamente.' };
      }

      const data: MiusePaymentResponse = await response.json();
      logger.debug(`[PixService] Resposta: ${JSON.stringify(data)}`);

      const copyPaste = data.liquidator?.pix_qr ?? null;
      const qrImage = data.qr_image ?? null;
      const expiresAt = new Date(Date.now() + env.PIX_TTL_MINUTES * 60 * 1000).toISOString();

      const { data: payment, error: dbError } = await this.db
        .from('pending_payments')
        .insert({
          telegram_id: telegramId,
          user_id: userId,
          transaction_id: data.id,
          amount_cents: amountCents,
          status: 'pending',
          qrcode: qrImage,
          copy_paste: copyPaste,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Log rico no Telegram
      sendLog({
        type: 'pix_created',
        telegramId,
        username: username ?? null,
        amountCents,
        txid: data.id,
      });

      logger.info(`[PixService] PIX criado | user=${telegramId} | id=${data.id}`);

      return { success: true, data: payment as PendingPayment };
    } catch (err) {
      logger.error('[PixService] createCharge error:', err);
      return { success: false, error: 'Erro interno ao criar PIX.' };
    }
  }

  async getActivePending(telegramId: number): Promise<PendingPayment | null> {
    try {
      const { data } = await this.db
        .from('pending_payments')
        .select('*')
        .eq('telegram_id', telegramId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data ?? null;
    } catch {
      return null;
    }
  }

  async consultPayment(paymentId: string): Promise<MiusePaymentResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${env.PIX_GATEWAY_API_KEY}` },
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      logger.error('[PixService] consultPayment error:', err);
      return null;
    }
  }

  async processWebhook(payload: PixWebhookPayload): Promise<{
    success: boolean;
    alreadyProcessed: boolean;
    telegramId?: number;
    amountCents?: number;
    error?: string;
  }> {
    const { txid, status, paidAt } = payload;

    const { data: existing } = await this.db
      .from('processed_webhooks')
      .select('transaction_id')
      .eq('transaction_id', txid)
      .maybeSingle();

    if (existing) {
      logger.warn(`[PixService] Webhook duplicado: ${txid}`);
      sendLog({ type: 'webhook_dup', txid });
      return { success: true, alreadyProcessed: true };
    }

    const { error: insertErr } = await this.db
      .from('processed_webhooks')
      .insert({ transaction_id: txid, payload: payload as unknown as Record<string, unknown> });

    if (insertErr?.code === '23505') {
      return { success: true, alreadyProcessed: true };
    }

    if (status !== 'paid') {
      await this.db
        .from('pending_payments')
        .update({ status: status === 'expired' ? 'expired' : 'cancelled' })
        .eq('transaction_id', txid)
        .eq('status', 'pending');

      // Busca o valor para o log
      const { data: pp } = await this.db
        .from('pending_payments')
        .select('amount_cents')
        .eq('transaction_id', txid)
        .maybeSingle();

      sendLog({
        type: 'pix_expired',
        txid,
        amountCents: (pp as { amount_cents: number } | null)?.amount_cents ?? 0,
      });

      return { success: true, alreadyProcessed: false };
    }

    const { data: payment } = await this.db
      .from('pending_payments')
      .select('*')
      .eq('transaction_id', txid)
      .maybeSingle();

    if (!payment) {
      logger.error(`[PixService] Pagamento nao encontrado: ${txid}`);
      return { success: false, alreadyProcessed: false, error: 'Pagamento nao encontrado.' };
    }

    const pp = payment as PendingPayment;

    await this.db
      .from('pending_payments')
      .update({ status: 'paid', paid_at: paidAt ?? new Date().toISOString() })
      .eq('id', pp.id);

    const amountReais = pp.amount_cents / 100;

    const { data: user } = await this.db
      .from('users')
      .select('balance, username')
      .eq('telegram_id', pp.telegram_id)
      .single();

    if (!user) {
      logger.error(`[PixService] Usuario nao encontrado: ${pp.telegram_id}`);
      return { success: false, alreadyProcessed: false, error: 'Usuario nao encontrado.' };
    }

    const u = user as { balance: number; username: string | null };
    const newBalance = parseFloat((u.balance + amountReais).toFixed(2));

    await this.db
      .from('users')
      .update({ balance: newBalance })
      .eq('telegram_id', pp.telegram_id);

    // Log rico no Telegram
    sendLog({
      type: 'pix_paid',
      telegramId: pp.telegram_id,
      username: u.username,
      amountCents: pp.amount_cents,
      txid,
      newBalance,
    });

    logger.info(`[PixService] Pago | user=${pp.telegram_id} | R$${amountReais.toFixed(2)}`);

    return {
      success: true,
      alreadyProcessed: false,
      telegramId: pp.telegram_id,
      amountCents: pp.amount_cents,
    };
  }

  async releaseExpiredCharges(): Promise<number> {
    try {
      const { data, error } = await this.db
        .from('pending_payments')
        .update({ status: 'expired' })
        .eq('status', 'pending')
        .lt('expires_at', new Date().toISOString())
        .select('id');
      if (error) throw error;
      return data?.length ?? 0;
    } catch (err) {
      logger.error('[PixService] releaseExpiredCharges error:', err);
      return 0;
    }
  }

  async logEvent(params: {
    telegramId: number;
    transactionId?: string;
    event: string;
    amountCents?: number;
    detail?: string;
  }): Promise<void> {
    try {
      await this.db.from('payment_logs').insert({
        telegram_id: params.telegramId,
        transaction_id: params.transactionId ?? null,
        event: params.event,
        amount_cents: params.amountCents ?? null,
        detail: params.detail ?? null,
      });
    } catch { /* silencioso */ }
  }
}

export const pixService = new PixService();
