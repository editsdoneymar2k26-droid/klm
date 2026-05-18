// -----------------------------------------
// HYPERCUT ADMIN -- Users Handler
// Com confirmacoes criticas e restricoes por cargo
// -----------------------------------------

import { BotContext } from '../../types';
import { Markup } from 'telegraf';
import { userAdminService } from '../../services/admin/user.admin.service';
import { getUserRole, hasPermission, isOwner, invalidateRoleCache, setUserRole } from '../../helpers/permissions';
import { logAdminAction } from '../../middlewares/admin';
import { adminBackKeyboard, adminUsersKeyboard, adminUserActionsKeyboard, adminUserLevelKeyboard } from '../../keyboards/admin';

function pad(n: number): string { return String(n).padStart(2, '0'); }
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
function brl(v: number): string { return 'R$ ' + v.toFixed(2).replace('.', ','); }

const LEVEL_LABELS: Record<string, string> = {
  bronze: '🥉 Bronze', silver: '🥈 Prata', gold: '🥇 Ouro', vip: '💎 VIP',
};
const ROLE_LABELS: Record<string, string> = {
  user: '👤 Usuario', admin: '🛡️ Admin', owner: '👑 Owner',
};

export async function adminUsersMenuHandler(ctx: BotContext): Promise<void> {
  await ctx.editMessageText(`👤 <b>Usuarios</b>\n\nBusque um usuario.`, { parse_mode: 'HTML', ...adminUsersKeyboard });
  await ctx.answerCbQuery();
}

export async function adminUsersSearchPromptHandler(ctx: BotContext): Promise<void> {
  ctx.session.step = 'admin:users:search';
  await ctx.editMessageText(`🔎 Envie o @username ou Telegram ID:`, { parse_mode: 'HTML', ...adminBackKeyboard });
  await ctx.answerCbQuery();
}

export async function adminUsersSearchHandler(ctx: BotContext): Promise<void> {
  if (ctx.session.step !== 'admin:users:search') return;
  const query = ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';
  if (!query) return;
  ctx.session.step = undefined;

  const users = await userAdminService.search(query);
  if (users.length === 0) { await ctx.reply('Nenhum usuario encontrado.'); return; }
  if (users.length === 1) { await showUserProfile(ctx, users[0].telegram_id); return; }

  const buttons = users.map(u => [
    Markup.button.callback(
      `${u.first_name}${u.username ? ` @${u.username}` : ''} (${u.telegram_id})`,
      `adm:users:view:${u.telegram_id}`
    ),
  ]);
  await ctx.reply(`${users.length} usuarios encontrados:`, Markup.inlineKeyboard(buttons));
}

export async function showUserProfile(ctx: BotContext, telegramId: number): Promise<void> {
  const user = await userAdminService.findByTelegramId(telegramId);
  if (!user) {
    const t = 'Usuario nao encontrado.';
    if (ctx.callbackQuery) await ctx.editMessageText(t);
    else await ctx.reply(t);
    return;
  }

  const orderCount = await userAdminService.getOrderCount(user.id);
  const targetRole = await getUserRole(telegramId);

  const text = [
    `👤 <b>Ficha do Usuario</b>`,
    `━━━━━━━━━━━━━━━━`,
    `📛 Nome: <b>${user.first_name}</b>`,
    `🔗 Username: ${user.username ? `@${user.username}` : '—'}`,
    `🆔 ID: <code>${user.telegram_id}</code>`,
    ``,
    `💰 Saldo: <b>${brl(user.balance)}</b>`,
    `📊 Total gasto: <b>${brl(user.total_spent)}</b>`,
    `📦 Compras: <b>${orderCount}</b>`,
    `🏅 Nivel: <b>${LEVEL_LABELS[user.level] ?? user.level}</b>`,
    `🎭 Cargo: <b>${ROLE_LABELS[targetRole] ?? targetRole}</b>`,
    ``,
    `🚫 Banido: <b>${user.is_banned ? 'Sim' : 'Nao'}</b>`,
    `📅 Registro: <b>${fmtDate(user.created_at)}</b>`,
    `━━━━━━━━━━━━━━━━`,
  ].join('\n');

  // Determina quais acoes o admin atual pode fazer
  const adminRole = await getUserRole(ctx.from!.id);
  const canManageAdmins = hasPermission(adminRole, 'manage_admins');
  const canAddBalance = hasPermission(adminRole, 'add_balance');
  const targetIsOwner = isOwner(telegramId);

  const buttons: any[] = [];

  // Ban: nao pode banir owners
  if (!targetIsOwner) {
    buttons.push([
      Markup.button.callback(
        user.is_banned ? '✅ Desbanir' : '🚫 Banir',
        user.is_banned ? `adm:users:unban:${telegramId}` : `adm:users:ban:confirm:${telegramId}`
      ),
      Markup.button.callback('👑 Nivel', `adm:users:level:${telegramId}`),
    ]);
  }

  if (canAddBalance) {
    buttons.push([
      Markup.button.callback('💰 Add Saldo', `adm:users:addbal:${telegramId}`),
      Markup.button.callback('💸 Rem Saldo', `adm:users:rembal:${telegramId}`),
    ]);
  }

  buttons.push([Markup.button.callback('📦 Pedidos', `adm:users:orders:${telegramId}`)]);

  if (canManageAdmins && !targetIsOwner) {
    buttons.push([
      Markup.button.callback(
        targetRole === 'admin' ? '🔽 Rebaixar Admin' : '🛡️ Promover Admin',
        targetRole === 'admin' ? `adm:users:demote:confirm:${telegramId}` : `adm:users:promote:confirm:${telegramId}`
      ),
    ]);
  }

  buttons.push([Markup.button.callback('⬅️ Voltar', 'adm:users')]);

  const keyboard = Markup.inlineKeyboard(buttons);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    await ctx.answerCbQuery();
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  }
}

