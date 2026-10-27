#!/usr/bin/env bash
# Cria ./.venv-audio com audio-separator[cpu] (separação de stems), faster-whisper (STT local) e edge-tts (TTS).
set -euo pipefail

cd "$(dirname "$0")/.."
VENV=".venv-audio"
PYTHON="${PYTHON:-python3}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg não encontrado. Instale com: sudo apt install ffmpeg" >&2
  exit 1
fi

if [ ! -d "$VENV" ]; then
  "$PYTHON" -m venv "$VENV"
fi

"$VENV/bin/pip" install --upgrade pip
# PyTorch CPU-only (evita baixar as bibliotecas CUDA)
"$VENV/bin/pip" install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
# audioread não vem nas dependências da lib, mas é usado na leitura de MP3
"$VENV/bin/pip" install "audio-separator[cpu]==0.47.0" audioread faster-whisper edge-tts

"$VENV/bin/audio-separator" --version
echo "Ambiente de áudio pronto em $VENV"

# Baixa o modelo do Whisper agora, para a primeira voice note não estourar o timeout
WHISPER_MODEL="${WHISPER_MODEL:-$(grep -s '^WHISPER_MODEL=' .env | cut -d= -f2)}"
"$VENV/bin/python" scripts/transcribe.py --download-only --model "${WHISPER_MODEL:-base}" none
echo "Modelo Whisper '${WHISPER_MODEL:-base}' pronto"
