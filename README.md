# SeparadorAudioBot

Agente pessoal que roda no seu computador e conversa pelo Telegram. A função principal é separar os instrumentos de uma música (karaokê, todos os instrumentos ou um instrumento específico) **na CPU**, sem enviar o áudio para a nuvem.

Também conversa por texto e voz, lê PDF e `.md`, cria arquivos e responde em áudio quando pedido. As especificações ficam em [specs/](specs/).

## Requisitos

- Linux com Node.js 20+ (testado no 24), Python 3.9+ (testado no 3.12) e `ffmpeg`/`ffprobe` (`sudo apt install ffmpeg`)
- ~2 GB de disco para o ambiente Python e ~2 GB para os modelos de separação (baixados no primeiro uso)
- Um bot do Telegram (token do [@BotFather](https://t.me/BotFather)) e o seu ID numérico ([@userinfobot](https://t.me/userinfobot))
- Uma chave de LLM: OpenAI (padrão), Gemini, DeepSeek, Groq, ou um modelo local via Ollama

## Instalação

```bash
npm install
npm run setup:audio      # cria .venv-audio: audio-separator[cpu], faster-whisper, edge-tts
cp .env.example .env     # preencha TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_IDS e OPENAI_API_KEY
npm run dev
```

`npm run dev` usa nodemon: alterações em `src/` reiniciam o bot. Skills em `.agents/skills/` são relidas a cada mensagem, sem reiniciar.

## Uso no Telegram

1. Envie uma música (MP3, WAV, FLAC ou OGG, até 20 MB) como áudio ou documento.
2. O bot responde com o menu:

   | Opção | Resultado | Modelo |
   |---|---|---|
   | 1.1 | Karaokê: vocals + instrumental | preset `karaoke` (3 modelos Mel-Band RoFormer) |
   | 1.2 | Todos: vocals, drums, bass, guitar, piano, other | `htdemucs_6s` |
   | 1.3.1 … 1.3.6 | Só baixo, bateria, outros, vocais, guitarra ou piano | `htdemucs_6s --single_stem` |

3. Responda com o número (ou em linguagem natural: "só a bateria", "quero o karaokê"). Uma mensagem de status mostra o progresso e os stems chegam como arquivos.

Os WAVs ficam em `workspace/stems/<música>/`, junto com `<música>_metadata.json` (hash, duração, sample rate, tempo, versão da lib, opção). Pelo Telegram, WAVs acima de 50 MB são enviados em MP3 320 kbps.

Arquivos acima de 20 MB (limite de download de bots): copie para `workspace/entradas/` e diga o nome ao bot.

Comandos: `/menu`, `/novo` (nova conversa, sem apagar o histórico) e `/ajuda`.

### Tempo de processamento

Medido em 12 CPUs com um áudio de 20 s, com os modelos já baixados:

| Opção | Tempo | × tempo real |
|---|---|---|
| 1.3.x (um instrumento) | 37 s | ≈ 1,9× |
| 1.2 (seis stems) | 45 s | ≈ 2,3× |
| 1.1 (karaokê) | 583 s | ≈ 29× |

O karaokê roda 3 modelos RoFormer em sequência e fica muito acima da meta de 5×: uma música de 3 min leva perto de 1h30, o que passa do `AUDIO_SEPARATOR_TIMEOUT_MS` padrão (60 min). Para usá-lo em músicas inteiras, aumente esse timeout.

O primeiro uso de cada opção baixa os modelos para `data/audio-models/` (~80 MB para `htdemucs_6s`, ~1,7 GB para o karaokê).

## Configuração

Todas as variáveis estão comentadas em [.env.example](.env.example). As principais:

| Variável | Padrão | Uso |
|---|---|---|
| `LLM_PROVIDER` | `openai` | `openai`, `gemini`, `deepseek`, `groq` ou `openai-compatible` |
| `LLM_FALLBACK_PROVIDER` | — | Usado quando o primário falha (precisa da chave dele) |
| `ROUTER_PROVIDER` | primário | Provedor do roteador de skills |
| `OPENAI_MODEL` | `gpt-5-nano` | Com `OPENAI_SUPPORTS_TEMPERATURE=false` (modelo de raciocínio) |
| `COMPATIBLE_*` | Ollama | URL, modelo e flags de capacidade do servidor local |
| `MAX_ITERATIONS` | 5 | Limite do loop ReAct |
| `MEMORY_WINDOW_SIZE` | 20 | Mensagens recentes enviadas ao LLM |
| `AUDIO_SEPARATOR_MAX_SECONDS` | 900 | Duração máxima da música |
| `AUDIO_SEPARATOR_TIMEOUT_MS` | 3600000 | Timeout da separação |
| `WHISPER_MODEL` | `base` | Modelo do faster-whisper para voice notes |
| `TTS_VOICE` | `pt-BR-ThalitaMultilingualNeural` | Voz das respostas em áudio |

### LLM local com Ollama

```bash
ollama pull qwen3:8b       # qualquer modelo; prefira um com suporte a tools
```

```env
LLM_PROVIDER=openai-compatible
COMPATIBLE_MODEL=qwen3:8b
# Modelo sem function calling: COMPATIBLE_SUPPORTS_TOOLS=false
```

Outros servidores compatíveis (LM Studio `http://localhost:1234/v1`, llama.cpp, vLLM) funcionam trocando `COMPATIBLE_BASE_URL`.

## Estrutura

```
src/
  main.ts                 composição e startup
  config/Config.ts        leitura e validação do .env
  llm/                    ILlmProvider, OpenAICompatibleProvider (base), OpenAI/Gemini/DeepSeek/Groq/compatível, Fallback, Factory
  memory/                 SQLite (WAL): DatabaseConnection, repositórios, MemoryManager
  core/                   AgentController (facade), AgentLoop (ReAct), SystemPromptBuilder
  skills/                 SkillLoader, SkillRouter, SkillExecutor
  tools/                  data_hora_atual, criar_arquivo, listar_entradas, separar_audio
  audio/                  AudioSeparatorService, AudioProbe, AudioTranscriber (Whisper), TextToSpeech
  telegram/               TelegramBot, InputHandler, OutputHandler + estratégias (texto, arquivo, erro, áudio)
scripts/                  setup-audio.sh, transcribe.py
.agents/skills/           skills em Markdown (separador-audio)
workspace/                entradas/, stems/, arquivos/ (criados no startup)
data/                     banco SQLite e modelos de separação
tests/                    vitest
```

## Testes

```bash
npm test            # vitest (sem rede: LLM e Telegram mockados)
npm run typecheck
```

## Decisões e desvios das specs

- **TTS:** o pacote npm `edge-tts-universal` 1.4.0 recebe HTTP 403 do serviço da Microsoft e trava. O bot usa a CLI Python `edge-tts` instalada em `.venv-audio` e converte para OGG/Opus com ffmpeg.
- **Whisper:** escolhido o `faster-whisper` (CPU, int8) no mesmo venv da separação, resolvendo a open question de telegram-input §14. O áudio é decodificado pelo ffmpeg do sistema, porque o decodificador interno do faster-whisper 1.2 é incompatível com PyAV ≥ 15.
- **Memória:** só mensagens `user` e `assistant` são persistidas. As trocas de tool calls ficam em RAM durante o loop; a resposta final registra os arquivos enviados. Isso evita que o truncamento da janela separe um tool call da sua resposta.
- **Router:** recebe as últimas 6 mensagens, para entender respostas curtas como "1.2" depois do menu.
- **Menu em texto:** sem botões inline (telegram-output NG-01).
- **Arquivos na resposta:** o LLM entrega documentos com a ferramenta `criar_arquivo` ou, sem tools, com blocos `<arquivo nome="x.md">…</arquivo>`.
- **Separação:** uma por vez (fila), porque cada uma ocupa todas as CPUs. O LLM escolhe só a opção; o comando é fixo no código, sem shell.
- **Modelos:** guardados em `data/audio-models/` em vez do padrão `/tmp/audio-separator-models/`, para não serem apagados no reboot.
- **Comandos extras:** `/menu` e `/novo`.
