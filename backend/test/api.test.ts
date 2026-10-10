import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import type { SpeechClient, SpeechResult } from '../src/speechClient.js';
import { AnthropicCoach, type CoachClient, type CoachInput } from '../src/coach.js';

const H = { 'X-Requested-With': 'fluentai' };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fluentai-test-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const fakeResult: SpeechResult = {
  language: 'en',
  language_probability: 0.99,
  duration_sec: 12.5,
  transcript: 'I I want to go to the shop',
  segments: [{ start: 0, end: 5, text: 'I I want to go to the shop', words: [] }],
  indicators: {
    word_count: 8,
    speech_rate_wpm_total: 38.4,
    speech_rate_wpm_active: 96,
    active_speech_sec: 5,
    pause_count: 1,
    total_pause_sec: 1.2,
    longest_pause_sec: 1.2,
    mean_pause_sec: 1.2,
    repetition_count: 1,
    repeated_items: [{ text: 'i', count: 1 }],
    filler_count: 0,
    filler_items: [],
    flow_index: 77.5,
    flow_components: { repetition: 0.4, filler: 1, pause: 0.9 },
    pause_threshold_sec: 0.5,
  },
  model: { name: 'base', device: 'cpu', compute_type: 'int8', stub: false },
  processing_ms: 1234,
};

function setup(opts: { autoVerify?: boolean; speech?: SpeechClient; coach?: CoachClient } = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATA_DIR: tmp,
    AUTO_VERIFY_CLINICIANS: opts.autoVerify === false ? 'false' : 'true',
    ADMIN_EMAIL: 'admin@test.local',
    ADMIN_PASSWORD: 'Admin-Passw0rd-123',
  });
  const db = openDb(':memory:');
  const speech: SpeechClient = opts.speech ?? {
    transcribe: async () => fakeResult,
    health: async () => true,
  };
  const { app, queue } = createApp({ db, config, speech, ...(opts.coach ? { coach: opts.coach } : {}) });
  return { app, db, queue };
}

async function register(app: any, role: 'patient' | 'clinician', email: string, name = 'Test User') {
  const agent = request.agent(app);
  const s = await agent.post('/api/v1/auth/signup').set(H).send({
    fullName: name, email, password: 'Str0ngPassw0rd!', role: role, acceptTerms: true,
  });
  expect(s.status).toBe(201);
  const body =
    role === 'patient'
      ? { confirmAdult: true, ageGroup: '25-34', primaryLanguage: 'English', goals: 'Calmer phone calls',
          consentVoiceProcessing: true, consentTerms: true }
      : { title: 'Dr', specialty: 'Speech-language pathology', organisation: 'Test Clinic',
          licenseNumber: 'SLP-12345', licenseRegion: 'India', licenseExpiry: FUTURE, yearsExperience: 6, languages: 'English',
          bio: 'Fluency specialist', acceptsNewPatients: true, consentTerms: true };
  const p = await agent.put('/api/v1/profile').set(H).send(body);
  expect(p.status).toBe(200);
  return { agent, id: s.body.user.id as string };
}

const wav = () => Buffer.alloc(4000, 1);
const FUTURE = `${new Date().getFullYear() + 2}-06-30`;
const PAST = `${new Date().getFullYear() - 1}-01-31`;
const upload = (agent: any) =>
  agent.post('/api/v1/sessions').set(H).field('title', 'Morning practice').field('activity', 'reading')
    .attach('file', wav(), { filename: 'a.wav', contentType: 'audio/wav' });

