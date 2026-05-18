// -----------------------------------------
// HYPERCUT ADMIN -- User Admin Service
// -----------------------------------------

import { getSupabaseClient } from '../../database/client';
import { logger } from '../../utils/logger';

export interface AdminUser {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  balance: number;
  total_spent: number;
  level: string;
  is_banned: boolean;
  is_admin: boolean;
  created_at: string;
}

export class UserAdminService {
  private get db() { return getSupabaseClient(); }

  async search(query: string): Promise<AdminUser[]> {
    const isNumeric = /^\d+$/.test(query);

    if (isNumeric) {
      const { data } = await this.db
        .from('users')
        .select('*')
        .eq('telegram_id', parseInt(query, 10))
        .limit(5);
      return (data ?? []) as AdminUser[];
    }

    const clean = query.replace('@', '').toLowerCase();
    const { data } = await this.db
      .from('users')
      .select('*')
      .or(`username.ilike.%${clean}%,first_name.ilike.%${clean}%`)
      .limit(5);

    return (data ?? []) as AdminUser[];
  }

  async findByTelegramId(telegramId: number): Promise<AdminUser | null> {
    const { data } = await this.db
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();
    return (data as AdminUser) ?? null;
  }

  async getOrderCount(userId: string): Promise<number> {
    const { count } = await this.db
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'delivered');
    return count ?? 0;
  }

  async ban(telegramId: number, reason: string): Promise<void> {
    await this.db.from('users').update({
      is_banned: true,
      banned_at: new Date().toISOString(),
      ban_reason: reason,
    }).eq('telegram_id', telegramId);
  }

  async unban(telegramId: number): Promise<void> {
    await this.db.from('users').update({
      is_banned: false,
      banned_at: null,
      ban_reason: null,
    }).eq('telegram_id', telegramId);
  }

  async adjustBalance(telegramId: number, amountCents: number): Promise<{
    success: boolean;
    newBalance?: number;
    error?: string;
  }> {
    try {
      const { data: user } = await this.db
        .from('users')
        .select('balance')
        .eq('telegram_id', telegramId)
        .single();

      if (!user) return { success: false, error: 'Usuario nao encontrado.' };

      const u = user as { balance: number };
      const delta = amountCents / 100;
      const newBalance = parseFloat((u.balance + delta).toFixed(2));

      if (newBalance < 0) return { success: false, error: 'Saldo resultante negativo.' };

      await this.db.from('users').update({ balance: newBalance }).eq('telegram_id', telegramId);
      return { success: true, newBalance };
    } catch (err) {
      logger.error('[UserAdmin] adjustBalance error:', err);
      return { success: false, error: 'Erro ao ajustar saldo.' };
    }
  }

  async setLevel(telegramId: number, level: string): Promise<void> {
    await this.db.from('users').update({ level }).eq('telegram_id', telegramId);
  }

  async setAdmin(telegramId: number, isAdmin: boolean): Promise<void> {
    await this.db.from('users').update({ is_admin: isAdmin }).eq('telegram_id', telegramId);
  }

  async getRecentOrders(userId: string, limit = 5) {
    const { data } = await this.db
      .from('orders')
      .select('id, amount, status, created_at, products(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data ?? []) as {
      id: string;
      amount: number;
      status: string;
      created_at: string;
      products: { name: string } | null;
    }[];
  }

  async getUsersForBroadcast(filter: string): Promise<{ telegram_id: number }[]> {
    const db = this.db;

    const baseQuery = () => db.from('users').select('telegram_id').eq('is_banned', false);

    switch (filter) {
      case 'all':
        const { data: all } = await baseQuery();
        return (all ?? []) as { telegram_id: number }[];

      case 'bronze':
      case 'silver':
      case 'gold':
      case 'vip': {
        const { data } = await baseQuery().eq('level', filter);
        return (data ?? []) as { telegram_id: number }[];
      }

      case 'no_purchase': {
        const { data } = await baseQuery().eq('total_spent', 0);
        return (data ?? []) as { telegram_id: number }[];
      }

      case 'no_topup': {
        // Usuarios sem nenhum pix pago
        const { data: withPix } = await db
          .from('pending_payments')
          .select('telegram_id')
          .eq('status', 'paid');
        const ids = (withPix ?? []).map((r: any) => r.telegram_id);
        const { data } = await baseQuery().not('telegram_id', 'in', `(${ids.join(',')})`);
        return (data ?? []) as { telegram_id: number }[];
      }

      case 'active': {
        // Compraram nos ultimos 30 dias
        const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const { data: recentUsers } = await db
          .from('orders')
          .select('users!inner(telegram_id)')
          .eq('status', 'delivered')
          .gte('created_at', since);
        const ids = [...new Set((recentUsers ?? []).map((r: any) => r.users?.telegram_id).filter(Boolean))];
        return ids.map(id => ({ telegram_id: id }));
      }

      case 'old': {
        // Registrados ha mais de 60 dias sem compra
        const since = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
        const { data } = await baseQuery().lt('created_at', since).eq('total_spent', 0);
        return (data ?? []) as { telegram_id: number }[];
      }

      default:
        return [];
    }
  }
}

export const userAdminService = new UserAdminService();
