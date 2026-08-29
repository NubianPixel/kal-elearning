/**
 * Speech-recognition service for the Learn tab's pronunciation game.
 *
 * Built on the `expo-speech-recognition` community module, which ships a
 * NATIVE module — it only exists in development-client / production
 * builds, NOT in Expo Go. Everything here therefore lazy-requires the
 * module so the rest of the app keeps working wherever it is missing;
 * callers check `speechAvailable()` first and fall back to
 * listen-and-repeat (record & replay) when it is not.
 */

import { ensurePlaybackMode } from '../audio';

type SpeechModule = typeof import('expo-speech-recognition');

let cached: SpeechModule | null | undefined;

function getModule(): SpeechModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-speech-recognition') as SpeechModule;
    cached = mod?.ExpoSpeechRecognitionModule ? mod : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** True when the native speech recognizer is available in this build. */
export function speechAvailable(): boolean {
  return getModule() !== null;
}

/** Ask for mic + speech-recognition permission; true when granted. */
export async function requestSpeechPermission(): Promise<boolean> {
  const mod = getModule();
  if (!mod) return false;
  try {
    const resp = await mod.ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return !!resp.granted;
  } catch {
    return false;
  }
}

export interface DictationHandlers {
  /** Interim transcript while the child is still speaking. */
  onPartial?: (text: string) => void;
  /** Final transcript once the recognizer stops. */
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  /** Recognizer finished (result, error or stopped). */
  onEnd?: () => void;
}

export interface DictationSession {
  /** Ask the recognizer to wrap up and emit a final result. */
  stop: () => void;
}

/**
 * Start one listen-and-transcribe round. Returns null when the native
 * module is unavailable or start fails. Listeners are torn down on end.
 */
export function startDictation(
  lang: string,
  handlers: DictationHandlers,
): DictationSession | null {
  const mod = getModule();
  if (!mod) return null;
  const native = mod.ExpoSpeechRecognitionModule;

  const subscriptions: Array<{ remove: () => void }> = [];
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    for (const sub of subscriptions) {
      try {
        sub.remove();
      } catch {
        // Already removed — fine.
      }
    }
    // The recognizer's mic session can leave iOS routed to record-category
    // audio; restore playback mode so the next "Hear it" tap is audible.
    ensurePlaybackMode();
    handlers.onEnd?.();
  };

  subscriptions.push(
    native.addListener('result', (event) => {
      const text = event?.results?.[0]?.transcript ?? '';
      if (event.isFinal) handlers.onFinal(text);
      else handlers.onPartial?.(text);
    }),
  );
  subscriptions.push(
    native.addListener('error', (event) => {
      handlers.onError(String(event?.error ?? event?.message ?? 'speech error'));
      finish();
    }),
  );
  subscriptions.push(native.addListener('end', () => finish()));

  try {
    native.start({
      lang,
      interimResults: true,
      maxAlternatives: 1,
      continuous: false,
      requiresOnDeviceRecognition: false,
    });
  } catch (e) {
    finish();
    handlers.onError(`Could not start speech recognition: ${String(e)}`);
    return null;
  }

  return {
    stop: () => {
      try {
        native.stop();
      } catch {
        finish();
      }
    },
  };
}