export async function adminUserViewHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const telegramId = parseInt(cb.data?.replace('adm:users:view:', '') ?? '0', 10);
  await showUserProfile(ctx, telegramId);
}

// Confirmacao de ban
export async function adminUserBanConfirmHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const telegramId = parseInt(cb.data?.replace('adm:users:ban:confirm:', '') ?? '0', 10);

  await ctx.editMessageText(
    `⚠️ <b>Confirmar Banimento</b>\n\nBanir usuario <code>${telegramId}</code>?`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirmar Banimento', `adm:users:ban:do:${telegramId}`)],
        [Markup.button.callback('❌ Cancelar', `adm:users:view:${telegramId}`)],
      ]),
    }
  );
  await ctx.answerCbQuery();
}

export async function adminUserBanDoHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const telegramId = parseInt(cb.data?.replace('adm:users:ban:do:', '') ?? '0', 10);

  if (isOwner(telegramId)) {
    await ctx.answerCbQuery('Nao e possivel banir um owner.', { show_alert: true }); return;
  }

  await userAdminService.ban(telegramId, `Banido pelo admin ${ctx.from!.id}`);
  await logAdminAction({ adminId: ctx.from!.id, action: 'ban', targetId: String(telegramId) });
  await ctx.answerCbQuery('🚫 Banido.');
  await showUserProfile(ctx, telegramId);
}

export async function adminUserUnbanHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const telegramId = parseInt(cb.data?.replace('adm:users:unban:', '') ?? '0', 10);
  await userAdminService.unban(telegramId);
  await logAdminAction({ adminId: ctx.from!.id, action: 'unban', targetId: String(telegramId) });
  await ctx.answerCbQuery('✅ Desbanido.');
  await showUserProfile(ctx, telegramId);
}

export async function adminUserLevelMenuHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const telegramId = parseInt(cb.data?.replace('adm:users:level:', '') ?? '0', 10);
  await ctx.editMessageText(
    `👑 Novo nivel para <code>${telegramId}</code>:`,
    { parse_mode: 'HTML', ...adminUserLevelKeyboard(telegramId) }
  );
  await ctx.answerCbQuery();
}

export async function adminUserSetLevelHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const parts = cb.data?.split(':') ?? [];
  const telegramId = parseInt(parts[4] ?? '0', 10);
  const level = parts[5] ?? 'bronze';
  await userAdminService.setLevel(telegramId, level);
  await logAdminAction({ adminId: ctx.from!.id, action: 'set_level', targetId: String(telegramId), detail: level });
  await ctx.answerCbQuery(`✅ Nivel: ${LEVEL_LABELS[level] ?? level}`);
  await showUserProfile(ctx, telegramId);
}

export async function adminUserAddBalPromptHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const telegramId = parseInt(cb.data?.replace('adm:users:addbal:', '') ?? '0', 10);
  ctx.session.step = `admin:addbal:${telegramId}`;
  await ctx.editMessageText(`💰 Valor a ADICIONAR em R$ (ex: 10.00):`, { parse_mode: 'HTML', ...adminBackKeyboard });
  await ctx.answerCbQuery();
}

export async function adminUserRemBalPromptHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const telegramId = parseInt(cb.data?.replace('adm:users:rembal:', '') ?? '0', 10);
  ctx.session.step = `admin:rembal:${telegramId}`;
  await ctx.editMessageText(`💸 Valor a REMOVER em R$ (ex: 5.00):`, { parse_mode: 'HTML', ...adminBackKeyboard });
  await ctx.answerCbQuery();
}

