/**
 * Audio helper — playback of admin-recorded pronunciation clips and
 * in-app recording for the admin screen. Built on expo-audio (the
 * supported replacement for the deprecated expo-av); everything is
 * stored on-device (local file URI), fully offline.
 *
 * Single-player manager: only ONE clip plays at a time anywhere in the
 * app. Starting a new clip (or a sound effect) cleanly releases the
 * previous player so no audio ever leaks or overlaps. Provides a
 * play/pause toggle plus a tiny state subscription so any icon in the
 * UI can flip between play and pause while its own clip is playing.
 *
 * Session handling: we ALWAYS set an explicit audio mode before
 * playback AND re-assert the playback mode after recording stops
 * (`ensurePlaybackMode`). Failing to restore the `.playback` mode
 * leaves the session in the record category, which routes output to
 * the earpiece / mutes it in silent mode (iOS) — so nothing is audible.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  AudioModule,
  createAudioPlayer,
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import type { AudioPlayer, AudioSource } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Identifies one clip: a local file URI (admin-recorded pronunciation
 * clips, speaking recordings) or a bundled `require()` asset id (content
 * audio from src/content/media.ts, which Metro resolves to a number).
 */
export type AudioKey = string | number;

function toSource(key: AudioKey): AudioSource {
  return typeof key === 'number' ? key : { uri: key };
}

/** Human-readable details about a recorded audio file, for diagnostics. */
export interface AudioFileInfo {
  exists: boolean;
  size: number | null;
  uri: string;
}

/** Check whether a recorded clip really exists on disk and its size. */
export function getAudioFileInfo(uri: string): AudioFileInfo {
  try {
    const file = new File(uri);
    return { exists: file.exists, size: file.size, uri };
  } catch {
    return { exists: false, size: null, uri };
  }
}

/** Native record-permission status (iOS+Android). */
export async function getRecordPermission(): Promise<{
  granted: boolean;
  status: string;
}> {
  try {
    const resp = await getRecordingPermissionsAsync();
    return { granted: resp.granted, status: resp.status };
  } catch (e) {
    return { granted: false, status: `unavailable: ${String(e)}` };
  }
}

/** A playback event reported to the UI for diagnostics. */
export interface PlaybackEvent {
  kind: 'loaded' | 'playing' | 'finished' | 'error';
  message: string;
  /** Clip length in milliseconds, present on 'loaded' events. */
  durationMs?: number;
}

function setPlaybackMode(): Promise<void> {
  return setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
  });
}

function setRecordingMode(): Promise<void> {
  return setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
  });
}

/**
 * Re-assert the playback audio session. Call this when a screen mounts
 * (or right after any recording session) so output is never left routed
 * to the earpiece / muted by a stale record-mode session.
 */
export function ensurePlaybackMode(): Promise<void> {
  return setPlaybackMode().catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Single-player clip manager
// ---------------------------------------------------------------------------

export type ClipState = 'playing' | 'paused' | 'ended' | 'stopped';

export interface ClipEvent {
  key: AudioKey;
  state: ClipState;
}

interface ActiveClip {
  key: AudioKey;
  player: AudioPlayer;
  playing: boolean;
  onEvent?: (e: PlaybackEvent) => void;
  giveUp: ReturnType<typeof setTimeout> | null;
  released: boolean;
}

/** The one clip currently loaded (playing, paused or finishing). */
let active: ActiveClip | null = null;

const listeners = new Set<(e: ClipEvent) => void>();

function emit(key: AudioKey, state: ClipState): void {
  const event: ClipEvent = { key, state };
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      // A subscriber must never break playback.
    }
  }
}

