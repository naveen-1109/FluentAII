"""Starts the real speech service (stub ASR) and the real API, then walks the whole
patient -> clinician flow over HTTP with the production code paths."""
import json, os, signal, subprocess, sys, tempfile, time, wave, struct, math, urllib.request, urllib.error, http.cookiejar, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = tempfile.mkdtemp(prefix="fluentai-e2e-")
procs = []

def start(cmd, cwd, env):
    p = subprocess.Popen(cmd, cwd=cwd, env={**os.environ, **env}, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    procs.append(p); return p

def wait_http(url, secs=40):
    end = time.time() + secs
    while time.time() < end:
        try:
            urllib.request.urlopen(url, timeout=2); return
        except Exception: time.sleep(0.4)
    raise SystemExit(f"timeout waiting for {url}")

def make_wav(seconds=2.0, rate=16000):
    f = os.path.join(DATA, "tone.wav")
    with wave.open(f, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", int(8000*math.sin(2*math.pi*220*i/rate))) for i in range(int(rate*seconds))))
    return open(f, "rb").read()

class Client:
    def __init__(self, base):
        self.base = base; self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def call(self, method, path, body=None, multipart=None):
        h = {"X-Requested-With": "fluentai"}; data = None
        if multipart:
            b = uuid.uuid4().hex; parts = []
            for k, v in multipart["fields"].items():
                parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
            parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode() + multipart["file"] + f'\r\n--{b}--\r\n'.encode())
            data = b"".join(parts); h["Content-Type"] = f"multipart/form-data; boundary={b}"
        elif body is not None:
            data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with self.op.open(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

def check(label, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + label + (f"  {extra}" if extra and not cond else ""))
    if not cond: raise SystemExit(1)

try:
    start([sys.executable, "-m", "uvicorn", "app.main:app", "--port", "8765"], os.path.join(ROOT, "speech-service"),
          {"ASR_BACKEND": "stub", "SERVICE_KEY": "e2e-key"})
    wait_http("http://127.0.0.1:8765/health")
    start(["npx", "tsx", "src/server.ts"], os.path.join(ROOT, "backend"),
          {"PORT": "4567", "DATA_DIR": DATA, "SPEECH_SERVICE_URL": "http://127.0.0.1:8765", "SPEECH_SERVICE_KEY": "e2e-key",
           "AUTO_VERIFY_CLINICIANS": "true", "JWT_SECRET": "e2e-secret-e2e-secret", "NODE_ENV": "development"})
    wait_http("http://127.0.0.1:4567/api/v1/health")
    base = "http://127.0.0.1:4567/api/v1"
    st, h = Client(base).call("GET", "/health")
    check("API health reports speech service reachable", st == 200 and h["speechService"] is True, str(h))

    pat, doc = Client(base), Client(base)
    pw = "Str0ngPassw0rd!"
    check("patient signup", pat.call("POST", "/auth/signup", dict(fullName="Asha K", email="asha@example.com", password=pw, role="patient", acceptTerms=True))[0] == 201)
    check("patient registration", pat.call("PUT", "/profile", dict(confirmAdult=True, ageGroup="25-34", primaryLanguage="English", goals="", consentVoiceProcessing=True, consentTerms=True))[0] == 200)
    check("clinician signup+registration",
          doc.call("POST", "/auth/signup", dict(fullName="Dana Doc", email="dana@example.com", password=pw, role="clinician", acceptTerms=True))[0] == 201
          and doc.call("PUT", "/profile", dict(title="Dr", specialty="Speech-language pathology", organisation="Clinic", licenseNumber="SLP-1001", licenseRegion="Rehabilitation Council of India", licenseExpiry=f"{__import__('datetime').date.today().year + 2}-06-30", yearsExperience=5, languages="English", bio="", acceptsNewPatients=True, consentTerms=True))[0] == 200)

    st, up = pat.call("POST", "/sessions", multipart=dict(fields=dict(title="E2E", activity="reading"), file=make_wav(2.0)))
    check("upload recording", st == 201 and up["session"]["status"] == "uploaded", str(up))
    sid = up["session"]["id"]
    st, _ = pat.call("POST", f"/sessions/{sid}/transcribe")
    check("analyse accepted (202)", st == 202)
    for _ in range(40):
        st, d = pat.call("GET", f"/sessions/{sid}")
        if d["session"]["status"] != "processing": break
        time.sleep(0.3)
    s = d["session"]
    check("session completed through real service", s["status"] == "completed", json.dumps(s)[:300])
    check("duration measured from real file (~2s)", abs(s["durationSec"] - 2.0) < 0.1, str(s["durationSec"]))
    check("stub flag carried through to API", s["model"]["stub"] is True)

    st, ap = pat.call("GET", "/clinicians")
    cid = ap["clinicians"][0]["id"]
    start_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 86400))
    st, b = pat.call("POST", "/appointments", dict(clinicianId=cid, requestedStart=start_iso, mode="video", reason="Help"))
    check("patient requests consultation", st == 201)
    st, al = doc.call("GET", "/appointments")
    check("clinician sees the request", st == 200 and al["appointments"][0]["otherName"] == "Asha K")
    check("clinician accepts", doc.call("PATCH", f"/appointments/{b['id']}", dict(status="accepted", clinicianMessage="Welcome"))[0] == 200)
    check("patient shares session", pat.call("PUT", f"/sessions/{sid}/shares", dict(clinicianIds=[cid]))[0] == 200)
    st, view = doc.call("GET", f"/sessions/{sid}")
    check("clinician can open shared session", st == 200 and view["access"] == "clinician")
    check("clinician adds note", doc.call("POST", f"/sessions/{sid}/notes", dict(body="Nice work"))[0] == 201)
    st, view = pat.call("GET", f"/sessions/{sid}")
    check("patient sees the note", view["notes"][0]["body"] == "Nice work")
    print("\nALL END-TO-END CHECKS PASSED")
finally:
    for p in procs:
        p.send_signal(signal.SIGTERM)
    for p in procs:
        try: p.wait(timeout=5)
        except Exception: p.kill()
