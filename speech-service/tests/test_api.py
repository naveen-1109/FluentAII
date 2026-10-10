import io
import os
import wave

os.environ["ASR_BACKEND"] = "stub"
os.environ["SERVICE_KEY"] = "test-key"

import pytest
from fastapi.testclient import TestClient

from app import main
from app.asr import AsrOutput


def make_wav(seconds=1.5, rate=16000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(b"\x00\x00" * int(rate * seconds))
    return buf.getvalue()


@pytest.fixture()
def client():
    main.SERVICE_KEY = "test-key"
    with TestClient(main.app) as c:
        yield c


def post(client, key="test-key", data=None, name="a.wav"):
    headers = {"X-Service-Key": key} if key else {}
    return client.post("/api/v1/transcribe", headers=headers,
                       files={"file": (name, data if data is not None else make_wav(), "audio/wav")})


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_requires_service_key(client):
    assert post(client, key=None).status_code == 401
    assert post(client, key="wrong").status_code == 401


def test_stub_flow_reports_true_duration_and_flags_stub(client):
    body = post(client).json()
    assert body["model"]["stub"] is True
    assert abs(body["duration_sec"] - 1.5) < 0.05
    assert body["transcript"] == "" and body["indicators"]["word_count"] == 0
    assert body["indicators"]["flow_index"] is None


def test_real_backend_output_is_turned_into_indicators(client, monkeypatch):
    words = [("so", 0.0, 0.3), ("i", 0.4, 0.6), ("i", 0.7, 0.9), ("want", 1.0, 1.3),
             ("to", 2.2, 2.4), ("go", 2.5, 2.8)]
    seg = {"start": 0.0, "end": 2.8, "text": "so i i want to go",
           "words": [{"word": w, "start": s, "end": e} for w, s, e in words]}

    class Fake:
        def transcribe(self, path):
            return AsrOutput("en", 0.98, 4.0, [seg], "base", "cpu", "int8")

    monkeypatch.setitem(main.state, "asr", Fake())
    body = post(client).json()
    ind = body["indicators"]
    assert body["transcript"] == "so i i want to go"
    assert ind["word_count"] == 6 and ind["repetition_count"] == 1
    assert ind["pause_count"] == 1 and ind["longest_pause_sec"] == 0.9
    assert body["model"] == {"name": "base", "device": "cpu", "compute_type": "int8", "stub": False}


def test_rejects_too_long_audio(client, monkeypatch):
    class Long:
        def transcribe(self, path):
            return AsrOutput("en", 0.9, 99999.0, [], "base", "cpu", "int8")
    monkeypatch.setitem(main.state, "asr", Long())
    assert post(client).status_code == 413


def test_decode_failure_is_422(client, monkeypatch):
    class Boom:
        def transcribe(self, path):
            raise ValueError("bad stream")
    monkeypatch.setitem(main.state, "asr", Boom())
    assert post(client).status_code == 422


def test_stub_refused_in_production(monkeypatch):
    from app.asr import load_backend
    monkeypatch.setenv("APP_ENV", "production")
    with pytest.raises(RuntimeError):
        load_backend()
