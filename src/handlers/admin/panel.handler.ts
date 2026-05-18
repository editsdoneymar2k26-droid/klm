// -----------------------------------------
// HYPERCUT ADMIN -- Painel Principal
// Menu dinamico baseado no cargo
// -----------------------------------------

import { BotContext } from '../../types';
import { Markup } from 'telegraf';
import { getSupabaseClient } from '../../database/client';
import { stockAdminService } from '../../services/admin/stock.admin.service';
import { getUserRole, hasPermission, canAccessAdminPanel } from '../../helpers/permissions';
import { getMaintenanceState, invalidateMaintenanceCache, logAdminAction } from '../../middlewares/admin';
import { adminBackKeyboard } from '../../keyboards/admin';
import { logger } from '../../utils/logger';

// -----------------------------------------
// Constroi teclado do painel baseado no cargo
// -----------------------------------------
async function buildAdminKeyboard(telegramId: number) {
  const role = await getUserRole(telegramId);
  const buttons = [];

  if (hasPermission(role, 'manage_stock') || hasPermission(role, 'manage_gifts')) {
    const row = [];
    if (hasPermission(role, 'manage_stock')) row.push(Markup.button.callback('📦 Estoque', 'adm:stock'));
    if (hasPermission(role, 'manage_gifts')) row.push(Markup.button.callback('🎁 Gifts', 'adm:gifts'));
    if (row.length) buttons.push(row);
  }

  if (hasPermission(role, 'manage_users') || hasPermission(role, 'add_balance')) {
    const row = [];
    if (hasPermission(role, 'manage_users')) row.push(Markup.button.callback('👤 Usuarios', 'adm:users'));
    if (hasPermission(role, 'add_balance')) row.push(Markup.button.callback('💰 Saldo', 'adm:balance'));
    if (row.length) buttons.push(row);
  }

  if (hasPermission(role, 'manage_broadcast') || hasPermission(role, 'manage_logs')) {
    const row = [];
    if (hasPermission(role, 'manage_broadcast')) row.push(Markup.button.callback('📢 Broadcast', 'adm:broadcast'));
    if (hasPermission(role, 'manage_logs')) row.push(Markup.button.callback('📄 Logs', 'adm:logs'));
    if (row.length) buttons.push(row);
  }

  if (role === 'owner') {
    buttons.push([
      Markup.button.callback('🔥 Promoções', 'adm:promos'),
      Markup.button.callback('🚨 Manutencao', 'adm:maintenance'),
      Markup.button.callback('⚙️ Config', 'adm:config'),
    ]);
  }

  buttons.push([Markup.button.callback('🔙 Voltar ao Menu', 'menu:main')]);

  return Markup.inlineKeyboard(buttons);
}

export async function adminPanelHandler(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from!.id;
  const role = await getUserRole(telegramId);

  if (!canAccessAdminPanel(role)) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Sem permissão!', { show_alert: true });
    return;
  }

  const db = getSupabaseClient();
  const [{ count: totalUsers }, { count: totalOrders }, maintenance] = await Promise.all([
    db.from('users').select('*', { count: 'exact', head: true }),
    db.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'delivered'),
    getMaintenanceState(),
  ]);

  const roleLabel = role === 'owner' ? '👑 Owner' : '🛡️ Admin';

  const text = [
    `👑 <b>PAINEL HYPERCUT</b>`,
    ``,
    `${roleLabel}: <b>${ctx.from!.first_name}</b>`,
    `👤 Usuarios: <b>${totalUsers ?? 0}</b>`,
    `✅ Vendas: <b>${totalOrders ?? 0}</b>`,
    role === 'owner' ? `🚨 Manutencao: <b>${maintenance.active ? 'ATIVA' : 'Inativa'}</b>` : '',
    ``,
    `Selecione uma opcao:`,
  ].filter(Boolean).join('\n');

  const keyboard = await buildAdminKeyboard(telegramId);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    await ctx.answerCbQuery();
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  }
}

