// -----------------------------------------
// HYPERCUT STORE BOT -- Shop Handler v2
// Fluxo: Categoria → Planos → Páginas → Compra
// -----------------------------------------

import { BotContext } from '../types';
import { productService } from '../services/product.service';
import { purchaseService } from '../services/purchase.service';
import { promotionService } from '../services/promotion.service';
import { userService } from '../services/user.service';
import { getSupabaseClient } from '../database/client';
import {
  shopCategoryKeyboard,
  buildProductListKeyboard,
  buildPlanPageKeyboard,
  buildPromoListKeyboard,
  buildPromoDetailKeyboard,
  shopBackKeyboard,
} from '../keyboards/shop';
import { backToMenuKeyboard } from '../keyboards/main';
import { formatCurrency } from '../utils/format';
import { logger, sendLog } from '../utils/logger';

// -----------------------------------------
// Helper: formata tempo restante
// -----------------------------------------
function formatTimeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'encerrada';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(r => setTimeout(r, ms));
}

// -----------------------------------------
// Busca itens disponíveis de um produto com paginacao
// -----------------------------------------
async function getStockPage(productId: string, page: number): Promise<{
  item: { id: string; credentials: string; current_users: number; max_users: number } | null;
  total: number;
}> {
  const db = getSupabaseClient();
  const { data, count } = await db
    .from('stock_items')
    .select('id, credentials, current_users, max_users', { count: 'exact' })
    .eq('product_id', productId)
    .eq('status', 'available')
    .order('created_at', { ascending: true })
    .range(page - 1, page - 1);

  return {
    item: ((data ?? [])[0] as any) ?? null,
    total: count ?? 0,
  };
}

// -----------------------------------------
// 1. Botão "🛒 Comprar" → menu de categorias
// -----------------------------------------
export async function shopListHandler(ctx: BotContext): Promise<void> {
  const text = [
    `<b>⚠️  Antes de Continuar, Leia Atentamente:</b>`,
    ``,
    `🔗 https://t.me/trocascapcut`,
    `🔗 https://t.me/trocascapcut`,
    `🔗 https://t.me/trocascapcut`,
    ``,
  `<b>Trocas só são válidas para quem está de acordo com as regras.</b>`
  ].join('\n');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...shopCategoryKeyboard });
    await ctx.answerCbQuery();
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', ...shopCategoryKeyboard });
  }
}

// -----------------------------------------
// 2. Aba Contas → lista de planos
// -----------------------------------------
export async function shopAccountsHandler(ctx: BotContext): Promise<void> {
  const products = await productService.listActive();
  const text = [`📦 <b>Contas CapCut</b>`, ``, `Escolha um plano:`].join('\n');
  await ctx.editMessageText(text, { parse_mode: 'HTML', ...buildProductListKeyboard(products) });
  await ctx.answerCbQuery();
}

// -----------------------------------------
// 3. Plano selecionado → página 1
// -----------------------------------------
export async function shopPlanHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const productId = cb.data?.replace('shop:plan:', '') ?? '';
  await ctx.answerCbQuery();
  await renderPlanPage(ctx, productId, 1);
}

// -----------------------------------------
// 4. Navegação de páginas
// -----------------------------------------
export async function shopPageHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const parts = cb.data?.split(':') ?? [];
  // shop:page:productId:page
  const productId = parts[2] ?? '';
  const page = parseInt(parts[3] ?? '1', 10);
  await ctx.answerCbQuery();
  await renderPlanPage(ctx, productId, page);
}

// -----------------------------------------
// Core: renderiza uma página de plano
// -----------------------------------------
async function renderPlanPage(ctx: BotContext, productId: string, page: number): Promise<void> {
  const [product, user] = await Promise.all([
    productService.findById(productId),
    userService.findByTelegramId(ctx.from!.id),
  ]);

  if (!product) {
    await ctx.editMessageText('⚠️ Produto não encontrado.', { parse_mode: 'HTML', ...shopBackKeyboard });
    return;
  }

  const balance = user?.balance ?? 0;
  const { item, total } = await getStockPage(productId, page);
  const isOnWaitlist = total === 0
    ? await promotionService.isOnWaitlist(ctx.from!.id, productId)
    : false;

  let text: string;

  if (total === 0) {
    text = [
      `📦 <b>${product.name}</b>`,
      ``,
      `🚫 <b>Sem estoque disponível</b>`,
      ``,
      `Ative o aviso para ser notificado quando voltar.`,
    ].join('\n');
  } else {
    const currentUsers = item?.current_users ?? 0;
    const maxUsers = item?.max_users ?? 5;
    const vagas = maxUsers - currentUsers;
    const canBuy = balance >= product.price;

    text = [
      `📦 <b>${product.name}</b>`,
      ``,
      `💸 <b>Preço:</b> ${formatCurrency(product.price)}`,
      `👥 <b>Usuários:</b> ${currentUsers}/${maxUsers}`,
      `🔓 <b>Vagas:</b> ${vagas}`,
    ].join('\n');
  }

  const keyboard = buildPlanPageKeyboard({
    productId,
    page,
    total,
    canBuy: total > 0 && balance >= product.price,
    stockItemId: item?.id ?? '',
    isOnWaitlist,
  });

  await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
}

