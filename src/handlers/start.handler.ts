// -----------------------------------------
// HYPERCUT STORE BOT -- Handler /start
// -----------------------------------------

import { BotContext } from '../types';
import { userService } from '../services/user.service';
import { mainMenuKeyboard, mainMenuStaffKeyboard } from '../keyboards/main';
import { MESSAGES } from '../config/constants';
import { getUserRole, canAccessAdminPanel } from '../helpers/permissions';
import { logger, sendLog } from '../utils/logger';

export async function startHandler(ctx: BotContext): Promise<void> {
  const tgUser = ctx.from!;

  // Registra dono da sessao
  ctx.session.ownerId = tgUser.id;

  const existing = await userService.findByTelegramId(tgUser.id);

  const result = await userService.upsert({
    telegram_id: tgUser.id,
    username: tgUser.username ?? null,
    first_name: tgUser.first_name,
  });

  if (!result.success) {
    logger.error('[StartHandler] Falha ao registrar usuario:', result.error);
    await ctx.reply(MESSAGES.ERROR_GENERIC);
    return;
  }

  // Determina teclado baseado no cargo
  const role = await getUserRole(tgUser.id);
  const keyboard = canAccessAdminPanel(role) ? mainMenuStaffKeyboard : mainMenuKeyboard;

  // Log rico
  sendLog({
    type: 'new_user',
    telegramId: tgUser.id,
    username: tgUser.username ?? null,
    firstName: tgUser.first_name,
    isNew: !existing,
  });

  await ctx.reply(MESSAGES.WELCOME(tgUser.first_name), {
    parse_mode: 'HTML',
    ...keyboard,
    reply_parameters: { message_id: ctx.message!.message_id },
  } as any);
}
