// -----------------------------------------
// HYPERCUT STORE BOT -- Helpers de Contexto
// Edicao segura, reply vinculado, isolamento de grupo
// -----------------------------------------

import { BotContext } from '../types';
import { ExtraEditMessageText } from 'telegraf/typings/telegram-types';

// -----------------------------------------
// Edita mensagem com fallback para reply
// Evita erro quando a mensagem nao pode ser editada
// -----------------------------------------
export async function safeEdit(
  ctx: BotContext,
  text: string,
  extra?: ExtraEditMessageText
): Promise<void> {
  try {
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...extra });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', ...extra } as any);
    }
  } catch (err: any) {
    // Mensagem identica — ignora o erro "message is not modified"
    if (err?.description?.includes('message is not modified')) return;
    // Qualquer outro erro: tenta reply como fallback
    try {
      await ctx.reply(text, { parse_mode: 'HTML', ...extra } as any);
    } catch { /* ignora */ }
  }
}

// -----------------------------------------
// Reply vinculado a mensagem do usuario
// Ideal para /start e /menu em grupos
// -----------------------------------------
export async function replyLinked(
  ctx: BotContext,
  text: string,
  extra?: Record<string, unknown>
): Promise<void> {
  const messageId = ctx.message?.message_id;
  await ctx.reply(text, {
    parse_mode: 'HTML',
    ...(messageId ? { reply_parameters: { message_id: messageId } } : {}),
    ...extra,
  } as any);
}

// -----------------------------------------
// Verifica se o callback pertence ao dono da mensagem
// Protecao contra uso de menus alheios em grupos
// -----------------------------------------
export function isCallbackOwner(ctx: BotContext): boolean {
  if (!ctx.callbackQuery) return true;

  const callbackUserId = ctx.callbackQuery.from.id;
  const messageFromId = (ctx.callbackQuery.message as any)?.reply_to_message?.from?.id
    ?? (ctx.callbackQuery.message as any)?.from?.id;

  // Em chat privado nao ha ambiguidade — permite sempre
  if (ctx.chat?.type === 'private') return true;

  // Em grupos: valida que o clicador e o dono da sessao
  const sessionOwnerId = ctx.session?.ownerId;
  if (sessionOwnerId && callbackUserId !== sessionOwnerId) return false;

  return true;
}

// -----------------------------------------
// Responde negando acesso ao menu de outro usuario
// -----------------------------------------
export async function denyCallbackAccess(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery('❌ Voce nao pode usar o menu de outra pessoa.', { show_alert: true });
}