// -----------------------------------------
// 5. Compra direta pelo stockItemId
// -----------------------------------------
export async function shopBuyHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const parts = cb.data?.split(':') ?? [];
  // shop:buy:stockItemId  ou  shop:buy:stockItemId:promo:promoId
  const stockItemId = parts[2] ?? '';
  const isPromo = parts[3] === 'promo';
  const promoId = parts[4];

  const telegramId = ctx.from!.id;

  // Animação de carregamento
  await ctx.editMessageText('⏳ Verificando estoque...', { parse_mode: 'HTML' });
  await ctx.answerCbQuery();
  await randomDelay(2000, 10000)

  // Busca o item
  const db = getSupabaseClient();
  const { data: itemData } = await db
    .from('stock_items')
    .select('*, products(id, name, price)')
    .eq('id', stockItemId)
    .eq('status', 'available')
    .single();

  if (!itemData) {
    await ctx.editMessageText(
      `⚠️ <b>Esta conta acabou de ser reservada.</b>\n\nTente outra vez ou aguarde.`,
      { parse_mode: 'HTML', ...shopBackKeyboard }
    );
    return;
  }

  const item = itemData as any;
  const product = item.products;

  // Preço: usa promo se aplicável
  let finalPrice = product.price;
  let promoUsed: any = null;

  if (isPromo && promoId) {
    promoUsed = await promotionService.findById(promoId);
    if (promoUsed && promoUsed.is_active) {
      if (promoUsed.max_uses !== null && promoUsed.used_count >= promoUsed.max_uses) {
        await ctx.editMessageText('⚠️ <b>Promoção encerrada.</b>\n\nEsta promoção atingiu o limite de usos.', { parse_mode: 'HTML', ...shopBackKeyboard });
        return;
      }
      if (promoUsed.expires_at && new Date(promoUsed.expires_at) < new Date()) {
        await ctx.editMessageText('⚠️ <b>Promoção expirada.</b>', { parse_mode: 'HTML', ...shopBackKeyboard });
        return;
      }
      finalPrice = promoUsed.promo_price;
    }
  }

  await ctx.editMessageText('⏳ Processando compra...', { parse_mode: 'HTML' });

  const result = await purchaseService.executePurchase({
    telegramId,
    productId: product.id,
    productName: product.name,
    price: finalPrice,
    forcedStockItemId: stockItemId,
  });

  if (!result.success || !result.data) {
    const errMsg = result.error ?? 'Erro inesperado.';
    let friendlyMsg = errMsg;

    if (errMsg.includes('insuficiente')) friendlyMsg = '⚠️ <b>Saldo insuficiente.</b>\n\nRecarregue seu saldo e tente novamente.';
    else if (errMsg.includes('estoque')) friendlyMsg = '⚠️ <b>Sem estoque disponível.</b>\n\nEste plano acabou. Tente outro.';

    await ctx.editMessageText(friendlyMsg, { parse_mode: 'HTML', ...shopBackKeyboard });

    sendLog({ type: 'purchase_fail', telegramId, username: ctx.from!.username ?? null, productName: product.name, reason: errMsg });
    return;
  }

  // Incrementa contador de promo
  if (promoUsed) await promotionService.incrementUsed(promoId!);

  sendLog({ type: 'purchase', telegramId, username: ctx.from!.username ?? null, productName: product.name, price: finalPrice, orderId: result.data.order.id });

  await ctx.editMessageText(result.data.deliveryMessage, { parse_mode: 'HTML', ...shopBackKeyboard });
}