/** Subscribe to clip play/pause/end events anywhere in the app. Returns an unsubscribe fn. */
export function subscribeClips(listener: (e: ClipEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current state for a specific clip ('stopped' when nothing/another clip is active). */
export function clipStateFor(key: AudioKey): ClipState {
  if (active && active.key === key) return active.playing ? 'playing' : 'paused';
  return 'stopped';
}

/** Release the active player (if any) and notify listeners. */
export function stopActiveClip(): void {
  const clip = active;
  if (!clip) return;
  active = null;
  clip.released = true;
  if (clip.giveUp) clearTimeout(clip.giveUp);
  try {
    clip.player.remove();
  } catch {
    // Already released — safe to ignore.
  }
  emit(clip.key, 'stopped');
}

/**
 * Start playing a clip (a local file URI or a bundled require() asset id).
 * Any currently-playing clip is stopped first. Playback starts only once
 * the player truthfully reports it is loaded (via the player's own status
 * event, with a give-up timer as a fallback) — the old "play() before
 * loaded" nudge would silently die on slow Android loads.
 *
 * `rate`: playback speed (1 = normal). Off-1 rates enable pitch correction
 * so slowed-down speech doesn't drop in pitch.
 */
export async function playClip(
  key: AudioKey,
  onEvent?: (e: PlaybackEvent) => void,
  rate = 1,
): Promise<void> {
  await setPlaybackMode();
  startClip(
    key,
    (e) => {
      if (e.kind === 'error') console.warn(`[audio] playClip(${key}):`, e.message);
      onEvent?.(e);
    },
    rate,
  );
}

function startClip(key: AudioKey, onEvent?: (e: PlaybackEvent) => void, rate = 1): void {
  stopActiveClip();
  const player = createAudioPlayer(toSource(key));
  let started = false;

  const clip: ActiveClip = {
    key,
    player,
    playing: false,
    onEvent,
    giveUp: null,
    released: false,
  };
  active = clip;

  const tryStart = () => {
    if (clip.released || started) return;
    try {
      if (!player.isLoaded) return;
    } catch {
      return;
    }
    started = true;
    if (clip.giveUp) clearTimeout(clip.giveUp);
    onEvent?.({
      kind: 'loaded',
      message: `loaded, duration ${player.duration.toFixed(1)}s`,
      durationMs: Math.round(player.duration * 1000),
    });
    clip.playing = true;
    emit(key, 'playing');
    onEvent?.({ kind: 'playing', message: 'playback started' });
    try {
      if (rate !== 1) {
        player.shouldCorrectPitch = true;
        player.setPlaybackRate(rate, 'high');
      }
      player.play();
    } catch {
      onEvent?.({ kind: 'error', message: 'play() failed' });
      stopActiveClip();
    }
  };

  clip.giveUp = setTimeout(() => {
    if (!started && !clip.released) {
      onEvent?.({ kind: 'error', message: 'clip never became ready' });
      stopActiveClip();
    }
  }, 10000);

  const subscription = player.addListener('playbackStatusUpdate', (status) => {
    if (clip.released) return;
    if (status.isLoaded) tryStart();
    if (status.didJustFinish) {
      clip.playing = false;
      emit(key, 'ended');
      onEvent?.({ kind: 'finished', message: 'playback finished' });
      const finished = active;
      active = null;
      if (finished) {
        finished.released = true;
        if (finished.giveUp) clearTimeout(finished.giveUp);
      }
      try {
        subscription.remove();
      } catch {
        // Fine.
      }
      try {
        player.remove();
      } catch {
        // Fine.
      }
    }
  });
  tryStart();
}

/**
 * Play the clip, or pause it when it is already playing. Returns true when
 * the clip is now playing (i.e. the UI should show a pause icon).
 */
export function toggleClip(key: AudioKey, onEvent?: (e: PlaybackEvent) => void): boolean {
  if (active && active.key === key && active.playing) {
    try {
      active.player.pause();
    } catch {
      stopActiveClip();
      return false;
    }
    active.playing = false;
    emit(key, 'paused');
    return false;
  }
  if (active && active.key === key && !active.playing) {
    // Paused — resume.
    active.playing = true;
    emit(key, 'playing');
    try {
      active.player.play();
    } catch {
      stopActiveClip();
      return false;
    }
    return true;
  }
  void playClip(key, onEvent);
  return true;
}

// ---------------------------------------------------------------------------
// Correct / wrong sound effects (bundled WAV resources)
// ---------------------------------------------------------------------------

type EffectKind = 'correct' | 'wrong';

/**
 * One player per effect kind, created once and reused for every tap
 * (rewound to the start each time) instead of building a fresh player +
 * re-requiring the asset on every correct/wrong answer.
 */
const effectPlayers = new Map<EffectKind, { player: AudioPlayer; ready: boolean }>();

function getEffectPlayer(kind: EffectKind): { player: AudioPlayer; ready: boolean } {
  let entry = effectPlayers.get(kind);
  if (!entry) {
    const assetId =
      kind === 'correct'
        ? (require('../assets/sounds/correct.wav') as number)
        : (require('../assets/sounds/wrong.wav') as number);
    entry = { player: createAudioPlayer({ assetId }), ready: false };
    effectPlayers.set(kind, entry);
  }
  return entry;
}

export function playEffect(kind: EffectKind): void {
  void (async () => {
    try {
      await setPlaybackMode();
    } catch (e) {
      console.warn(`[audio] setPlaybackMode failed before "${kind}" effect:`, e);
    }
    stopActiveClip();
    const entry = getEffectPlayer(kind);
    const { player } = entry;

    const start = () => {
      try {
        player.seekTo(0);
        player.play();
      } catch (e) {
        console.warn(`[audio] play() threw for "${kind}" effect:`, e);
      }
    };

    if (entry.ready || player.isLoaded) {
      entry.ready = true;
      start();
      return;
    }

    // First tap only: the freshly-created player hasn't finished loading
    // yet, so poll briefly until it has (with a give-up timer).
    let started = false;
    const poll = setInterval(() => {
      if (started) return;
      try {
        if (!player.isLoaded) return;
      } catch {
        return;
      }
      started = true;
      entry.ready = true;
      clearInterval(poll);
      clearTimeout(giveUp);
      start();
    }, 100);
    const giveUp = setTimeout(() => {
      if (!started) {
        clearInterval(poll);
        console.warn(`[audio] "${kind}" effect never became ready (asset/focus issue?)`);
      }
    }, 3000);
  })();
}

// ---------------------------------------------------------------------------
// Recording (admin screen)
// ---------------------------------------------------------------------------

export async function requestMicPermission(): Promise<boolean> {
  const { granted } = await requestRecordingPermissionsAsync();
  return granted;
}

/**
 * Dedicated cache subdirectory for speaking recordings only — keeps the
 * privacy sweep from ever touching expo-asset's own cached bundled audio
 * (e.g. dev-build `ExponentAsset-*.m4a`) or anything else in `Paths.cache`.
 */
const RECORDINGS_DIR_NAME = 'kal-recordings';

function recordingsDir(): Directory {
  const dir = new Directory(Paths.cache, RECORDINGS_DIR_NAME);
  try {
    dir.create({ intermediates: true, idempotent: true });
  } catch {
    // Best-effort — if this fails, the move below will surface the error.
  }
  return dir;
}

/** Delete a recorded clip's temp file. Best-effort; never throws — callers
 *  fire this on rating, on leaving a line/screen, and on app background. */
export function deleteRecording(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // Already gone (or never existed) — fine, this is cleanup.
  }
}

/**
 * Privacy sweep: speaking recordings live only in `Paths.cache/kal-recordings/`
 * (see `startRecording`), meant to be deleted right after use (see
 * `deleteRecording`). Call once on app start to catch anything left behind
 * by a crash or force-quit — deletes only the contents of that directory,
 * never anything else in the shared cache dir.
 */
export function sweepLeftoverRecordings(): void {
  try {
    const dir = new Directory(Paths.cache, RECORDINGS_DIR_NAME);
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      try {
        entry.delete();
      } catch {
        // Best-effort.
      }
    }
  } catch {
    // Never block app start over a privacy-cleanup sweep.
  }
}