async function waitDone(agent: any, id: string) {
  for (let i = 0; i < 50; i++) {
    const r = await agent.get(`/api/v1/sessions/${id}`).set(H);
    if (r.body.session.status !== 'processing') return r.body;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timeout');
}

async function bookAndAccept(patient: any, clinician: any, clinicianId: string) {
  const start = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
  const a = await patient.agent.post('/api/v1/appointments').set(H).send({
    clinicianId, requestedStart: start, mode: 'video', reason: 'Block on phone calls',
  });
  expect(a.status).toBe(201);
  const acc = await clinician.agent.patch(`/api/v1/appointments/${a.body.id}`).set(H)
    .send({ status: 'accepted', clinicianMessage: 'See you then' });
  expect(acc.status).toBe(200);
  return a.body.id as string;
}

describe('accounts', () => {
  it('requires registration, then allows login/me; protects against bad input', async () => {
    const { app } = setup();
    const agent = request.agent(app);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    expect((await agent.post('/api/v1/auth/signup').send({})).status).toBe(403); // CSRF header
    const weak = await agent.post('/api/v1/auth/signup').set(H).send({
      fullName: 'A B', email: 'a@b.com', password: 'short', role: 'patient', acceptTerms: true });
    expect(weak.status).toBe(400);
    const ok = await agent.post('/api/v1/auth/signup').set(H).send({
      fullName: 'Asha K', email: 'asha@example.com', password: 'Str0ngPassw0rd!', role: 'patient', acceptTerms: true });
    expect(ok.status).toBe(201);
    expect(ok.body.user.registered).toBe(false);
    expect(ok.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
    // cannot use app features before registration
    expect((await upload(agent)).status).toBe(403);
    // duplicate email
    const dup = await request(app).post('/api/v1/auth/signup').set(H).send({
      fullName: 'Asha K', email: 'ASHA@example.com', password: 'Str0ngPassw0rd!', role: 'patient', acceptTerms: true });
    expect(dup.status).toBe(409);
    // wrong password / right password
    const bad = await request(app).post('/api/v1/auth/login').set(H).send({ email: 'asha@example.com', password: 'nope-nope' });
    expect(bad.status).toBe(401);
    const good = await request(app).post('/api/v1/auth/login').set(H).send({ email: 'asha@example.com', password: 'Str0ngPassw0rd!' });
    expect(good.status).toBe(200);
  });

  it('rejects minors / missing consent at registration', async () => {
    const { app } = setup();
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/signup').set(H).send({
      fullName: 'Asha K', email: 'asha@example.com', password: 'Str0ngPassw0rd!', role: 'patient', acceptTerms: true });
    const r = await agent.put('/api/v1/profile').set(H).send({
      confirmAdult: true, ageGroup: '25-34', primaryLanguage: 'English', consentVoiceProcessing: false, consentTerms: true });
    expect(r.status).toBe(400);
  });
});

