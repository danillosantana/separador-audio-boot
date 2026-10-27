import type { AudioSeparatorService } from '../audio/AudioSeparatorService.js';
import type { Config } from '../config/Config.js';
import { CriarArquivoTool } from './CriarArquivoTool.js';
import { DataHoraAtualTool } from './DataHoraAtualTool.js';
import { ListarEntradasTool } from './ListarEntradasTool.js';
import { SepararAudioTool } from './SepararAudioTool.js';
import { ToolRegistry } from './ToolRegistry.js';

export class ToolFactory {
  static createRegistry(config: Config, separator: AudioSeparatorService): ToolRegistry {
    return new ToolRegistry()
      .register(new DataHoraAtualTool())
      .register(new CriarArquivoTool(config.filesDir))
      .register(new ListarEntradasTool(config.inputsDir))
      .register(new SepararAudioTool(separator, config.inputsDir));
  }
}