// Estoque
export async function adminStockMenuHandler(ctx: BotContext): Promise<void> {
  const summary = await stockAdminService.getSummary();
  const lines = summary.map(s =>
    `📦 <b>${s.productName}</b>\n   ✅ ${s.available}  ⏳ ${s.reserved}  💰 ${s.sold}`
  );

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('➕ Adicionar Contas', 'adm:stock:add')],
    [Markup.button.callback('📊 Ver Estoque', 'adm:stock:view')],
    [Markup.button.callback('🧹 Limpar Reservas', 'adm:stock:clear:confirm')],
    [Markup.button.callback('📦 Contas Reservadas', 'adm:stock:reserved')],
    [Markup.button.callback('🔙 Voltar', 'adm:main')],
  ]);

  await ctx.editMessageText(
    [`📦 <b>Gestao de Estoque</b>`, ``, ...lines].join('\n'),
    { parse_mode: 'HTML', ...keyboard }
  );
  await ctx.answerCbQuery();
}

export async function adminStockAddHandler(ctx: BotContext): Promise<void> {
  const { adminStockPlanKeyboard } = await import('../../keyboards/admin');
  await ctx.editMessageText(`➕ <b>Adicionar Contas</b>\n\nEscolha o plano:`,
    { parse_mode: 'HTML', ...adminStockPlanKeyboard });
  await ctx.answerCbQuery();
}

export async function adminStockPlanHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const plan = cb.data?.replace('adm:stock:plan:', '') ?? '';
  const planNames: Record<string, string> = { '7d': '7 Dias', '30d': '1 Mes', '3m': '3 Meses', '1y': '1 Ano' };

  ctx.session.step = `admin:stock:adding:${plan}`;

  await ctx.editMessageText(
    [`➕ <b>Adicionar Contas — ${planNames[plan] ?? plan}</b>`, ``, `Envie as contas, uma por linha:`, ``, `<code>email@exemplo.com:senha123\nemail2@exemplo.com:senha456</code>`].join('\n'),
    { parse_mode: 'HTML', ...adminBackKeyboard }
  );
  await ctx.answerCbQuery();
}

// Confirmacao antes de limpar reservas
export async function adminStockClearConfirmHandler(ctx: BotContext): Promise<void> {
  await ctx.editMessageText(
    `⚠️ <b>Tem certeza?</b>\n\nIsso ira liberar TODAS as reservas expiradas de estoque.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirmar', 'adm:stock:clear:do')],
        [Markup.button.callback('❌ Cancelar', 'adm:stock')],
      ]),
    }
  );
  await ctx.answerCbQuery();
}

export async function adminStockClearHandler(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery('Limpando...');
  const count = await stockAdminService.clearExpiredReservations();
  await logAdminAction({ adminId: ctx.from!.id, action: 'stock_clear_reservations', detail: `${count} liberadas` });
  await ctx.editMessageText(`🧹 <b>${count} reserva(s) liberada(s).</b>`, { parse_mode: 'HTML', ...adminBackKeyboard });
}

export async function adminStockReservedHandler(ctx: BotContext): Promise<void> {
  const items = await stockAdminService.getReservedAccounts();
  if (items.length === 0) {
    await ctx.editMessageText('Nenhuma conta reservada.', { parse_mode: 'HTML', ...adminBackKeyboard });
    await ctx.answerCbQuery(); return;
  }
  const lines = items.slice(0, 10).map((item, i) => {
    const exp = item.reservation_expires_at
      ? new Date(item.reservation_expires_at).toLocaleTimeString('pt-BR') : '—';
    return `${i + 1}. <code>${item.reserved_by}</code> | exp: ${exp}`;
  });
  await ctx.editMessageText([`📦 <b>Reservadas (${items.length})</b>`, ``, ...lines].join('\n'),
    { parse_mode: 'HTML', ...adminBackKeyboard });
  await ctx.answerCbQuery();
}

export async function adminStockReceiveAccountsHandler(ctx: BotContext): Promise<void> {
  const step = ctx.session.step ?? '';
  if (!step.startsWith('admin:stock:adding:')) return;
  const { ProductKey } = await import('../../services/admin/stock.admin.service');
  const plan = step.replace('admin:stock:adding:', '') as any;
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  if (!text) return;
  ctx.session.step = undefined;

  const { stockAdminService } = await import('../../services/admin/stock.admin.service');
  const result = await stockAdminService.addAccounts(plan, text);
  await logAdminAction({ adminId: ctx.from!.id, action: 'stock_add', detail: `plano=${plan} inseridas=${result.inserted}` });
  await ctx.reply(
    [`✅ <b>Contas adicionadas</b>`, ``, `✔️ Inseridas: <b>${result.inserted}</b>`, `⏭ Ignoradas: <b>${result.skipped}</b>`, `❌ Erros: <b>${result.errors}</b>`].join('\n'),
    { parse_mode: 'HTML', ...adminBackKeyboard }
  );
}

// Logs
export async function adminLogsHandler(ctx: BotContext): Promise<void> {
  const db = getSupabaseClient();
  const [orders, pixLogs, adminLogs] = await Promise.all([
    db.from('orders').select('id, amount, created_at, users!inner(username, telegram_id)').eq('status', 'delivered').order('created_at', { ascending: false }).limit(5),
    db.from('payment_logs').select('*').eq('event', 'pix_paid').order('created_at', { ascending: false }).limit(5),
    db.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(5),
  ]);

  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (iso: string) => { const d = new Date(iso); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}`; };

  const orderLines = (orders.data ?? []).map((o: any) => `• ${o.users?.username ?? o.users?.telegram_id} — R$${o.amount} — ${fmt(o.created_at)}`);
  const pixLines = (pixLogs.data ?? []).map((p: any) => `• ID ${p.telegram_id} — R$${((p.amount_cents??0)/100).toFixed(2)} — ${fmt(p.created_at)}`);
  const adminLines = (adminLogs.data ?? []).map((a: any) => `• Admin ${a.admin_id}: ${a.action}${a.detail ? ` (${a.detail.slice(0,40)})` : ''}`);

  await ctx.editMessageText(
    [`📄 <b>Logs Recentes</b>`, ``, `<b>Vendas:</b>`, orderLines.join('\n') || 'Nenhuma', ``, `<b>PIX Pagos:</b>`, pixLines.join('\n') || 'Nenhum', ``, `<b>Admin:</b>`, adminLines.join('\n') || 'Nenhuma'].join('\n'),
    { parse_mode: 'HTML', ...adminBackKeyboard }
  );
  await ctx.answerCbQuery();
}

