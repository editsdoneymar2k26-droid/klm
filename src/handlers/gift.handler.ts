// -----------------------------------------
// HYPERCUT STORE BOT -- Handler /gift
// Comando para usuarios resgatarem gifts
// -----------------------------------------

import { BotContext } from '../types';
import { giftAdminService } from '../services/admin/gift.admin.service';
import { backToMenuKeyboard } from '../keyboards/main';

export async function giftCommandHandler(ctx: BotContext): Promise<void> {
  const msg = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = msg.trim().split(/\s+/);
  const code = parts[1];

  if (!code) {
    await ctx.reply(
      `🎁 <b>Gift</b>\n\nUso: <code>/resgatat CODIGO</code>`,
      { parse_mode: 'HTML', ...backToMenuKeyboard }
    );
    return;
  }

  const telegramId = ctx.from!.id;
  const result = await giftAdminService.redeem(code, telegramId);

  if (!result.success) {
    await ctx.reply(`❌ ${result.error}`, { parse_mode: 'HTML', ...backToMenuKeyboard });
    return;
  }

  const reais = 'R$ ' + (result.balanceCents! / 100).toFixed(2).replace('.', ',');

  await ctx.reply(
    [
      `🎁 <b>Gift Resgatado!</b>`,
      ``,
      `✅ <b>${result.giftName}</b>`,
      `💰 <b>${reais}</b> adicionado ao seu saldo.`,
      ``,
      `Use /start para ver seu saldo atualizado.`,
    ].join('\n'),
    { parse_mode: 'HTML', ...backToMenuKeyboard }
  );
}
