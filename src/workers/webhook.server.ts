// -----------------------------------------
// HYPERCUT STORE BOT -- Servidor de Webhook PIX
// Gateway: miuse.app
// -----------------------------------------

import http from 'http';
import crypto from 'crypto';
import { Telegraf } from 'telegraf';

import { BotContext, PixWebhookPayload } from '../types';
import { pixService } from '../services/pix.service';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// -----------------------------------------
// Lê body raw como Buffer
// -----------------------------------------
function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {

    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', reject);
  });
}

// -----------------------------------------
// Detecta header de assinatura automaticamente
// -----------------------------------------
function getSignature(req: http.IncomingMessage): string | undefined {

  const possibleHeaders = [
    'x-webhook-signature',
    'x-signature',
    'x-miuse-signature',
    'signature',
    'authorization'
  ];

  for (const header of possibleHeaders) {

    const value = req.headers[header];

    if (
      typeof value === 'string' &&
      value.trim().length > 0
    ) {

      logger.info(
        `[Webhook] Header de assinatura detectado: ${header}`
      );

      return value;
    }
  }

  return undefined;
}

// -----------------------------------------
// Valida assinatura HMAC-SHA256
// -----------------------------------------
function validateSignature(
  rawBody: Buffer,
  signature: string
): boolean {

  // Dev sem secret configurado
  if (!env.PIX_WEBHOOK_SECRET) {

    logger.warn(
      '[Webhook] PIX_WEBHOOK_SECRET nao configurado — validacao ignorada.'
    );

    return true;
  }

  const expected = crypto
    .createHmac(
      'sha256',
      env.PIX_WEBHOOK_SECRET
    )
    .update(rawBody)
    .digest('hex');

  const received = signature
    .replace(/^sha256=/, '')
    .trim();

  try {

    return crypto.timingSafeEqual(
      Buffer.from(received, 'hex'),
      Buffer.from(expected, 'hex')
    );

  } catch {

    return false;
  }
}

// -----------------------------------------
// Parseia eventos do miuse
// -----------------------------------------
function parseEnvelope(
  raw: Record<string, unknown>
): PixWebhookPayload | null {

  const event =
    raw.event as string | undefined;

  const data =
    raw.data as Record<string, unknown> | undefined;

 const resourceType =
  raw.resource_type as string | undefined;

  if (!resourceType){

    logger.warn(
      '[Webhook] resource_type ausente.'
    );

    return null;
  }

  if (
    !event ||
    !data ||
    !data.id
  ){

    logger.warn(
      '[Webhook] Payload incompleto.'
    );

    return null;
  }
  
  let status: 'paid' | 'expired';

  switch (event) {

    case 'payment.paid':
      status = 'paid';
      break;

    case 'payment.expired':
    case 'payment.cancelled':
    case 'payment.failed':
      status = 'expired';
      break;

    default:

      logger.debug(
        `[Webhook] Evento ignorado: ${event}`
      );

      return null;
  }

  return {
    txid: String(data.id),
    status,
    amount: Number(data.pix_total ?? 0),
    paidAt: data.paid_at
      ? String(data.paid_at)
      : undefined,
  };
}

