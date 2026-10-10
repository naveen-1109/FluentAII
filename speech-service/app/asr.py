"""Speech-recognition backends.

* `FasterWhisperBackend` is the real backend (used by default).
* `StubBackend` runs NO recognition. It exists only so the rest of the system
  can be exercised on machines without the model; its output is flagged
  `stub: true` and the API refuses to start it in production.
"""
from __future__ import annotations

import os
import subprocess
import wave
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class AsrOutput:
    language: str | None
    language_probability: float | None
    duration_sec: float
    segments: list[dict[str, Any]]
    model_name: str
    device: str
    compute_type: str
    stub: bool = False
    extra: dict[str, Any] = field(default_factory=dict)


class AsrBackend(Protocol):
    def transcribe(self, path: str) -> AsrOutput: ...


# Prompt style that nudges Whisper towards verbatim output (keeps repeats/fillers
# more often). It is a heuristic, not a guarantee, and can be switched off.
VERBATIM_PROMPT = "Um, so I I want to, uh, go to the the shop. B-b-because we need milk."


class FasterWhisperBackend:
    def __init__(self) -> None:
        from faster_whisper import WhisperModel  # imported lazily: heavy dependency

        self.model_name = os.getenv("WHISPER_MODEL", "base")
        self.device = os.getenv("WHISPER_DEVICE", "cpu")
        self.compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
        self.language = os.getenv("WHISPER_LANGUAGE") or None  # None = auto-detect
        self.vad = os.getenv("WHISPER_VAD", "false").lower() == "true"
        self.verbatim = os.getenv("WHISPER_VERBATIM_PROMPT", "true").lower() == "true"
        self.beam_size = int(os.getenv("WHISPER_BEAM_SIZE", "5"))
        self.model = WhisperModel(
            self.model_name, device=self.device, compute_type=self.compute_type
        )

    def transcribe(self, path: str) -> AsrOutput:
        segments_iter, info = self.model.transcribe(
            path,
            language=self.language,
            beam_size=self.beam_size,
            word_timestamps=True,
            vad_filter=self.vad,
            condition_on_previous_text=False,
            initial_prompt=VERBATIM_PROMPT if self.verbatim else None,
        )
        segments: list[dict[str, Any]] = []
        for s in segments_iter:
            segments.append(
                {
                    "start": float(s.start),
                    "end": float(s.end),
                    "text": s.text.strip(),
                    "words": [
                        {
                            "word": w.word.strip(),
                            "start": float(w.start),
                            "end": float(w.end),
                            "probability": float(w.probability),
                        }
                        for w in (s.words or [])
                    ],
                }
            )
        return AsrOutput(
            language=info.language,
            language_probability=float(info.language_probability),
            duration_sec=float(info.duration),
            segments=segments,
            model_name=self.model_name,
            device=self.device,
            compute_type=self.compute_type,
        )


def _probe_duration(path: str) -> float:
    try:
        with wave.open(path, "rb") as w:
            return w.getnframes() / float(w.getframerate())
    except Exception:
        pass
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", path],
            capture_output=True, text=True, timeout=15,
        )
        return float(out.stdout.strip())
    except Exception:
        return 0.0


class StubBackend:
    """No recognition at all: returns an empty transcript and the true duration."""

    def transcribe(self, path: str) -> AsrOutput:
        return AsrOutput(
            language=None,
            language_probability=None,
            duration_sec=_probe_duration(path),
            segments=[],
            model_name="stub",
            device="none",
            compute_type="none",
            stub=True,
        )


def load_backend() -> AsrBackend:
    kind = os.getenv("ASR_BACKEND", "faster-whisper")
    if kind == "stub":
        if os.getenv("APP_ENV", "development") == "production":
            raise RuntimeError("ASR_BACKEND=stub is not allowed in production.")
        return StubBackend()
    return FasterWhisperBackend()
