// -----------------------------------------
// HYPERCUT STORE BOT -- Handler de Recarga
// Teclado numpad + geracao de PIX
// -----------------------------------------

import { BotContext } from '../types';
import { pixService } from '../services/pix.service';
import { userService } from '../services/user.service';
import { buildTopupKeyboard, digitsToDisplay } from '../keyboards/topup';
import { backToMenuKeyboard } from '../keyboards/main';
import { checkPixRateLimit } from '../middlewares/pixRateLimit';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// -----------------------------------------
// Abre o teclado de recarga
// -----------------------------------------
export async function topupHandler(ctx: BotContext): Promise<void> {
  ctx.session.topupDigits = '';

  const text = buildTopupText('');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...buildTopupKeyboard(''),
    });
    await ctx.answerCbQuery();
  } else {
    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...buildTopupKeyboard(''),
    });
  }
}

// -----------------------------------------
// Digito pressionado
// -----------------------------------------
export async function topupDigitHandler(ctx: BotContext): Promise<void> {
  const cb = ctx.callbackQuery as { data?: string };
  const digit = cb.data?.replace('topup:digit:', '') ?? '';

  let digits = ctx.session.topupDigits ?? '';

  // Max 6 digitos = R$ 999,99
  if (digits.length >= 6) {
    await ctx.answerCbQuery('Valor maximo atingido.');
    return;
  }

  // Nao permite zeros a esquerda
  if (digits === '' && digit === '0') {
    await ctx.answerCbQuery();
    return;
  }

  digits = digits + digit;
  ctx.session.topupDigits = digits;

  await ctx.editMessageText(buildTopupText(digits), {
    parse_mode: 'HTML',
    ...buildTopupKeyboard(digits),
  });
  await ctx.answerCbQuery();
}

// -----------------------------------------
// Backspace
// -----------------------------------------
export async function topupBackspaceHandler(ctx: BotContext): Promise<void> {
  let digits = ctx.session.topupDigits ?? '';
  digits = digits.slice(0, -1);
  ctx.session.topupDigits = digits;

  await ctx.editMessageText(buildTopupText(digits), {
    parse_mode: 'HTML',
    ...buildTopupKeyboard(digits),
  });
  await ctx.answerCbQuery();
}

// -----------------------------------------
// Clear
// -----------------------------------------
export async function topupClearHandler(ctx: BotContext): Promise<void> {
  ctx.session.topupDigits = '';

  await ctx.editMessageText(buildTopupText(''), {
    parse_mode: 'HTML',
    ...buildTopupKeyboard(''),
  });
  await ctx.answerCbQuery();
}

// -----------------------------------------
// Confirmar — gera a cobrança PIX
// -----------------------------------------
export async function topupConfirmHandler(ctx: BotContext): Promise<void> {
  const digits = ctx.session.topupDigits ?? '';
  const cents = parseInt(digits || '0', 10);

  // Valida limites
  if (cents < env.PIX_MIN_CENTS) {
    const min = digitsToDisplay(String(env.PIX_MIN_CENTS));
    await ctx.answerCbQuery(`Valor minimo: ${min}`, { show_alert: true });
    return;
  }
  if (cents > env.PIX_MAX_CENTS) {
    const max = digitsToDisplay(String(env.PIX_MAX_CENTS));
    await ctx.answerCbQuery(`Valor maximo: ${max}`, { show_alert: true });
    return;
  }

  const telegramId = ctx.from!.id;

  // Rate limit
  const rl = checkPixRateLimit(telegramId);
  if (!rl.allowed) {
    const secsLeft = Math.ceil(rl.retryAfterMs / 1000);
    await ctx.answerCbQuery(
      `Muitas tentativas. Aguarde ${secsLeft}s.`,
      { show_alert: true }
    );
    return;
  }

  await ctx.answerCbQuery('Gerando PIX...');

  // Verifica se ja tem PIX aberto
  const active = await pixService.getActivePending(telegramId);
  if (active) {
    await ctx.editMessageText(
      buildPixMessage({
        amountCents: active.amount_cents,
        transactionId: active.transaction_id,
        expiresAt: active.expires_at,
      }),
      { parse_mode: 'HTML', ...backToMenuKeyboard }
    );
    // Reenvia copia-e-cola
    if (active.copy_paste) {
      await ctx.reply(
        `<code>${active.copy_paste}</code>`,
        { parse_mode: 'HTML' }
      );
    }
    return;
  }

  // Carrega usuario
  const user = await userService.findByTelegramId(telegramId);
  if (!user) {
    await ctx.reply('Use /start primeiro.');
    return;
  }

  // Cria cobrança
  const result = await pixService.createCharge({
    telegramId,
    userId: user.id,
    amountCents: cents,
  });

  if (!result.success || !result.data) {
    await ctx.editMessageText(
      `❌ <b>Erro ao gerar PIX</b>\n\n${result.error}`,
      { parse_mode: 'HTML', ...backToMenuKeyboard }
    );
    return;
  }

  const payment = result.data;
  ctx.session.topupDigits = '';

  // Edita mensagem com resumo do PIX
  await ctx.editMessageText(
    buildPixMessage({
      amountCents: payment.amount_cents,
      transactionId: payment.transaction_id,
      expiresAt: payment.expires_at,
    }),
    { parse_mode: 'HTML', ...backToMenuKeyboard }
  );

  // Envia QR Code se disponivel
  if (payment.qrcode) {
    try {
      const qrBuffer = Buffer.from(payment.qrcode, 'base64');
      await ctx.replyWithPhoto(
        { source: qrBuffer },
        { caption: 'QR Code para pagamento' }
      );
    } catch (err) {
      logger.warn('[TopupHandler] Nao foi possivel enviar QR Code como imagem:', err);
    }
  }

  // Envia copia-e-cola
  if (payment.copy_paste) {
    await ctx.editMessageText(
      `📋 <b>PIX Copia e Cola:</b>\n\n<code>${payment.copy_paste}</code>`,
      { parse_mode: 'HTML' }
    );
  }

  logger.info(`[TopupHandler] PIX gerado | user=${telegramId} | R$ ${(cents / 100).toFixed(2)}`);
}

