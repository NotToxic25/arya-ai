/** Shared contracts for Phase 4 voice adapters. */
import { AryaError, VoiceError } from '../core/errors.js';

export const VoiceState = Object.freeze({ IDLE: 'idle', LISTENING: 'listening', SPEAKING: 'speaking', PAUSED: 'paused', STOPPING: 'stopping' });
export const VoiceEvent = Object.freeze({ START: 'start', PARTIAL: 'partial', FINAL: 'final', END: 'end', ERROR: 'error', SPEAK_START: 'speakstart', SPEAK_END: 'speakend', CANCEL: 'cancel', STATE: 'state' });

export function createTranscriptResult({ text, isFinal, confidence = null, alternatives = [] } = {}) {
  if (typeof text !== 'string') throw new TypeError('Transcript result text must be a string.');
  return Object.freeze({ type: isFinal ? 'final' : 'partial', text, isFinal: !!isFinal, confidence: typeof confidence === 'number' ? confidence : null, alternatives: Array.isArray(alternatives) ? alternatives : [], timestamp: new Date().toISOString() });
}

export function normalizeVoiceError(error, { operation = 'voice operation', kind = 'unknown', recoverable = false, context = {} } = {}) {
  if (error instanceof VoiceError) return error;
  if (error instanceof AryaError) return new VoiceError(error.message, { cause: error, kind, recoverable, context });
  const message = error?.message ? operation + ': ' + error.message : operation + ' failed.';
  return new VoiceError(message, { cause: error, kind, recoverable, context });
}

export class VoiceEvents {
  constructor() { this._listeners = new Map(); }
  on(event, handler) {
    if (!Object.values(VoiceEvent).includes(event)) throw new TypeError('Unknown voice event: ' + event);
    if (typeof handler !== 'function') throw new TypeError('Voice event handler must be a function.');
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler); return () => this.off(event, handler);
  }
  off(event, handler) { this._listeners.get(event)?.delete(handler); }
  emit(event, payload) { for (const h of [...(this._listeners.get(event) ?? [])]) { try { h(payload); } catch (_) {} } }
  clear() { this._listeners.clear(); }
}
