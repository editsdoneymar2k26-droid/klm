// -----------------------------------------
// HYPERCUT STORE BOT -- Handlers Owner
// /addsaldo + modo teste de compra
// -----------------------------------------

import { BotContext } from '../types';
import { getUserRole } from '../helpers/permissions';
import { getSupabaseClient } from '../database/client';
import { logAdminAction } from '../middlewares/admin';
import { backToMenuKeyboard } from '../keyboards/main';
import { logger } from '../utils/logger';

// -----------------------------------------
// /addsaldo [valor]
// Adiciona saldo ao proprio owner para testes
// -----------------------------------------
export async function addSaldoCommandHandler(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from!.id;
  const role = await getUserRole(telegramId);

  if (role !== 'owner') {
    await ctx.reply('', { parse_mode: 'HTML' });
    return;
  }

  const msg = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = msg.trim().split(/\s+/);
  const valueStr = parts[1];

  if (!valueStr) {
    await ctx.reply('Uso: <code>/addsaldo 50.00</code>', { parse_mode: 'HTML' });
    return;
  }

  const value = parseFloat(valueStr.replace(',', '.'));
  if (isNaN(value) || value <= 0) {
    await ctx.reply('Valor invalido.', { parse_mode: 'HTML' });
    return;
  }

  try {
    const db = getSupabaseClient();
    const { data: user } = await db
      .from('users')
      .select('balance, id')
      .eq('telegram_id', telegramId)
      .single();

    if (!user) {
      await ctx.reply('Usuario nao encontrado.', { parse_mode: 'HTML' });
      return;
    }

    const u = user as { balance: number; id: string };
    const newBalance = parseFloat((u.balance + value).toFixed(2));

    await db.from('users').update({ balance: newBalance }).eq('telegram_id', telegramId);

    await logAdminAction({
      adminId: telegramId,
      action: 'owner_add_balance',
      targetId: String(telegramId),
      detail: `+R$${value.toFixed(2)} | novo saldo: R$${newBalance.toFixed(2)}`,
    });

    await ctx.reply(
      [
        `✅ <b>Saldo Adicionado!</b>`,
        ``,
        `💰 Adicionado: <b>R$ ${value.toFixed(2).replace('.', ',')}</b>`,
        `💳 Novo saldo: <b>R$ ${newBalance.toFixed(2).replace('.', ',')}</b>`,
      ].join('\n'),
      { parse_mode: 'HTML', ...backToMenuKeyboard }
    );

    logger.info(`[Owner] /addsaldo | user=${telegramId} | +R$${value.toFixed(2)}`);
  } catch (err) {
    logger.error('[Owner] addSaldo error:', err);
    await ctx.reply('Erro ao adicionar saldo.', { parse_mode: 'HTML' });
  }
}
