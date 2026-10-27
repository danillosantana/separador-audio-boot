# Spec: Separação de instrumentos com audio-separator[cpu]
**Versão:** 1.1 | **Status:** Aprovada | **Data:** 2026-10-17

## 1. Resumo
Este PRD descreve a especificação de uma skill local para separar instrumentos de uma música usando a biblioteca audio-separator[cpu]. A solução recebe um arquivo de áudio (input), executa a separação de fontes na CPU e produz stems (vocals, drums, bass, guitar, piano, other; ou vocals e instrumental no modo karaokê) como arquivos de áudio independentes, com metadados relevantes. O objetivo é oferecer uma ferramenta autônoma, com integração simples ao fluxo do usuário (via Telegram) e sem dependência de GPU.

## 2. Contexto e Motivação (Problema, Evidências, Por que agora)
- Produtores, DJs e pesquisadores precisam de stems para remix, análise de mixagem e estudo de timbres.
- A biblioteca audio-separator[cpu] permite separação de fontes executada inteiramente no CPU, tornando-a adequada para ambientes locais com restrições de GPU ou conectividade.
- Disponibilizar uma skill local amplia privacidade, controle de dados e revela outputs reusáveis (stems) para pipelines posteriores.

## 3. Goals (G-01...) + tabela de métricas de sucesso
G-01 Executar separação de áudio usando audio-separator[cpu] com entrada fornecida pelo usuário.
G-02 Gerar stems com nomes padronizados: vocals, drums, bass, guitar, piano, other (e instrumental no modo karaokê).
G-03 Salvar stems em um diretório de saída com nomes consistentes e metadados da operação.
G-04 Fornecer feedback de progresso e logs simples.
G-05 Suportar formatos comuns de áudio de entrada (MP3, WAV, FLAC, OGG).

### Métricas de sucesso
| Métrica | Descrição | Meta | Frequência de medição |
|---|---|---|---|
| Sucesso de execução | Porcentagem de jobs concluídos sem falha | >= 95% | A cada execução |
| Compatibilidade de formatos | Input suportado e reconhecido | MP3, WAV, FLAC, OGG | Cada novo formato adicionado testado |
| Precisão percebida de stems (qualidade) | Avaliação qualitativa dos stems | Nota média ≥ 3.5/5 em avaliações de usuários | Mensal |
| Tempo de processamento | Tempo total de separação | <= 5x tempo real do áudio para áudios até 5 minutos em hardware comum | Por execução |
| Integridade de dados | Duração dos stems corresponde ao input (aprox) | Duração de cada stem dentro de ±1s da duração do input | Por execução |

## 4. Non-Goals (NG-01...)
- Não oferecer suporte a GPUs ou aceleração via CUDA/ROCm.
- Não habilitar streaming de áudio em tempo real.
- Não realizar remix automático; apenas exportação de stems.
- Não enviar arquivos para a nuvem; operação é estritamente local.

## 5. Usuários e Personas
- Produtor musical (PU): quer stems para remix e arranjos. Requer outputs estáveis e nomes consistentes.
- Estutando de música (EM): precisa de stems para extração de features e estudos de timbre e percepção musical. 
- Técnico de suporte/local user (TS): mantém a ferramenta e verifica compatibilidade com diferentes formatos.

## 6. Requisitos Funcionais
| ID | Requisito | Prioridade | Critério de Aceite |
|---|---|---|---|
| FR-01 | Carregar arquivo de áudio de entrada a partir de caminho local fornecido pelo usuário | Alta | O sistema lê o arquivo com sucesso e extrai metadados básicos (duração, sample rate, canais). |
| FR-02 | Executar separação usando audio-separator[cpu] | Alta | A função de separação é chamada com o modelo padrão `htdemucs_6s.yaml` (targets: vocals, drums, bass, guitar, piano, other) e retorna caminhos dos stems gerados. |
| FR-03 | Gerar stems em arquivos WAV com nomes padronizados | Alta | Opção 1.2 gera seis arquivos: inputname_vocals.wav, inputname_drums.wav, inputname_bass.wav, inputname_guitar.wav, inputname_piano.wav, inputname_other.wav. Opção 1.1 gera inputname_vocals.wav e inputname_instrumental.wav. Opção 1.3 gera só o arquivo do instrumento escolhido. Todos ficam no diretório de saída. |
| FR-04 | Suportar parâmetros de separação configuráveis | Média | Usuário escolhe uma das opções do Fluxo Principal (karaokê, todos os instrumentos ou um instrumento específico). Critério: cada opção executa o comando correspondente sem falhas. |
| FR-05 | Fornecer feedback de progresso | Média | Progresso exibido em mensagens de status durante a execução. |
| FR-06 | Exportar metadados da operação | Baixa | Arquivo JSON com input_hash, duração, sample_rate, tempo_decorrido, versão da lib e configuração gerado ao final. |
| FR-07 | Gerar relatório básico de falhas | Baixa | Em caso de erro, retornar código de erro legível e mensagem de diagnóstico. |

