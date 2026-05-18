// -----------------------------------------
// HYPERCUT STORE BOT -- Logger
// Terminal (Winston) + Logs ricos no Telegram
// -----------------------------------------

import winston from 'winston';
import path from 'path';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const terminalFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}] ${stack ?? message}`;
});

// -----------------------------------------
// Tipos de eventos que geram log no Telegram
// Cada tipo tem layout proprio e bonito
// -----------------------------------------
export type LogEvent =
  | { type: 'new_user';      telegramId: number; username: string | null; firstName: string; isNew: boolean }
  | { type: 'purchase';      telegramId: number; username: string | null; productName: string; price: number; orderId: string }
  | { type: 'purchase_fail'; telegramId: number; username: string | null; productName: string; reason: string }
  | { type: 'pix_created';   telegramId: number; username: string | null; amountCents: number; txid: string }
  | { type: 'pix_paid';      telegramId: number; username: string | null; amountCents: number; txid: string; newBalance: number }
  | { type: 'pix_expired';   txid: string; amountCents: number }
  | { type: 'webhook_dup';   txid: string }
  | { type: 'error';         context: string; message: string; stack?: string }
  | { type: 'bot_start' }
  | { type: 'bot_stop' };

// -----------------------------------------
// Helpers
// -----------------------------------------
function now(): string {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function brl(cents: number): string {
  return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');
}

function userTag(telegramId: number, username: string | null): string {
  return username ? `@${username}` : `ID ${telegramId}`;
}

function shortId(id: string): string {
  return '#' + id.split('-')[0].toUpperCase();
}

function esc(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// -----------------------------------------
// Monta a mensagem formatada para cada evento
// -----------------------------------------
function buildMessage(event: LogEvent): string {
  switch (event.type) {

    case 'new_user':
      return [
        event.isNew ? `👤 <b>NOVO USUÁRIO</b>` : `👋 <b>USUÁRIO RETORNOU</b>`,
        `━━━━━━━━━━━━━━━━`,
        `📛 Nome: <b>${esc(event.firstName)}</b>`,
        `🔗 Username: ${event.username ? `@${event.username}` : '—'}`,
        `🆔 Telegram ID: <code>${event.telegramId}</code>`,
        `━━━━━━━━━━━━━━━━`,
        `🕐 ${now()}`,
      ].join('\n');

    case 'purchase':
      return [
        `✅ <b>VENDA REALIZADA</b>`,
        `━━━━━━━━━━━━━━━━`,
        `👤 ${esc(userTag(event.telegramId, event.username))}`,
        `🆔 <code>${event.telegramId}</code>`,
        `📦 Produto: <b>${esc(event.productName)}</b>`,
        `💰 Valor: <b>R$ ${event.price.toFixed(2).replace('.', ',')}</b>`,
        `🧾 Pedido: <code>${shortId(event.orderId)}</code>`,
        `━━━━━━━━━━━━━━━━`,
        `🕐 ${now()}`,
      ].join('\n');

    case 'purchase_fail':
      return [
        `❌ <b>COMPRA FALHOU</b>`,
        `━━━━━━━━━━━━━━━━`,
        `👤 ${esc(userTag(event.telegramId, event.username))}`,
        `🆔 <code>${event.telegramId}</code>`,
        `📦 Produto: <b>${esc(event.productName)}</b>`,
        `⚠️ Motivo: <i>${esc(event.reason)}</i>`,
        `━━━━━━━━━━━━━━━━`,
        `🕐 ${now()}`,
      ].join('\n');

    case 'pix_created':
      return [
        `🔔 <b>PIX GERADO</b>`,
        `━━━━━━━━━━━━━━━━`,
        `👤 ${esc(userTag(event.telegramId, event.username))}`,
        `🆔 <code>${event.telegramId}</code>`,
        `💵 Valor: <b>${brl(event.amountCents)}</b>`,
        `🧾 TxID: <code>${event.txid.slice(0, 20)}...</code>`,
        `━━━━━━━━━━━━━━━━`,
        `🕐 ${now()}`,
      ].join('\n');

    case 'pix_paid':
      return [
        `💸 <b>PAGAMENTO CONFIRMADO</b>`,
        `━━━━━━━━━━━━━━━━`,
        `👤 ${esc(userTag(event.telegramId, event.username))}`,
        `🆔 <code>${event.telegramId}</code>`,
        `💵 Valor pago: <b>${brl(event.amountCents)}</b>`,
        `💰 Novo saldo: <b>R$ ${event.newBalance.toFixed(2).replace('.', ',')}</b>`,
        `🧾 TxID: <code>${event.txid.slice(0, 20)}...</code>`,
        `━━━━━━━━━━━━━━━━`,
        `🕐 ${now()}`,
      ].join('\n');

    case 'pix_expired':
      return [
        `⌛ <b>PIX EXPIRADO</b>`,
        `━━━━━━━━━━━━━━━━`,
        `💵 Valor: ${brl(event.amountCents)}`,
        `🧾 TxID: <code>${event.txid.slice(0, 20)}...</code>`,
        `━━━━━━━━━━━━━━━━`,
        `🕐 ${now()}`,
      ].join('\n');

    case 'webhook_dup':
      return [
        `⚠️ <b>WEBHOOK DUPLICADO</b>`,
        `━━━━━━━━━━━━━━━━`,
        `🧾 TxID: <code>${event.txid.slice(0, 20)}...</code>`,
        `ℹ️ Ignorado com segurança.`,
        `━━━━━━━━━━━━━━━━`,
        `🕐 ${now()}`,
      ].join('\n');

    case 'error':
      return [
        `🚨 <b>ERRO — ${esc(event.context)}</b>`,
        `━━━━━━━━━━━━━━━━`,
        `📋 ${esc(event.message)}`,
        event.stack
          ? `\n<pre>${esc(event.stack.slice(0, 600))}</pre>`
          : '',
        `━━━━━━━━━━━━━━━━`,
        `🕐 ${now()}`,
      ].filter(Boolean).join('\n');

    case 'bot_start':
      return [
        `🟢 <b>BOT ONLINE</b>`,
        `━━━━━━━━━━━━━━━━`,
        `✅ HyperCut Store BOT iniciado.`,
        `🕐 ${now()}`,
      ].join('\n');

    case 'bot_stop':
      return [
        `🔴 <b>BOT OFFLINE</b>`,
        `━━━━━━━━━━━━━━━━`,
        `🕐 ${now()}`,
      ].join('\n');
  }
}

// -----------------------------------------
// Envia log formatado para o grupo Telegram
// Chamado diretamente pelos handlers/services
// NAO usa Winston — e totalmente independente
// -----------------------------------------
export async function sendLog(event: LogEvent): Promise<void> {
  const botToken = process.env.BOT_TOKEN;
  const chatId = process.env.LOG_CHAT_ID;
  if (!botToken || !chatId) return;

  const text = buildMessage(event);

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        disable_notification: true,
      }),
    });
  } catch {
    // Nunca quebra o fluxo principal
  }
}

// -----------------------------------------
// Logger Winston — terminal + arquivo apenas
// NAO envia mais nada para o Telegram
// -----------------------------------------
export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    terminalFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        terminalFormat
      ),
    }),
    new winston.transports.File({
      filename: path.join('src', 'logs', 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join('src', 'logs', 'combined.log'),
    }),
  ],
});
