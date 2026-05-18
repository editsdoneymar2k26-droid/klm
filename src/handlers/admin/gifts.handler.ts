// -----------------------------------------
// HYPERCUT ADMIN -- Gifts Handler v2
// Com visualizacao de resgates
// -----------------------------------------

import { BotContext } from '../../types';
import { Markup } from 'telegraf';
import { giftAdminService } from '../../services/admin/gift.admin.service';
import { getSupabaseClient } from '../../database/client';
import { logAdminAction } from '../../middlewares/admin';
import { adminBackKeyboard } from '../../keyboards/admin';

function brl(cents: number): string { return 'R$ ' + (cents / 100).toFixed(2).replace('.', ','); }
function pad(n: number): string { return String(n).padStart(2, '0'); }
function fmtDate(iso: string | null): string {
  if (!iso) return 'Sem validade';
  const d = new Date(iso);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}/${d.getUTCFullYear()}`;
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export async function adminGiftsMenuHandler(ctx: BotContext): Promise<void> {
  await ctx.editMessageText(
    `🎁 <b>Gifts</b>\n\nCrie e gerencie códigos de presente.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Criar Gift', 'adm:gifts:create')],
        [Markup.button.callback('⚙️ Gerenciar Gifts', 'adm:gifts:list')],
        [Markup.button.callback('⬅️ Voltar', 'adm:main')],
      ]),
    }
  );
  await ctx.answerCbQuery();
}

export async function adminGiftCreateHandler(ctx: BotContext): Promise<void> {
  ctx.session.step = 'admin:gift:name';
  ctx.session.giftDraft = {};
  await ctx.editMessageText(
    `➕ <b>Criar Gift</b> (1/4)\n\nEnvie o <b>nome</b> do gift:`,
    { parse_mode: 'HTML', ...adminBackKeyboard }
  );
  await ctx.answerCbQuery();
}

export async function adminGiftInputHandler(ctx: BotContext): Promise<void> {
  const step = ctx.session.step ?? '';
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';
  if (!text) return;

  if (step === 'admin:gift:name') {
    ctx.session.giftDraft = { name: text };
    ctx.session.step = 'admin:gift:code';
    await ctx.reply(`(2/4) Código do gift (ex: PROMO10):`);
  } else if (step === 'admin:gift:code') {
    ctx.session.giftDraft = { ...ctx.session.giftDraft, code: text.toUpperCase() };
    ctx.session.step = 'admin:gift:uses';
    await ctx.reply(`(3/4) Quantidade máxima de usos:`);
  } else if (step === 'admin:gift:uses') {
    const uses = parseInt(text, 10);
    if (isNaN(uses) || uses < 1) { await ctx.reply('Número inválido.'); return; }
    ctx.session.giftDraft = { ...ctx.session.giftDraft, maxUses: uses };
    ctx.session.step = 'admin:gift:balance';
    await ctx.reply(`(4/4) Saldo em R$ que será creditado (ex: 5.00):`);
  } else if (step === 'admin:gift:balance') {
    const val = parseFloat(text.replace(',', '.'));
    if (isNaN(val) || val <= 0) { await ctx.reply('Valor inválido.'); return; }

    const draft = ctx.session.giftDraft ?? {};
    ctx.session.step = undefined;
    ctx.session.giftDraft = undefined;

    const result = await giftAdminService.create({
      name: draft.name ?? 'Gift',
      code: draft.code ?? 'GIFT',
      maxUses: draft.maxUses ?? 1,
      balanceCents: Math.round(val * 100),
      createdBy: ctx.from!.id,
    });

    if (!result.success) { await ctx.reply(`❌ ${result.error}`); return; }

    await logAdminAction({ adminId: ctx.from!.id, action: 'gift_create', detail: `code=${result.gift!.code}` });

await ctx.reply(
  [
    `🎁 \\| *GIFT CRIADO COM SUCESSO\\!*`,
    ``,
    `🔑 *Código:* \`${(result.gift!.code)}\``,
    `🔄 *Limite de Usos:* ${(result.gift!.max_uses)}`,
    `💰 *Valor:* ${(brl(result.gift!.balance_cents))}`,
    ``,
    `🤖 \\| @hypercutbot`,
  ].join('\n'), 
  { parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [[
        {
          text: '✅ Resgatar Aqui',
          url: `https://t.me/hypercutbot?start=resgatar_${result.gift!.code}`,
        },
      ]],
    },
   },
  );
 }
};

