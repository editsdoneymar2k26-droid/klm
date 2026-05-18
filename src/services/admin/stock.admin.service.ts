// -----------------------------------------
// HYPERCUT ADMIN -- Stock Service
// -----------------------------------------

import { getSupabaseClient } from '../../database/client';
import { logger } from '../../utils/logger';

// IDs dos produtos CapCut (seed da migration_purchase_module.sql)
export const PRODUCT_IDS = {
  '7d':  'a1b2c3d4-0001-0001-0001-000000000001',
  '30d': 'a1b2c3d4-0002-0002-0002-000000000002',
  '3m':  'a1b2c3d4-0003-0003-0003-000000000003',
  '1y':  'a1b2c3d4-0004-0004-0004-000000000004',
} as const;

export type ProductKey = keyof typeof PRODUCT_IDS;

export interface StockSummary {
  productName: string;
  available: number;
  reserved: number;
  sold: number;
  total: number;
}

export interface AddStockResult {
  inserted: number;
  skipped: number;
  errors: number;
}

export class StockAdminService {
  private get db() { return getSupabaseClient(); }

  // Adiciona contas em lote. Formato: "login:senha" por linha
  async addAccounts(productKey: ProductKey, rawText: string): Promise<AddStockResult> {
    const productId = PRODUCT_IDS[productKey];
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

    let inserted = 0, skipped = 0, errors = 0;

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) { skipped++; continue; }

      const login = line.slice(0, colonIdx).trim();
      const senha = line.slice(colonIdx + 1).trim();

      if (!login || !senha) { skipped++; continue; }

      const credentials = `${login}|${senha}`;

      try {
        // Verifica se ja existe
        const { data: existing } = await this.db
          .from('stock_items')
          .select('id')
          .eq('credentials', credentials)
          .eq('product_id', productId)
          .maybeSingle();

        if (existing) { skipped++; continue; }

        await this.db.from('stock_items').insert({
          product_id: productId,
          credentials,
          status: 'available',
          current_users: 0,
          max_users: 5,
        });
        inserted++;
      } catch (err) {
        logger.error('[StockAdmin] Erro ao inserir conta:', err);
        errors++;
      }
    }

    return { inserted, skipped, errors };
  }

  async getSummary(): Promise<StockSummary[]> {
    const productNames: Record<string, string> = {
      [PRODUCT_IDS['7d']]:  'CapCut 7 Dias',
      [PRODUCT_IDS['30d']]: 'CapCut 30 Dias',
      [PRODUCT_IDS['3m']]:  'CapCut 3 Meses',
      [PRODUCT_IDS['1y']]:  'CapCut 1 Ano',
    };

    const result: StockSummary[] = [];

    for (const [key, productId] of Object.entries(PRODUCT_IDS)) {
      const { data } = await this.db
        .from('stock_items')
        .select('status')
        .eq('product_id', productId);

      const items = (data ?? []) as { status: string }[];
      result.push({
        productName: productNames[productId] ?? key,
        available: items.filter(i => i.status === 'available').length,
        reserved: items.filter(i => i.status === 'reserved').length,
        sold: items.filter(i => i.status === 'sold').length,
        total: items.length,
      });
    }

    return result;
  }

  async clearExpiredReservations(): Promise<number> {
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
    return data?.length ?? 0;
  }

  async getReservedAccounts() {
    const { data } = await this.db
      .from('stock_items')
      .select('id, credentials, reserved_by, reservation_expires_at, product_id')
      .eq('status', 'reserved')
      .order('reservation_expires_at', { ascending: true });

    return (data ?? []) as {
      id: string;
      credentials: string;
      reserved_by: number | null;
      reservation_expires_at: string | null;
      product_id: string;
    }[];
  }
}

export const stockAdminService = new StockAdminService();
