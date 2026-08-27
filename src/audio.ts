/**
 * Audio helper — playback of admin-recorded pronunciation clips and
 * in-app recording for the admin screen. Built on expo-audio (the
 * supported replacement for the deprecated expo-av); everything is
 * stored on-device (local file URI), fully offline.
 *
 * Kept in one module so the player/recorder implementation can evolve
 * without touching screens.
 *
 * Session handling: we ALWAYS set an explicit audio mode before
 * playback and after recording stops. Failing to restore the `.playback`
 * mode leaves the session in the record category, which routes output to
 * the earpiece / mutes it in silent mode (iOS) — so nothing is audible.
 */

import {
  AudioModule,
  createAudioPlayer,
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { File } from 'expo-file-system';

/** Safety nudge to start playback if the load event is slow. */
const LOAD_NUDGE_MS = 250;

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
 * Play a recorded pronunciation clip, reporting load/play/finish/error
 * events for diagnostics. Waits for the player to report it is loaded
 * before starting playback, then releases the player once finished.
 */
export async function playClip(
  uri: string,
  onEvent?: (e: PlaybackEvent) => void,
): Promise<void> {
  await setPlaybackMode();
  const player = createAudioPlayer({ uri });
  let started = false;

  const release = () => {
    try {
      player.remove();
    } catch {
      // Already released — safe to ignore.
    }
  };

  const subscription = player.addListener('playbackStatusUpdate', (status) => {
    if (!started && status.isLoaded) {
      started = true;
      onEvent?.({ kind: 'loaded', message: `loaded, duration ${status.duration?.toFixed(2) ?? '?'}s` });
      player.play();
    }
    if (status.didJustFinish) {
      onEvent?.({ kind: 'finished', message: 'playback finished' });
      subscription.remove();
      release();
    }
  });

  // If the load event is slow to arrive, nudge playback so we never get stuck.
  setTimeout(() => {
    if (!started) {
      started = true;
      onEvent?.({ kind: 'playing', message: 'forced play after load-nudge' });
      player.play();
    }
  }, LOAD_NUDGE_MS);
}

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
