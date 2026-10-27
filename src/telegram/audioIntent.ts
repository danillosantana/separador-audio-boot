// \b do JavaScript não reconhece letras acentuadas ("áudio", "não"); usamos limites Unicode
const B = '(?<!\\p{L})';
const E = '(?!\\p{L})';

const ASKS_AUDIO = new RegExp(
  `${B}(responda|responde|me responda|fale|fala|manda|mande|envie|grave)${E}[^.?!]{0,25}${B}(em |por |com )?(áudio|audio)${E}` +
    `|${B}fale comigo${E}|${B}(em|por) voz${E}`,
  'iu',
);
const REFUSES_AUDIO = new RegExp(`${B}(sem|não|nao)${E}[^.?!]{0,20}${B}(áudio|audio|voz)${E}`, 'iu');

/** telegram-input RF-06/EC-07: só marca resposta em áudio com pedido explícito e sem negação. */
export function wantsAudioReply(text: string): boolean {
  return ASKS_AUDIO.test(text) && !REFUSES_AUDIO.test(text);
}

/** Voice note assume resposta em áudio, exceto se o próprio pedido recusar. */
export function refusesAudioReply(text: string): boolean {
  return REFUSES_AUDIO.test(text);
}