// -----------------------------------------
// Servidor principal
// -----------------------------------------
export function startWebhookServer(
  bot: Telegraf<BotContext>
): http.Server {

  const server = http.createServer(
    async (req, res) => {

      // -----------------------------------------
      // DEBUG HEADERS
      // -----------------------------------------
      logger.info('[Webhook] Headers recebidos:');
      logger.info(req.headers);

      // -----------------------------------------
      // HEALTH CHECK
      // -----------------------------------------
      if (
        req.method === 'GET' &&
        req.url === '/health'
      ) {

        res.writeHead(200, {
          'Content-Type': 'application/json'
        });

        res.end(JSON.stringify({
          status: 'ok',
          ts: new Date().toISOString()
        }));

        return;
      }

      // -----------------------------------------
      // WEBHOOK PIX
      // -----------------------------------------
      if (
        req.method === 'POST' &&
        req.url === '/webhook/pix'
      ) {

        let rawBody: Buffer;

        try {

          rawBody = await readBody(req);

        } catch {

          res.writeHead(400);

          res.end('Bad Request');

          return;
        }

        // -----------------------------------------
        // CHALLENGE VERIFICATION (MIUSE)
        // -----------------------------------------
        const challenge =
          req.headers['x-webhook-challenge'] ||
          req.headers['x-challenge'] ||
          req.headers['challenge'];

        if (
          challenge &&
          typeof challenge === 'string'
        ) {

          logger.info(
            `[Webhook] Challenge recebido: ${challenge}`
          );

          res.writeHead(200, {
            'Content-Type': 'text/plain'
          });

          res.end(challenge);

          return;
        }

        // -----------------------------------------
        // DETECTA ASSINATURA
        // -----------------------------------------
        const signature = getSignature(req);

        // -----------------------------------------
        // REQUISICAO SEM ASSINATURA
        // -----------------------------------------
        if (!signature) {

          logger.info(
            '[Webhook] Requisicao sem assinatura — respondido 200.'
          );

          res.writeHead(200, {
            'Content-Type': 'application/json'
          });

          res.end(JSON.stringify({
            received: true
          }));

          return;
        }

        // -----------------------------------------
        // VALIDACAO ASSINATURA
        // -----------------------------------------
        if (
          !validateSignature(
            rawBody,
            signature
          )
        ) {

          logger.warn(
            '[Webhook] Assinatura invalida.'
          );

          logger.warn(
            `[Webhook] Signature recebida: ${signature}`
          );

          // IMPORTANTE:
          // Respondemos 200 pro miuse nao invalidar o endpoint
          res.writeHead(200, {
            'Content-Type': 'application/json'
          });

          res.end(JSON.stringify({
            received: true,
            ignored: 'invalid_signature'
          }));

          return;
        }

        // -----------------------------------------
        // PARSE JSON
        // -----------------------------------------
        let rawPayload: Record<string, unknown>;

        try {

          rawPayload = JSON.parse(
            rawBody.toString('utf8')
          );

        } catch {

          res.writeHead(400, {
            'Content-Type': 'application/json'
          });

          res.end(JSON.stringify({
            error: 'invalid_json'
          }));

          return;
        }

        // -----------------------------------------
        // RESPONDE IMEDIATAMENTE
        // -----------------------------------------
        res.writeHead(200, {
          'Content-Type': 'application/json'
        });

        res.end(JSON.stringify({
          received: true
        }));

        // -----------------------------------------
        // PARSE EVENTO
        // -----------------------------------------
        const payload =
          parseEnvelope(rawPayload);

        if (!payload) {
          return;
        }

        logger.info(
          `[Webhook] Evento: ${rawPayload.event} | txid=${payload.txid}`
        );

        // -----------------------------------------
        // PROCESSAMENTO ASSINCRONO
        // -----------------------------------------
        setImmediate(async () => {

          try {

            const result =
              await pixService.processWebhook(payload);

            if (result.alreadyProcessed) {
              return;
            }

            if (!result.success) {

              logger.error(
                `[Webhook] Falha: ${result.error}`
              );

              return;
            }

            // -----------------------------------------
            // NOTIFICA TELEGRAM
            // -----------------------------------------
            if (
              payload.status === 'paid' &&
              result.telegramId &&
              result.amountCents
            ) {

              const reais =
                'R$ ' +
                (result.amountCents / 100)
                  .toFixed(2)
                  .replace('.', ',');

              try {

                await bot.telegram.sendMessage(
                  result.telegramId,
                  [
                    `✅ <b>Pagamento confirmado!</b>`,
                    ``,
                    `💰 <b>${reais}</b> adicionado ao seu saldo.`,
                    ``,
                    `Use /start para acessar o menu.`,
                  ].join('\n'),
                  {
                    parse_mode: 'HTML'
                  }
                );

              } catch {

                logger.warn(
                  `[Webhook] Nao foi possivel notificar user=${result.telegramId}`
                );
              }
            }

          } catch (err) {

            logger.error(
              '[Webhook] Erro inesperado:',
              err
            );
          }
        });

        return;
      }

      // -----------------------------------------
      // ROTA INVALIDA
      // -----------------------------------------
      res.writeHead(404, {
        'Content-Type': 'application/json'
      });

      res.end(JSON.stringify({
        error: 'not_found'
      }));
    }
  );

  // -----------------------------------------
  // START SERVER
  // -----------------------------------------
  server.listen(
    env.WEBHOOK_PORT,
    () => {

      logger.info(
        `[Webhook] Porta ${env.WEBHOOK_PORT} | POST /webhook/pix`
      );
    }
  );

  // -----------------------------------------
  // ERROR HANDLER
  // -----------------------------------------
  server.on('error', (err) => {

    logger.error(
      '[Webhook] Erro no servidor:',
      err
    );
  });

  return server;
}