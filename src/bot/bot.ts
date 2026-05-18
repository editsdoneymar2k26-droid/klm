// -----------------------------------------
// HYPERCUT STORE BOT -- bot.ts v2
// -----------------------------------------

import { Telegraf, session } from 'telegraf';
import { BotContext, SessionData } from '../types';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Middlewares
import { loggerMiddleware } from '../middlewares/logger';
import { errorHandlerMiddleware } from '../middlewares/errorHandler';
import { forceJoinMiddleware } from '../middlewares/forceJoin';

// Handlers usuarios
import { startHandler } from '../handlers/start.handler';
import { profileHandler } from '../handlers/profile.handler';
import { historyDownloadHandler } from '../handlers/history.handler';
import { giftCommandHandler } from '../handlers/gift.handler';
import {
  showMainMenu, topupHandler, rulesHandler,
  supportHandler, forceJoinCheckHandler,
} from '../handlers/menu.handler';
import {
  shopListHandler,
  shopAccountsHandler,
  shopPlanHandler,
  shopPageHandler,
  shopBuyHandler,
  shopPromosHandler,
  shopPromoDetailHandler,
  shopPromoNotifOnHandler,
  shopPromoNotifOffHandler,
  shopWaitlistJoinHandler,
  shopWaitlistLeaveHandler,
  shopNoopHandler,
  shopNoStockHandler,
} from '../handlers/shop.handler';
import {
  pixCommandHandler, topupDigitHandler, topupBackspaceHandler,
  topupClearHandler, topupConfirmHandler, topupNoopHandler,
} from '../handlers/topup.handler';

// Handlers admin
import { adminPanelHandler } from '../handlers/admin/panel.handler';
import {
  adminStockMenuHandler, adminStockAddHandler, adminStockPlanHandler,
  adminStockClearConfirmHandler, adminStockClearHandler,
  adminStockReservedHandler, adminStockReceiveAccountsHandler,
  adminLogsHandler, adminMaintenanceHandler, adminMaintenanceToggleHandler,
  adminMaintenanceEditMsgHandler, adminMaintenanceReceiveMsgHandler,
  adminConfigHandler,
} from '../handlers/admin/panel.handler';
import {
  adminUsersMenuHandler, adminUsersSearchPromptHandler,
  adminUsersSearchHandler, adminUserViewHandler,
  adminUserBanConfirmHandler, adminUserBanDoHandler, adminUserUnbanHandler,
  adminUserLevelMenuHandler, adminUserSetLevelHandler,
  adminUserAddBalPromptHandler, adminUserRemBalPromptHandler,
  adminUserBalanceHandler, adminUserOrdersHandler,
  adminUserPromoteConfirmHandler, adminUserPromoteDoHandler,
  adminUserDemoteConfirmHandler, adminUserDemoteDoHandler,
} from '../handlers/admin/users.handler';
import {
  adminGiftsMenuHandler, adminGiftCreateHandler, adminGiftInputHandler,
  adminGiftListHandler, adminGiftItemHandler, adminGiftToggleHandler,
  adminGiftDeleteHandler, adminGiftRedemptionsHandler,
} from '../handlers/admin/gifts.handler';
import {
  adminBroadcastMenuHandler, adminBroadcastFilterHandler,
  adminBroadcastMessageHandler, adminBroadcastSendHandler,
} from '../handlers/admin/broadcast.handler';
import {
  adminPromosMenuHandler, adminPromoProductHandler, adminPromoCreateHandler,
  adminPromoInputHandler, adminPromoToggleHandler,
  adminPromoDeleteConfirmHandler, adminPromoDeleteDoHandler,
  adminPromoBroadcastHandler,
} from '../handlers/admin/promotions.handler';

import { getUserRole, isStaff, canAccessAdminPanel } from '../helpers/permissions';