describe('sessions and processing', () => {
  it('uploads, validates, transcribes on request, and isolates users', async () => {
    const { app } = setup();
    const p1 = await register(app, 'patient', 'p1@example.com');
    const p2 = await register(app, 'patient', 'p2@example.com');

    const bad = await p1.agent.post('/api/v1/sessions').set(H)
      .attach('file', Buffer.from('text'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(bad.status).toBe(415);
    const tiny = await p1.agent.post('/api/v1/sessions').set(H)
      .attach('file', Buffer.alloc(10), { filename: 'x.wav', contentType: 'audio/wav' });
    expect(tiny.status).toBe(400);

    const up = await upload(p1.agent);
    expect(up.status).toBe(201);
    const id = up.body.session.id as string;
    expect(up.body.session.status).toBe('uploaded'); // nothing transcribed yet

    expect((await p2.agent.get(`/api/v1/sessions/${id}`).set(H)).status).toBe(404);
    expect((await p2.agent.get(`/api/v1/sessions/${id}/audio`).set(H)).status).toBe(404);
    expect((await p2.agent.post(`/api/v1/sessions/${id}/transcribe`).set(H)).status).toBe(404);

    const t = await p1.agent.post(`/api/v1/sessions/${id}/transcribe`).set(H);
    expect(t.status).toBe(202);
    const done = await waitDone(p1.agent, id);
    expect(done.session.status).toBe('completed');
    expect(done.session.indicators.flow_index).toBe(77.5);
    expect(done.session.transcript).toContain('shop');

    const audio = await p1.agent.get(`/api/v1/sessions/${id}/audio`).set(H);
    expect(audio.status).toBe(200);
    expect(audio.headers['content-type']).toMatch(/audio\/wav/);

    const list = await p1.agent.get('/api/v1/sessions').set(H);
    expect(list.body.sessions).toHaveLength(1);
    expect((await p2.agent.get('/api/v1/sessions').set(H)).body.sessions).toHaveLength(0);
  });

  it('records a friendly failure when the speech service is down', async () => {
    const { app } = setup({
      speech: { transcribe: async () => { throw new Error('connect ECONNREFUSED'); }, health: async () => false },
    });
    const p = await register(app, 'patient', 'p@example.com');
    const id = (await upload(p.agent)).body.session.id as string;
    await p.agent.post(`/api/v1/sessions/${id}/transcribe`).set(H);
    const done = await waitDone(p.agent, id);
    expect(done.session.status).toBe('failed');
    expect(done.session.error).toMatch(/Could not process/);
    // can retry
    expect((await p.agent.post(`/api/v1/sessions/${id}/transcribe`).set(H)).status).toBe(202);
  });
});

describe('clinician connection and consent', () => {
  it('only verified clinicians are listed; sharing needs an accepted consultation', async () => {
    const { app, db } = setup({ autoVerify: false });
    const patient = await register(app, 'patient', 'pat@example.com', 'Pat Ient');
    const clin = await register(app, 'clinician', 'doc@example.com', 'Dana Doc');

    expect((await patient.agent.get('/api/v1/clinicians').set(H)).body.clinicians).toHaveLength(0);
    expect((await clin.agent.get('/api/v1/clinician/patients').set(H)).status).toBe(403);
    // marking 'verified' without a recorded licence check does not count
    db.prepare(`UPDATE clinician_profiles SET verification_status='verified' WHERE user_id=?`).run(clin.id);
    expect((await patient.agent.get('/api/v1/clinicians').set(H)).body.clinicians).toHaveLength(0);
    db.prepare(`UPDATE clinician_profiles SET verified_at=?, verified_by='test', verification_ref='SLP-12345' WHERE user_id=?`)
      .run(new Date().toISOString(), clin.id);
    const dir = await patient.agent.get('/api/v1/clinicians?q=speech').set(H);
    expect(dir.body.clinicians).toHaveLength(1);
    expect(dir.body.clinicians[0]).not.toHaveProperty('licenseNumber');
    // clinicians cannot browse the directory (patient-only)
    expect((await clin.agent.get('/api/v1/clinicians').set(H)).status).toBe(403);

    const id = (await upload(patient.agent)).body.session.id as string;
    await patient.agent.post(`/api/v1/sessions/${id}/transcribe`).set(H);
    await waitDone(patient.agent, id);

    // no consultation yet -> cannot share
    const tooEarly = await patient.agent.put(`/api/v1/sessions/${id}/shares`).set(H).send({ clinicianIds: [clin.id] });
    expect(tooEarly.status).toBe(400);
    // clinician cannot see it either
    expect((await clin.agent.get(`/api/v1/sessions/${id}`).set(H)).status).toBe(404);

    await bookAndAccept(patient, clin, clin.id);
    expect((await patient.agent.put(`/api/v1/sessions/${id}/shares`).set(H).send({ clinicianIds: [clin.id] })).status).toBe(200);

    const seen = await clin.agent.get(`/api/v1/sessions/${id}`).set(H);
    expect(seen.status).toBe(200);
    expect(seen.body.access).toBe('clinician');
    expect(seen.body.shares).toBeUndefined(); // clinician cannot see sharing config
    expect((await clin.agent.get(`/api/v1/sessions/${id}/audio`).set(H)).status).toBe(200);

    const pts = await clin.agent.get('/api/v1/clinician/patients').set(H);
    expect(pts.body.patients[0].sharedSessions).toBe(1);
    const list = await clin.agent.get(`/api/v1/clinician/patients/${patient.id}/sessions`).set(H);
    expect(list.body.sessions).toHaveLength(1);

    // clinician feedback visible to patient
    expect((await clin.agent.post(`/api/v1/sessions/${id}/notes`).set(H).send({ body: 'Good pacing. Try easy onsets.' })).status).toBe(201);
    const withNote = await patient.agent.get(`/api/v1/sessions/${id}`).set(H);
    expect(withNote.body.notes[0].body).toMatch(/easy onsets/);

    // audit trail exists for clinician access
    const audits = db.prepare(`SELECT action FROM audit_log WHERE action LIKE 'clinician_%'`).all();
    expect(audits.length).toBeGreaterThan(0);

    // another clinician never gets access
    const other = await register(app, 'clinician', 'other@example.com', 'Olly Other');
    expect((await other.agent.get(`/api/v1/sessions/${id}`).set(H)).status).toBe(404);
    expect((await other.agent.post(`/api/v1/sessions/${id}/notes`).set(H).send({ body: 'x' })).status).toBe(404);
  });

  it('cancelling the consultation revokes access to shared sessions', async () => {
    const { app } = setup();
    const patient = await register(app, 'patient', 'pat@example.com');
    const clin = await register(app, 'clinician', 'doc@example.com');
    const id = (await upload(patient.agent)).body.session.id as string;
    const apptId = await bookAndAccept(patient, clin, clin.id);
    await patient.agent.put(`/api/v1/sessions/${id}/shares`).set(H).send({ clinicianIds: [clin.id] });
    expect((await clin.agent.get(`/api/v1/sessions/${id}`).set(H)).status).toBe(200);
    expect((await patient.agent.patch(`/api/v1/appointments/${apptId}`).set(H).send({ status: 'cancelled' })).status).toBe(200);
    expect((await clin.agent.get(`/api/v1/sessions/${id}`).set(H)).status).toBe(404);
  });

  it('enforces appointment rules', async () => {
    const { app } = setup();
    const patient = await register(app, 'patient', 'pat@example.com');
    const clin = await register(app, 'clinician', 'doc@example.com');
    const past = await patient.agent.post('/api/v1/appointments').set(H).send({
      clinicianId: clin.id, requestedStart: new Date(Date.now() - 3600_000).toISOString(), mode: 'video' });
    expect(past.status).toBe(400);
    const start = new Date(Date.now() + 86400_000).toISOString();
    const a = await patient.agent.post('/api/v1/appointments').set(H).send({ clinicianId: clin.id, requestedStart: start, mode: 'phone' });
    // patient cannot accept their own request
    expect((await patient.agent.patch(`/api/v1/appointments/${a.body.id}`).set(H).send({ status: 'accepted' })).status).toBe(409);
    // clinician can decline; then no further change
    expect((await clin.agent.patch(`/api/v1/appointments/${a.body.id}`).set(H).send({ status: 'declined' })).status).toBe(200);
    expect((await clin.agent.patch(`/api/v1/appointments/${a.body.id}`).set(H).send({ status: 'accepted' })).status).toBe(409);
  });
});

describe('privacy', () => {
  it('deletes account, data rows and audio files', async () => {
    const { app, db } = setup();
    const p = await register(app, 'patient', 'del@example.com');
    const up = await upload(p.agent);
    const file = db.prepare('SELECT audio_path FROM sessions').get() as { audio_path: string };
    expect(fs.existsSync(file.audio_path)).toBe(true);
    expect(up.status).toBe(201);
    expect((await p.agent.delete('/api/v1/auth/me').set(H).send({ password: 'wrong-password' })).status).toBe(401);
    expect((await p.agent.delete('/api/v1/auth/me').set(H).send({ password: 'Str0ngPassw0rd!' })).status).toBe(200);
    expect(fs.existsSync(file.audio_path)).toBe(false);
    expect(db.prepare('SELECT COUNT(*) n FROM sessions').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) n FROM users').get()).toEqual({ n: 0 });
  });
});

async function adminAgent(app: any) {
  const a = request.agent(app);
  const r = await a.post('/api/v1/auth/login').set(H).send({ email: 'admin@test.local', password: 'Admin-Passw0rd-123' });
  expect(r.status).toBe(200);
  expect(r.body.admin.email).toBe('admin@test.local');
  return a;
}

describe('admin panel', () => {
  it('opens the admin panel from the normal sign-in when admin credentials are used', async () => {
    const { app } = setup();
    const patient = await register(app, 'patient', 'pat@example.com');
    const login = (email: string, password: string) => request(app).post('/api/v1/auth/login').set(H).send({ email, password });
    // no CSRF header, wrong admin password: refused
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'admin@test.local', password: 'Admin-Passw0rd-123' })).status).toBe(403);
    expect((await login('admin@test.local', 'wrong')).status).toBe(401);
    // patient credentials give a patient session only
    const p = await login('pat@example.com', 'Str0ngPassw0rd!');
    expect(p.status).toBe(200);
    expect(p.body.user.role).toBe('patient');
    expect(p.body.admin).toBeUndefined();
    expect(String(p.headers['set-cookie'])).toMatch(/fluentai_token=[^;]+/);
    expect((await patient.agent.get('/api/v1/admin/me')).status).toBe(401);
    // admin credentials on the same endpoint give the separate admin session
    const a = await login('admin@test.local', 'Admin-Passw0rd-123');
    expect(a.status).toBe(200);
    expect(a.body.user).toBeUndefined();
    const cookies = (a.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(cookies).toMatch(/fluentai_admin=[^;]+;.*HttpOnly/i);
    expect(cookies).toMatch(/SameSite=Strict/i);
    expect(cookies).toMatch(/fluentai_token=;/); // any app session is cleared
    const admin = await adminAgent(app);
    expect((await admin.get('/api/v1/admin/me')).body.admin.email).toBe('admin@test.local');
    // the admin session is not a patient session
    expect((await admin.get('/api/v1/sessions')).status).toBe(401);
    expect((await admin.get('/api/v1/auth/me')).status).toBe(401);
    expect((await admin.get('/api/v1/admin/overview')).body.patients).toBe(1);
    // nobody can sign up with the admin's email
    expect((await request(app).post('/api/v1/auth/signup').set(H).send({
      fullName: 'Fake Admin', email: 'ADMIN@test.local', password: 'Str0ngPassw0rd!', role: 'patient', acceptTerms: true })).status).toBe(409);
    const log = (await admin.get('/api/v1/admin/audit')).body.entries.map((e: any) => e.action);
    expect(log).toContain('admin_login_failed');
  });

  it('switches patient features globally and per patient, and the server enforces them', async () => {
    const { app } = setup();
    const a = await register(app, 'patient', 'a@example.com');
    const b = await register(app, 'patient', 'b@example.com');
    const admin = await adminAgent(app);

    expect((await a.agent.get('/api/v1/features')).body.features.clinicianDirectory).toBe(true);
    // turn the directory and uploads off for everyone, set a goal and an announcement
    const put = await admin.put('/api/v1/admin/features').set(H)
      .send({ features: { clinicianDirectory: false, upload: false }, weeklyGoal: 3, announcement: 'Maintenance on Sunday' });
    expect(put.status).toBe(200);
    expect(put.body.features.find((f: any) => f.key === 'upload').enabled).toBe(false);
    expect((await admin.put('/api/v1/admin/features').set(H).send({ features: { notAFeature: true } })).status).toBe(400);

    const fa = (await a.agent.get('/api/v1/features')).body;
    expect(fa.features.clinicianDirectory).toBe(false);
    expect(fa.weeklyGoal).toBe(3);
    expect(fa.announcement).toBe('Maintenance on Sunday');
    expect((await a.agent.get('/api/v1/clinicians')).status).toBe(403);
    expect((await upload(a.agent)).status).toBe(403);
    // recording is still on, so a recorded clip is accepted
    const rec = await a.agent.post('/api/v1/sessions').set(H).field('title', 'Rec').field('source', 'recording')
      .attach('file', wav(), { filename: 'r.webm', contentType: 'audio/webm' });
    expect(rec.status).toBe(201);

    // override for patient A only
    const pid = a.id;
    const o = await admin.put(`/api/v1/admin/patients/${pid}/features`).set(H)
      .send({ features: { clinicianDirectory: true, upload: true }, weeklyGoal: 7 });
    expect(o.status).toBe(200);
    expect(o.body.features.find((f: any) => f.key === 'clinicianDirectory')).toMatchObject({ global: false, override: true, effective: true });
    expect((await a.agent.get('/api/v1/clinicians')).status).toBe(200);
    expect((await upload(a.agent)).status).toBe(201);
    expect((await a.agent.get('/api/v1/features')).body.weeklyGoal).toBe(7);
    expect((await b.agent.get('/api/v1/clinicians')).status).toBe(403); // B still follows the global setting

    // clearing the override puts A back on the global setting
    await admin.put(`/api/v1/admin/patients/${pid}/features`).set(H).send({ features: { clinicianDirectory: null }, weeklyGoal: null });
    expect((await a.agent.get('/api/v1/clinicians')).status).toBe(403);
    expect((await a.agent.get('/api/v1/features')).body.weeklyGoal).toBe(3);

    // analysis off blocks transcription
    await admin.put('/api/v1/admin/features').set(H).send({ features: { analysis: false } });
    expect((await a.agent.post(`/api/v1/sessions/${rec.body.session.id}/transcribe`).set(H)).status).toBe(403);

    // every change is in the activity log
    const log = (await admin.get('/api/v1/admin/audit')).body.entries.map((e: any) => e.action);
    expect(log).toContain('admin_update_features');
    expect(log).toContain('admin_update_patient_features');
    // patients cannot change features themselves
    expect((await a.agent.put('/api/v1/admin/features').set(H).send({ features: { upload: true } })).status).toBe(401);
  });

  it('approves clinicians only with a checked, valid licence, and drops them when it expires', async () => {
    const { app, db } = setup({ autoVerify: false });
    const p = await register(app, 'patient', 'p@example.com');
    const c = await register(app, 'clinician', 'c@example.com');
    const admin = await adminAgent(app);
    const dir = async () => (await p.agent.get('/api/v1/clinicians')).body.clinicians;
    expect(await dir()).toHaveLength(0);
    expect((await c.agent.get('/api/v1/auth/me')).body.user.verification).toBe('pending');
    const pending = (await admin.get('/api/v1/admin/clinicians?status=pending')).body.clinicians;
    expect(pending.map((x: any) => x.id)).toEqual([c.id]);
    expect(pending[0].licenseExpiry).toBe(FUTURE);

    const approve = (b: object) => admin.patch(`/api/v1/admin/clinicians/${c.id}`).set(H).send({ status: 'verified', ...b });
    // approval is refused without the licence check, without a reference, or with an expired licence
    expect((await approve({ licenseExpiry: FUTURE, verificationRef: 'RCI-A12345' })).status).toBe(400);
    expect((await approve({ licenseExpiry: FUTURE, verificationRef: '', confirmChecked: true })).status).toBe(400);
    const expired = await approve({ licenseExpiry: PAST, verificationRef: 'RCI-A12345', confirmChecked: true });
    expect(expired.status).toBe(400);
    expect(expired.body.error).toMatch(/expired/);
    expect(await dir()).toHaveLength(0);

    // a checked, valid licence approves the clinician and they show as verified
    expect((await approve({ licenseExpiry: FUTURE, verificationRef: 'RCI-A12345', confirmChecked: true, note: 'Checked on the RCI register' })).status).toBe(200);
    const listed = await dir();
    expect(listed).toHaveLength(1);
    expect(listed[0].verified).toBe(true);
    expect((await c.agent.get('/api/v1/auth/me')).body.user.verification).toBe('verified');
    const row = (await admin.get('/api/v1/admin/clinicians?status=verified')).body.clinicians[0];
    expect(row).toMatchObject({ verificationRef: 'RCI-A12345', verifiedBy: 'FluentAI Admin' });

    // when the licence expires the clinician stops being verified everywhere
    db.prepare('UPDATE clinician_profiles SET license_expiry = ? WHERE user_id = ?').run(PAST, c.id);
    expect(await dir()).toHaveLength(0);
    expect((await c.agent.get('/api/v1/auth/me')).body.user.verification).toBe('expired');
    expect((await admin.get('/api/v1/admin/clinicians?status=expired')).body.clinicians.map((x: any) => x.id)).toEqual([c.id]);
    expect((await admin.get('/api/v1/admin/overview')).body.clinicians.expired).toBe(1);

    // reject, and unknown ids
    expect((await admin.patch(`/api/v1/admin/clinicians/${c.id}`).set(H).send({ status: 'rejected', note: 'Licence not found' })).status).toBe(200);
    expect((await c.agent.get('/api/v1/auth/me')).body.user.verification).toBe('rejected');
    expect((await admin.patch('/api/v1/admin/clinicians/nope').set(H).send({ status: 'rejected' })).status).toBe(404);
  });

  it('checks licence details at clinician registration and re-checks after changes', async () => {
    const { app } = setup({ autoVerify: false });
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/signup').set(H).send({ fullName: 'Dr X', email: 'x@example.com', password: 'Str0ngPassw0rd!', role: 'clinician', acceptTerms: true });
    const base = { title: 'Dr', specialty: 'SLP', licenseNumber: 'RCI-A12345', licenseRegion: 'Rehabilitation Council of India', licenseExpiry: FUTURE, consentTerms: true };
    const r1 = await agent.put('/api/v1/profile').set(H).send({ ...base, licenseExpiry: PAST });
    expect(r1.status).toBe(400);
    expect(r1.body.error).toMatch(/expired/);
    expect((await agent.put('/api/v1/profile').set(H).send({ ...base, licenseNumber: '??' })).status).toBe(400);
    expect((await agent.put('/api/v1/profile').set(H).send({ ...base, licenseExpiry: undefined })).status).toBe(400);
    expect((await agent.put('/api/v1/profile').set(H).send(base)).status).toBe(200);
    const admin = await adminAgent(app);
    const id = (await agent.get('/api/v1/auth/me')).body.user.id;
    await admin.patch(`/api/v1/admin/clinicians/${id}`).set(H).send({ status: 'verified', licenseExpiry: FUTURE, verificationRef: 'RCI-A12345', confirmChecked: true });
    expect((await agent.get('/api/v1/auth/me')).body.user.verification).toBe('verified');
    // a renewed licence (new expiry) goes back to pending for a fresh check
    await agent.put('/api/v1/profile').set(H).send({ ...base, licenseExpiry: `${new Date().getFullYear() + 5}-01-01` });
    expect((await agent.get('/api/v1/auth/me')).body.user.verification).toBe('pending');
  });
});

