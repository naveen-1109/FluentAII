# FluentAI

A speech-practice support application for people who stutter, with a way to connect with healthcare professionals.

- **People who stutter** record or upload speech, get insights (pace, pauses, repetitions, fillers, a "flow index"), track progress, request consultations, and choose which sessions to share.
- **Clinicians** register with licence details, accept consultation requests, and review only the sessions their patients share, leaving notes.

> FluentAI gives practice insights. It does not diagnose or treat stuttering, and it is not a substitute for care from a qualified speech-language pathologist.

## Architecture

```
Browser (React + TypeScript + Tailwind)
   │  httpOnly cookie, same origin (/api/v1)
   ▼
API (Node + Express + TypeScript, SQLite)      ──►  Speech service (Python + FastAPI + faster-whisper)
   • accounts, roles, consent                        • transcription with word timestamps
   • sessions, sharing, notes, appointments          • indicators (pace, pauses, repeats, fillers, flow index)
   • audio files on local disk (DATA_DIR/audio)
```

| Folder | What it is |
|---|---|
| `frontend/` | React app: landing, login, sign-up, registration, patient and clinician areas |
| `backend/` | Express API, SQLite schema, transcription job queue, tests |
| `speech-service/` | FastAPI service wrapping faster-whisper, indicator maths, demo-data seed, tests |
| `qa/` | Cross-process smoke test and a real-browser walkthrough |

## Run it locally

Requirements: Node 22+, Python 3.10+, `ffmpeg` on the PATH (used to decode browser recordings).

```bash
# 1. Speech service  (first run downloads the Whisper "base" model, ~150 MB)
cd speech-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000

# 2. API
cd backend
cp .env.example .env
npm install
npm run dev                      # http://localhost:4000

# 3. Web app
cd frontend
npm install
npm run dev                      # http://localhost:5173  (proxies /api to :4000)
```

Optional demo data (clearly labelled, made-up timings, **not real analysis**):

```bash
cd speech-service && pip install bcrypt
python scripts/seed_demo.py --data-dir ../backend/data
# patient:   demo.patient@fluentai.test
# clinician: demo.clinician@fluentai.test      password: DemoPass123!
```

Single-process deployment: `cd frontend && npm run build`, then run the API; it serves `frontend/dist` automatically.

## Accounts, registration and roles

1. **Sign up** (name, email, password, role, terms).
2. **Registration** (separate page): patients confirm they are 18+, give age group, language, goals and **consent to voice processing**; clinicians give title, specialty, licence number and region.
3. **Clinicians start as `pending`.** They are hidden from the directory and cannot accept requests or see shared data until verified. In development `AUTO_VERIFY_CLINICIANS=true` skips this; **production refuses to start with it enabled**. Verification itself is a manual step you must provide (check the licence with the issuing body, then set `verification_status = 'verified'`).

## How consultations and privacy work

- A patient requests a consultation; the clinician accepts or declines.
- Sessions are private. After a consultation is **accepted**, the patient can share individual sessions with that clinician. Clinicians can only open sessions shared with them, only while a care relationship exists. Cancelling or declining removes shares.
- Clinician access (view, audio, notes) is written to an `audit_log` table.
- Patients can delete any session (file and data) and delete their whole account (requires password).
- Audio is only served through authenticated routes; there are no public file URLs.
- Security basics: bcrypt password hashes, httpOnly SameSite cookie, custom-header CSRF check, Helmet headers/CSP, rate-limited auth routes, upload type and size limits, zod validation on every input.

## The insights

Computed from word timestamps in `speech-service/app/indicators.py`:

| Indicator | Definition |
|---|---|
| Pace (speaking / overall) | words ÷ minutes of speech excluding pauses / ÷ whole recording |
| Pauses | gaps ≥ 0.5 s between consecutive words |
| Repetitions | immediate word repeats, repeated two-word phrases, hyphenated sound repeats (`b-b-ball`) |
| Fillers | `um`, `uh`, … present in the transcript |
| Flow index (0–100) | mean of three smoothness scores (repetitions, fillers, pauses) that fall to 0 at 10 %, 10 % and 30 % |

The flow index and its caps are a **simple, documented design choice, not a validated or clinical measure**. Speech recognisers often drop repeats and fillers, so those counts are lower bounds (the UI says so). Whisper is prompted towards verbatim output, which helps but does not guarantee it.

## Tests

```bash
cd backend && npm test                 # 8 API tests: auth, roles, consent, sharing, deletion
cd speech-service && pytest            # 17 tests: indicator maths and the service API
cd frontend && npm test && npm run build
python qa/e2e_smoke.py                 # real API + real speech service, full patient → clinician flow
python qa/ui_qa.py                     # real browser (needs playwright); saves screenshots
```

## What is NOT done yet (read before relying on it)

- **Real transcription has not been tested with real audio.** The environment this was built in could not download the Whisper model, so tests used a stub backend (`ASR_BACKEND=stub`, flagged in the UI and refused in production) and a faked recogniser. Run a real recording on your machine and check the results before trusting any numbers.
- **"Real-time" means: results appear when analysis of a finished recording completes** (the page updates automatically). Live streaming transcription while speaking is not built.
- **No video calls, chat or calendar sync.** Consultations are requests with a time, a mode and a message; the actual call happens elsewhere.
- **No email or push notifications**, password reset, email verification or two-factor sign-in.
- **Auth is local (email + password, JWT cookie).** The previous project used Firebase Authentication and Backblaze B2; neither is wired in here. Storage is local disk.
- **Adults only (18+).** Supporting children needs guardian consent flows and a legal review.
- **Clinician licence verification is manual** (see above).
- **Production checklist:** HTTPS, a strong `JWT_SECRET` and `SPEECH_SERVICE_KEY`, regular backups of `DATA_DIR`, a retention and deletion policy, a privacy notice and terms reviewed for your jurisdiction (e.g. health-data rules), and a decision on where data is hosted.

## Deploying the web app on Vercel

Vercel hosts the **frontend** (`frontend/`). The API (`backend/`) and the speech service
(`speech-service/`) need a host that keeps a running process and persistent storage, so
they cannot run on Vercel as they are (SQLite file, uploaded audio on disk, Python Whisper).

1. Deploy the API and the speech service somewhere that supports them (see the architecture
   plan: for a free setup, Render for the API, Supabase for the database, Backblaze B2 for audio).
2. In Vercel, import this repository and set **Root Directory** to `frontend`.
3. Edit `frontend/vercel.json` and replace `YOUR-BACKEND-URL` with the public address of your API.
   Requests to `/api/...` are then forwarded there, so the browser sees one origin and the
   httpOnly sign-in cookie keeps working.
4. Redeploy. Without a running backend, the pages load but sign-in and analysis will fail.
