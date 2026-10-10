"""Real-browser walkthrough (Playwright + Chromium with a fake microphone).

Requires: pip install playwright bcrypt && playwright install chromium, and `npm run build` in frontend/.
Seeds a throw-away demo database, then drives patient, clinician, new-user and mobile flows,
saving screenshots to qa/screenshots/ and reporting console errors.
"""
import os, signal, subprocess, sys, time, urllib.request, json
from playwright.sync_api import sync_playwright, expect

import tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "qa", "screenshots")
os.makedirs(OUT, exist_ok=True)
DATA = tempfile.mkdtemp(prefix="fluentai-ui-")
subprocess.run([sys.executable, os.path.join(ROOT, "speech-service", "scripts", "seed_demo.py"), "--data-dir", DATA], check=True)
procs = []
def start(cmd, cwd, env):
    p = subprocess.Popen(cmd, cwd=cwd, env={**os.environ, **env}, stdout=open(f"{OUT}/{env.get('TAG','x')}.log","w"), stderr=subprocess.STDOUT)
    procs.append(p); return p
def wait(url, s=40):
    end = time.time()+s
    while time.time() < end:
        try: urllib.request.urlopen(url, timeout=2); return
        except Exception: time.sleep(0.4)
    raise SystemExit("timeout "+url)

problems = []
def hook(page, label):
    page.on("pageerror", lambda e: problems.append(f"[{label}] pageerror: {e}"))
    page.on("console", lambda m: problems.append(f"[{label}] console.{m.type}: {m.text}") if m.type in ("error",) else None)
    page.on("response", lambda r: problems.append(f"[{label}] HTTP {r.status} {r.url}") if r.status >= 500 else None)

