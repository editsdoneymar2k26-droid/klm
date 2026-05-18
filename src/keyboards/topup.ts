// -----------------------------------------
// HYPERCUT STORE BOT -- Teclado de Recarga (numpad)
// Funciona internamente em centavos
// -----------------------------------------

import { Markup } from 'telegraf';

// Converte string de digitos em centavos -> reais formatado
export function digitsToDisplay(digits: string): string {
  const cents = parseInt(digits || '0', 10);
  const reais = (cents / 100).toFixed(2).replace('.', ',');
  return `R$ ${reais}`;
}

export function buildTopupKeyboard(digits: string) {
  const display = digitsToDisplay(digits);

  return Markup.inlineKeyboard([
    // Display do valor atual
    [Markup.button.callback(`💵 ${display}`, 'topup:noop')],

    // Numpad
    [
      Markup.button.callback('1', 'topup:digit:1'),
      Markup.button.callback('2', 'topup:digit:2'),
      Markup.button.callback('3', 'topup:digit:3'),
    ],
    [
      Markup.button.callback('4', 'topup:digit:4'),
      Markup.button.callback('5', 'topup:digit:5'),
      Markup.button.callback('6', 'topup:digit:6'),
    ],
    [
      Markup.button.callback('7', 'topup:digit:7'),
      Markup.button.callback('8', 'topup:digit:8'),
      Markup.button.callback('9', 'topup:digit:9'),
    ],
    [
      Markup.button.callback('⌫', 'topup:backspace'),
      Markup.button.callback('0', 'topup:digit:0'),
      Markup.button.callback('C', 'topup:clear'),
    ],

    // Ações
    [Markup.button.callback('✅  Confirmar', 'topup:confirm')],
    [Markup.button.callback('🔙 Voltar', 'menu:main')],
  ]);
}
