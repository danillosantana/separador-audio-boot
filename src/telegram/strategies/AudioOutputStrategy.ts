import { InputFile } from 'grammy';
import { MAX_TTS_CHARS, type TextToSpeech } from '../../audio/TextToSpeech.js';
import { removeQuietly } from '../../utils/files.js';
import { withTelegramRetry } from '../telegramRetry.js';
import type { OutputTarget } from './OutputStrategy.js';

/** Responde com voice note (TTS); quem chama faz fallback para texto se falhar. */
export class AudioOutputStrategy {
  constructor(private readonly tts: TextToSpeech) {}

  /** Retorna true se o texto inteiro coube no áudio. */
  async send(target: OutputTarget, text: string): Promise<boolean> {
    void target.api.sendChatAction(target.chatId, 'record_voice').catch(() => undefined);
    const oggPath = await this.tts.synthesize(text);
    try {
      await withTelegramRetry(() => target.api.sendVoice(target.chatId, new InputFile(oggPath)));
    } finally {
      await removeQuietly(oggPath);
    }
    return text.length <= MAX_TTS_CHARS;
  }
}
