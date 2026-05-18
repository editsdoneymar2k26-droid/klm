// -----------------------------------------
// HYPERCUT STORE BOT -- Teclados da Loja v2
// -----------------------------------------

import { Markup } from 'telegraf';
import { ProductWithStock } from '../types';
import { formatCurrency } from '../utils/format';
import { PromoWithProduct } from '../services/promotion.service';

// Menu inicial da loja
export const shopCategoryKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('📦  Contas', 'shop:accounts'),
    Markup.button.callback('🔥  Promoções', 'shop:promos'),
  ],
  [Markup.button.callback('🔙 Voltar', 'menu:main')],
]);

// Lista de planos (aba Contas)
export function buildProductListKeyboard(products: ProductWithStock[]) {
  const buttons = products.map(p => {
    const hasStock = p.available_count > 0;
    const label = hasStock ? p.name : `${p.name} — Sem estoque`;
    return [Markup.button.callback(label, hasStock ? `shop:plan:${p.id}` : `shop:nostock:${p.id}`)];
  });
  buttons.push([Markup.button.callback('🔙 Voltar', 'menu:main')]);
  return Markup.inlineKeyboard(buttons);
}

// Paginacao de contas de um plano
export function buildPlanPageKeyboard(params: {
  productId: string;
  page: number;
  total: number;
  canBuy: boolean;
  stockItemId: string;
  isOnWaitlist?: boolean;
}) {
  const { productId, page, total, canBuy, stockItemId, isOnWaitlist } = params;
  const buttons: any[] = [];

  // Navegacao
  const navRow = [];
  if (page > 1) navRow.push(Markup.button.callback('⬅️', `shop:page:${productId}:${page - 1}`));
  navRow.push(Markup.button.callback(`${page}/${total}`, 'shop:noop'));
  if (page < total) navRow.push(Markup.button.callback('➡️', `shop:page:${productId}:${page + 1}`));
  if (navRow.length) buttons.push(navRow);

  // Acao
  if (total === 0) {
    buttons.push([
      Markup.button.callback(
        isOnWaitlist ? '🔕  Cancelar aviso' : '🔔  Avise quando voltar',
        isOnWaitlist ? `shop:waitlist:leave:${productId}` : `shop:waitlist:join:${productId}`
      ),
    ]);
  } else if (canBuy) {
    buttons.push([Markup.button.callback('✅  Comprar', `shop:buy:${stockItemId}`)]);
  } else {
    buttons.push([Markup.button.callback('💰 Adicionar Saldo', 'menu:topup')]);
  }

  buttons.push([Markup.button.callback('🔙 Voltar', 'shop:accounts')]);
  return Markup.inlineKeyboard(buttons);
}

// Promos
export function buildPromoListKeyboard(promos: PromoWithProduct[], isSubscribed: boolean) {
  const buttons = promos.map(p => [
    Markup.button.callback(`🔥 ${p.product_name} — ${formatCurrency(p.promo_price)}`, `shop:promo:${p.id}`),
  ]);

  buttons.push([
    Markup.button.callback(
      isSubscribed ? '🔕  Desativar avisos' : '🔔  Me avise quando chegar',
      isSubscribed ? 'shop:promonotif:off' : 'shop:promonotif:on'
    ),
  ]);

  buttons.push([Markup.button.callback('🔙 Voltar', 'menu:main')]);
  return Markup.inlineKeyboard(buttons);
}

// Detalhe de uma promo
export function buildPromoDetailKeyboard(promoId: string, stockItemId: string, canBuy: boolean) {
  const buttons: any[] = [];
  if (canBuy) {
    buttons.push([Markup.button.callback('✅  Comprar agora', `shop:buy:${stockItemId}:promo:${promoId}`)]);
  } else {
    buttons.push([Markup.button.callback('💰  Recarregar Saldo', 'menu:topup')]);
  }
  buttons.push([Markup.button.callback('🔙 Voltar', 'shop:promos')]);
  return Markup.inlineKeyboard(buttons);
}

export const shopBackKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔙 Voltar', 'menu:main')],
]);
