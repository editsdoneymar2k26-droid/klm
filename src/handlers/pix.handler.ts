// ─────────────────────────────────────────
// HYPERCUT STORE BOT — Handler /pix (base)
// ─────────────────────────────────────────

import { BotContext } from '../types';
import { backToMenuKeyboard } from '../keyboards/main';
import { MESSAGES } from '../config/constants';

export async function pixCommandHandler(ctx: BotContext): Promise<void> {
  await ctx.reply(MESSAGES.PIX_NOT_IMPLEMENTED, {
    parse_mode: 'HTML',
    ...backToMenuKeyboard,
  });
}
