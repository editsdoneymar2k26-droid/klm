// ─────────────────────────────────────────
// HYPERCUT STORE BOT — Winston Transport: Telegram
// Envia logs diretamente para um grupo privado
// ─────────────────────────────────────────

import TransportStream from 'winston-transport';

const LEVEL_EMOJI: Record<string, string> = {
  error: '🔴',
  warn:  '🟡',
  info:  '🟢',
  debug: '⚪',
  http:  '🔵',
};

interface TelegramTransportOptions extends TransportStream.TransportStreamOptions {
  botToken: string;
  chatId: string;
  // Intervalo mínimo entre mensagens (ms) para evitar flood do Telegram
  floodIntervalMs?: number;
}

export class TelegramTransport extends TransportStream {
  private botToken: string;
  private chatId: string;
  private floodIntervalMs: number;
  private queue: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(opts: TelegramTransportOptions) {
    super(opts);
    this.botToken = opts.botToken;
    this.chatId = opts.chatId;
    this.floodIntervalMs = opts.floodIntervalMs ?? 1500;
  }

  log(info: Record<string, unknown>, callback: () => void): void {
    setImmediate(() => this.emit('logged', info));

    const level = String(info.level ?? 'info');
    const message = String(info.stack ?? info.message ?? '');
    const ts = String(info.timestamp ?? new Date().toLocaleTimeString('pt-BR'));
    const emoji = LEVEL_EMOJI[level] ?? '⚫';

    const line = `${emoji} <b>[${level.toUpperCase()}]</b> <code>${ts}</code>\n${escapeHtml(message)}`;

    this.queue.push(line);
    this.scheduleFlush();
    callback();
  }

  // Agrupa mensagens em batch para evitar flood
  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushQueue();
    }, this.floodIntervalMs);
  }

  private async flushQueue(): Promise<void> {
    if (this.queue.length === 0) return;

    // Pega até 10 logs por mensagem
    const batch = this.queue.splice(0, 10);
    const text = batch.join('\n\n─────────────────\n\n');

    try {
      await this.sendTelegram(text);
    } catch {
      // Ignora falha silenciosamente — não quer causar loop de log
    }

    // Se ainda tiver itens na fila, agenda novo flush
    if (this.queue.length > 0) {
      this.scheduleFlush();
    }
  }

  private async sendTelegram(text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    const body = JSON.stringify({
      chat_id: this.chatId,
      text: text.slice(0, 4000), // limite do Telegram
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      disable_notification: true, // silencioso por padrão
    });

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
