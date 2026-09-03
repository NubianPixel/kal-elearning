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
import type { AudioPlayer } from 'expo-audio';
import { File } from 'expo-file-system';

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
  uri: string;
  state: ClipState;
}

interface ActiveClip {
  uri: string;
  player: AudioPlayer;
  playing: boolean;
  onEvent?: (e: PlaybackEvent) => void;
  giveUp: ReturnType<typeof setTimeout> | null;
  released: boolean;
}

/** The one clip currently loaded (playing, paused or finishing). */
let active: ActiveClip | null = null;

const listeners = new Set<(e: ClipEvent) => void>();

function emit(uri: string, state: ClipState): void {
  const event: ClipEvent = { uri, state };
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

/** Current state for a specific uri ('stopped' when nothing/another clip is active). */
export function clipStateFor(uri: string): ClipState {
  if (active && active.uri === uri) return active.playing ? 'playing' : 'paused';
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
  emit(clip.uri, 'stopped');
}

/**
 * Start playing a local pronunciation clip. Any currently-playing clip is
 * stopped first. Playback starts only once the player truthfully reports
 * it is loaded (via the player's own status event, with a give-up timer
 * as a fallback) — the old "play() before loaded" nudge would silently
 * die on slow Android loads.
 */
export async function playClip(
  uri: string,
  onEvent?: (e: PlaybackEvent) => void,
): Promise<void> {
  await setPlaybackMode();
  startClip(uri, (e) => {
    if (e.kind === 'error') console.warn(`[audio] playClip(${uri}):`, e.message);
    onEvent?.(e);
  });
}

function startClip(uri: string, onEvent?: (e: PlaybackEvent) => void): void {
  stopActiveClip();
  const player = createAudioPlayer({ uri });
  let started = false;

  const clip: ActiveClip = {
    uri,
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
    emit(uri, 'playing');
    onEvent?.({ kind: 'playing', message: 'playback started' });
    try {
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
      emit(uri, 'ended');
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
export function toggleClip(uri: string, onEvent?: (e: PlaybackEvent) => void): boolean {
  if (active && active.uri === uri && active.playing) {
    try {
      active.player.pause();
    } catch {
      stopActiveClip();
      return false;
    }
    active.playing = false;
    emit(uri, 'paused');
    return false;
  }
  if (active && active.uri === uri && !active.playing) {
    // Paused — resume.
    active.playing = true;
    emit(uri, 'playing');
    try {
      active.player.play();
    } catch {
      stopActiveClip();
      return false;
    }
    return true;
  }
  void playClip(uri, onEvent);
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
        return recorder.uri;
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
 * `{ playing, toggle }` for one clip. `playing` is true while THIS uri is
 * the one currently making sound, so a button can swap its icon and stop
 * the clip by tapping again.
 */
export function useClipToggle(
  uri: string | null | undefined,
): { playing: boolean; toggle: () => void } {
  const [playing, setPlaying] = useState<boolean>(() =>
    uri ? clipStateFor(uri) === 'playing' : false,
  );

  useEffect(() => {
    if (!uri) {
      setPlaying(false);
      return undefined;
    }
    setPlaying(clipStateFor(uri) === 'playing');
    return subscribeClips((e) => {
      if (e.uri === uri) setPlaying(e.state === 'playing');
    });
  }, [uri]);

  const toggle = useCallback(() => {
    if (uri) toggleClip(uri);
  }, [uri]);

  return { playing, toggle };
}

