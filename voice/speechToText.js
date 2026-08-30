import { rootLogger } from '../core/logger.js';
import { VoiceError } from '../core/errors.js';
import { VoiceEvent, VoiceState, VoiceEvents, createTranscriptResult, normalizeVoiceError } from './contracts.js';

export class BrowserSpeechToText {
  constructor({ windowRef = globalThis, language = 'en-IN', interimResults = true, continuous = false, maxAlternatives = 1, recognitionFactory, logger = rootLogger.child('voice:stt') } = {}) {
    this.windowRef = windowRef; this.language = language; this.interimResults = interimResults; this.continuous = continuous; this.maxAlternatives = maxAlternatives; this._factory = recognitionFactory; this.log = logger; this.events = new VoiceEvents(); this.state = VoiceState.IDLE; this._recognition = null; this._disposed = false;
  }
  get supported() { return typeof (this._factory ?? this.windowRef?.SpeechRecognition ?? this.windowRef?.webkitSpeechRecognition) === 'function'; }
  on(event, handler) { return this.events.on(event, handler); }
  _setState(state) { this.state = state; this.events.emit(VoiceEvent.STATE, state); }
  _makeRecognition() { const Ctor = this._factory ?? this.windowRef?.SpeechRecognition ?? this.windowRef?.webkitSpeechRecognition; if (typeof Ctor !== 'function') throw new VoiceError('Speech recognition is not supported in this browser.', { kind: 'unsupported', recoverable: false }); return new Ctor(); }
  _wire(recognition) {
    recognition.lang = this.language; recognition.interimResults = this.interimResults; recognition.continuous = this.continuous; recognition.maxAlternatives = this.maxAlternatives;
    recognition.onstart = () => { this._setState(VoiceState.LISTENING); this.events.emit(VoiceEvent.START); };
    recognition.onresult = (event) => {
      let partial = '', finalText = '', confidence = null, alternatives = [];
      for (let i = event.resultIndex ?? 0; i < event.results.length; i++) { const result = event.results[i]; const item = result[0]; if (!item) continue; if (result.isFinal) { finalText += item.transcript; confidence = typeof item.confidence === 'number' ? item.confidence : confidence; alternatives = Array.from(result, x => x.transcript); } else partial += item.transcript; }
      if (partial) this.events.emit(VoiceEvent.PARTIAL, createTranscriptResult({ text: partial, isFinal: false, confidence, alternatives }));
      if (finalText.trim()) this.events.emit(VoiceEvent.FINAL, createTranscriptResult({ text: finalText.trim(), isFinal: true, confidence, alternatives }));
    };
    recognition.onerror = (event) => { const kind = event?.error ?? 'recognition'; const recoverable = !['not-allowed', 'service-not-allowed', 'audio-capture'].includes(kind); const err = normalizeVoiceError(new Error(event?.message || kind), { operation: 'Speech recognition', kind, recoverable }); this._setState(VoiceState.IDLE); this.events.emit(VoiceEvent.ERROR, err); };
    recognition.onend = () => { this._setState(VoiceState.IDLE); this.events.emit(VoiceEvent.END); };
  }
  start() { if (this._disposed) throw new VoiceError('Speech recognition has been disposed.', { kind: 'lifecycle' }); if (this.state === VoiceState.LISTENING) return; const r = this._makeRecognition(); this._recognition = r; this._wire(r); try { r.start(); } catch (error) { this._recognition = null; this._setState(VoiceState.IDLE); const err = normalizeVoiceError(error, { operation: 'Could not start speech recognition', kind: error?.name === 'NotAllowedError' ? 'permission' : 'start' }); this.events.emit(VoiceEvent.ERROR, err); throw err; } }
  stop() { if (!this._recognition) return; this._setState(VoiceState.STOPPING); try { this._recognition.stop(); } catch (error) { const err = normalizeVoiceError(error, { operation: 'Could not stop speech recognition', kind: 'stop', recoverable: true }); this.events.emit(VoiceEvent.ERROR, err); } }
  abort() { if (!this._recognition) return; try { this._recognition.abort(); } catch (error) { this.events.emit(VoiceEvent.ERROR, normalizeVoiceError(error, { operation: 'Could not abort speech recognition', kind: 'abort', recoverable: true })); } this._setState(VoiceState.IDLE); }
  dispose() { this.abort(); this._disposed = true; this.events.clear(); this._recognition = null; }
}
