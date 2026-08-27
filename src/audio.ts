/**
 * Audio helper — playback of admin-recorded pronunciation clips and
 * in-app recording for the admin screen. Built on expo-audio (the
 * supported replacement for the deprecated expo-av); everything is
 * stored on-device (local file URI), fully offline.
 *
 * Kept in one module so the player/recorder implementation can evolve
 * without touching screens.
 */

import {
  AudioModule,
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

/** Fallback release timer for playback (ms) in case the finish event
 *  never fires on some platforms. Pronunciation clips are short. */
const PLAYBACK_RELEASE_FALLBACK_MS = 20000;

let configured = false;

async function ensureAudioMode(): Promise<void> {
  if (configured) return;
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
  });
  configured = true;
}

/** Play a recorded pronunciation clip from a local file URI. */
export async function playClip(uri: string): Promise<void> {
  await ensureAudioMode();
  const player = createAudioPlayer({ uri });
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(fallbackTimer);
    try {
      player.remove();
    } catch {
      // Already released — safe to ignore.
    }
  };

  const fallbackTimer = setTimeout(release, PLAYBACK_RELEASE_FALLBACK_MS);
  const subscription = player.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) {
      subscription.remove();
      release();
    }
  });

  player.play();
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
  await ensureAudioMode();
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
  });

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
        await setAudioModeAsync({ allowsRecording: false });
      }
    },
  };
}