export interface ActiveRecording {
  stop: () => Promise<string | null>;
}

/**
 * Start recording a pronunciation clip; returns a handle to stop it.
 * Also reports permission/readiness for diagnostics.
 */
export async function startRecording(): Promise<ActiveRecording> {
  await setRecordingMode();

  const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
  await recorder.prepareToRecordAsync();
  recorder.record();

  let stopped = false;
  return {
    stop: async () => {
      if (stopped) return recorder.uri;
      stopped = true;
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) return null;
        // Move (never copy) the recording into its own cache subdirectory so
        // the privacy sweep can safely delete "everything in here" without
        // risking any other cached audio (see sweepLeftoverRecordings).
        try {
          const file = new File(uri);
          file.moveSync(recordingsDir());
          return file.uri;
        } catch (e) {
          console.warn('[audio] failed to move recording into kal-recordings/:', e);
          return uri;
        }
      } finally {
        // Restore a clean playback session so the recorded clip is audible.
        await setPlaybackMode().catch(() => undefined);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// React hook — flip a play/pause icon for a single clip uri
// ---------------------------------------------------------------------------

/**
 * `{ playing, toggle }` for one clip. `playing` is true while THIS key is
 * the one currently making sound, so a button can swap its icon and stop
 * the clip by tapping again.
 */
export function useClipToggle(
  uri: AudioKey | null | undefined,
): { playing: boolean; toggle: () => void } {
  const [playing, setPlaying] = useState<boolean>(() =>
    uri != null ? clipStateFor(uri) === 'playing' : false,
  );

  useEffect(() => {
    if (uri == null) {
      setPlaying(false);
      return undefined;
    }
    setPlaying(clipStateFor(uri) === 'playing');
    return subscribeClips((e) => {
      if (e.key === uri) setPlaying(e.state === 'playing');
    });
  }, [uri]);

  const toggle = useCallback(() => {
    if (uri != null) toggleClip(uri);
  }, [uri]);

  return { playing, toggle };
}