// -----------------------------------------
// Noop (botao de display do valor)
// -----------------------------------------
export async function topupNoopHandler(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery();
}

// -----------------------------------------
// Comando /pix [valor]
// Exemplo: /pix 10 gera PIX de R$ 10,00
// -----------------------------------------
export async function pixCommandHandler(ctx: BotContext): Promise<void> {
  const msg = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = msg.trim().split(/\s+/);
  const valueStr = parts[1];

  if (!valueStr) {
    // Sem argumento: abre o teclado de recarga
    await topupHandler(ctx);
    return;
  }

  const valueReais = parseFloat(valueStr.replace(',', '.'));
  if (isNaN(valueReais) || valueReais <= 0) {
    await ctx.reply('Uso: /pix [valor]\nExemplo: /pix 10');
    return;
  }

  const cents = Math.round(valueReais * 100);

  if (cents < env.PIX_MIN_CENTS) {
    await ctx.reply(`Valor minimo: R$ ${(env.PIX_MIN_CENTS / 100).toFixed(2)}`);
    return;
  }
  if (cents > env.PIX_MAX_CENTS) {
    await ctx.reply(`Valor maximo: R$ ${(env.PIX_MAX_CENTS / 100).toFixed(2)}`);
    return;
  }

  const telegramId = ctx.from!.id;

  const rl = checkPixRateLimit(telegramId);
  if (!rl.allowed) {
    const secsLeft = Math.ceil(rl.retryAfterMs / 1000);
    await ctx.reply(`Muitas tentativas. Aguarde ${secsLeft}s.`);
    return;
  }

  const user = await userService.findByTelegramId(telegramId);
  if (!user) {
    await ctx.reply('Use /start primeiro.');
    return;
  }

  const msg2 = await ctx.reply('⏳ Gerando PIX...');

  const result = await pixService.createCharge({
    telegramId,
    userId: user.id,
    amountCents: cents,
  });

  if (!result.success || !result.data) {
    await ctx.reply(`❌ ${result.error}`);
    return;
  }

  const payment = result.data;

  await ctx.reply(
    buildPixMessage({
      amountCents: payment.amount_cents,
      transactionId: payment.transaction_id,
      expiresAt: payment.expires_at,
    }),
    { parse_mode: 'HTML' }
  );

  if (payment.qrcode) {
    try {
      await ctx.replyWithPhoto(
        { source: Buffer.from(payment.qrcode, 'base64') },
        { caption: 'QR Code para pagamento' }
      );
    } catch {
      // Ignora falha no QR
    }
  }

  if (payment.copy_paste) {
    await ctx.reply(
      `📋 <b>PIX Copia e Cola:</b>\n\n<code>${payment.copy_paste}</code>`,
      { parse_mode: 'HTML' }
    );
  }
}

// -----------------------------------------
// Helpers de texto
// -----------------------------------------
function buildTopupText(digits: string): string {
  const display = digitsToDisplay(digits);
  const min = `R$ ${(env.PIX_MIN_CENTS / 100).toFixed(2).replace('.', ',')}`;
  const max = `R$ ${(env.PIX_MAX_CENTS / 100).toFixed(2).replace('.', ',')}`;

  return [
    `Digite o valor que deseja recarregar:`,
    `<b>${display}</b>`,
    ``,
    `Min: ${min}  |  Max: ${max}`,
  ].join('\n');
}

function buildPixMessage(params: {
  amountCents: number;
  transactionId: string;
  expiresAt: string;
}): string {
  const { amountCents, transactionId, expiresAt } = params;
  const display = `R$ ${(amountCents / 100).toFixed(2).replace('.', ',')}`;
  const shortId = transactionId.slice(0, 8).toUpperCase();

  // Data de expiração sem locale
  const d = new Date(expiresAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const expStr = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;

  return [
    `<b>✅ Pagamento Gerado!</b>`,
    `🧾 <b>ID:</b> #${shortId}`,,
    ``,
    `💵 <b>Valor:</b> ${display}`,
    `🧾 <b>ID:</b> #${shortId}`,
    ``,
    `⏳ Prazo de Expiração: 10 Minutos`,
    ``,
    `🔗 Pix Copia e Cola:`,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `Apos o pagamento, seu saldo sera creditado automaticamente.`,
  ].join('\n');
}
