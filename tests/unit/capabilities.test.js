import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectCapabilities, CAPABILITY_NOTES } from '../../core/capabilities.js';

test('detectCapabilities returns all-false gracefully with an empty window stub (Node env)', () => {
  const caps = detectCapabilities({});
  assert.equal(caps.localStorage, false);
  assert.equal(caps.speechRecognition, false);
  assert.equal(caps.speechSynthesis, false);
  assert.equal(caps.mediaDevices, false);
});

test('detectCapabilities never throws even if navigator/window fields are malformed', () => {
  const weirdWindow = { navigator: null, get localStorage() { throw new Error('boom'); } };
  assert.doesNotThrow(() => detectCapabilities(weirdWindow));
});

test('structural limitations are always reported false regardless of window shape', () => {
  const fullishWindow = {
    localStorage: {},
    indexedDB: {},
    SpeechRecognition: function () {},
    speechSynthesis: {},
    navigator: { mediaDevices: { getUserMedia: () => {} }, onLine: true },
    Notification: function () {},
  };
  const caps = detectCapabilities(fullishWindow);
  assert.equal(caps.localStorage, true);
  assert.equal(caps.speechRecognition, true);
  // These are architectural limitations of a static browser app; must remain false.
  assert.equal(caps.backgroundWakeWord, false);
  assert.equal(caps.trueOfflineSTT, false);
  assert.equal(caps.nativeAppLaunching, false);
  assert.equal(caps.nativeSystemInfo, false);
  assert.equal(caps.secureClientSideSecrets, false);
});

test('every always-false structural flag has a human-readable explanation', () => {
  const caps = detectCapabilities({});
  const structuralFlags = ['backgroundWakeWord', 'trueOfflineSTT', 'nativeAppLaunching', 'nativeSystemInfo', 'secureClientSideSecrets'];
  for (const flag of structuralFlags) {
    assert.equal(caps[flag], false);
    assert.ok(CAPABILITY_NOTES[flag] && CAPABILITY_NOTES[flag].length > 10, `missing note for ${flag}`);
  }
});