export async function adminUserBalanceHandler(ctx: BotContext): Promise<void> {
  const step = ctx.session.step ?? '';
  const isAdd = step.startsWith('admin:addbal:');
  const isRem = step.startsWith('admin:rembal:');
  if (!isAdd && !isRem) return;

  const telegramId = parseInt(step.split(':')[2] ?? '0', 10);
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';
  const value = parseFloat(text.replace(',', '.'));
  if (isNaN(value) || value <= 0) { await ctx.reply('Valor invalido.'); return; }

  ctx.session.step = undefined;
  const cents = Math.round(value * 100) * (isRem ? -1 : 1);
  const result = await userAdminService.adjustBalance(telegramId, cents);
  if (!result.success) { await ctx.reply(`❌ ${result.error}`); return; }

  await logAdminAction({
    adminId: ctx.from!.id,
    action: isAdd ? 'add_balance' : 'remove_balance',
    targetId: String(telegramId),
    detail: `${isAdd ? '+' : '-'}R$ ${value.toFixed(2)} | saldo: R$ ${result.newBalance!.toFixed(2)}`,
  });

  await ctx.reply(
    `✅ Saldo ${isAdd ? 'adicionado' : 'removido'}.\nNovo saldo: <b>R$ ${result.newBalance!.toFixed(2).replace('.', ',')}</b>`,
    { parse_mode: 'HTML' }
  );
  await showUserProfile(ctx, telegramId);
}

export async function adminUserOrdersHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const telegramId = parseInt(cb.data?.replace('adm:users:orders:', '') ?? '0', 10);
  const user = await userAdminService.findByTelegramId(telegramId);
  if (!user) { await ctx.answerCbQuery('Nao encontrado.', { show_alert: true }); return; }

  const orders = await userAdminService.getRecentOrders(user.id);
  if (orders.length === 0) {
    await ctx.editMessageText('Nenhum pedido.', { parse_mode: 'HTML', ...adminBackKeyboard });
    await ctx.answerCbQuery(); return;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (iso: string) => { const d = new Date(iso); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}`; };
  const lines = orders.map((o: any, i) => `${i+1}. ${o.products?.name ?? '?'} — R$${o.amount} — ${fmt(o.created_at)}`);

  await ctx.editMessageText(
    [`📦 <b>Pedidos de ${user.first_name}</b>`, ``, ...lines].join('\n'),
    { parse_mode: 'HTML', ...adminBackKeyboard }
  );
  await ctx.answerCbQuery();
}

// Confirmacao para promover admin
export async function adminUserPromoteConfirmHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const telegramId = parseInt(cb.data?.replace('adm:users:promote:confirm:', '') ?? '0', 10);
  await ctx.editMessageText(
    `⚠️ <b>Promover a Admin</b>\n\nUser <code>${telegramId}</code> tera acesso ao painel. Confirmar?`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirmar', `adm:users:promote:do:${telegramId}`)],
        [Markup.button.callback('❌ Cancelar', `adm:users:view:${telegramId}`)],
      ]),
    }
  );
  await ctx.answerCbQuery();
}

export async function adminUserPromoteDoHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const telegramId = parseInt(cb.data?.replace('adm:users:promote:do:', '') ?? '0', 10);
  const result = await setUserRole(ctx.from!.id, telegramId, 'admin');
  if (!result.success) { await ctx.answerCbQuery(result.error!, { show_alert: true }); return; }
  await logAdminAction({ adminId: ctx.from!.id, action: 'promote_admin', targetId: String(telegramId) });
  invalidateRoleCache(telegramId);
  await ctx.answerCbQuery('🛡️ Admin promovido.');
  await showUserProfile(ctx, telegramId);
}

export async function adminUserDemoteConfirmHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const telegramId = parseInt(cb.data?.replace('adm:users:demote:confirm:', '') ?? '0', 10);
  await ctx.editMessageText(
    `⚠️ <b>Rebaixar Admin</b>\n\nRemover cargo admin de <code>${telegramId}</code>?`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirmar', `adm:users:demote:do:${telegramId}`)],
        [Markup.button.callback('❌ Cancelar', `adm:users:view:${telegramId}`)],
      ]),
    }
  );
  await ctx.answerCbQuery();
}

export async function adminUserDemoteDoHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const telegramId = parseInt(cb.data?.replace('adm:users:demote:do:', '') ?? '0', 10);
  const result = await setUserRole(ctx.from!.id, telegramId, 'user');
  if (!result.success) { await ctx.answerCbQuery(result.error!, { show_alert: true }); return; }
  await logAdminAction({ adminId: ctx.from!.id, action: 'demote_admin', targetId: String(telegramId) });
  invalidateRoleCache(telegramId);
  await ctx.answerCbQuery('🔽 Admin rebaixado.');
  await showUserProfile(ctx, telegramId);
}
