"""Creates clearly-labelled DEMO accounts and sessions so the interface can be
explored without real recordings.  Demo sessions use illustrative, made-up speech
timings -- they are NOT real analysis results and are marked "[Demo]" in the UI.

    python scripts/seed_demo.py --data-dir ../backend/data

Accounts (password for both: DemoPass123!)
    demo.patient@fluentai.test      demo.clinician@fluentai.test
"""
from __future__ import annotations

import argparse, json, math, random, re, sqlite3, struct, sys, uuid, wave
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.indicators import compute_indicators  # noqa: E402

try:
    import bcrypt
except ImportError:
    sys.exit("pip install bcrypt   (needed only for this demo seed script)")

PASSWORD = "DemoPass123!"
SCRIPTS = [
    ("[Demo] Morning reading", "reading", "the weather this morning was calm and clear so we decided to walk along the river before work and talk about the week ahead"),
    ("[Demo] Phone call practice", "conversation_practice", "hello i would like to book a table for two people on friday evening at around seven thirty if that is possible"),
    ("[Demo] Describing my weekend", "free_speech", "on saturday i went to the market with my sister and we bought fresh fruit and vegetables then we cooked dinner together at home"),
    ("[Demo] Breathing and phrasing", "breathing_exercise", "i take a slow breath and then i say one short sentence while my shoulders stay relaxed and my voice stays steady"),
    ("[Demo] Reading the news", "reading", "the city council announced a new plan to improve bus services across the north of town starting early next year"),
    ("[Demo] Talking about my job", "free_speech", "at work i help customers with questions about their accounts and i enjoy solving problems and learning something new every day"),
]


def schema_sql(root: Path) -> str:
    ts = (root / "backend" / "src" / "db.ts").read_text()
    m = re.search(r"const SCHEMA = `(.*?)`;", ts, re.S)
    if not m:
        sys.exit("Could not read the schema from backend/src/db.ts")
    return m.group(1)


