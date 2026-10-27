import { describe, expect, it } from 'vitest';
import { TextToSpeech } from '../src/audio/TextToSpeech.js';
import { wantsAudioReply } from '../src/telegram/audioIntent.js';
import { FileOutputStrategy } from '../src/telegram/strategies/FileOutputStrategy.js';
import { TextOutputStrategy } from '../src/telegram/strategies/TextOutputStrategy.js';

describe('TextOutputStrategy.chunk', () => {
  it('não divide textos dentro do limite', () => {
    expect(TextOutputStrategy.chunk('curto')).toEqual(['curto']);
  });

  it('divide 9000 caracteres em 3 bolhas sem cortar palavras', () => {
    const text = Array.from({ length: 2000 }, (_, i) => `pal${i % 10}`).join(' ');
    const chunks = TextOutputStrategy.chunk(text.slice(0, 9000));
    expect(chunks).toHaveLength(3);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(4096);
    expect(chunks.join(' ')).toBe(text.slice(0, 9000).trim());
  });

  it('corta texto sem espaços no limite exato', () => {
    expect(TextOutputStrategy.chunk('x'.repeat(5000)).map((c) => c.length)).toEqual([4096, 904]);
  });
});

describe('FileOutputStrategy.extractBlocks', () => {
  it('extrai blocos <arquivo> e deixa um marcador no texto', () => {
    const { text, blocks } = FileOutputStrategy.extractBlocks('Segue:\n<arquivo nome="../prd.md">\n# PRD\n</arquivo>');
    expect(blocks).toEqual([{ name: 'prd.md', content: '# PRD' }]);
    expect(text).toBe('Segue:\n[arquivo prd.md enviado]');
  });
});

describe('wantsAudioReply', () => {
  it('detecta pedidos explícitos de resposta em áudio e respeita negação', () => {
    expect(wantsAudioReply('Cria um PRD e me responde em áudio')).toBe(true);
    expect(wantsAudioReply('fale comigo')).toBe(true);
    expect(wantsAudioReply('responda isso sem ser em áudio')).toBe(false);
    expect(wantsAudioReply('separe o áudio da música')).toBe(false);
  });
});

describe('TextToSpeech.stripMarkdown', () => {
  it('remove formatação antes da síntese', () => {
    expect(TextToSpeech.stripMarkdown('# Título\n- **item** com `code` e [link](http://x)')).toBe('Título\nitem com code e link');
  });
});

describe('refusesAudioReply', () => {
  it('reconhece recusa de áudio em voice notes', async () => {
    const { refusesAudioReply } = await import('../src/telegram/audioIntent.js');
    expect(refusesAudioReply('me responde sem áudio')).toBe(true);
    expect(refusesAudioReply('não quero voz')).toBe(true);
    expect(refusesAudioReply('separa a bateria')).toBe(false);
  });
});