try:
    start([sys.executable,"-m","uvicorn","app.main:app","--port","8000"], f"{ROOT}/speech-service", {"ASR_BACKEND":"stub","TAG":"speech"})
    wait("http://127.0.0.1:8000/health")
    start(["npx","tsx","src/server.ts"], f"{ROOT}/backend", {"PORT":"4000","DATA_DIR":DATA,"AUTO_VERIFY_CLINICIANS":"true","TAG":"api"})
    wait("http://127.0.0.1:4000/api/v1/health")
    B = "http://127.0.0.1:4000"

    with sync_playwright() as p:
        br = p.chromium.launch(args=["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"])
        ctx = br.new_context(viewport={"width":1280,"height":900}, permissions=["microphone"])
        page = ctx.new_page(); hook(page,"patient")

        page.goto(B+"/"); page.wait_for_selector("text=Understand your speech")
        page.screenshot(path=f"{OUT}/01_landing.png", full_page=True)

        page.goto(B+"/app"); page.wait_for_url("**/login")      # guard redirects
        page.screenshot(path=f"{OUT}/02_login.png")
        page.get_by_label("Email").fill("demo.patient@fluentai.test")
        page.get_by_label("Password").fill("wrong-password")
        page.get_by_role("button", name="Sign in").click()
        page.wait_for_selector("text=Email or password is incorrect")
        page.get_by_label("Password").fill("DemoPass123!")
        page.get_by_role("button", name="Sign in").click()
        page.wait_for_url("**/app"); page.wait_for_selector("text=Hello, Demo")
        page.wait_for_selector("text=Latest analysed session")
        page.screenshot(path=f"{OUT}/03_patient_dashboard.png", full_page=True)

        page.get_by_role("link", name="My sessions").click(); page.wait_for_selector("table")
        page.screenshot(path=f"{OUT}/04_sessions.png", full_page=True)

        page.get_by_role("link", name="[Demo] Talking about my job").click()
        page.wait_for_selector("text=Flow index"); page.wait_for_selector("text=Transcript")
        page.screenshot(path=f"{OUT}/05_session_detail.png", full_page=True)

        page.goto(B+"/app/sessions"); page.get_by_role("link", name="[Demo] New recording (not analysed yet)").click()
        page.wait_for_selector("text=Ready to analyse")
        page.screenshot(path=f"{OUT}/06_session_uploaded.png")

        page.get_by_role("link", name="Find a clinician").first.click(); page.wait_for_selector("text=Priya Raman")
        page.get_by_role("button", name="Request a consultation").first.click()
        page.wait_for_selector("text=Preferred date and time")
        page.screenshot(path=f"{OUT}/07_clinicians_booking.png", full_page=True)

        page.get_by_role("link", name="Consultations").click(); page.wait_for_selector("text=Confirmed")
        page.screenshot(path=f"{OUT}/08_appointments.png", full_page=True)

        page.goto(B+"/app/record"); page.wait_for_selector("text=Start recording")
        page.screenshot(path=f"{OUT}/09_record.png", full_page=True)
        page.get_by_role("button", name="Sign out").click(); page.wait_for_url(B+"/")

        # ---- clinician ----
        c2 = br.new_context(viewport={"width":1280,"height":900}); cp = c2.new_page(); hook(cp,"clinician")
        cp.goto(B+"/login"); cp.get_by_label("Email").fill("demo.clinician@fluentai.test"); cp.get_by_label("Password").fill("DemoPass123!")
        cp.get_by_role("button", name="Sign in").click(); cp.wait_for_selector("text=Welcome, Priya")
        cp.screenshot(path=f"{OUT}/10_clinician_dashboard.png", full_page=True)
        cp.get_by_role("link", name="My patients").click(); cp.get_by_role("link", name="Demo Patient").click()
        cp.wait_for_selector("text=Flow index over shared sessions")
        cp.screenshot(path=f"{OUT}/11_clinician_patient.png", full_page=True)
        cp.get_by_role("link", name="[Demo] Talking about my job").click(); cp.wait_for_selector("text=Add a note for the patient")
        cp.get_by_label("Add a note for the patient").fill("Browser QA note")
        cp.get_by_role("button", name="Save note").click(); cp.wait_for_selector("text=Browser QA note")
        cp.screenshot(path=f"{OUT}/12_clinician_session.png", full_page=True)
        # privacy: unshared demo session must not be reachable for the clinician
        r = c2.request.get(B+"/api/v1/sessions/00000000-0000-0000-0000-000000000000", headers={"X-Requested-With":"fluentai"})
        assert r.status == 404, r.status

        # ---- brand-new patient: signup -> registration -> record (fake mic) -> analyse ----
        c3 = br.new_context(viewport={"width":1280,"height":900}, permissions=["microphone"]); np_ = c3.new_page(); hook(np_,"newpatient")
        np_.goto(B+"/signup")
        np_.get_by_label("Full name").fill("Browser Tester"); np_.get_by_label("Email").fill(f"bt{int(time.time())}@example.com")
        np_.get_by_label("Password").fill("Str0ngPassw0rd!")
        np_.get_by_label("I agree to the terms of use", exact=False).check()
        np_.screenshot(path=f"{OUT}/13_signup.png", full_page=True)
        np_.get_by_role("button", name="Continue").click(); np_.wait_for_url("**/register")
        np_.get_by_label("Age group").select_option("25-34")
        np_.get_by_label("I am 18 or older", exact=False).check()
        np_.get_by_label("I agree that FluentAI may store", exact=False).check()
        np_.get_by_label("I confirm these details", exact=False).check()
        np_.screenshot(path=f"{OUT}/14_register.png", full_page=True)
        np_.get_by_role("button", name="Complete registration").click(); np_.wait_for_url("**/app")
        np_.wait_for_selector("text=Make your first recording")
        np_.screenshot(path=f"{OUT}/15_empty_dashboard.png", full_page=True)
        np_.goto(B+"/app/record"); np_.get_by_role("button", name="Start recording").click()
        np_.wait_for_selector("text=Recording…"); time.sleep(2.6)
        np_.screenshot(path=f"{OUT}/16_recording.png")
        np_.get_by_role("button", name="Stop").click(); np_.wait_for_selector("text=Recording ready")
        np_.get_by_role("button", name="Save and analyse").click()
        np_.wait_for_url("**/app/sessions/*"); np_.wait_for_selector("text=Test mode", timeout=20000)
        np_.screenshot(path=f"{OUT}/17_new_session_result.png", full_page=True)

        # mobile
        mc = br.new_context(viewport={"width":390,"height":844}, device_scale_factor=2); mp = mc.new_page(); hook(mp,"mobile")
        mp.goto(B+"/"); mp.screenshot(path=f"{OUT}/18_mobile_landing.png", full_page=True)
        mp.goto(B+"/login"); mp.get_by_label("Email").fill("demo.patient@fluentai.test"); mp.get_by_label("Password").fill("DemoPass123!")
        mp.get_by_role("button", name="Sign in").click(); mp.wait_for_selector("text=Hello, Demo")
        mp.screenshot(path=f"{OUT}/19_mobile_dashboard.png", full_page=True)
        br.close()
    print("UI QA flow completed")
finally:
    for p in procs: p.send_signal(signal.SIGTERM)
    for p in procs:
        try: p.wait(timeout=5)
        except Exception: p.kill()
    print("problems:", len(problems))
    for x in problems[:25]: print(" ", x)
