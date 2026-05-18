// -----------------------------------------
// HYPERCUT STORE BOT -- Teclados inline
// Menu principal com botao admin condicional
// -----------------------------------------

import { Markup } from 'telegraf';

// Menu para usuarios comuns
export const mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🛒 Comprar', 'menu:shop')],
  [
    Markup.button.callback('👤 Meu Perfil', 'menu:profile'),
    Markup.button.callback('💰 Adicionar Saldo', 'menu:topup'),
  ],
  [
    Markup.button.url('📋  Regras', 't.me/trocascapcut'),
    {
      text: '🆘 Suporte',
      url: 'https://t.me/HyperCutSOS',
      text_entities: [
        {
          offset: 0,
          length: 2,
          type: 'custom_emoji',
          custom_emoji_id: '5219675837887956268'
        }
      ]
    }
  ],
  [Markup.button.url('👥  Canal de Clientes', 'https://t.me/hypercutchat')],
]);

// Menu para staff (admin/owner) — inclui botao do painel
export const mainMenuStaffKeyboard = Markup.inlineKeyboard([
 [Markup.button.callback('🛒 Comprar', 'menu:shop')],
  [
    Markup.button.callback('👤 Meu Perfil', 'menu:profile'),
    Markup.button.callback('💰 Adicionar Saldo', 'menu:topup'),
  ],
  [
    Markup.button.url('📋  Regras', 't.me/trocascapcut'),
    Markup.button.url('🆘  Suporte', 't.me/HyperCutSOS'),
  ],
  [Markup.button.url('👥  Canal de Clientes', 'https://t.me/hypercutchat')],
  [Markup.button.callback('👑  Painel Administrativo', 'adm:main')],
]);

export const forceJoinKeyboard = (inviteLink: string) =>
  Markup.inlineKeyboard([
    [Markup.button.url('📢  Entrar no Canal', inviteLink)],
    [Markup.button.callback('✅  Já entrei', 'forcejoin:check')],
  ]);

export const backToMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🏠  Menu Principal', 'menu:main')],
]);

export const profileKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📥  Baixar Historico de Compras', 'history:download')],
  [Markup.button.callback('💰  Recarregar Saldo', 'menu:topup')],
  [Markup.button.callback('🏠  Menu Principal', 'menu:main')],
]);
