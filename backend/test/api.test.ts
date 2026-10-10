import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import type { SpeechClient, SpeechResult } from '../src/speechClient.js';

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

function setup(opts: { autoVerify?: boolean; speech?: SpeechClient } = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATA_DIR: tmp,
    AUTO_VERIFY_CLINICIANS: opts.autoVerify === false ? 'false' : 'true',
  });
  const db = openDb(':memory:');
  const speech: SpeechClient = opts.speech ?? {
    transcribe: async () => fakeResult,
    health: async () => true,
  };
  const { app, queue } = createApp({ db, config, speech });
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
          licenseNumber: 'SLP-12345', licenseRegion: 'India', yearsExperience: 6, languages: 'English',
          bio: 'Fluency specialist', acceptsNewPatients: true, consentTerms: true };
  const p = await agent.put('/api/v1/profile').set(H).send(body);
  expect(p.status).toBe(200);
  return { agent, id: s.body.user.id as string };
}

const wav = () => Buffer.alloc(4000, 1);
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
    db.prepare(`UPDATE clinician_profiles SET verification_status='verified' WHERE user_id=?`).run(clin.id);
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
