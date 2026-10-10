import fs from 'node:fs';
import { z } from 'zod';

const wordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
  probability: z.number().nullable().optional(),
});

const segmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
  words: z.array(wordSchema).default([]),
});

export const speechResultSchema = z.object({
  language: z.string().nullable(),
  language_probability: z.number().nullable().optional(),
  duration_sec: z.number(),
  transcript: z.string(),
  segments: z.array(segmentSchema),
  indicators: z.object({
    word_count: z.number(),
    speech_rate_wpm_total: z.number().nullable(),
    speech_rate_wpm_active: z.number().nullable(),
    active_speech_sec: z.number(),
    pause_count: z.number(),
    total_pause_sec: z.number(),
    longest_pause_sec: z.number(),
    mean_pause_sec: z.number().nullable(),
    repetition_count: z.number(),
    repeated_items: z.array(z.object({ text: z.string(), count: z.number() })),
    filler_count: z.number(),
    filler_items: z.array(z.object({ text: z.string(), count: z.number() })),
    flow_index: z.number().nullable(),
    flow_components: z.record(z.string(), z.number()),
    pause_threshold_sec: z.number(),
  }),
  model: z.object({
    name: z.string(),
    device: z.string(),
    compute_type: z.string(),
    stub: z.boolean().default(false),
  }),
  processing_ms: z.number(),
});

export type SpeechResult = z.infer<typeof speechResultSchema>;

export interface SpeechClient {
  transcribe(file: { path: string; mime: string; filename: string }): Promise<SpeechResult>;
  health(): Promise<boolean>;
}

export class HttpSpeechClient implements SpeechClient {
  constructor(private baseUrl: string, private key: string, private timeoutMs = 10 * 60 * 1000) {}

  async transcribe(file: { path: string; mime: string; filename: string }): Promise<SpeechResult> {
    const blob = await fs.openAsBlob(file.path, { type: file.mime });
    const form = new FormData();
    form.append('file', blob, file.filename);
    const res = await fetch(`${this.baseUrl}/api/v1/transcribe`, {
      method: 'POST',
      headers: { 'X-Service-Key': this.key },
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Speech service returned ${res.status}: ${detail.slice(0, 200)}`);
    }
    return speechResultSchema.parse(await res.json());
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
