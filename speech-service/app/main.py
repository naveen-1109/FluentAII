from __future__ import annotations

import hmac
import os
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile

from .asr import AsrBackend, load_backend
from .indicators import compute_indicators

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "25")) * 1024 * 1024
MAX_AUDIO_SECONDS = float(os.getenv("MAX_AUDIO_SECONDS", "900"))
PAUSE_THRESHOLD = float(os.getenv("PAUSE_THRESHOLD_SEC", "0.5"))
SERVICE_KEY = os.getenv("SERVICE_KEY", "dev-service-key")
ALLOWED_SUFFIX = {".webm", ".ogg", ".wav", ".mp3", ".m4a", ".aac", ".bin", ""}

state: dict[str, AsrBackend] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    if os.getenv("APP_ENV") == "production" and SERVICE_KEY == "dev-service-key":
        raise RuntimeError("Set SERVICE_KEY to a private value in production.")
    state["asr"] = load_backend()
    yield
    state.clear()


app = FastAPI(title="FluentAI speech service", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, object]:
    asr = state.get("asr")
    return {"ok": asr is not None, "backend": type(asr).__name__ if asr else None}


@app.post("/api/v1/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    x_service_key: str | None = Header(default=None),
) -> dict[str, object]:
    if not x_service_key or not hmac.compare_digest(x_service_key, SERVICE_KEY):
        raise HTTPException(status_code=401, detail="Invalid service key.")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIX:
        suffix = ".bin"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
        size = 0
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                Path(tmp_path).unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Audio file too large.")
            tmp.write(chunk)
    try:
        started = time.perf_counter()
        try:
            out = state["asr"].transcribe(tmp_path)
        except Exception as exc:  # decoding / model errors
            raise HTTPException(status_code=422, detail=f"Could not decode audio: {exc}") from exc
        if out.duration_sec > MAX_AUDIO_SECONDS:
            raise HTTPException(
                status_code=413,
                detail=f"Recording is longer than {int(MAX_AUDIO_SECONDS)} seconds.",
            )
        indicators = compute_indicators(out.segments, out.duration_sec, PAUSE_THRESHOLD)
        transcript = " ".join(s["text"] for s in out.segments).strip()
        return {
            "language": out.language,
            "language_probability": out.language_probability,
            "duration_sec": round(out.duration_sec, 2),
            "transcript": transcript,
            "segments": out.segments,
            "indicators": indicators,
            "model": {
                "name": out.model_name,
                "device": out.device,
                "compute_type": out.compute_type,
                "stub": out.stub,
            },
            "processing_ms": int((time.perf_counter() - started) * 1000),
        }
    finally:
        Path(tmp_path).unlink(missing_ok=True)
