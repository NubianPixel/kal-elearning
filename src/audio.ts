/**
 * Audio helper — playback of admin-recorded pronunciation clips and
 * in-app recording for the admin screen. Uses expo-av; everything is
 * stored on-device (local file URI), fully offline.
 *
 * Kept in one module so the player/recorder implementation can be
 * swapped (e.g. to expo-audio) without touching screens.
 */

import { Audio } from 'expo-av';

let configured = false;

async function ensureAudioMode(): Promise<void> {
  if (configured) return;
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });
  configured = true;
}

/** Play a recorded pronunciation clip from a local file URI. */
export async function playClip(uri: string): Promise<void> {
  await ensureAudioMode();
  const { sound } = await Audio.Sound.createAsync({ uri });
  try {
    await sound.playAsync();
    // Give the clip time to finish before unloading (no status subscription
    // needed for short clips; a few seconds of headroom is sufficient).
    await new Promise((resolve) => setTimeout(resolve, 4000));
  } finally {
    await sound.unloadAsync();
  }
}

export async function requestMicPermission(): Promise<boolean> {
  const { granted } = await Audio.requestPermissionsAsync();
  return granted;
}

export interface ActiveRecording {
  stop: () => Promise<string | null>;
}

/** Start recording a pronunciation clip; returns a handle to stop it. */
export async function startRecording(): Promise<ActiveRecording> {
  await ensureAudioMode();
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });
  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  await recording.startAsync();
  return {
    stop: async () => {
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        return uri;
      } finally {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      }
    },
  };
}
