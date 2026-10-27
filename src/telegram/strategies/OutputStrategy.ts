import type { Api } from 'grammy';

export interface OutputTarget {
  api: Api;
  chatId: number;
}