### Happy Path
- Usuário fornece caminho para um arquivo de áudio válido (ex.: music.mp3).
- O sistema lê o arquivo, executa a separação com audio-separator[cpu], gera os stems WAV da opção escolhida (6 na opção 1.2) e salva no diretório de saída. O bot Telegram recebe os arquivos com mensagens de status concluídas.

### Fluxo  Principal
1. O sistema disponibiliza as opções:
    1.1. Karaokê (voz principal / instrumental)
    1.2. Todos os instrumentos (Baixo, Bateria, Outros, Vocais, Guitarra, Piano)
    1.3. Separar um instrumento específico:
        1.3.1. Baixo
        1.3.2. Bateria
        1.3.3. Outros
        1.3.4. Vocais
        1.3.5. Guitarra
        1.3.6. Piano
2. O usuário manda a opção.
3. A LLM escolhe o comando de separação correspondente à opção (tabela abaixo) e o executa pela ferramenta `separar_audio`.

Comandos da CLI `audio-separator` 0.47.0. `<arquivo>` é o caminho do áudio em `workspace/entradas/` e `<saida>` é `workspace/stems/<nome>/`. Todos os comandos usam `--output_format=WAV`, pois o padrão da CLI é FLAC.

| Opção | Stems gerados | Comando |
|---|---|---|
| 1.1 | Vocals, Instrumental | `audio-separator <arquivo> --ensemble_preset=karaoke --output_format=WAV --output_dir=<saida>` |
| 1.2 | Vocals, Drums, Bass, Guitar, Piano, Other | `audio-separator <arquivo> -m htdemucs_6s.yaml --output_format=WAV --output_dir=<saida>` |
| 1.3.1 | Bass | `audio-separator <arquivo> -m htdemucs_6s.yaml --single_stem=Bass --output_format=WAV --output_dir=<saida>` |
| 1.3.2 | Drums | `audio-separator <arquivo> -m htdemucs_6s.yaml --single_stem=Drums --output_format=WAV --output_dir=<saida>` |
| 1.3.3 | Other | `audio-separator <arquivo> -m htdemucs_6s.yaml --single_stem=Other --output_format=WAV --output_dir=<saida>` |
| 1.3.4 | Vocals | `audio-separator <arquivo> -m htdemucs_6s.yaml --single_stem=Vocals --output_format=WAV --output_dir=<saida>` |
| 1.3.5 | Guitar | `audio-separator <arquivo> -m htdemucs_6s.yaml --single_stem=Guitar --output_format=WAV --output_dir=<saida>` |
| 1.3.6 | Piano | `audio-separator <arquivo> -m htdemucs_6s.yaml --single_stem=Piano --output_format=WAV --output_dir=<saida>` |

Observações:
- O modelo é passado com `-m`/`--model_filename` e o nome inclui a extensão (`htdemucs_6s.yaml`). A CLI não tem a opção `--model_name`.
- O preset `karaoke` combina 3 modelos Mel-Band RoFormer (`avg_wave`), então é bem mais lento na CPU que o Demucs.
- `htdemucs_6s` separa guitarra e piano com qualidade inferior aos demais stems (a lib não publica SDR para eles).


### Fluxos Alternativos
- FP-01 Formato não suportado: exibe mensagem de erro clara e sugere formatos suportados.
- FP-02 Falha de leitura do arquivo: diagnóstico de erro e instruções para tentar novamente com novo arquivo.
- FP-03 Parâmetros de separação inválidos: retorna erro de validação e mostra valores aceitos.

## 7. Requisitos Não-Funcionais
- Compatibilidade: funciona em ambientes Python 3.9+; CPU-only.
- Performance: se o hardware for limitado, o tempo de processamento pode subir; a UI deve refletir o tempo estimado de conclusão.
- Privacidade: processamento é local; nenhum envio para a nuvem.
- Tolerância a falhas: se a separação falhar, o sistema não trava; fornece log de erro.
- Observabilidade: logs simples (JSON) com informações de entrada, versão da biblioteca, timestamp e duração.

## 8. Design e Interface
- Interface de entrada: comando/fluxo para enviar caminho de arquivo; opção de configuração de targets.
- Interface de saída: stems WAV da opção escolhida com nomes padronizados, mais JSON de metadados; mensagens de status no Telegram com links ou anexos diretos.
- API interna (exposição de função): audio_separator_separate(input_path: str, targets: List[str] = [vocals, drums, bass, guitar, piano, other], output_dir: str, options: dict) -> Dict[str, Any]

## 9. Modelo de Dados
- InputAudio: {path, duration, sample_rate, channels, format}
- OutputStem: {name (vocals/drums/bass/guitar/piano/other/instrumental), path, duration, sample_rate}
- Job: {job_id, input_path, output_dir, status, started_at, finished_at, duration_ms, library_version, config}

