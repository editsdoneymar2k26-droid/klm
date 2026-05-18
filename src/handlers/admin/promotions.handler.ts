// -----------------------------------------
// HYPERCUT ADMIN -- Promotions Handler
// Exclusivo para OWNER
// -----------------------------------------

import { BotContext } from '../../types';
import { Markup } from 'telegraf';
import { promotionService, Promotion } from '../../services/promotion.service';
import { productService } from '../../services/product.service';
import { logAdminAction } from '../../middlewares/admin';
import { adminBackKeyboard } from '../../keyboards/admin';
import { formatCurrency } from '../../utils/format';
import { logger } from '../../utils/logger';

function pad(n: number): string { return String(n).padStart(2, '0'); }
function fmtDate(iso: string | null): string {
  if (!iso) return 'Sem validade';
  const d = new Date(iso);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// -----------------------------------------
// Menu de promoções
// -----------------------------------------
export async function adminPromosMenuHandler(ctx: BotContext): Promise<void> {
  const products = await productService.listActive();

  const buttons = products.map(p => [
    Markup.button.callback(p.name, `adm:promo:product:${p.id}`),
  ]);
  buttons.push([Markup.button.callback('🔙 Voltar', 'adm:main')]);

  await ctx.editMessageText(
    [`🔥 <b>Gerenciar Promoções</b>`, ``, `Selecione o plano para criar ou editar promoção:`].join('\n'),
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
  );
  await ctx.answerCbQuery();
}

// -----------------------------------------
// Detalhe de promo de um produto
// -----------------------------------------
export async function adminPromoProductHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const productId = cb.data?.replace('adm:promo:product:', '') ?? '';

  const [product, promo] = await Promise.all([
    productService.findById(productId),
    promotionService.findByProduct(productId),
  ]);

  if (!product) { await ctx.answerCbQuery('Produto não encontrado.', { show_alert: true }); return; }

  const buttons: any[] = [];

  if (promo) {
    const status = promo.is_active ? '🟢 Ativa' : '🔴 Inativa';
    const text = [
      `🔥 <b>${product.name}</b>`,
      ``,
      `💸 Preço promo: <b>${formatCurrency(promo.promo_price)}</b>`,
      `💰 Preço original: ${formatCurrency(promo.original_price)}`,
      `📊 Usos: ${promo.used_count}${promo.max_uses ? `/${promo.max_uses}` : ''}`,
      `📅 Validade: ${fmtDate(promo.expires_at)}`,
      `Status: <b>${status}</b>`,
    ].join('\n');

    buttons.push([
      Markup.button.callback(promo.is_active ? '🔴 Desativar' : '🟢 Ativar', `adm:promo:toggle:${promo.id}`),
      Markup.button.callback('🗑 Remover', `adm:promo:delete:confirm:${promo.id}`),
    ]);
    buttons.push([Markup.button.callback('📢 Mandar para Todos', `adm:promo:broadcast:${promo.id}`)]);
    buttons.push([Markup.button.callback('🔙 Voltar', 'adm:promos')]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  } else {
    buttons.push([Markup.button.callback('➕ Criar Promoção', `adm:promo:create:${productId}`)]);
    buttons.push([Markup.button.callback('🔙 Voltar', 'adm:promos')]);

    await ctx.editMessageText(
      [`🔥 <b>${product.name}</b>`, ``, `Nenhuma promoção ativa.`, `Preço atual: ${formatCurrency(product.price)}`].join('\n'),
      { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
    );
  }

  await ctx.answerCbQuery();
}

// -----------------------------------------
// Criar promoção — step 1: preço promo
// -----------------------------------------
export async function adminPromoCreateHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const productId = cb.data?.replace('adm:promo:create:', '') ?? '';

  ctx.session.step = `admin:promo:price:${productId}`;
  await ctx.editMessageText(
    `➕ <b>Criar Promoção</b>\n\nEnvie o <b>preço promocional</b> em R$ (ex: 9.90):`,
    { parse_mode: 'HTML', ...adminBackKeyboard }
  );
  await ctx.answerCbQuery();
}

// -----------------------------------------
// Recebe dados da promoção em steps
// -----------------------------------------
export async function adminPromoInputHandler(ctx: BotContext): Promise<void> {
  const step = ctx.session.step ?? '';
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';
  if (!text) return;

  // Step 1: preco promo
  if (step.startsWith('admin:promo:price:')) {
    const productId = step.replace('admin:promo:price:', '');
    const price = parseFloat(text.replace(',', '.'));
    if (isNaN(price) || price <= 0) { await ctx.reply('Valor inválido.'); return; }

    ctx.session.promoDraft = { productId, price };
    ctx.session.step = 'admin:promo:maxuses';
    await ctx.reply(
      `Quantidade máxima de usos? (número ou "sem limite"):`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Step 2: max uses
  if (step === 'admin:promo:maxuses') {
    const isUnlimited = text.toLowerCase().includes('sem') || text === '0';
    const maxUses = isUnlimited ? null : parseInt(text, 10);
    if (!isUnlimited && (isNaN(maxUses!) || maxUses! < 1)) { await ctx.reply('Valor inválido. Use um número ou "sem limite".'); return; }

    ctx.session.promoDraft = { ...ctx.session.promoDraft, maxUses };
    ctx.session.step = 'admin:promo:expires';
    await ctx.reply(`Validade? (ex: 24h, 7d, ou "sem validade"):`);
    return;
  }

  // Step 3: validade
  if (step === 'admin:promo:expires') {
    const draft = ctx.session.promoDraft ?? {};
    let expiresAt: string | undefined;

    const lower = text.toLowerCase();
    if (!lower.includes('sem')) {
      const match = lower.match(/^(\d+)(h|d)$/);
      if (match) {
        const val = parseInt(match[1], 10);
        const mult = match[2] === 'h' ? 3600_000 : 86400_000;
        expiresAt = new Date(Date.now() + val * mult).toISOString();
      }
    }

    ctx.session.step = undefined;

    // Busca preco original do produto
    const product = await productService.findById(draft.productId);
    if (!product) { await ctx.reply('Produto não encontrado.'); return; }

    const result = await promotionService.create({
      productId: draft.productId,
      promoPrice: draft.price,
      originalPrice: product.price,
      maxUses: draft.maxUses ?? undefined,
      expiresAt,
      createdBy: ctx.from!.id,
    });

    if (!result.success) { await ctx.reply(`❌ ${result.error}`); return; }

    await logAdminAction({
      adminId: ctx.from!.id,
      action: 'promo_create',
      detail: `produto=${product.name} | preco=${draft.price} | usos=${draft.maxUses ?? 'ilimitado'}`,
    });

    ctx.session.promoDraft = undefined;

    await ctx.reply(
      [`✅ <b>Promoção criada!</b>`, ``, `📦 ${product.name}`, `💸 ${formatCurrency(draft.price)}`, `📅 Validade: ${expiresAt ? fmtDate(expiresAt) : 'Sem validade'}`].join('\n'),
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📢 Mandar para Todos', `adm:promo:broadcast:${result.promo!.id}`)],
          [Markup.button.callback('🔙 Voltar', 'adm:promos')],
        ]),
      }
    );
  }
}

