// ─────────────────────────────────────────
// HYPERCUT STORE BOT — Utilitários de formatação
// ─────────────────────────────────────────

import { UserLevel } from '../types';
import { LEVELS } from '../config/constants';

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function getLevelLabel(level: UserLevel): string {
  return LEVELS[level]?.label ?? '🥉 Bronze';
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Exibe apenas os primeiros 8 chars do UUID como ID curto.
 * Ex: "a1b2c3d4-..." → "#A1B2C3D4"
 */
export function shortOrderId(orderId: string): string {
  return `#${orderId.split('-')[0].toUpperCase()}`;
}

/**
 * Formata a mensagem de entrega enviada ao cliente após a compra.
 * Credenciais no formato "login|senha".
 */
export function formatDeliveryMessage(params: {
  credentials: string;
  productName: string;
  orderId: string;
}): string {
  const { credentials, productName, orderId } = params;
  const parts = credentials.split('|');
  const login = parts[0]?.trim() ?? '—';
  const senha = parts[1]?.trim() ?? '—';

  return [
    `┌─────────────────────────┐`,
    `│   📦 ENTREGA HYPERCUT    │`,
    `└─────────────────────────┘`,
    ``,
    `📅 <b>Plano:</b> ${escapeHtml(productName)}`,
    ``,
    `📧 <b>Login:</b> <code>${escapeHtml(login)}</code>`,
    `🔑 <b>Senha:</b> <code>${escapeHtml(senha)}</code>`,
    ``,
    `🆔 <b>Pedido:</b> <code>${shortOrderId(orderId)}</code>`,
    ``,
    `⚠️ <i>Não compartilhe suas credenciais.\nEm caso de problemas, contate o suporte.</i>`,
  ].join('\n');
}

/**
 * Formata lista de produtos para exibição na loja.
 */
export function formatProductList(products: { name: string; price: number; available_count: number }[]): string {
  if (products.length === 0) return '😔 Nenhum plano disponível no momento.';

  return products
    .map((p) => {
      const stock = p.available_count > 0
        ? `✅ ${p.available_count} disponíveis`
        : '❌ Sem estoque';
      return `• <b>${escapeHtml(p.name)}</b> — ${formatCurrency(p.price)}\n  ${stock}`;
    })
    .join('\n\n');
}
