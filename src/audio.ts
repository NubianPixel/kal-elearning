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
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

/** Safety nudge to start playback if the load event is slow. */
const LOAD_NUDGE_MS = 250;

async function setPlaybackMode(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
  });
}

async function setRecordingMode(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
  });
}

/**
 * Play a recorded pronunciation clip from a local file URI.
 * Waits for the player to report it is loaded before starting playback
 * (reliable on both iOS AVPlayer and Android ExoPlayer), then releases
 * the player once the clip finishes.
 */
export async function playClip(uri: string): Promise<void> {
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
      player.play();
    }
    if (status.didJustFinish) {
      subscription.remove();
      release();
    }
  });

  // If the load event is slow to arrive, nudge playback so we never get stuck.
  setTimeout(() => {
    if (!started) {
      started = true;
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

/** Start recording a pronunciation clip; returns a handle to stop it. */
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
