// -----------------------------------------
// HYPERCUT ADMIN -- Broadcast Handler v2
// Com preview antes do envio
// -----------------------------------------

import { BotContext } from '../../types';
import { Markup } from 'telegraf';
import { runBroadcast } from '../../services/admin/broadcast.service';
import { logAdminAction } from '../../middlewares/admin';
import { adminBackKeyboard } from '../../keyboards/admin';

const FILTER_LABELS: Record<string, string> = {
  bronze: '🥉 Bronze', silver: '🥈 Prata', gold: '🥇 Ouro', vip: '💎 VIP',
  no_purchase: 'Sem compra', no_topup: 'Sem recarga',
  active: 'Ativos', old: 'Antigos', all: 'Todos',
};

export async function adminBroadcastMenuHandler(ctx: BotContext): Promise<void> {
  await ctx.editMessageText(
    `📢 <b>Broadcast</b>\n\nEscolha o filtro:`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🥉 Bronze', 'adm:bc:filter:bronze'), Markup.button.callback('🥈 Prata', 'adm:bc:filter:silver')],
        [Markup.button.callback('🥇 Ouro', 'adm:bc:filter:gold'), Markup.button.callback('💎 VIP', 'adm:bc:filter:vip')],
        [Markup.button.callback('🚫 Sem compra', 'adm:bc:filter:no_purchase'), Markup.button.callback('💳 Sem recarga', 'adm:bc:filter:no_topup')],
        [Markup.button.callback('✅ Ativos', 'adm:bc:filter:active'), Markup.button.callback('🕐 Antigos', 'adm:bc:filter:old')],
        [Markup.button.callback('👥 Todos', 'adm:bc:filter:all')],
        [Markup.button.callback('⬅️ Voltar', 'adm:main')],
      ]),
    }
  );
  await ctx.answerCbQuery();
}

export async function adminBroadcastFilterHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const filter = cb.data?.replace('adm:bc:filter:', '') ?? 'all';
  ctx.session.step = `admin:bc:msg:${filter}`;

  await ctx.editMessageText(
    [`📢 <b>Broadcast — ${FILTER_LABELS[filter] ?? filter}</b>`, ``, `Envie a mensagem (HTML suportado):`].join('\n'),
    { parse_mode: 'HTML', ...adminBackKeyboard }
  );
  await ctx.answerCbQuery();
}

export async function adminBroadcastMessageHandler(ctx: BotContext): Promise<void> {
  const step = ctx.session.step ?? '';
  if (!step.startsWith('admin:bc:msg:')) return;

  const filter = step.replace('admin:bc:msg:', '');
  const message = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  if (!message) return;

  ctx.session.step = undefined;
  ctx.session.broadcastMessage = message;

  // Mostra preview antes de confirmar
  await ctx.reply(
    [`👀 <b>Preview da mensagem:</b>`, ``, `─────────────────`, message, `─────────────────`, ``, `Filtro: <b>${FILTER_LABELS[filter] ?? filter}</b>`, ``, `Confirmar envio?`].join('\n'),
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirmar Envio', `adm:bc:send:${filter}`)],
        [Markup.button.callback('❌ Cancelar', 'adm:broadcast')],
      ]),
    }
  );
}

export async function adminBroadcastSendHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const filter = cb.data?.replace('adm:bc:send:', '') ?? 'all';
  const message = ctx.session.broadcastMessage ?? '';

  if (!message) {
    await ctx.answerCbQuery('Mensagem não encontrada. Recomece.', { show_alert: true });
    return;
  }

  ctx.session.broadcastMessage = undefined;
  await ctx.answerCbQuery('Enviando...');

  const progressMsg = await ctx.reply(`📤 Enviando broadcast...\n\n⏳ 0 enviados | 0 falhas`);
  const chatId = ctx.chat!.id;
  const msgId = progressMsg.message_id;

  const { sent, fail } = await runBroadcast({
    bot: { telegram: ctx.telegram } as any,
    adminId: ctx.from!.id,
    filter,
    message,
    progressCallback: async (s, f, total) => {
      try {
        await ctx.telegram.editMessageText(chatId, msgId, undefined,
          `📤 Enviando...\n\n✅ ${s} enviados | ❌ ${f} falhas | Total: ${total}`
        );
      } catch { /* ignora */ }
    },
  });

  await logAdminAction({ adminId: ctx.from!.id, action: 'broadcast', detail: `filter=${filter} sent=${sent} fail=${fail}` });

  await ctx.telegram.editMessageText(
    chatId, msgId, undefined,
    [`✅ <b>Broadcast Concluído</b>`, ``, `✔️ Enviados: <b>${sent}</b>`, `❌ Falhas: <b>${fail}</b>`].join('\n'),
    { parse_mode: 'HTML' }
  );
}