describe('fluency roadmap', () => {
  const analysed = async (agent: any, activity = 'reading') => {
    const up = await agent.post('/api/v1/sessions').set(H).field('title', 'Practice').field('activity', activity)
      .attach('file', wav(), { filename: 'a.wav', contentType: 'audio/wav' });
    expect(up.status).toBe(201);
    await agent.post(`/api/v1/sessions/${up.body.session.id}/transcribe`).set(H);
    await waitDone(agent, up.body.session.id);
  };

  it('builds a personal plan from analysed sessions and moves through its stages', async () => {
    const { app } = setup();
    const p = await register(app, 'patient', 'p@example.com', 'Asha K');
    const empty = (await p.agent.get('/api/v1/roadmap')).body;
    expect(empty.roadmap.ready).toBe(false);
    expect(empty.coaching.source).toBe('builtin');
    expect(empty.ai.configured).toBe(false);

    for (let i = 0; i < 3; i++) await analysed(p.agent);
    let r = (await p.agent.get('/api/v1/roadmap')).body.roadmap;
    expect(r.ready).toBe(true);
    expect(r.analysed).toBe(3);
    // the fake recogniser's weakest score is repetitions (0.4), so that is the focus
    expect(r.focus.primary).toBe('repetitions');
    expect(r.phases[1].title).toMatch(/repetitions/);
    expect(r.phases[1].targets[0].label).toBe('Repetitions per 100 words');
    expect(r.currentPhase).toBe('foundations'); // still needs a breathing exercise
    expect(r.thisWeek).toHaveLength(5);

    await analysed(p.agent, 'breathing_exercise');
    r = (await p.agent.get('/api/v1/roadmap')).body.roadmap;
    expect(r.phases[0].status).toBe('done');
    expect(r.currentPhase).toBe('focus');
    expect(r.progressPct).toBeGreaterThan(0);

    // admins can switch the roadmap off; clinicians never have one
    const admin = await adminAgent(app);
    await admin.put('/api/v1/admin/features').set(H).send({ features: { roadmap: false } });
    expect((await p.agent.get('/api/v1/roadmap')).status).toBe(403);
    const c = await register(app, 'clinician', 'c@example.com');
    expect((await c.agent.get('/api/v1/roadmap')).status).toBe(403);
  });

  it('uses Claude only after the patient opts in, and sends numbers but never transcripts', async () => {
    const seen: CoachInput[] = [];
    let fail = false;
    const coach: CoachClient = {
      available: true,
      model: 'claude-test',
      coach: async (input) => {
        if (fail) throw new Error('boom');
        seen.push(input);
        return {
          summary: `Your repetitions are the focus, ${input.firstName}.`,
          weekFocus: 'Practise easy onsets five times this week.',
          phaseTips: { foundations: 'a', focus: 'b', carryover: 'c', maintain: 'd' },
          encouragement: 'Keep going.',
        };
      },
    };
    const { app } = setup({ coach });
    const p = await register(app, 'patient', 'p@example.com', 'Asha K');
    await analysed(p.agent);

    const g = (await p.agent.get('/api/v1/roadmap')).body;
    expect(g.ai).toMatchObject({ configured: true, enabled: true, consent: false, model: 'claude-test' });
    expect((await p.agent.post('/api/v1/roadmap/coach').set(H)).status).toBe(403); // no opt-in yet
    expect(seen).toHaveLength(0);

    expect((await p.agent.put('/api/v1/roadmap/consent').set(H).send({ consent: true })).status).toBe(200);
    const made = await p.agent.post('/api/v1/roadmap/coach').set(H);
    expect(made.status).toBe(200);
    expect(made.body.coaching).toMatchObject({ source: 'ai', model: 'claude-test', summary: 'Your repetitions are the focus, Asha.' });
    const sent = JSON.stringify(seen[0]);
    expect(sent).not.toMatch(/shop/); // transcript words never leave the server
    expect(sent).not.toMatch(/audio|\.wav|@example/);
    expect(seen[0]!.focus.primary).toBe('repetitions');

    // cached: the same data does not call Claude again
    expect((await p.agent.post('/api/v1/roadmap/coach').set(H)).status).toBe(200);
    expect(seen).toHaveLength(1);
    expect((await p.agent.get('/api/v1/roadmap')).body.coaching).toMatchObject({ source: 'ai', upToDate: true });

    // turning it off deletes the AI text and goes back to the built-in coaching
    await p.agent.put('/api/v1/roadmap/consent').set(H).send({ consent: false });
    expect((await p.agent.get('/api/v1/roadmap')).body.coaching.source).toBe('builtin');

    // admin switch for AI, and a failing AI call, both leave the plan working
    await p.agent.put('/api/v1/roadmap/consent').set(H).send({ consent: true });
    fail = true;
    expect((await p.agent.post('/api/v1/roadmap/coach').set(H)).status).toBe(502);
    expect((await p.agent.get('/api/v1/roadmap')).status).toBe(200);
    const admin = await adminAgent(app);
    await admin.put('/api/v1/admin/features').set(H).send({ features: { aiCoaching: false } });
    expect((await p.agent.get('/api/v1/roadmap')).body.ai.enabled).toBe(false);
    expect((await p.agent.post('/api/v1/roadmap/coach').set(H)).status).toBe(403);
  });

  it('calls the Claude Messages API correctly and validates the reply', async () => {
    let req: { url: string; init: any } | null = null;
    const reply = {
      summary: 'S', weekFocus: 'W', phaseTips: { foundations: 'a', focus: 'b', carryover: 'c', maintain: 'd' }, encouragement: 'E',
    };
    const fakeFetch = (async (url: string, init: any) => {
      req = { url, init };
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Here you go:\n' + JSON.stringify(reply) }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = new AnthropicCoach('sk-test', 'claude-sonnet-5-5', fakeFetch);
    const out = await c.coach({ firstName: 'A' } as CoachInput);
    expect(out).toEqual(reply);
    expect(req!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req!.init.headers).toMatchObject({ 'x-api-key': 'sk-test', 'anthropic-version': '2023-06-01' });
    expect(JSON.parse(req!.init.body).model).toBe('claude-sonnet-5-5');
    const bad = new AnthropicCoach('sk-test', 'm', (async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"summary": 1}' }] }))) as unknown as typeof fetch);
    await expect(bad.coach({} as CoachInput)).rejects.toThrow();
    expect(new AnthropicCoach(undefined, 'm').available).toBe(false);
  });

  it('lets the patient\'s clinician set their plan; the admin has no roadmap controls', async () => {
    const { app } = setup();
    const p = await register(app, 'patient', 'p@example.com', 'Asha K');
    await analysed(p.agent);
    await analysed(p.agent);
    const admin = await adminAgent(app);
    let r: any;
    // the admin roadmap page and its API are gone
    expect([401, 404]).toContain((await admin.get('/api/v1/admin/roadmap')).status);
    expect([401, 404]).toContain((await admin.put('/api/v1/admin/roadmap').set(H).send({ targets: { foundationSessions: 2 } })).status);
    expect((await admin.get(`/api/v1/admin/patients/${p.id}`)).body).not.toHaveProperty('roadmap');

    // per-patient plan: set by the patient's clinician, not the admin
    const gone = await admin.put(`/api/v1/admin/patients/${p.id}/roadmap`).set(H).send({ focus: 'fillers', stage: 3, minutes: 5, note: 'x' });
    expect([401, 404]).toContain(gone.status);
    const c = await register(app, 'clinician', 'c@example.com', 'Priya Raman');
    const other = await register(app, 'clinician', 'o@example.com', 'Other Doc');
    const planUrl = `/api/v1/clinician/patients/${p.id}/roadmap`;
    // no accepted consultation yet: no access
    expect((await c.agent.get(planUrl)).status).toBe(404);
    await bookAndAccept(p, c, c.id);
    const view = (await c.agent.get(planUrl)).body;
    expect(view.plan).toEqual({ focus: null, stage: null, minutes: null, note: '' });
    expect(view.suggestions.length).toBeGreaterThanOrEqual(8); // built-in suggestion list
    expect(view).not.toHaveProperty('autoFocus'); // nothing derived from unshared sessions
    expect(JSON.stringify({ ...view, suggestions: [] })).not.toMatch(/repsPer100|flow|wpm|analysed/i);
    expect((await other.agent.put(planUrl).set(H).send({ focus: 'fillers', stage: null, minutes: null, note: '' })).status).toBe(404);
    expect((await p.agent.put(planUrl).set(H).send({ focus: 'fillers', stage: null, minutes: null, note: '' })).status).toBe(403);

    const set = await c.agent.put(planUrl).set(H).send({ focus: 'fillers', stage: 3, minutes: 5, note: view.suggestions[0] });
    expect(set.status).toBe(200);
    expect(set.body.setBy).toMatchObject({ kind: 'clinician', name: 'Dr Priya Raman' });
    r = (await p.agent.get('/api/v1/roadmap')).body.roadmap;
    expect(r.focus.primary).toBe('fillers');
    expect(r.focus.why).toMatch(/Dr Priya Raman, your clinician, chose fillers/);
    expect(r.currentPhase).toBe('carryover');
    expect(r.phases.map((x: any) => x.status)).toEqual(['done', 'done', 'current', 'upcoming']);
    expect(r.phases.flatMap((x: any) => x.exercises).every((e: any) => e.minutes === 5)).toBe(true);
    expect(r.plan).toMatchObject({ focusPinned: true, stagePinned: true, note: view.suggestions[0], setBy: { kind: 'clinician', name: 'Dr Priya Raman' } });
    expect((await admin.get('/api/v1/admin/patients')).body.patients.find((x: any) => x.id === p.id).overrides).toBe(0);
    expect((await admin.get('/api/v1/admin/audit')).body.entries.map((e: any) => e.action)).toContain('clinician_update_roadmap');

    // back to automatic
    await c.agent.put(planUrl).set(H).send({ focus: null, stage: null, minutes: null, note: '' });
    r = (await p.agent.get('/api/v1/roadmap')).body.roadmap;
    expect(r.focus.primary).toBe('repetitions');
    expect(r.plan).toEqual({ focusPinned: false, stagePinned: false, note: '', setBy: null });
    expect((await c.agent.put(planUrl).set(H).send({ focus: 'nope', stage: null, minutes: null, note: '' })).status).toBe(400);
    expect((await p.agent.get('/api/v1/admin/roadmap')).status).toBe(401);
  });
});
