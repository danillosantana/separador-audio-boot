import fs from 'node:fs';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

/** Texto máximo de um documento repassado ao agente. */
export const MAX_DOCUMENT_CHARS = 30_000;

export class DocumentParser {
  static isSupported(fileName: string, mimeType?: string): boolean {
    const ext = path.extname(fileName).toLowerCase();
    return mimeType === 'application/pdf' || ext === '.pdf' || ext === '.md';
  }

  async parse(filePath: string, fileName: string): Promise<string> {
    const ext = path.extname(fileName).toLowerCase();
    let text: string;
    if (ext === '.md') {
      text = await fs.promises.readFile(filePath, 'utf8');
    } else {
      const parser = new PDFParse({ data: await fs.promises.readFile(filePath) });
      try {
        text = (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
    }
    text = text.replace(/\u0000/g, '').trim();
    return text.length > MAX_DOCUMENT_CHARS ? `${text.slice(0, MAX_DOCUMENT_CHARS)}\n[...documento truncado]` : text;
  }
}
