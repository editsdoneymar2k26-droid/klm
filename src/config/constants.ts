// ─────────────────────────────────────────
// HYPERCUT STORE BOT — Constantes do sistema
// ─────────────────────────────────────────

export const LEVELS = {
  bronze: { label: '🥉 Bronze', minSpent: 0 },
  silver: { label: '🥈 Prata', minSpent: 100 },
  gold:   { label: '🥇 Ouro', minSpent: 300 },
  vip:    { label: '💎 VIP', minSpent: 500 },
} as const;

export const ORDER_STATUS_LABELS = {
  pending:   '⏳ Aguardando pagamento',
  paid:      '✅ Pago',
  delivered: '📦 Entregue',
  expired:   '❌ Expirado',
  cancelled: '🚫 Cancelado',
} as const;

export const MESSAGES = {
  WELCOME: (firstName: string) =>
    `<a href="https://i.supaimg.com/4310b32e-1b77-41b7-b58c-f653c9f7ff22/cfdce955-0d36-475b-9c49-b7b0ed688483.png">&#8203;</a>👋 Olá, <b>${firstName}</b>! Bem-vindo à <b>HyperCut Store</b>.`,

  FORCE_JOIN: `🔒 Para usar o bot, você precisa entrar no nosso canal oficial primeiro.`,

  PROFILE_HEADER: (firstName: string) =>
    `👤 <b>Perfil de ${firstName}</b>`,

  NOT_FOUND: `❌ Você ainda não está registrado. Use /start para se registrar.`,

  ERROR_GENERIC: `⚠️ Algo deu errado. Tente novamente em instantes.`,
} as const;
