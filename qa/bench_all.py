"""Measures the FluentAI software layers on the machine it runs on and writes results.json.

  1. indicator engine: compute time against transcript length
  2. API: request latency for the main endpoints (real Express + SQLite server)
  3. pipeline: orchestration time from 'Analyse' to 'completed' for recordings of different length,
     with the recognizer replaced by the stub (so the figure isolates upload, queue, HTTP forwarding,
     indicator computation and database writes)

    python qa/bench_all.py [output.json]
"""
import http.client, json, os, platform, random, signal, statistics as st, struct, subprocess, sys, tempfile, time, uuid, wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "qa", "bench_results.json")
sys.path.insert(0, os.path.join(ROOT, "speech-service"))
from app.indicators import compute_indicators  # noqa: E402

res = {"env": {"python": platform.python_version(), "platform": platform.platform(),
               "cpu": next((l.split(':', 1)[1].strip() for l in open('/proc/cpuinfo') if l.startswith('model name')), '?'),
               "cores": os.cpu_count()}}

def pct(a, q):
    a = sorted(a); k = (len(a) - 1) * q; f = int(k); c = min(f + 1, len(a) - 1)
    return a[f] + (a[c] - a[f]) * (k - f)

# ---------- 1. indicator engine ----------
def make_segments(n, seed=1):
    rng = random.Random(seed); t = 0.3; words = []; i = 0
    while len(words) < n:
        w = f"w{i % 97}"; i += 1
        dur = 0.18 + 0.03 * rng.random() * 5
        words.append({"word": w, "start": round(t, 3), "end": round(t + dur, 3)})
        t += dur + (rng.uniform(0.6, 1.2) if rng.random() < 0.025 else rng.uniform(0.05, 0.15))
        if rng.random() < 0.05 and len(words) < n:      # immediate repeat
            words.append({"word": w, "start": round(t, 3), "end": round(t + 0.2, 3)}); t += 0.3
        if rng.random() < 0.01 and len(words) < n:      # filler
            words.append({"word": "um", "start": round(t, 3), "end": round(t + 0.25, 3)}); t += 0.35
    words = words[:n]
    segs = [{"start": words[k]["start"], "end": words[min(k + 11, n - 1)]["end"], "text": "",
             "words": words[k:k + 12]} for k in range(0, n, 12)]
    return segs, words[-1]["end"] + 0.5

