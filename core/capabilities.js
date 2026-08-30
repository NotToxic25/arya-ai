/**
 * core/capabilities.js
 *
 * Central, honest feature-detection for the browser environment. Every
 * later module (voice, wakeword, memory, tools) should check here instead
 * of assuming a browser API exists. This is how the project satisfies the
 * "never pretend to support something the platform can't do" requirement.
 */

export function detectCapabilities(win = (typeof window !== 'undefined' ? window : {})) {
  const SpeechRecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition || null;

  return Object.freeze({
    localStorage: safeCheck(() => typeof win.localStorage !== 'undefined' && !!win.localStorage),
    indexedDB: safeCheck(() => typeof win.indexedDB !== 'undefined' && !!win.indexedDB),
    speechRecognition: !!SpeechRecognitionCtor,
    speechSynthesis: safeCheck(() => typeof win.speechSynthesis !== 'undefined'),
    mediaDevices: safeCheck(() => !!(win.navigator && win.navigator.mediaDevices && win.navigator.mediaDevices.getUserMedia)),
    notifications: safeCheck(() => typeof win.Notification !== 'undefined'),
    onLine: safeCheck(() => !!(win.navigator && 'onLine' in win.navigator)),
    // Structural/architectural limitations of a pure static-site-in-a-tab app.
    // These are always false — documented here rather than silently absent.
    backgroundWakeWord: false, // a browser tab cannot listen when not open/foregrounded
    trueOfflineSTT: false, // Web Speech API STT is cloud-backed in Chrome
    nativeAppLaunching: false, // no OS-level intent system from a webpage
    nativeSystemInfo: false, // only a small, permissioned subset (battery/network) is exposable
    secureClientSideSecrets: false, // any key used directly from browser JS is visible in DevTools
  });
}

function safeCheck(fn) {
  try {
    return !!fn();
  } catch (_) {
    return false;
  }
}

/** Human-readable explanation for a capability flag, used by the UI/tools to explain limitations. */
export const CAPABILITY_NOTES = Object.freeze({
  backgroundWakeWord:
    'Wake-word detection only runs while this browser tab is open and in the foreground. It cannot listen when the tab/browser is closed or the phone is locked — that requires a native Android app.',
  trueOfflineSTT:
    "Chrome's built-in speech recognition (Web Speech API) sends audio to Google's servers to transcribe it; it is not a fully offline/local STT engine.",
  nativeAppLaunching:
    'Web pages cannot launch other installed Android apps directly. Where possible, Arya will offer an app/intent-style link (e.g. tel:, mailto:, or a custom URL scheme) but this only works for apps that register such links.',
  nativeSystemInfo:
    'Browsers only expose a limited, permissioned subset of device info (e.g. Battery Status API where supported, navigator.onLine). Full system info (installed apps, storage, etc.) is not accessible to a webpage.',
  secureClientSideSecrets:
    'Any API key used directly from this page is visible in the browser DevTools Network tab. For real secret confidentiality, a small backend proxy is required — see docs/ARCHITECTURE.md.',
});
