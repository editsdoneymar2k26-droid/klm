// -----------------------------------------
// HYPERCUT ADMIN -- Teclados do Painel
// -----------------------------------------

import { Markup } from 'telegraf';
import { Gift } from '../../services/admin/gift.admin.service';

// Menu principal admin
export const adminMainKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('📦 Estoque', 'adm:stock'),
    Markup.button.callback('🎁 Gifts', 'adm:gifts'),
  ],
  [
    Markup.button.callback('👤 Usuarios', 'adm:users'),
    Markup.button.callback('💰 Saldo', 'adm:balance'),
  ],
  [
    Markup.button.callback('📢 Broadcast', 'adm:broadcast'),
    Markup.button.callback('📄 Logs', 'adm:logs'),
  ],
  [
    Markup.button.callback('🚨 Manutencao', 'adm:maintenance'),
    Markup.button.callback('⚙️ Config', 'adm:config'),
  ],
  [
    [Markup.button.callback('🔙 Voltar', 'menu:main')],
  ],
]);

// Estoque
export const adminStockKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('➕ Adicionar Contas', 'adm:stock:add')],
  [Markup.button.callback('📊 Ver Estoque', 'adm:stock:view')],
  [Markup.button.callback('🧹 Limpar Reservas', 'adm:stock:clear')],
  [Markup.button.callback('📦 Contas Reservadas', 'adm:stock:reserved')],
  [Markup.button.callback('🔙 Voltar', 'adm:main')],
]);

// Selecao de plano para adicionar contas
export const adminStockPlanKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('7 DIAS', 'adm:stock:plan:7d'),
    Markup.button.callback('1 MES', 'adm:stock:plan:30d'),
  ],
  [
    Markup.button.callback('3 MESES', 'adm:stock:plan:3m'),
    Markup.button.callback('1 ANO', 'adm:stock:plan:1y'),
  ],
  [Markup.button.callback('', 'adm:stock')],
]);

// Gifts
export const adminGiftsKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('➕ Criar Gift', 'adm:gifts:create')],
  [Markup.button.callback('⚙️ Gerenciar Gifts', 'adm:gifts:list')],
  [Markup.button.callback('🔙 Voltar', 'adm:main')],
]);

export function adminGiftItemKeyboard(giftId: string, isActive: boolean) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isActive ? '🔴 Desativar' : '🟢 Ativar',
        `adm:gifts:toggle:${giftId}`
      ),
      Markup.button.callback('🗑 Deletar', `adm:gifts:delete:${giftId}`),
    ],
    [Markup.button.callback('🔙 Voltar', 'adm:gifts:list')],
  ]);
}

// Usuarios
export const adminUsersKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔎 Buscar Usuario', 'adm:users:search')],
  [Markup.button.callback('🔙 Voltar', 'adm:main')],
]);

export function adminUserActionsKeyboard(telegramId: number, isBanned: boolean) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isBanned ? '✅ Desbanir' : '🚫 Banir',
        `adm:users:ban:${telegramId}`
      ),
      Markup.button.callback('👑 Nivel', `adm:users:level:${telegramId}`),
    ],
    [
      Markup.button.callback('💰 Add Saldo', `adm:users:addbal:${telegramId}`),
      Markup.button.callback('💸 Rem Saldo', `adm:users:rembal:${telegramId}`),
    ],
    [
      Markup.button.callback('📦 Pedidos', `adm:users:orders:${telegramId}`),
      Markup.button.callback('🛡️ Admin', `adm:users:setadmin:${telegramId}`),
    ],
    [Markup.button.callback('🔙 Voltar', 'adm:users')],
  ]);
}

export function adminUserLevelKeyboard(telegramId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🥉 Bronze', `adm:users:setlevel:${telegramId}:bronze`),
      Markup.button.callback('🥈 Prata', `adm:users:setlevel:${telegramId}:silver`),
    ],
    [
      Markup.button.callback('🥇 Ouro', `adm:users:setlevel:${telegramId}:gold`),
      Markup.button.callback('💎 VIP', `adm:users:setlevel:${telegramId}:vip`),
    ],
    [Markup.button.callback('🔙 Voltar', `adm:users:view:${telegramId}`)],
  ]);
}

// Broadcast filtros
export const adminBroadcastFilterKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('🥉 Bronze', 'adm:bc:filter:bronze'),
    Markup.button.callback('🥈 Prata', 'adm:bc:filter:silver'),
  ],
  [
    Markup.button.callback('🥇 Ouro', 'adm:bc:filter:gold'),
    Markup.button.callback('💎 VIP', 'adm:bc:filter:vip'),
  ],
  [
    Markup.button.callback('🚫 Sem compra', 'adm:bc:filter:no_purchase'),
    Markup.button.callback('💳 Sem recarga', 'adm:bc:filter:no_topup'),
  ],
  [
    Markup.button.callback('🕐 Antigos', 'adm:bc:filter:old'),
    Markup.button.callback('✅ Ativos', 'adm:bc:filter:active'),
  ],
  [Markup.button.callback('👥 Todos', 'adm:bc:filter:all')],
  [Markup.button.callback('🔙 Voltar', 'adm:main')],
]);

export function adminBroadcastConfirmKeyboard(filter: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Confirmar Envio', `adm:bc:send:${filter}`)],
    [Markup.button.callback('❌ Cancelar', 'adm:broadcast')],
  ]);
}

// Manutencao
export function adminMaintenanceKeyboard(isActive: boolean) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        isActive ? '🟢 Desativar Manutencao' : '🔴 Ativar Manutencao',
        'adm:maint:toggle'
      ),
    ],
    [Markup.button.callback('✏️ Editar Mensagem', 'adm:maint:editmsg')],
    [Markup.button.callback('🔙 Voltar', 'adm:main')],
  ]);
}

// Voltar ao painel
export const adminBackKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔙 Voltar', 'adm:main')],
]);
