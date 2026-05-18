// -----------------------------------------
// HYPERCUT STORE BOT -- Handler Menu Principal
// -----------------------------------------

import { BotContext } from '../types';
import { mainMenuKeyboard, mainMenuStaffKeyboard, forceJoinKeyboard, backToMenuKeyboard } from '../keyboards/main';
import { MESSAGES } from '../config/constants';
import { env } from '../config/env';
import { getUserRole, canAccessAdminPanel } from '../helpers/permissions';
import { replyLinked } from '../helpers/context';

export { topupHandler } from './topup.handler';

export async function showMainMenu(ctx: BotContext): Promise<void> {
  const firstName = ctx.from?.first_name ?? 'visitante';
  const telegramId = ctx.from?.id ?? 0;

  // Registra dono da sessao
  if (!ctx.session.ownerId) ctx.session.ownerId = telegramId;

  const role = await getUserRole(telegramId);
  const keyboard = canAccessAdminPanel(role) ? mainMenuStaffKeyboard : mainMenuKeyboard;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(MESSAGES.WELCOME(firstName), {
      parse_mode: 'HTML',
      ...keyboard,
    });
    await ctx.answerCbQuery();
  } else {
    await replyLinked(ctx, MESSAGES.WELCOME(firstName), keyboard);
  }
}

export async function rulesHandler(ctx: BotContext): Promise<void> {
  const text = [
    `📋 <b>Regras da Loja</b>`,
    ``,
    `• Todos os produtos sao digitais e entregues automaticamente.`,
    `• Pagamentos via PIX tem validade de 20 minutos.`,
    `• Apos o pagamento, a entrega e imediata.`,
    `• Nao realizamos reembolsos em produtos ja entregues.`,
    `• Em caso de problemas, contate o suporte.`,
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'HTML', ...backToMenuKeyboard });
  await ctx.answerCbQuery();
}

export async function supportHandler(ctx: BotContext): Promise<void> {
  await ctx.editMessageText(
    `🆘 <b>Suporte</b>\n\nEntre em contato com nossa equipe:\n\n👉 @hypercutsupporte`,
    { parse_mode: 'HTML', ...backToMenuKeyboard }
  );
  await ctx.answerCbQuery();
}

export async function forceJoinCheckHandler(ctx: BotContext): Promise<void> {
  const userId = ctx.from!.id;
  try {
    const member = await ctx.telegram.getChatMember(env.CHANNEL_ID, userId);
    const allowed = ['member', 'administrator', 'creator'];

    if (allowed.includes(member.status)) {
      await ctx.answerCbQuery('Acesso liberado!', { show_alert: false });
      await showMainMenu(ctx);
    } else {
      await ctx.answerCbQuery('Voce ainda nao entrou no canal.', { show_alert: true });
    }
  } catch {
    await ctx.answerCbQuery('Nao foi possivel verificar. Tente novamente.', { show_alert: true });
  }
}
