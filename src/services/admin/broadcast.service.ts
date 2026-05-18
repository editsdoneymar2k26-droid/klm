// -----------------------------------------
// HYPERCUT ADMIN -- Broadcast Service
// -----------------------------------------

import { Telegraf } from 'telegraf';
import { BotContext } from '../../types';
import { getSupabaseClient } from '../../database/client';
import { userAdminService } from './user.admin.service';
import { logger } from '../../utils/logger';

const BATCH_DELAY_MS = 50; // ~20 msgs/s dentro do limite do Telegram

export async function runBroadcast(params: {
  bot: Telegraf<BotContext>;
  adminId: number;
  filter: string;
  message: string;
  progressCallback?: (sent: number, fail: number, total: number) => Promise<void>;
}): Promise<{ sent: number; fail: number }> {
  const { bot, adminId, filter, message, progressCallback } = params;
  const db = getSupabaseClient();

  const users = await userAdminService.getUsersForBroadcast(filter);
  const total = users.length;
  let sent = 0, fail = 0;

  // Cria log no banco
  const { data: logRow } = await db
    .from('broadcast_logs')
    .insert({ admin_id: adminId, filter_type: filter, message, total_sent: 0, total_fail: 0 })
    .select()
    .single();

  const logId = (logRow as any)?.id;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    try {
      await bot.telegram.sendMessage(user.telegram_id, message, { parse_mode: 'HTML' });
      sent++;
    } catch {
      fail++;
    }

    // Progresso a cada 10 usuarios
    if (progressCallback && (i + 1) % 10 === 0) {
      await progressCallback(sent, fail, total).catch(() => {});
    }

    await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  // Atualiza log com resultado final
  if (logId) {
    await db.from('broadcast_logs').update({
      total_sent: sent,
      total_fail: fail,
      finished_at: new Date().toISOString(),
    }).eq('id', logId);
  }

  logger.info(`[Broadcast] filter=${filter} | sent=${sent} | fail=${fail}`);
  return { sent, fail };
}
