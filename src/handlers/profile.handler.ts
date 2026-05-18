// -----------------------------------------
// HYPERCUT STORE BOT -- Handler Perfil v2
// Layout premium e completo
// -----------------------------------------

import { BotContext } from '../types';
import { userService } from '../services/user.service';
import { getSupabaseClient } from '../database/client';
import { profileKeyboard } from '../keyboards/main';
import { MESSAGES } from '../config/constants';
import { formatCurrency, getLevelLabel } from '../utils/format';

function pad(n: number): string { return String(n).padStart(2, '0'); }
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const ROLE_LABELS: Record<string, string> = {
  user: '👤 Usuário', admin: '🛡️ Admin', owner: '👑 Owner',
};

export async function profileHandler(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from!.id;
  const db = getSupabaseClient();

  const user = await userService.findByTelegramId(telegramId);
  if (!user) {
    await ctx.reply(MESSAGES.NOT_FOUND);
    return;
  }

  // Busca contagens adicionais em paralelo
  const [{ count: orderCount }, { count: pixCount }] = await Promise.all([
    db.from('orders').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'delivered'),
    db.from('pending_payments').select('*', { count: 'exact', head: true }).eq('telegram_id', telegramId).eq('status', 'paid'),
  ]);

  // Atualiza last_seen_at
  db.from('users').update({ last_seen_at: new Date().toISOString() }).eq('telegram_id', telegramId).then(() => {});

  const levelLabel = getLevelLabel(user.level);
  const roleLabel = ROLE_LABELS[(user as any).role ?? 'user'] ?? ROLE_LABELS.user;
  const giftCount = (user as any).gift_count ?? 0;
  const topupCount = (user as any).topup_count ?? 0;
  const lastSeen = fmtDateTime((user as any).last_seen_at ?? null);

  const text = [
    `👤 <b>Perfil</b>`,
    `━━━━━━━━━━━━━━━━`,
    `📛 ${user.first_name}${user.username ? `  @${user.username}` : ''}`,
    `🆔 <code>${user.telegram_id}</code>`,
    `🎭 ${roleLabel}`,
    ``,
    `💰 Saldo: <b>${formatCurrency(user.balance)}</b>`,
    `🏅 Nível: <b>${levelLabel}</b>`,
    ``,
    `📦 Compras: <b>${orderCount ?? 0}</b>`,
    `🎁 Gifts: <b>${giftCount}</b>`,
    `💳 Recargas: <b>${topupCount}</b>`,
    `📊 Total gasto: <b>${formatCurrency(user.total_spent)}</b>`,
    ``,
    `📅 Cadastro: <b>${fmtDate(user.created_at)}</b>`,
    `🕐 Último acesso: <b>${lastSeen}</b>`,
    `━━━━━━━━━━━━━━━━`,
  ].join('\n');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...profileKeyboard });
    await ctx.answerCbQuery();
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', ...profileKeyboard });
  }
}
