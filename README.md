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
2. **Registration** (separate page): patients confirm they are 18+, give age group, language, goals and **consent to voice processing**; clinicians give title, specialty, licence number, issuing body and licence expiry date.
3. **Clinicians start as `pending`.** They are hidden from the directory and cannot accept requests or see shared data until verified. In development `AUTO_VERIFY_CLINICIANS=true` skips this (it is now off by default in `.env`); **production refuses to start with it enabled**. Verification is done by an admin in the admin panel after checking the licence (see below).

## Admin panel

A panel at **/admin** for whoever runs FluentAI. There is one sign-in page for everyone (**/login**): admin credentials open the admin panel, patient and clinician credentials open the app. The admin account still has its own table and its own sign-in cookie, so patient and clinician logins cannot open the panel, and the admin login cannot open the patient app. Nobody can sign up with the admin's email.

- **Credentials:** set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `backend/.env`. The account is created, or its password updated, every time the API starts. In development, if they are empty, the login is `admin@fluentai.local` / `FluentAdmin#2026`. In production both must be set, and the password must be at least 12 characters.
- **Patient features:** switch features on or off for every patient: browser recording, file upload, speech analysis, the clinician directory, consultation requests, session sharing, progress charts and the daily practice idea. Also set the weekly goal and an announcement shown on every patient's dashboard.
- **Per-patient settings:** open a patient and set any feature to Default, On or Off for that patient only, plus a custom weekly goal.
- **Enforced by the API, not only hidden:** switched-off features return `403` from the server. Removing a share and deleting data are always allowed. Note: recording and upload are told apart by a `source` field the browser sends, so a patient with one of them still on could send a file through it.
- **Clinicians and licences:** a clinician is approved only with a valid licence. At registration they must give their licence number, issuing body and expiry date (an expired date is refused). To approve, the admin must enter the expiry date confirmed with the issuing body (it must be in the future), the register reference they checked, and tick that they checked it; the server refuses an approval without these. The check (who, when, reference) is stored and logged. When the licence expiry date passes, the clinician automatically stops being verified: they disappear from the directory, cannot accept requests or open shared sessions, and show as "Licence expired" in the admin panel until they enter a renewed licence under Account and an admin checks it again. Changing licence details always sends the clinician back for a new check.
- **Verified badge:** patients see a blue "Verified" badge next to clinicians with a checked, valid licence: in the directory, on consultations, in the dashboard, in the sharing panel and on clinician notes. FluentAI cannot query licence registers automatically (there is no public API for them), so the check itself is done by a person.
- **Activity log:** admin sign-ins (including failed ones), setting changes, patient views and clinician approvals are written to `audit_log`.
- The admin can see a patient's registration details and activity counts, but not their recordings or transcripts.

## Fluency roadmap

Patients get a personal practice plan at **/app/roadmap**, rebuilt every time a session is analysed (`backend/src/roadmap.ts`).

- **Focus area:** from the latest analysed sessions FluentAI picks what has the most room to change: repetitions, fillers, long pauses or a fast pace (lowest flow-index component; pace above 170 wpm). If everything looks smooth, the focus is carrying skills into everyday speaking.
- **Four stages:** Foundations (3 analysed sessions and a breathing exercise), Focus (a 25% improvement on the focus metric against the first sessions, after 6 sessions), Carry it into conversation (3 conversation-practice sessions at or above the starting flow index) and Everyday confidence (meet the weekly goal two weeks running and flow index 10 points above the start). A stage unlocks when the previous one's targets are met.
- **This week:** the weekly goal split into short sessions, each with an activity and a technique (easy onsets, light contacts, pull-outs, planned phrasing, pausing instead of fillers, gentle stretching, steady pace, relaxed breathing). "Start" opens the recording page with that activity and technique.
- **AI coaching (optional):** set `ANTHROPIC_API_KEY` in `backend/.env` and patients can switch on "Personal coaching from Claude". Claude (`ANTHROPIC_MODEL`, default `claude-sonnet-5-5`) then writes the summary, weekly focus and stage tips from the numbers. Only aggregate numbers, the plan, first name, age group, language and the patient's own goal text are sent; never audio, transcripts or email. The text is cached and only regenerated when the numbers change. If the key is missing, the AI call fails, or the patient or admin turns it off, the built-in wording is used.
- **Clinician control (per patient):** a verified clinician with an accepted consultation opens the patient under My patients and uses "Fluency roadmap" to set the focus area, the stage and the session length from dropdowns ("Automatic" follows the patient's results), and a note picked from a list of ready-made suggestions and edited before saving. The patient sees it as "Note from Dr …, your clinician", and it is passed to the AI coach so its text agrees. The clinician is not shown figures derived from sessions the patient has not shared. Changes are written to the activity log. The admin panel has no roadmap controls.
- Admins can switch the roadmap and AI coaching off globally or per patient on the Patient features page.
- The plan gives general practice ideas, not a diagnosis or treatment plan.

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
