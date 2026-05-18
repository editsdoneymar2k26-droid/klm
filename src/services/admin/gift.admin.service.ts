// -----------------------------------------
// HYPERCUT ADMIN -- Gift Service
// -----------------------------------------

import { getSupabaseClient } from '../../database/client';
import { logger } from '../../utils/logger';

export interface Gift {
  id: string;
  name: string;
  code: string;
  max_uses: number;
  used_count: number;
  balance_cents: number;
  expires_at: string | null;
  is_active: boolean;
  created_by: number;
  created_at: string;
}

export interface CreateGiftDTO {
  name: string;
  code: string;
  maxUses: number;
  balanceCents: number;
  expiresAt?: string;
  createdBy: number;
}

export class GiftAdminService {
  private get db() { return getSupabaseClient(); }

  async create(dto: CreateGiftDTO): Promise<{ success: boolean; gift?: Gift; error?: string }> {
    try {
      const { data, error } = await this.db
        .from('gifts')
        .insert({
          name: dto.name,
          code: dto.code.toUpperCase(),
          max_uses: dto.maxUses,
          balance_cents: dto.balanceCents,
          expires_at: dto.expiresAt ?? null,
          is_active: true,
          created_by: dto.createdBy,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') return { success: false, error: 'Codigo ja existe.' };
        throw error;
      }

      return { success: true, gift: data as Gift };
    } catch (err) {
      logger.error('[GiftAdmin] create error:', err);
      return { success: false, error: 'Erro ao criar gift.' };
    }
  }

  async listAll(): Promise<Gift[]> {
    const { data } = await this.db
      .from('gifts')
      .select('*')
      .order('created_at', { ascending: false });
    return (data ?? []) as Gift[];
  }

  async findByCode(code: string): Promise<Gift | null> {
    const { data } = await this.db
      .from('gifts')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();
    return (data as Gift) ?? null;
  }

  async setActive(giftId: string, active: boolean): Promise<void> {
    await this.db.from('gifts').update({ is_active: active }).eq('id', giftId);
  }

  async delete(giftId: string): Promise<void> {
    await this.db.from('gifts').delete().eq('id', giftId);
  }

  // Chamado pelo usuario ao usar /gift CODIGO
  async redeem(code: string, telegramId: number): Promise<{
    success: boolean;
    balanceCents?: number;
    giftName?: string;
    error?: string;
  }> {
    try {
      const gift = await this.findByCode(code);

      if (!gift) return { success: false, error: 'Codigo invalido.' };
      if (!gift.is_active) return { success: false, error: 'Este gift nao esta ativo.' };
      if (gift.used_count >= gift.max_uses) return { success: false, error: 'Gift esgotado.' };
      if (gift.expires_at && new Date(gift.expires_at) < new Date()) {
        return { success: false, error: 'Gift expirado.' };
      }

      // Busca usuario
      const { data: user } = await this.db
        .from('users')
        .select('id, balance')
        .eq('telegram_id', telegramId)
        .single();

      if (!user) return { success: false, error: 'Usuario nao encontrado.' };

      const u = user as { id: string; balance: number };

      // Verifica se ja resgatou
      const { data: alreadyRedeemed } = await this.db
        .from('gift_redemptions')
        .select('id')
        .eq('gift_id', gift.id)
        .eq('user_id', u.id)
        .maybeSingle();

      if (alreadyRedeemed) return { success: false, error: 'Voce ja usou este gift.' };

      // Credita saldo
      const balanceAdd = gift.balance_cents / 100;
      const newBalance = parseFloat((u.balance + balanceAdd).toFixed(2));

      await this.db.from('users').update({ balance: newBalance }).eq('id', u.id);

      // Registra uso
      await this.db.from('gift_redemptions').insert({
        gift_id: gift.id,
        user_id: u.id,
        telegram_id: telegramId,
      });

      // Incrementa contador
      await this.db
        .from('gifts')
        .update({ used_count: gift.used_count + 1 })
        .eq('id', gift.id);

      return { success: true, balanceCents: gift.balance_cents, giftName: gift.name };
    } catch (err) {
      logger.error('[GiftAdmin] redeem error:', err);
      return { success: false, error: 'Erro ao resgatar gift.' };
    }
  }
}

export const giftAdminService = new GiftAdminService();
