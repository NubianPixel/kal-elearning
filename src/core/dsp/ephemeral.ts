/**
 * Ephemeral audio buffers for the Pronunciation module.
 *
 * 🚨 PRIVACY CONTRACT 🚨
 * Buffers produced here exist ONLY in RAM for the duration of a practice
 * attempt. There is NO file I/O, NO temp files, NO DB blobs — only the
 * final score survives (see pronunciation_attempts table). Every
 * allocation/deallocation point is marked with:
 *   // PRIVACY: ephemeral buffer — never persisted to disk
 * Call `zeroAndRelease` the moment MFCC extraction completes.
 */

import { SAMPLE_RATE } from './mfcc';

export { SAMPLE_RATE };

/**
 * Overwrite the buffer with zeros so the voice data is unrecoverable, then
 * drop the reference so the GC can reclaim it. Call at the exact moment
 * feature extraction finishes, and in onPause/onDestroy lifecycle hooks.
 */
export function zeroAndRelease(buffer: Float32Array | Uint8Array | null | undefined): void {
  if (!buffer) return;
  buffer.fill(0); // PRIVACY: ephemeral buffer — never persisted to disk
}

/**
 * Decode little-endian 16-bit PCM bytes into normalized [-1, 1] floats.
 * PRIVACY: ephemeral buffer — never persisted to disk
 */
export function pcm16ToFloat32(bytes: Uint8Array): Float32Array {
  const n = bytes.length >> 1; // 2 bytes per 16-bit sample
  const out = new Float32Array(n); // PRIVACY: ephemeral buffer — never persisted to disk
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < n; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

/**
 * Parse a RIFF/WAVE container into normalized PCM floats. Used only for
 * PCM-native recorders; bytes arrive from RAM (base64 of an in-memory
 * stream) — this function performs no file reads.
 * PRIVACY: the returned buffer is ephemeral — never persisted to disk
 */
export function parseWavToPcm(wavBytes: Uint8Array): Float32Array {
  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  // RIFF header: 'RIFF' + size + 'WAVE'
  if (wavBytes.length < 44 || view.getUint32(0, false) !== 0x52494646) {
    throw new Error('Not a WAV file');
  }
  // Walk chunks to find 'data'
  let offset = 12;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= wavBytes.length) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    if (id === 0x64617461) {
      // 'data'
      dataOffset = offset + 8;
      dataLength = Math.min(size, wavBytes.length - dataOffset);
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataOffset < 0) throw new Error('WAV data chunk not found');

  // PRIVACY: ephemeral buffer — never persisted to disk
  const pcmBytes = new Uint8Array(wavBytes.subarray(dataOffset, dataOffset + dataLength));
  const pcm = pcm16ToFloat32(pcmBytes);
  pcmBytes.fill(0); // PRIVACY: ephemeral buffer — never persisted to disk
  return pcm;
}

/** Duration in milliseconds of a mono PCM buffer at the module sample rate. */
export function pcmDurationMs(pcm: Float32Array): number {
  return Math.round((pcm.length / SAMPLE_RATE) * 1000);
}