// -----------------------------------------
// 6. Aba Promoções
// -----------------------------------------
export async function shopPromosHandler(ctx: BotContext): Promise<void> {
  const [promos, isSubscribed] = await Promise.all([
    promotionService.listActive(),
    promotionService.isSubscribedPromo(ctx.from!.id),
  ]);

  if (promos.length === 0) {
    const text = [
      `🔥 <b>Promoções</b>`,
      ``,
      `Nenhuma promoção ativa no momento.`,
      ``,
      isSubscribed
        ? `🔔 Você receberá um aviso quando chegar uma promoção nova.`
        : `Ative o aviso para ser notificado!`,
    ].join('\n');

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...Markup_inlineKeyboard([
        [Markup_button(isSubscribed ? '🔕  Desativar avisos' : '🔔  Me avise quando chegar', isSubscribed ? 'shop:promonotif:off' : 'shop:promonotif:on')],
        [Markup_button('🔙 Voltar', 'menu:main')],
      ]),
    });
    await ctx.answerCbQuery();
    return;
  }

  await ctx.editMessageText(
    [`🔥 <b>Promoções Ativas</b>`, ``, `Aproveite! Ofertas por tempo limitado.`].join('\n'),
    { parse_mode: 'HTML', ...buildPromoListKeyboard(promos, isSubscribed) }
  );
  await ctx.answerCbQuery();
}

// helper inline
function Markup_inlineKeyboard(buttons: any[]) {
  const { Markup } = require('telegraf');
  return Markup.inlineKeyboard(buttons);
}
function Markup_button(text: string, data: string) {
  const { Markup } = require('telegraf');
  return Markup.button.callback(text, data);
}

// -----------------------------------------
// 7. Detalhe de uma promoção
// -----------------------------------------
export async function shopPromoDetailHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const promoId = cb.data?.replace('shop:promo:', '') ?? '';

  const promo = await promotionService.findById(promoId);
  if (!promo || !promo.is_active) {
    await ctx.answerCbQuery('⚠️ Promoção não encontrada ou encerrada.', { show_alert: true });
    return;
  }

  const [user, stockResult] = await Promise.all([
    userService.findByTelegramId(ctx.from!.id),
    getStockPage(promo.product_id, 1),
  ]);

  const balance = user?.balance ?? 0;
  const canBuy = balance >= promo.promo_price && stockResult.total > 0;

  const savePct = Math.round((1 - promo.promo_price / promo.original_price) * 100);

  const lines = [
    `🔥 <b>Promoção Especial</b>`,
    ``,
    `💸 De: <s>${formatCurrency(promo.original_price)}</s>`,
    `✅ Por: <b>${formatCurrency(promo.promo_price)}</b>  (-${savePct}%)`,
    ``,
    promo.expires_at ? `⏰ Termina em: <b>${formatTimeLeft(promo.expires_at)}</b>` : '',
    promo.max_uses !== null ? `🔥 Restam: <b>${promo.max_uses - promo.used_count}</b> unidades` : '',
    `📦 Estoque: <b>${stockResult.total}</b> disponíveis`,
    ``,
    `💰 Seu saldo: ${formatCurrency(balance)}`,
  ].filter(Boolean).join('\n');

  await ctx.editMessageText(lines, {
    parse_mode: 'HTML',
    ...buildPromoDetailKeyboard(promoId, stockResult.item?.id ?? '', canBuy),
  });
  await ctx.answerCbQuery();
}

// -----------------------------------------
// 8. Notificacoes de promos
// -----------------------------------------
export async function shopPromoNotifOnHandler(ctx: BotContext): Promise<void> {
  await promotionService.subscribePromoNotif(ctx.from!.id);
  await ctx.answerCbQuery('🔔 Avisos ativados!', { show_alert: false });
  await shopPromosHandler(ctx);
}

export async function shopPromoNotifOffHandler(ctx: BotContext): Promise<void> {
  await promotionService.unsubscribePromoNotif(ctx.from!.id);
  await ctx.answerCbQuery('🔕 Avisos desativados.', { show_alert: false });
  await shopPromosHandler(ctx);
}

// -----------------------------------------
// 9. Waitlist de estoque
// -----------------------------------------
export async function shopWaitlistJoinHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const productId = cb.data?.replace('shop:waitlist:join:', '') ?? '';
  await promotionService.joinWaitlist(ctx.from!.id, productId);
  await ctx.answerCbQuery('🔔 Você será avisado quando o estoque voltar!', { show_alert: true });
  await renderPlanPage(ctx, productId, 1);
}

export async function shopWaitlistLeaveHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const productId = cb.data?.replace('shop:waitlist:leave:', '') ?? '';
  await promotionService.leaveWaitlist(ctx.from!.id, productId);
  await ctx.answerCbQuery('🔕 Aviso cancelado.', { show_alert: false });
  await renderPlanPage(ctx, productId, 1);
}

// -----------------------------------------
// Noops
// -----------------------------------------
export async function shopNoopHandler(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery();
}

export async function shopNoStockHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const productId = cb.data?.replace('shop:nostock:', '') ?? '';
  // Abre a pagina do produto sem estoque
  await ctx.answerCbQuery();
  await renderPlanPage(ctx, productId, 1);
}
