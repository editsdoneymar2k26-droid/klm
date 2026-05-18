// -----------------------------------------
// HYPERCUT STORE BOT -- Handler de Historico
// Gera arquivo .txt puro UTF-8 com logins
// -----------------------------------------

import { BotContext } from '../types';
import { userService } from '../services/user.service';
import { historyService } from '../services/history.service';
import { backToProfileKeyboard } from '../keyboards/history';
import { MESSAGES } from '../config/constants';
import { logger } from '../utils/logger';

// Formata valor numerico sem Intl (evita caracteres regionais no .txt)
function formatBRL(value: number): string {
  const fixed = value.toFixed(2).replace('.', ',');
  return 'R$ ' + fixed;
}

// Formata data sem toLocaleString (puro UTC -> dd/mm/yyyy hh:mm)
function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}

export async function historyDownloadHandler(ctx: BotContext): Promise<void> {
  await ctx.answerCbQuery('Gerando arquivo...');

  const telegramId = ctx.from!.id;

  const user = await userService.findByTelegramId(telegramId);
  if (!user) {
    await ctx.reply(MESSAGES.NOT_FOUND);
    return;
  }

  const orders = await historyService.getAllOrders(user.id);

  if (orders.length === 0) {
    await ctx.answerCbQuery('Nenhuma compra encontrada, Realize alguma compra!', { show_alert: true });
    return;
  }

  // -----------------------------------------
  // Monta o arquivo .txt em UTF-8 puro
  // Sem bordas box-drawing, sem Intl, sem locale
  // -----------------------------------------

  const username = user.username ? '@' + user.username : user.first_name;
  const generatedAt = formatDate(new Date().toISOString());

  const lines: string[] = [];

  lines.push('HYPERCUT STORE - HISTORICO DE COMPRAS');
  lines.push('======================================');
  lines.push('');
  lines.push('Usuario  : ' + username);
  lines.push('Gerado   : ' + generatedAt + ' (UTC)');
  lines.push('Total    : ' + orders.length + ' compra(s)');
  lines.push('');
  lines.push('======================================');
  lines.push('');

  orders.forEach((order, index) => {
    const num = String(index + 1).padStart(3, '0');
    lines.push('[' + num + '] ' + order.product_name);
    lines.push('  Login  : ' + (order.login || '-'));
    lines.push('  Senha  : ' + (order.senha || '-'));
    lines.push('  Valor  : ' + formatBRL(order.amount));
    lines.push('  Data   : ' + formatDate(order.delivered_at));
    lines.push('');
  });

  lines.push('======================================');
  lines.push('HyperCut Store - t.me/hypercutstore');

  // Buffer explicitamente UTF-8, sem BOM
  const fileContent = lines.join('\n');
  const fileBuffer = Buffer.from(fileContent, 'utf8');

  try {
    await ctx.replyWithDocument(
      {
        source: fileBuffer,
        filename: 'hypercut_historico-compras_' + telegramId + '.txt',
      },
      {
        caption:
          ' <b>📋 Historico de Compras: </b>\n' +
         '',
        parse_mode: 'HTML',
        ...backToProfileKeyboard,
      }
    );

    logger.info(
      '[HistoryHandler] Download gerado | user=' + telegramId + ' | total=' + orders.length
    );
  } catch (err) {
    logger.error('[HistoryHandler] Erro ao enviar arquivo:', err);
    await ctx.reply('Erro ao gerar o arquivo. Tente novamente.');
  }
}