// -----------------------------------------
// Toggle ativo/inativo
// -----------------------------------------
export async function adminPromoToggleHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const promoId = cb.data?.replace('adm:promo:toggle:', '') ?? '';
  const promo = await promotionService.findById(promoId);
  if (!promo) { await ctx.answerCbQuery('Não encontrado.', { show_alert: true }); return; }

  await promotionService.setActive(promoId, !promo.is_active);
  await logAdminAction({ adminId: ctx.from!.id, action: promo.is_active ? 'promo_deactivate' : 'promo_activate', targetId: promoId });
  await ctx.answerCbQuery(promo.is_active ? '🔴 Desativada' : '🟢 Ativada');
  await adminPromoProductHandler(ctx);
}

// -----------------------------------------
// Confirmar + deletar
// -----------------------------------------
export async function adminPromoDeleteConfirmHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const promoId = cb.data?.replace('adm:promo:delete:confirm:', '') ?? '';
  await ctx.editMessageText(
    `⚠️ <b>Remover promoção?</b>\n\nEsta ação não pode ser desfeita.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirmar', `adm:promo:delete:do:${promoId}`)],
        [Markup.button.callback('❌ Cancelar', 'adm:promos')],
      ]),
    }
  );
  await ctx.answerCbQuery();
}

export async function adminPromoDeleteDoHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const promoId = cb.data?.replace('adm:promo:delete:do:', '') ?? '';
  await promotionService.delete(promoId);
  await logAdminAction({ adminId: ctx.from!.id, action: 'promo_delete', targetId: promoId });
  await ctx.answerCbQuery('🗑 Promoção removida.');
  await adminPromosMenuHandler(ctx);
}

// -----------------------------------------
// Broadcast de promoção para inscritos
// -----------------------------------------
export async function adminPromoBroadcastHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const promoId = cb.data?.replace('adm:promo:broadcast:', '') ?? '';

  const promo = await promotionService.findById(promoId);
  if (!promo) { await ctx.answerCbQuery('Não encontrado.', { show_alert: true }); return; }

  const product = await productService.findById(promo.product_id);
  if (!product) { await ctx.answerCbQuery('Produto não encontrado.', { show_alert: true }); return; }

  const subscribers = await promotionService.getPromoSubscribers();
  if (subscribers.length === 0) {
    await ctx.answerCbQuery('Nenhum usuário inscrito para notificações.', { show_alert: true });
    return;
  }

  await ctx.answerCbQuery(`Enviando para ${subscribers.length} usuários...`);

  const savePct = Math.round((1 - promo.promo_price / promo.original_price) * 100);
  const msg = [
    `🔥 <b>Nova Promoção!</b>`,
    ``,
    `📦 <b>${product.name}</b>`,
    `💸 De ${formatCurrency(promo.original_price)} por <b>${formatCurrency(promo.promo_price)}</b> (-${savePct}%)`,
    promo.expires_at ? `⏰ Válido até ${fmtDate(promo.expires_at)}` : '',
    ``,
    `Use /start → 🛒 Comprar → 🔥 Promoções para aproveitar!`,
  ].filter(Boolean).join('\n');

  let sent = 0, fail = 0;
  for (const id of subscribers) {
    try {
      await ctx.telegram.sendMessage(id, msg, { parse_mode: 'HTML' });
      sent++;
    } catch { fail++; }
    await new Promise(r => setTimeout(r, 50));
  }

  await logAdminAction({
    adminId: ctx.from!.id,
    action: 'promo_broadcast',
    detail: `promo=${promoId} | sent=${sent} | fail=${fail}`,
  });

  await ctx.reply(
    [`📢 <b>Broadcast de Promoção</b>`, ``, `✅ Enviado: ${sent}`, `❌ Falhas: ${fail}`].join('\n'),
    { parse_mode: 'HTML', ...adminBackKeyboard }
  );
}
