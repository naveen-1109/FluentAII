import type { DB } from './db.js';
import { nowIso } from './db.js';
import type { SpeechClient } from './speechClient.js';
import { getSessionRow } from './util.js';

/** Runs transcription jobs one at a time (CPU inference is the bottleneck). */
export class TranscriptionQueue {
  private tail: Promise<void> = Promise.resolve();
  private active = new Set<string>();

  constructor(private db: DB, private speech: SpeechClient) {}

  /** Mark sessions left "processing" by a previous run as failed. */
  recoverInterrupted() {
    this.db
      .prepare(
        `UPDATE sessions SET status = 'failed',
           error = 'Processing was interrupted by a server restart. Please try again.'
         WHERE status = 'processing'`,
      )
      .run();
  }

  isActive(id: string) {
    return this.active.has(id);
  }

  enqueue(sessionId: string) {
    this.active.add(sessionId);
    this.db.prepare(`UPDATE sessions SET status = 'processing', error = NULL WHERE id = ?`).run(sessionId);
    this.tail = this.tail.then(() => this.run(sessionId)).catch(() => undefined);
  }

  private async run(sessionId: string) {
    const s = getSessionRow(this.db, sessionId);
    if (!s) {
      this.active.delete(sessionId);
      return;
    }
    try {
      const result = await this.speech.transcribe({
        path: s.audio_path,
        mime: s.audio_mime,
        filename: `${s.id}`,
      });
      this.db
        .prepare(
          `UPDATE sessions SET status='completed', error=NULL, duration_sec=?, language=?,
             transcript=?, indicators_json=?, segments_json=?, model_json=?, processed_at=?
           WHERE id=?`,
        )
        .run(
          result.duration_sec,
          result.language,
          result.transcript,
          JSON.stringify(result.indicators),
          JSON.stringify(result.segments),
          JSON.stringify({ ...result.model, processing_ms: result.processing_ms }),
          nowIso(),
          sessionId,
        );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.db
        .prepare(`UPDATE sessions SET status='failed', error=? WHERE id=?`)
        .run(`Could not process this recording. ${msg}`.slice(0, 400), sessionId);
    } finally {
      this.active.delete(sessionId);
    }
  }
}
