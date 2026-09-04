/**
 * Pronunciation engine orchestrator.
 *
 * 🚨 PRIVACY CONTRACT — EPHEMERAL AUDIO 🚨
 * The user's voice exists ONLY in RAM for the duration of one attempt:
 *  1. The recorder feeds raw 16 kHz / 16-bit mono PCM straight into memory
 *     (no file writes, no temp dirs — see the capture seam below).
 *  2. The exact moment MFCC extraction completes, the raw PCM buffer is
 *     zeroed in place and dereferenced.
 *  3. Only `accuracy`, `dtw_distance` and `duration_ms` are persisted.
 *  4. `destroySession()` (called from onPause/onBlur/unmount) zeroes any
 *     live buffers if the app is backgrounded mid-attempt.
 *
 * CAPTURE SEAM: expo-audio in Expo Go cannot stream PCM into memory, so a
 * dev-build recorder implementing `EphemeralPcmRecorder` plugs in here.
 * The engine itself never knows where the bytes came from — it only ever
 * touches in-memory buffers, and nothing in this file performs file I/O.
 */

import { extractMfcc } from '../core/dsp/mfcc';
import { zeroAndRelease, pcmDurationMs } from '../core/dsp/ephemeral';
import { scorePronunciation } from '../core/dsp/score';

/** Contract for a recorder that yields in-memory PCM (16 kHz, mono, 16-bit). */
export interface EphemeralPcmRecorder {
  /** Begin capturing. Resolves when the mic stream is live. */
  start(): Promise<void>;
  /** Stop capture and hand back the RAM buffer. Implementations must NOT have written any file. */
  stop(): Promise<Float32Array>;
  /** Abort capture and destroy any partial buffer (user backed out mid-attempt). */
  abort(): void;
}

export interface ScoredAttempt {
  accuracy: number;
  dtwDistance: number;
  durationMs: number;
}

export class PronunciationSession {
  private recorder: EphemeralPcmRecorder | null = null;
  private liveBuffer: Float32Array | null = null; // PRIVACY: ephemeral buffer — never persisted to disk
  private destroyed = false;

  constructor(private readonly referenceMfcc: Float64Array[], private readonly refDurationMs: number) {}

  /** True once destroy() has run — the session can never capture again. */
  get isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Attach a recorder and start capturing the user's voice into RAM. */
  async begin(recorder: EphemeralPcmRecorder): Promise<void> {
    if (this.destroyed) throw new Error('Session destroyed');
    this.recorder = recorder;
    await recorder.start();
  }

  /**
   * Stop capture, extract features, and destroy the raw voice buffer.
   * Returns the score + metadata that are ALLOWED to be persisted.
   */
  async finish(): Promise<ScoredAttempt> {
    if (!this.recorder) throw new Error('No active recording');
    // PRIVACY: ephemeral buffer — never persisted to disk
    const pcm = await this.recorder.stop();
    this.liveBuffer = pcm;
    try {
      const userMfcc = extractMfcc(pcm);
      const userDurationMs = pcmDurationMs(pcm);
      const result = scorePronunciation(this.referenceMfcc, userMfcc, this.refDurationMs, userDurationMs);
      return { accuracy: result.accuracy, dtwDistance: result.dtwDistance, durationMs: userDurationMs };
    } finally {
      // PRIVACY: ephemeral buffer — never persisted to disk. Destroyed the
      // instant feature extraction is done, on success OR on error.
      zeroAndRelease(pcm);
      this.liveBuffer = null;
    }
  }

  /** Cancel mid-attempt: zero and release everything immediately. */
  cancel(): void {
    if (this.recorder) {
      this.recorder.abort();
      this.recorder = null;
    }
    // PRIVACY: ephemeral buffer — never persisted to disk
    zeroAndRelease(this.liveBuffer);
    this.liveBuffer = null;
  }

  /** Lifecycle hook — call from onPause / onBlur / componentWillUnmount. */
  destroy(): void {
    this.cancel();
    this.destroyed = true;
  }
}
