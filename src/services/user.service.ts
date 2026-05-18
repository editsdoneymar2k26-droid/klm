// ─────────────────────────────────────────
// HYPERCUT STORE BOT — User Service
// ─────────────────────────────────────────

import { getSupabaseClient } from '../database/client';
import { User, CreateUserDTO, ServiceResult, UserLevel } from '../types';
import { logger } from '../utils/logger';
import { LEVELS } from '../config/constants';

export class UserService {
  private get db() {
    return getSupabaseClient();
  }

  async findByTelegramId(telegramId: number): Promise<User | null> {
    const { data, error } = await this.db
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('[UserService] findByTelegramId error:', error);
    }
    return data ?? null;
  }

  async upsert(dto: CreateUserDTO): Promise<ServiceResult<User>> {
    try {
      const existing = await this.findByTelegramId(dto.telegram_id);
      if (existing) return { success: true, data: existing };

      const { data, error } = await this.db
        .from('users')
        .insert({
          telegram_id: dto.telegram_id,
          username: dto.username,
          first_name: dto.first_name,
          balance: 0,
          total_spent: 0,
          level: 'bronze',
        })
        .select()
        .single();

      if (error) throw error;
      logger.info(`[UserService] Novo usuário: ${dto.telegram_id}`);
      return { success: true, data };
    } catch (err) {
      logger.error('[UserService] upsert error:', err);
      return { success: false, error: 'Erro ao registrar usuário.' };
    }
  }

  async updateLevel(userId: string, totalSpent: number): Promise<void> {
    let newLevel: UserLevel = 'bronze';
    for (const [key, cfg] of Object.entries(LEVELS).reverse()) {
      if (totalSpent >= cfg.minSpent) {
        newLevel = key as UserLevel;
        break;
      }
    }
    await this.db.from('users').update({ level: newLevel }).eq('id', userId);
  }

  async deductBalance(telegramId: number, amount: number): Promise<ServiceResult<User>> {
    try {
      const user = await this.findByTelegramId(telegramId);
      if (!user) return { success: false, error: 'Usuário não encontrado.' };
      if (user.balance < amount) return { success: false, error: 'Saldo insuficiente.' };

      const newBalance = parseFloat((user.balance - amount).toFixed(2));
      const newTotalSpent = parseFloat((user.total_spent + amount).toFixed(2));

      const { data, error } = await this.db
        .from('users')
        .update({ balance: newBalance, total_spent: newTotalSpent })
        .eq('telegram_id', telegramId)
        .select()
        .single();

      if (error) throw error;
      await this.updateLevel(user.id, newTotalSpent);

      return { success: true, data };
    } catch (err) {
      logger.error('[UserService] deductBalance error:', err);
      return { success: false, error: 'Erro ao debitar saldo.' };
    }
  }

  /**
   * Adiciona saldo ao usuário (usado em rollback de compra e recargas futuras).
   */
  async addBalance(telegramId: number, amount: number): Promise<ServiceResult<User>> {
    try {
      const user = await this.findByTelegramId(telegramId);
      if (!user) return { success: false, error: 'Usuário não encontrado.' };

      const newBalance = parseFloat((user.balance + amount).toFixed(2));

      const { data, error } = await this.db
        .from('users')
        .update({ balance: newBalance })
        .eq('telegram_id', telegramId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (err) {
      logger.error('[UserService] addBalance error:', err);
      return { success: false, error: 'Erro ao adicionar saldo.' };
    }
  }
}

export const userService = new UserService();