def build_words(text: str, disfluency: int, rng: random.Random):
    """Illustrative timing model: word-level timestamps with a chosen amount of repeats/fillers/pauses."""
    toks = text.split()
    out: list[str] = []
    for i, t in enumerate(toks):
        out.append(t)
    # inject disfluencies at random positions
    for _ in range(disfluency):
        i = rng.randrange(2, len(out) - 1)
        kind = rng.choice(["repeat", "repeat", "filler", "sound"])
        if kind == "repeat":
            out.insert(i, out[i])
        elif kind == "filler":
            out.insert(i, rng.choice(["um", "uh"]))
        else:
            w = out[i]
            out[i] = f"{w[0]}-{w[0]}-{w}"
    words, t = [], 0.4
    pauses = max(1, disfluency // 2)
    pause_at = set(rng.sample(range(3, len(out) - 2), min(pauses, len(out) - 6)))
    for i, w in enumerate(out):
        dur = 0.18 + 0.045 * len(w.replace("-", ""))
        words.append({"word": w, "start": round(t, 2), "end": round(t + dur, 2), "probability": 0.95})
        t += dur + (rng.uniform(0.75, 1.3) if i in pause_at else rng.uniform(0.07, 0.16))
    return words, t + 0.5


def write_silence(path: Path, seconds: float, rate=16000):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(struct.pack("<h", 0) * int(rate * seconds))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="../backend/data")
    args = ap.parse_args()
    root = Path(__file__).resolve().parents[2]
    data = Path(args.data_dir).resolve()
    (data / "audio").mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(data / "fluentai.db")
    db.executescript(schema_sql(root))
    db.execute("PRAGMA foreign_keys = ON")
    now = datetime.now(timezone.utc)
    iso = lambda d: d.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    h = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(11)).decode()

    for email in ("demo.patient@fluentai.test", "demo.clinician@fluentai.test"):
        row = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            db.execute("DELETE FROM users WHERE id = ?", (row[0],))  # cascades
    pid, cid = str(uuid.uuid4()), str(uuid.uuid4())
    db.execute("INSERT INTO users VALUES (?,?,?,?,?,1,?)", (pid, "demo.patient@fluentai.test", h, "patient", "Demo Patient", iso(now)))
    db.execute("INSERT INTO users VALUES (?,?,?,?,?,1,?)", (cid, "demo.clinician@fluentai.test", h, "clinician", "Priya Raman (demo)", iso(now)))
    db.execute("INSERT INTO patient_profiles VALUES (?,?,?,?,1,1,?)", (pid, "25-34", "English", "Feel calmer on phone calls", iso(now)))
    db.execute(
        "INSERT INTO clinician_profiles VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)",
        (cid, "Dr", "Speech-language pathology (demo)", "Demo Fluency Clinic", "DEMO-0000", "Demo region", 8,
         "English, Hindi", "Demo profile created by the seed script. Not a real clinician.", 1, "verified", iso(now)),
    )
    # a second, unrelated demo clinician to populate the directory
    c2 = str(uuid.uuid4())
    db.execute("INSERT INTO users VALUES (?,?,?,?,?,1,?)", (c2, "demo.clinician2@fluentai.test", h, "clinician", "Arjun Mehta (demo)", iso(now)))
    db.execute(
        "INSERT INTO clinician_profiles VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)",
        (c2, "Mr", "Speech and language therapy (demo)", "Demo Community Health", "DEMO-0001", "Demo region", 4,
         "English, Tamil", "Demo profile created by the seed script. Not a real clinician.", 1, "verified", iso(now)),
    )

    rng = random.Random(7)
    disfl = [5, 4, 3, 2, 1, 1]  # gently improving, illustrative only
    session_ids = []
    for i, ((title, act, text), d) in enumerate(zip(SCRIPTS, disfl)):
        words, dur = build_words(text + ' ' + SCRIPTS[(i + 1) % len(SCRIPTS)][2], d, rng)  # ~50 words
        seg = [{"start": words[0]["start"], "end": words[-1]["end"], "text": " ".join(w["word"] for w in words), "words": words}]
        ind = compute_indicators(seg, dur)
        sid = str(uuid.uuid4()); session_ids.append(sid)
        path = data / "audio" / f"{sid}.wav"
        write_silence(path, dur)
        when = now - timedelta(days=(len(SCRIPTS) - i) * 5)
        db.execute(
            "INSERT INTO sessions VALUES (?,?,?,?,?,?,?, 'completed', NULL, ?, 'en', ?, ?, ?, ?, ?, ?)",
            (sid, pid, title, act, str(path), "audio/wav", path.stat().st_size, round(dur, 2), seg[0]["text"],
             json.dumps(ind), json.dumps(seg),
             json.dumps({"name": "demo", "device": "none", "compute_type": "none", "stub": False, "processing_ms": 0}),
             iso(when), iso(when)),
        )
    # an unanalysed recording to show the "Analyse" step
    sid = str(uuid.uuid4())
    path = data / "audio" / f"{sid}.wav"; write_silence(path, 6.0)
    db.execute(
        "INSERT INTO sessions (id, patient_id, title, activity, audio_path, audio_mime, audio_bytes, status, created_at) VALUES (?,?,?,?,?,?,?, 'uploaded', ?)",
        (sid, pid, "[Demo] New recording (not analysed yet)", "free_speech", str(path), "audio/wav", path.stat().st_size, iso(now)),
    )

    # consultation + sharing
    appt = lambda s, m, **k: db.execute(
        "INSERT INTO appointments VALUES (?,?,?,?,?,?,?,?,?,?)",
        (str(uuid.uuid4()), pid, cid, iso(now + timedelta(days=k.get("days", 3))), m, k.get("reason", ""), s, k.get("msg", ""), iso(now), iso(now)),
    )
    appt("accepted", "video", days=3, reason="I get blocks on phone calls and would like a plan.", msg="Looking forward to it. Please share a couple of sessions.")
    db.execute("INSERT INTO appointments VALUES (?,?,?,?,?,?,?,?,?,?)",
               (str(uuid.uuid4()), pid, c2, iso(now + timedelta(days=6)), "phone", "Second opinion on pacing.", "requested", "", iso(now), iso(now)))
    for sid in session_ids[-3:]:
        db.execute("INSERT INTO session_shares VALUES (?,?,?)", (sid, cid, iso(now)))
    db.execute("INSERT INTO session_notes VALUES (?,?,?,?,?)",
               (str(uuid.uuid4()), session_ids[-1], cid, "Demo note: steadier pacing in this one. Try keeping the same easy start on the phone-call script.", iso(now)))
    db.commit()
    print(f"Seeded demo data in {data}\n  patient:   demo.patient@fluentai.test\n  clinician: demo.clinician@fluentai.test\n  password:  {PASSWORD}")


if __name__ == "__main__":
    main()