ind = []
for n in [50, 100, 250, 500, 1000, 2500, 5000]:
    segs, dur = make_segments(n)
    reps = max(30, 40000 // n); ts = []
    for _ in range(5): compute_indicators(segs, dur)           # warm-up
    for _ in range(reps):
        a = time.perf_counter(); compute_indicators(segs, dur); ts.append((time.perf_counter() - a) * 1000)
    ind.append({"words": n, "runs": reps, "median_ms": st.median(ts), "q1_ms": pct(ts, .25), "q3_ms": pct(ts, .75)})
res["indicators"] = ind
print("indicator engine:", [(r["words"], round(r["median_ms"], 3)) for r in ind])

# ---------- servers ----------
DATA = tempfile.mkdtemp(prefix="fluentai-bench-")
subprocess.run([sys.executable, os.path.join(ROOT, "speech-service", "scripts", "seed_demo.py"), "--data-dir", DATA],
               check=True, stdout=subprocess.DEVNULL)
procs = []
def start(cmd, cwd, env):
    p = subprocess.Popen(cmd, cwd=cwd, env={**os.environ, **env}, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT); procs.append(p)
def wait(port, path):
    end = time.time() + 40
    while time.time() < end:
        try:
            c = http.client.HTTPConnection("127.0.0.1", port, timeout=2); c.request("GET", path); c.getresponse().read(); return
        except Exception: time.sleep(0.4)
    raise SystemExit("timeout")

class Client:
    def __init__(self, port):
        self.c = http.client.HTTPConnection("127.0.0.1", port, timeout=60); self.cookie = None
    def req(self, method, path, body=None, raw=None, headers=None):
        h = {"X-Requested-With": "fluentai", **(headers or {})}
        if self.cookie: h["Cookie"] = self.cookie
        data = raw
        if body is not None: data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
        a = time.perf_counter()
        self.c.request(method, "/api/v1" + path, body=data, headers=h)
        r = self.c.getresponse(); payload = r.read()
        ms = (time.perf_counter() - a) * 1000
        sc = r.getheader("Set-Cookie")
        if sc: self.cookie = sc.split(";")[0]
        return r.status, (json.loads(payload) if payload else {}), ms

def wav_bytes(seconds, rate=16000):
    f = tempfile.NamedTemporaryFile(suffix=".wav", delete=False); f.close()
    with wave.open(f.name, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(struct.pack("<h", 0) * int(rate * seconds))
    b = open(f.name, "rb").read(); os.unlink(f.name); return b

def multipart(fields, fileb):
    b = uuid.uuid4().hex; parts = []
    for k, v in fields.items(): parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode() + fileb + f'\r\n--{b}--\r\n'.encode())
    return b"".join(parts), {"Content-Type": f"multipart/form-data; boundary={b}"}

try:
    start([sys.executable, "-m", "uvicorn", "app.main:app", "--port", "8101"], os.path.join(ROOT, "speech-service"),
          {"ASR_BACKEND": "stub", "SERVICE_KEY": "bench-key"})
    wait(8101, "/health")
    start(["npx", "tsx", "src/server.ts"], os.path.join(ROOT, "backend"),
          {"PORT": "4101", "NODE_ENV": "test", "DATA_DIR": DATA, "SPEECH_SERVICE_URL": "http://127.0.0.1:8101",
           "SPEECH_SERVICE_KEY": "bench-key", "AUTO_VERIFY_CLINICIANS": "true", "JWT_SECRET": "bench-secret-bench-secret"})
    wait(4101, "/api/v1/health")
    cl = Client(4101)
    s, d, _ = cl.req("POST", "/auth/login", {"email": "demo.patient@fluentai.test", "password": "DemoPass123!"})
    assert s == 200, d
    sessions = cl.req("GET", "/sessions")[1]["sessions"]
    done = next(x for x in sessions if x["status"] == "completed")["id"]
    body, hdr = multipart({"title": "bench", "activity": "free_speech"}, wav_bytes(3.0))

    # ---------- 2. API latency ----------
    def bench(label, fn, n, warm=5):
        for _ in range(warm): fn()
        ts = [fn() for _ in range(n)]
        r = {"endpoint": label, "runs": n, "median_ms": st.median(ts), "p95_ms": pct(ts, .95)}
        print(f"  {label:34s} median {r['median_ms']:8.2f} ms   p95 {r['p95_ms']:8.2f} ms"); return r
    hc = http.client.HTTPConnection("127.0.0.1", 4101, timeout=30)
    def health():
        a = time.perf_counter(); hc.request("GET", "/api/v1/health"); hc.getresponse().read(); return (time.perf_counter() - a) * 1000
    api = [bench("GET /health (with speech-service ping)", health, 200),
           bench("GET /auth/me", lambda: cl.req("GET", "/auth/me")[2], 200),
           bench("GET /sessions (7 sessions)", lambda: cl.req("GET", "/sessions")[2], 200),
           bench("GET /sessions/:id (analysed)", lambda: cl.req("GET", f"/sessions/{done}")[2], 200),
           bench("POST /sessions (96 KB upload)", lambda: cl.req("POST", "/sessions", raw=body, headers=hdr)[2], 60),
           bench("POST /auth/login (bcrypt)", lambda: cl.req("POST", "/auth/login", {"email": "demo.patient@fluentai.test", "password": "DemoPass123!"})[2], 25, warm=2)]
    res["api"] = api

    # ---------- 3. pipeline orchestration (stub recognizer) ----------
    pipe = []
    for dur in [2, 10, 30, 60, 120]:
        b, h = multipart({"title": f"pipe{dur}", "activity": "reading"}, wav_bytes(dur))
        ups, tot = [], []
        for _ in range(10):
            s, d, up_ms = cl.req("POST", "/sessions", raw=b, headers=h); assert s == 201, d
            sid = d["session"]["id"]
            a = time.perf_counter(); cl.req("POST", f"/sessions/{sid}/transcribe")
            while True:
                s, d, _ = cl.req("GET", f"/sessions/{sid}")
                if d["session"]["status"] in ("completed", "failed"): break
                time.sleep(0.005)
            assert d["session"]["status"] == "completed", d["session"]
            tot.append((time.perf_counter() - a) * 1000); ups.append(up_ms)
        pipe.append({"audio_s": dur, "file_kb": round(len(b) / 1024), "runs": 10,
                     "upload_median_ms": st.median(ups), "analyse_median_ms": st.median(tot),
                     "analyse_min_ms": min(tot), "analyse_max_ms": max(tot)})
        print(f"  audio {dur:>3}s  upload {st.median(ups):7.1f} ms   analyse->completed {st.median(tot):7.1f} ms (min {min(tot):.1f}, max {max(tot):.1f})")
    res["pipeline"] = pipe
finally:
    for p in procs: p.send_signal(signal.SIGTERM)
    for p in procs:
        try: p.wait(timeout=5)
        except Exception: p.kill()
json.dump(res, open(OUT, "w"), indent=2)
print("written", OUT)