export async function adminGiftListHandler(ctx: BotContext): Promise<void> {
  const gifts = await giftAdminService.listAll();
  if (gifts.length === 0) {
    await ctx.editMessageText('Nenhum gift criado.', { parse_mode: 'HTML', ...adminBackKeyboard });
    await ctx.answerCbQuery(); return;
  }

  const buttons = gifts.map(g => [
    Markup.button.callback(
      `${g.is_active ? '🟢' : '🔴'} ${g.code} | ${g.used_count}/${g.max_uses} | ${brl(g.balance_cents)}`,
      `adm:gifts:item:${g.id}`
    ),
  ]);
  buttons.push([Markup.button.callback('⬅️ Voltar', 'adm:gifts')]);

  await ctx.editMessageText(
    `🎁 <b>Gifts (${gifts.length})</b>`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
  );
  await ctx.answerCbQuery();
}

export async function adminGiftItemHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const giftId = cb.data?.replace('adm:gifts:item:', '') ?? '';
  const gifts = await giftAdminService.listAll();
  const gift = gifts.find(g => g.id === giftId);
  if (!gift) { await ctx.answerCbQuery('Não encontrado.', { show_alert: true }); return; }

  const text = [
    `🎁 <b>${gift.name}</b>`,
    ``,
    `🔑 Código: <code>${gift.code}</code>`,
    `🔄 Usos: <b>${gift.used_count}/${gift.max_uses}</b>`,
    `💰 Valor: <b>${brl(gift.balance_cents)}</b>`,
    `📅 Validade: <b>${fmtDate(gift.expires_at)}</b>`,
    `Status: <b>${gift.is_active ? '🟢 Ativo' : '🔴 Inativo'}</b>`,
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback(gift.is_active ? '🔴 Desativar' : '🟢 Ativar', `adm:gifts:toggle:${gift.id}`),
        Markup.button.callback('🗑 Deletar', `adm:gifts:delete:${gift.id}`),
      ],
      [Markup.button.callback('👥 Ver Resgates', `adm:gifts:redemptions:${gift.id}`)],
      [Markup.button.callback('⬅️ Lista', 'adm:gifts:list')],
    ]),
  });
  await ctx.answerCbQuery();
}

// -----------------------------------------
// Ver resgates de um gift
// -----------------------------------------
export async function adminGiftRedemptionsHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const giftId = cb.data?.replace('adm:gifts:redemptions:', '') ?? '';
  const db = getSupabaseClient();

  const { data } = await db
    .from('gift_redemptions')
    .select('telegram_id, redeemed_at, users!inner(username, first_name)')
    .eq('gift_id', giftId)
    .order('redeemed_at', { ascending: false })
    .limit(20);

  const gifts = await giftAdminService.listAll();
  const gift = gifts.find(g => g.id === giftId);

  if (!data || data.length === 0) {
    await ctx.editMessageText('Nenhum resgate ainda.', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Voltar', `adm:gifts:item:${giftId}`)]]),
    });
    await ctx.answerCbQuery(); return;
  }

  const lines = (data as any[]).map((r, i) => {
    const u = r.users;
    const name = u?.username ? `@${u.username}` : u?.first_name ?? '?';
    return `${i+1}. ${name} <code>(${r.telegram_id})</code> — ${fmtDateTime(r.redeemed_at)} — ${brl(gift?.balance_cents ?? 0)}`;
  });

  const total_dist = (data.length) * ((gift?.balance_cents ?? 0) / 100);

  await ctx.editMessageText(
    [
      `👥 <b>Resgates — ${gift?.code ?? giftId}</b>`,
      ``,
      `Total distribuído: <b>R$ ${total_dist.toFixed(2).replace('.', ',')}</b>`,
      `Total de resgates: <b>${data.length}</b>`,
      ``,
      ...lines,
    ].join('\n'),
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Voltar', `adm:gifts:item:${giftId}`)]]),
    }
  );
  await ctx.answerCbQuery();
}

export async function adminGiftToggleHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const giftId = cb.data?.replace('adm:gifts:toggle:', '') ?? '';
  const gifts = await giftAdminService.listAll();
  const gift = gifts.find(g => g.id === giftId);
  if (!gift) { await ctx.answerCbQuery('Não encontrado.', { show_alert: true }); return; }

  await giftAdminService.setActive(giftId, !gift.is_active);
  await logAdminAction({ adminId: ctx.from!.id, action: gift.is_active ? 'gift_deactivate' : 'gift_activate', detail: gift.code });
  await ctx.answerCbQuery(gift.is_active ? '🔴 Desativado' : '🟢 Ativado');
  await adminGiftListHandler(ctx);
}

export async function adminGiftDeleteHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const giftId = cb.data?.replace('adm:gifts:delete:', '') ?? '';
  await giftAdminService.delete(giftId);
  await logAdminAction({ adminId: ctx.from!.id, action: 'gift_delete', targetId: giftId });
  await ctx.answerCbQuery('🗑 Deletado.');
  await adminGiftListHandler(ctx);
}