export function createBot(): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(env.BOT_TOKEN);

  bot.use(session({ defaultSession: (): SessionData => ({}) }));
  bot.use(errorHandlerMiddleware);
  bot.use(loggerMiddleware);
  bot.use(forceJoinMiddleware);

  // -- Comandos --
  bot.start(startHandler);
  bot.command('pix', pixCommandHandler);
  bot.command('menu', showMainMenu);
  bot.command('resgatar', giftCommandHandler);

  bot.command('admin', async (ctx) => {
    const role = await getUserRole(ctx.from?.id ?? 0);
    if (!isStaff(role)) { await ctx.reply(''); return; }
    await adminPanelHandler(ctx);
  });

  // -- Menu principal --
  bot.action('menu:main', showMainMenu);
  bot.action('menu:shop', shopListHandler);
  bot.action('menu:topup', topupHandler);
  bot.action('menu:rules', rulesHandler);
  bot.action('menu:support', supportHandler);
  bot.action('menu:profile', profileHandler);

  // -- Loja v2 --
  bot.action('shop:accounts', shopAccountsHandler);
  bot.action('shop:promos', shopPromosHandler);
  bot.action('shop:promonotif:on', shopPromoNotifOnHandler);
  bot.action('shop:promonotif:off', shopPromoNotifOffHandler);
  bot.action('shop:noop', shopNoopHandler);
  bot.action(/^shop:plan:(.+)$/, shopPlanHandler);
  bot.action(/^shop:page:/, shopPageHandler);
  bot.action(/^shop:buy:/, shopBuyHandler);
  bot.action(/^shop:promo:/, shopPromoDetailHandler);
  bot.action(/^shop:waitlist:join:/, shopWaitlistJoinHandler);
  bot.action(/^shop:waitlist:leave:/, shopWaitlistLeaveHandler);
  bot.action(/^shop:nostock:/, shopNoStockHandler);

  // -- Historico --
  bot.action('history:download', historyDownloadHandler);

  // -- Recarga --
  bot.action(/^topup:digit:\d$/, topupDigitHandler);
  bot.action('topup:backspace', topupBackspaceHandler);
  bot.action('topup:clear', topupClearHandler);
  bot.action('topup:confirm', topupConfirmHandler);
  bot.action('topup:noop', topupNoopHandler);

  // -- Force Join --
  bot.action('forcejoin:check', forceJoinCheckHandler);

  // -- Admin: painel --
  bot.action('adm:main', adminPanelHandler);
  bot.action('adm:stock', adminStockMenuHandler);
  bot.action('adm:stock:add', adminStockAddHandler);
  bot.action('adm:stock:view', adminStockMenuHandler);
  bot.action('adm:stock:clear:confirm', adminStockClearConfirmHandler);
  bot.action('adm:stock:clear:do', adminStockClearHandler);
  bot.action('adm:stock:reserved', adminStockReservedHandler);
  bot.action(/^adm:stock:plan:/, adminStockPlanHandler);
  bot.action('adm:gifts', adminGiftsMenuHandler);
  bot.action('adm:gifts:create', adminGiftCreateHandler);
  bot.action('adm:gifts:list', adminGiftListHandler);
  bot.action(/^adm:gifts:item:/, adminGiftItemHandler);
  bot.action(/^adm:gifts:toggle:/, adminGiftToggleHandler);
  bot.action(/^adm:gifts:delete:/, adminGiftDeleteHandler);
  bot.action(/^adm:gifts:redemptions:/, adminGiftRedemptionsHandler);
  bot.action('adm:users', adminUsersMenuHandler);
  bot.action('adm:users:search', adminUsersSearchPromptHandler);
  bot.action(/^adm:users:view:/, adminUserViewHandler);
  bot.action(/^adm:users:ban:confirm:/, adminUserBanConfirmHandler);
  bot.action(/^adm:users:ban:do:/, adminUserBanDoHandler);
  bot.action(/^adm:users:unban:/, adminUserUnbanHandler);
  bot.action(/^adm:users:level:/, adminUserLevelMenuHandler);
  bot.action(/^adm:users:setlevel:/, adminUserSetLevelHandler);
  bot.action(/^adm:users:addbal:/, adminUserAddBalPromptHandler);
  bot.action(/^adm:users:rembal:/, adminUserRemBalPromptHandler);
  bot.action(/^adm:users:orders:/, adminUserOrdersHandler);
  bot.action(/^adm:users:promote:confirm:/, adminUserPromoteConfirmHandler);
  bot.action(/^adm:users:promote:do:/, adminUserPromoteDoHandler);
  bot.action(/^adm:users:demote:confirm:/, adminUserDemoteConfirmHandler);
  bot.action(/^adm:users:demote:do:/, adminUserDemoteDoHandler);
  bot.action('adm:broadcast', adminBroadcastMenuHandler);
  bot.action(/^adm:bc:filter:/, adminBroadcastFilterHandler);
  bot.action(/^adm:bc:send:/, adminBroadcastSendHandler);
  bot.action('adm:logs', adminLogsHandler);
  bot.action('adm:maintenance', adminMaintenanceHandler);
  bot.action('adm:maint:toggle', adminMaintenanceToggleHandler);
  bot.action('adm:maint:editmsg', adminMaintenanceEditMsgHandler);
  bot.action('adm:config', adminConfigHandler);

  // -- Admin: promoções (owner only) --
  bot.action('adm:promos', adminPromosMenuHandler);
  bot.action(/^adm:promo:product:/, adminPromoProductHandler);
  bot.action(/^adm:promo:create:/, adminPromoCreateHandler);
  bot.action(/^adm:promo:toggle:/, adminPromoToggleHandler);
  bot.action(/^adm:promo:delete:confirm:/, adminPromoDeleteConfirmHandler);
  bot.action(/^adm:promo:delete:do:/, adminPromoDeleteDoHandler);
  bot.action(/^adm:promo:broadcast:/, adminPromoBroadcastHandler);

  // -- Roteador de steps de texto --
  bot.on('message', async (ctx, next) => {
    const step = ctx.session.step ?? '';
    const tgId = ctx.from?.id ?? 0;
    const role = await getUserRole(tgId);

    if (isStaff(role)) {
      if (step.startsWith('admin:stock:adding:')) { await adminStockReceiveAccountsHandler(ctx); return; }
      if (step === 'admin:users:search') { await adminUsersSearchHandler(ctx); return; }
      if (step.startsWith('admin:addbal:') || step.startsWith('admin:rembal:')) { await adminUserBalanceHandler(ctx); return; }
      if (step.startsWith('admin:gift:')) { await adminGiftInputHandler(ctx); return; }
      if (step === 'admin:maint:editmsg') { await adminMaintenanceReceiveMsgHandler(ctx); return; }
      if (step.startsWith('admin:bc:msg:')) { await adminBroadcastMessageHandler(ctx); return; }
      if (step.startsWith('admin:promo:')) { await adminPromoInputHandler(ctx); return; }
    }

    return next();
  });

  bot.on('message', async (ctx) => {
    await ctx.reply('Use /start para abrir o menu principal.');
  });

  bot.catch((err, ctx) => {
    logger.error(`[Bot] Erro no update ${ctx.updateType}:`, err);
  });

  return bot;
}
