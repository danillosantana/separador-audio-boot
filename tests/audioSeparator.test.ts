import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AudioSeparatorService, SEPARATION_OPTIONS, stemNameFromOutput } from '../src/audio/AudioSeparatorService.js';
import { SepararAudioTool } from '../src/tools/SepararAudioTool.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sep-'));
const service = (venvDir = path.join(tmp, 'sem-venv')) =>
  new AudioSeparatorService({ venvDir, modelDir: path.join(tmp, 'models'), stemsDir: path.join(tmp, 'stems'), maxSeconds: 900, timeoutMs: 1000 });

const codeOf = (promise: Promise<unknown>) => promise.then(() => 'ok', (err: { code?: string }) => err.code);

describe('SEPARATION_OPTIONS', () => {
  it('segue a tabela da spec', () => {
    expect(SEPARATION_OPTIONS['1.1'].args).toEqual(['--ensemble_preset=karaoke']);
    expect(SEPARATION_OPTIONS['1.2'].args).toEqual(['-m', 'htdemucs_6s.yaml']);
    expect(SEPARATION_OPTIONS['1.3.5'].args).toEqual(['-m', 'htdemucs_6s.yaml', '--single_stem=Guitar']);
    expect(SEPARATION_OPTIONS['1.2'].stems).toHaveLength(6);
  });
});

describe('stemNameFromOutput', () => {
  it('extrai e normaliza o nome do stem da saída da CLI', () => {
    expect(stemNameFromOutput('musica_(Vocals)_htdemucs_6s.wav')).toBe('vocals');
    expect(stemNameFromOutput('a_(b)_c_(Drums)_htdemucs_6s.wav')).toBe('drums');
    expect(stemNameFromOutput('x_(Instrumental)_preset_karaoke.wav')).toBe('instrumental');
    expect(stemNameFromOutput('sem_padrao.wav')).toBeNull();
  });
});

describe('AudioSeparatorService validação', () => {
  const mp3 = path.join(tmp, 'musica.mp3');
  fs.writeFileSync(mp3, 'não é áudio');
  fs.writeFileSync(path.join(tmp, 'musica.m4a'), 'x');

  it('retorna os códigos de erro da spec', async () => {
    expect(await codeOf(service().separate(mp3, '9.9'))).toBe('INVALID_TARGETS');
    expect(await codeOf(service().separate(path.join(tmp, 'nao-existe.mp3'), '1.2'))).toBe('NOT_FOUND');
    expect(await codeOf(service().separate(path.join(tmp, 'musica.m4a'), '1.2'))).toBe('UNSUPPORTED_FORMAT');
    expect(await codeOf(service().separate(mp3, '1.2'))).toBe('NOT_INSTALLED');
  });

  it('detecta arquivo ilegível quando a CLI existe', async () => {
    const venv = path.join(tmp, 'venv');
    fs.mkdirSync(path.join(venv, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(venv, 'bin', 'audio-separator'), '#!/bin/sh\n', { mode: 0o755 });
    expect(await codeOf(service(venv).separate(mp3, '1.2'))).toBe('READ_FAILED');
  });
});

describe('SepararAudioTool', () => {
  it('recusa caminhos fora de workspace/entradas e devolve o erro como observação', async () => {
    const inputs = path.join(tmp, 'entradas');
    fs.mkdirSync(inputs, { recursive: true });
    const tool = new SepararAudioTool(service(), inputs);
    const context = { userId: '1', reportProgress: async () => undefined, attachFile: () => undefined };
    const result = JSON.parse(await tool.execute({ arquivo: '../../etc/passwd.mp3', opcao: '1.2' }, context));
    expect(result.error).toBe('NOT_FOUND');
  });
});