## 10. Integrações e Dependências
- audio-separator[cpu] (dependência principal)
- Python 3.9+
- ffmpeg (para conversão se necessário)
- numpy, librosa, soundfile, pydub (para leitura/escrita e manipulação de áudio)
- integração com Telegram via bot local (Telegram API) para envio de stems e logs

## 11. Edge Cases e Tratamento de Erros (tabela Cenário | Trigger | Comportamento esperado)
| Cenário | Trigger | Comportamento esperado |
|---|---|---|
| Arquivo não existe | user fornece path inválido | Investiga e retorna mensagem de erro informando que o arquivo não foi encontrado. |
| Formato não suportado | input com formato não suportado | Retorna erro com lista de formatos suportados. |
| Falha durante a separação | exceção durante audio-separator[cpu] | Captura, registra o erro, retorna código + mensagem legível, não trava o sistema. |
| Falha de escrita de saída | diretório de saída sem permissão | Erro de permissão, sugere caminho de saída alternativo. |
| Memória insuficiente | queda de memória durante processamento | Alerta de memória, interrompe com fallback mínimo e limpa recursos. |

## 12. Segurança e Privacidade
- Operação estritamente local; nenhum envio de dados para a nuvem.
- Logs minimizados com apenas metadados do job; remover informações sensíveis ao final, se aplicável.
- Controle de acesso via Telegram: apenas o usuário autorizado pode iniciar ou baixar stems.

## 13. Plano de Rollout
- Fase 1: Prototipagem local (desenvolvedor/teste) com arquivos de áudio simples; validação de saída.
- Fase 2: Beta com 5-10 usuários experientes; coleta de feedback de qualidade/usuabilidade e métricas de desempenho.
- Fase 3: Lançamento estável para todos os usuários locais; monitoramento e atualizações periódicas.

## 14. Open Questions

### Decisões tomadas na implementação (2026-10-17)
- **Integração**: skill `.agents/skills/separador-audio` + ferramenta `separar_audio` do AgentLoop, que chama a CLI `audio-separator` (0.47.0) via child process instalada em `./.venv-audio` por `npm run setup:audio` (PyTorch CPU-only + `audioread`, ausente nas dependências da lib).
- **Modelo/targets padrão**: `htdemucs_6s.yaml` (Demucs, 6 stems: vocals, drums, bass, guitar, piano, other), conforme as opções do Fluxo Principal; um instrumento isolado usa `--single_stem`. Medido em 12 CPUs (áudio de 20 s, modelos em cache): `htdemucs_6s` ≈ 2,3× (6 stems) e ≈ 1,9× (um stem), dentro da meta ≤ 5×; preset `karaoke` ≈ 29×, fora da meta. Referência anterior em 12 CPUs: `htdemucs.yaml` (4 stems) ≈ 3,5× o tempo real e `htdemucs_ft.yaml` ≈ 13×.
- **Entrada pelo Telegram**: arquivos de música (MP3/WAV/FLAC/OGG enviados como áudio ou documento) são salvos em `workspace/entradas/` e repassados ao agente; voice notes continuam no Whisper. Limite de 20 MB do download de bots; acima disso o usuário copia o arquivo para `workspace/entradas/`.
- **Formatos**: apenas MP3, WAV, FLAC e OGG (M4A/AAC continuam em aberto).
- **Saída**: WAV em `workspace/stems/<nome>/`; para o Telegram, WAVs acima de 50 MB são enviados em MP3 320 kbps (o WAV permanece no disco). FLAC não foi adotado.
- **Áudios longos**: limite configurável `AUDIO_SEPARATOR_MAX_SECONDS` (padrão 15 min) e timeout `AUDIO_SEPARATOR_TIMEOUT_MS` (padrão 60 min).
- **Códigos de erro (FR-07)**: `NOT_FOUND`, `UNSUPPORTED_FORMAT`, `INVALID_TARGETS`, `TOO_LONG`, `READ_FAILED`, `NOT_INSTALLED`, `TIMEOUT`, `OUT_OF_MEMORY`, `SEPARATION_FAILED`, `WRITE_FAILED`.

### Ainda em aberto
- Quais formatos de entrada adicionais devem ser suportados (e.g., M4A, AAC) além de MP3/WAV/FLAC/OGG?
- O preset `karaoke` (≈ 29× o tempo real) não atende a meta ≤ 5×: trocar por um único modelo de karaokê, aceitar a lentidão ou limitar a duração?
- Há requisitos de integração com outras ferramentas do nosso fluxo de trabalho (DAW, reaper, etc.)?
- Quais informações de privacidade devem ser expostas aos usuários (hash do arquivo, consentimento, etc.)?
- Qual será a política de versionamento para o library audio-separator[cpu] (quando atualizar, compatibilidade de API)?
- Precisamos de suporte para usuários com baixa banda ou offline itens de pré-processamento (pré-separação em cache)?