// Manutencao
export async function adminMaintenanceHandler(ctx: BotContext): Promise<void> {
  const { adminMaintenanceKeyboard } = await import('../../keyboards/admin');
  const state = await getMaintenanceState();
  await ctx.editMessageText(
    [`🚨 <b>Modo Manutencao</b>`, ``, `Status: <b>${state.active ? '🔴 ATIVO' : '🟢 Inativo'}</b>`, ``, `Mensagem:`, `<i>${state.message}</i>`].join('\n'),
    { parse_mode: 'HTML', ...adminMaintenanceKeyboard(state.active) }
  );
  await ctx.answerCbQuery();
}

export async function adminMaintenanceToggleHandler(ctx: BotContext): Promise<void> {
  const db = getSupabaseClient();
  const state = await getMaintenanceState();
  const newActive = !state.active;
  await db.from('maintenance_mode').update({ is_active: newActive, activated_by: ctx.from!.id, activated_at: new Date().toISOString() }).eq('id', 1);
  invalidateMaintenanceCache();
  await logAdminAction({ adminId: ctx.from!.id, action: newActive ? 'maintenance_on' : 'maintenance_off' });
  await ctx.answerCbQuery(newActive ? '🔴 ATIVADA' : '🟢 Desativada');
  await adminMaintenanceHandler(ctx);
}

export async function adminMaintenanceEditMsgHandler(ctx: BotContext): Promise<void> {
  ctx.session.step = 'admin:maint:editmsg';
  await ctx.editMessageText('✏️ Envie a nova mensagem de manutencao:', { parse_mode: 'HTML', ...adminBackKeyboard });
  await ctx.answerCbQuery();
}

export async function adminMaintenanceReceiveMsgHandler(ctx: BotContext): Promise<void> {
  if (ctx.session.step !== 'admin:maint:editmsg') return;
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  if (!text) return;
  ctx.session.step = undefined;
  const db = getSupabaseClient();
  await db.from('maintenance_mode').update({ message: text }).eq('id', 1);
  invalidateMaintenanceCache();
  await ctx.reply('✅ Mensagem atualizada.', { parse_mode: 'HTML', ...adminBackKeyboard });
}

export async function adminConfigHandler(ctx: BotContext): Promise<void> {
  await ctx.editMessageText('⚙️ <b>Configuracoes</b>\n\nEm breve.', { parse_mode: 'HTML', ...adminBackKeyboard });
  await ctx.answerCbQuery();
}
