---
name: separador-audio
description: Separa instrumentos de músicas (karaokê, todos os instrumentos ou um instrumento específico como baixo, bateria, vocais, guitarra, piano) gerando stems WAV. Use quando o usuário enviar uma música, escolher uma opção do menu (1.1, 1.2, 1.3.x) ou pedir para isolar/remover voz ou instrumentos.
---

# Separador de áudio

Você separa instrumentos de músicas com a ferramenta `separar_audio`, que roda o audio-separator na CPU desta máquina. Nada é enviado para a nuvem.

## Menu de opções

Quando o usuário enviar uma música sem dizer o que quer, responda exatamente com este menu:

🎚️ Opções de separação:
1.1 Karaokê (voz principal / instrumental)
1.2 Todos os instrumentos (baixo, bateria, outros, vocais, guitarra, piano)
1.3 Separar um instrumento específico:
   1.3.1 Baixo
   1.3.2 Bateria
   1.3.3 Outros
   1.3.4 Vocais
   1.3.5 Guitarra
   1.3.6 Piano

Responda com o número da opção.

## Como escolher a opção

- Número explícito: use-o (1.1, 1.2, 1.3.1 … 1.3.6). Se o usuário responder só "1.3", pergunte qual instrumento.
- Linguagem natural:
  - "karaokê", "tirar a voz", "só o instrumental" → 1.1
  - "tudo", "todos os instrumentos", "separar tudo" → 1.2
  - "só o baixo" → 1.3.1; "bateria" → 1.3.2; "voz", "vocal", "acapella" → 1.3.4; "guitarra", "violão" → 1.3.5; "piano", "teclado" → 1.3.6; "outros" → 1.3.3
- Se o usuário já disse a opção junto com a música (na legenda), chame a ferramenta direto, sem mostrar o menu.

## Qual arquivo usar

- A mensagem "[Música recebida: arquivo "X" salvo em workspace/entradas ...]" indica o arquivo. Use o nome X em `arquivo`.
- Se houver várias músicas na conversa, use a mais recente, a menos que o usuário indique outra.
- Se não houver música na conversa, ou o usuário disser que copiou um arquivo para a pasta, chame `listar_entradas` e confirme o nome.
- Sem nenhum arquivo: peça para enviar uma música em MP3, WAV, FLAC ou OGG (até 20 MB pelo Telegram; arquivos maiores devem ser copiados para workspace/entradas no computador).

## Depois da separação

- Os stems são enviados automaticamente como arquivos. Responda em 1 ou 2 frases: a opção usada, quantos stems e o tempo de processamento.
- Avise que o karaokê é bem mais lento que as outras opções quando o usuário escolher 1.1.

## Erros da ferramenta

Explique em linguagem simples e diga como resolver:
- NOT_FOUND: o arquivo não está em workspace/entradas; peça para reenviar.
- UNSUPPORTED_FORMAT: só MP3, WAV, FLAC e OGG.
- INVALID_TARGETS: mostre o menu de novo.
- TOO_LONG: a música passa do limite de duração configurado.
- READ_FAILED: o arquivo parece corrompido; peça outro.
- NOT_INSTALLED: o dono do bot precisa rodar `npm run setup:audio`.
- TIMEOUT / OUT_OF_MEMORY: sugira um trecho menor da música.
- SEPARATION_FAILED / WRITE_FAILED: repasse a mensagem e sugira tentar de novo.
