import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { HttpError, requireRole, requireRegistered } from '../auth.js';
import type { Deps } from '../app.js';
import { nowIso } from '../db.js';
import {
  audit,
  getSessionRow,
  hasCareRelationship,
  isVerifiedClinician,
  newId,
  sessionAccess,
  sessionDetail,
  sessionSummary,
} from '../util.js';

const ALLOWED_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
};

const ACTIVITIES = ['free_speech', 'reading', 'breathing_exercise', 'conversation_practice'] as const;

export function sessionsRouter({ db, config, queue }: Deps) {
  const r = Router();
  const audioDir = path.join(config.dataDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, audioDir),
      filename: (_req, file, cb) =>
        cb(null, `${newId()}.${ALLOWED_MIME[file.mimetype.split(';')[0]!.trim()] ?? 'bin'}`),
    }),
    limits: { fileSize: config.maxUploadBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      const mime = file.mimetype.split(';')[0]!.trim();
      if (ALLOWED_MIME[mime]) return cb(null, true);
      cb(new HttpError(415, 'Unsupported audio format. Use WebM, OGG, WAV, MP3 or M4A.'));
    },
  });

  const patientOnly = [requireRole('patient'), requireRegistered];

  r.post('/', ...patientOnly, upload.single('file'), (req, res) => {
    if (!req.file) throw new HttpError(400, 'Attach an audio file in the "file" field.');
    try {
      const body = z
        .object({
          title: z.string().trim().min(1).max(120).default('Practice session'),
          activity: z.enum(ACTIVITIES).default('free_speech'),
        })
        .parse(req.body);
      if (req.file.size < 1000) throw new HttpError(400, 'The recording is empty or too short.');
      const id = newId();
      db.prepare(
        `INSERT INTO sessions (id, patient_id, title, activity, audio_path, audio_mime, audio_bytes, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      ).run(
        id, req.user!.id, body.title, body.activity, req.file.path,
        req.file.mimetype.split(';')[0]!.trim(), req.file.size, nowIso(),
      );
      res.status(201).json({ session: sessionSummary(getSessionRow(db, id)!) });
    } catch (e) {
      fs.rmSync(req.file.path, { force: true });
      throw e;
    }
  });

  r.get('/', ...patientOnly, (req, res) => {
    const rows = db
      .prepare('SELECT * FROM sessions WHERE patient_id = ? ORDER BY created_at DESC LIMIT 200')
      .all(req.user!.id) as any[];
    const counts = new Map(
      (
        db
          .prepare(
            `SELECT s.id AS id, COUNT(sh.clinician_id) AS n FROM sessions s
             LEFT JOIN session_shares sh ON sh.session_id = s.id
             WHERE s.patient_id = ? GROUP BY s.id`,
          )
          .all(req.user!.id) as { id: string; n: number }[]
      ).map((x) => [x.id, x.n]),
    );
    res.json({ sessions: rows.map((s) => sessionSummary(s, counts.get(s.id) ?? 0)) });
  });

  r.get('/:id', requireRegistered, (req, res) => {
    const s = getSessionRow(db, String(req.params.id));
    if (!s) throw new HttpError(404, 'Session not found.');
    const access = sessionAccess(db, req.user!, s);
    if (access === 'clinician') audit(db, req.user!.id, 'clinician_view_session', s.id);

    const notes = db
      .prepare(
        `SELECT n.id, n.body, n.created_at AS createdAt, u.full_name AS clinicianName
         FROM session_notes n JOIN users u ON u.id = n.clinician_id
         WHERE n.session_id = ? ORDER BY n.created_at ASC`,
      )
      .all(s.id);
    const shares =
      access === 'owner'
        ? db
            .prepare(
              `SELECT sh.clinician_id AS clinicianId, u.full_name AS name FROM session_shares sh
               JOIN users u ON u.id = sh.clinician_id WHERE sh.session_id = ?`,
            )
            .all(s.id)
        : undefined;
    res.json({ session: sessionDetail(s), notes, shares, access });
  });

  r.get('/:id/audio', requireRegistered, (req, res) => {
    const s = getSessionRow(db, String(req.params.id));
    if (!s) throw new HttpError(404, 'Session not found.');
    const access = sessionAccess(db, req.user!, s);
    if (access === 'clinician') audit(db, req.user!.id, 'clinician_play_audio', s.id);
    if (!fs.existsSync(s.audio_path)) throw new HttpError(404, 'Audio file is no longer available.');
    res.setHeader('Content-Type', s.audio_mime);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(path.resolve(s.audio_path));
  });

  // Transcription only starts when the patient asks for it.
  r.post('/:id/transcribe', ...patientOnly, (req, res) => {
    const s = getSessionRow(db, String(req.params.id));
    if (!s || s.patient_id !== req.user!.id) throw new HttpError(404, 'Session not found.');
    if (s.status === 'processing' || queue.isActive(s.id))
      throw new HttpError(409, 'This recording is already being processed.');
    queue.enqueue(s.id);
    res.status(202).json({ session: sessionSummary(getSessionRow(db, s.id)!) });
  });

  r.delete('/:id', ...patientOnly, (req, res) => {
    const s = getSessionRow(db, String(req.params.id));
    if (!s || s.patient_id !== req.user!.id) throw new HttpError(404, 'Session not found.');
    if (s.status === 'processing') throw new HttpError(409, 'Wait for processing to finish first.');
    fs.rmSync(s.audio_path, { force: true });
    db.prepare('DELETE FROM sessions WHERE id = ?').run(s.id);
    res.json({ ok: true });
  });

  // Replace the set of clinicians this session is shared with.
  r.put('/:id/shares', ...patientOnly, (req, res) => {
    const s = getSessionRow(db, String(req.params.id));
    if (!s || s.patient_id !== req.user!.id) throw new HttpError(404, 'Session not found.');
    const { clinicianIds } = z.object({ clinicianIds: z.array(z.string()).max(20) }).parse(req.body);
    for (const cid of clinicianIds) {
      if (!isVerifiedClinician(db, cid) || !hasCareRelationship(db, req.user!.id, cid))
        throw new HttpError(
          400,
          'You can only share with clinicians who accepted your consultation request.',
        );
    }
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM session_shares WHERE session_id = ?').run(s.id);
      const ins = db.prepare(
        'INSERT INTO session_shares (session_id, clinician_id, created_at) VALUES (?,?,?)',
      );
      for (const cid of new Set(clinicianIds)) ins.run(s.id, cid, nowIso());
    });
    tx();
    audit(db, req.user!.id, 'update_shares', s.id);
    res.json({ ok: true });
  });

  r.post('/:id/notes', requireRole('clinician'), requireRegistered, (req, res) => {
    const s = getSessionRow(db, String(req.params.id));
    if (!s) throw new HttpError(404, 'Session not found.');
    sessionAccess(db, req.user!, s); // throws unless shared with this clinician
    const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).parse(req.body);
    db.prepare(
      'INSERT INTO session_notes (id, session_id, clinician_id, body, created_at) VALUES (?,?,?,?,?)',
    ).run(newId(), s.id, req.user!.id, body, nowIso());
    audit(db, req.user!.id, 'clinician_add_note', s.id);
    res.status(201).json({ ok: true });
  });

  return r;
}
