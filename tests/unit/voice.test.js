import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSpeechToText } from '../../voice/speechToText.js';
import { BrowserTextToSpeech } from '../../voice/textToSpeech.js';
import { VoiceEvent, VoiceState, createTranscriptResult, normalizeVoiceError } from '../../voice/contracts.js';
import { VoiceError } from '../../core/errors.js';

class FakeRecognition {
  static instances = [];
  constructor() { FakeRecognition.instances.push(this); }
  start() { this.started = true; this.onstart?.(); }
  stop() { this.stopped = true; this.onend?.(); }
  abort() { this.aborted = true; this.onend?.(); }
}
class FakeUtterance { constructor(text) { this.text = text; } }
function fakeSynthesis() {
  return { spoken: [], voices: [{ name: 'Hindi Male', lang: 'hi-IN' }], speak(u) { this.spoken.push(u); }, cancel() { this.cancelled = true; }, pause() { this.paused = true; }, resume() { this.resumed = true; }, getVoices() { return this.voices; } };
}

test('voice contracts normalize transcript and errors', () => {
  const result = createTranscriptResult({ text: 'hello', isFinal: true, confidence: .9 });
  assert.deepEqual({ type: result.type, text: result.text, isFinal: result.isFinal, confidence: result.confidence }, { type: 'final', text: 'hello', isFinal: true, confidence: .9 });
  const error = normalizeVoiceError(new Error('denied'), { operation: 'STT', kind: 'permission' });
  assert.ok(error instanceof VoiceError); assert.equal(error.kind, 'permission'); assert.match(error.message, /STT: denied/);
});

test('STT uses SpeechRecognition, configured options, partial/final results, and lifecycle', () => {
  FakeRecognition.instances.length = 0;
  const stt = new BrowserSpeechToText({ recognitionFactory: FakeRecognition, language: 'en-IN', continuous: false });
  const events = []; stt.on(VoiceEvent.PARTIAL, x => events.push(['partial', x])); stt.on(VoiceEvent.FINAL, x => events.push(['final', x])); stt.start();
  const r = FakeRecognition.instances[0];
  assert.equal(r.lang, 'en-IN'); assert.equal(r.interimResults, true); assert.equal(stt.state, VoiceState.LISTENING);
  r.onresult({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: 'hel' }, length: 1 }, { isFinal: true, 0: { transcript: 'hello', confidence: .8 }, length: 1 }] });
  assert.equal(events[0][0], 'partial'); assert.equal(events[0][1].text, 'hel'); assert.equal(events[1][0], 'final'); assert.equal(events[1][1].text, 'hello');
  stt.stop(); assert.equal(r.stopped, true); assert.equal(stt.state, VoiceState.IDLE);
});

test('STT maps recognition errors and supports webkit fallback, abort, and dispose', () => {
  let instance; class Webkit extends FakeRecognition { constructor() { super(); instance = this; } }
  const errors = []; const stt = new BrowserSpeechToText({ windowRef: { webkitSpeechRecognition: Webkit } }); stt.on(VoiceEvent.ERROR, e => errors.push(e)); stt.start(); instance.onerror({ error: 'not-allowed' });
  assert.equal(errors[0].kind, 'not-allowed'); assert.equal(errors[0].recoverable, false); stt.abort(); stt.dispose(); assert.throws(() => stt.start(), VoiceError);
  assert.throws(() => new BrowserSpeechToText({ windowRef: {} }).start(), VoiceError);
});

test('TTS creates configured utterances, selects voice, queues, and tracks lifecycle', async () => {
  const synthesis = fakeSynthesis(); const tts = new BrowserTextToSpeech({ synthesis, utteranceFactory: FakeUtterance, language: 'hi-IN', rate: 1.1, volume: .7 });
  const p1 = tts.speak('one'); const p2 = tts.speak('two'); assert.equal(synthesis.spoken.length, 1); const first = synthesis.spoken[0];
  assert.equal(first.lang, 'hi-IN'); assert.equal(first.rate, 1.1); assert.equal(first.volume, .7); assert.equal(first.voice.name, 'Hindi Male'); first.onstart(); assert.equal(tts.state, VoiceState.SPEAKING); first.onend(); assert.deepEqual(await p1, { cancelled: false, text: 'one' });
  assert.equal(synthesis.spoken.length, 2); synthesis.spoken[1].onend(); assert.deepEqual(await p2, { cancelled: false, text: 'two' }); assert.equal(tts.state, VoiceState.IDLE);
});

test('TTS supports pause/resume, cancel, errors, and unsupported handling', async () => {
  const synthesis = fakeSynthesis(); const tts = new BrowserTextToSpeech({ synthesis, utteranceFactory: FakeUtterance }); const p = tts.speak('cancel me'); tts.pause(); assert.equal(tts.state, VoiceState.PAUSED); tts.resume(); assert.equal(tts.state, VoiceState.SPEAKING); tts.cancel(); assert.deepEqual(await p, { cancelled: true, text: 'cancel me' }); assert.equal(synthesis.cancelled, true);
  await assert.rejects(() => new BrowserTextToSpeech({}).speak('x'), e => e instanceof VoiceError && e.kind === 'unsupported');
  await assert.rejects(() => tts.speak(''), e => e instanceof VoiceError && e.kind === 'input');
});
