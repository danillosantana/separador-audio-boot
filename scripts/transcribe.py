"""Transcreve um arquivo de áudio com faster-whisper (CPU) e imprime JSON {"text", "language"}.

O áudio é decodificado pelo ffmpeg do sistema: o decodificador interno do faster-whisper 1.2
é incompatível com PyAV >= 15 (argumento metadata_errors removido).
"""
import argparse
import json
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

SAMPLE_RATE = 16000


def decode(path: str) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-nostdin", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("file")
    parser.add_argument("--model", default="base")
    parser.add_argument("--language", default="")
    parser.add_argument("--download-only", action="store_true")
    args = parser.parse_args()

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    if args.download_only:
        print(json.dumps({"text": "", "language": None}))
        return 0

    segments, info = model.transcribe(decode(args.file), language=args.language or None, vad_filter=True)
    text = " ".join(segment.text.strip() for segment in segments).strip()
    print(json.dumps({"text": text, "language": info.language}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
