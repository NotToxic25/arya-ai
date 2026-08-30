/**
 * core/config.js
 *
 * Configuration management for a pure browser (no build step, no server)
 * deployment of Arya.
 *
 * IMPORTANT — read before relying on this for secrets:
 * A static HTML/CSS/JS app served by opening index.html (or a plain static
 * file server) has NO server-side process and therefore no real ".env" file
 * mechanism. There is no way to hide a secret from the browser's DevTools
 * Network tab if that secret is ever attached to a request made directly
 * from client-side JS to a third-party API. This is a hard limitation of
 * the "pure static site" architecture, not a bug in this module.
 *
 * What this module DOES do (the closest safe equivalent to env-based config):
 *   1. Never hard-codes any key/secret in source.
 *   2. Keeps user-supplied keys only in the browser's localStorage, entered
 *      via the Settings UI at runtime — never committed to the repo.
 *   3. Distinguishes "public/non-secret settings" (defaults.js, committed)
 *      from "user secrets" (localStorage only, per-browser-profile).
 *   4. Fails gracefully (returns null / raises ConfigError) instead of
 *      crashing or fabricating a working integration when a key is missing.
 *
 * What it explicitly does NOT do:
 *   - It cannot guarantee confidentiality of a key once that key is used to
 *     call a third-party API directly from the browser. For real production
 *     use with paid/rate-limited keys, a minimal backend proxy is the only
 *     way to keep a key off the client. This is documented in
 *     docs/ARCHITECTURE.md and surfaced in the Settings UI.
 */

import { ConfigError } from './errors.js';
import { rootLogger } from './logger.js';

const log = rootLogger.child('config');

const STORAGE_KEY = 'arya:config:v1';

/** Non-secret defaults. Safe to commit; contains no keys or tokens. */
export const DEFAULTS = Object.freeze({
  language: 'hinglish', // 'hinglish' | 'en' | 'hi'
  voice: {
    ttsEnabled: true,
    ttsPreferredGender: 'male',
    ttsLang: 'hi-IN',
    ttsRate: 1,
    ttsVolume: 1,
    sttLang: 'en-IN',
  },
  wakeWord: {
    enabled: false, // off by default; browser wake-word has real limitations (see wakeword module)
  },
  logging: {
    level: 'INFO',
  },
  ai: {
    // Phase 2 decision: no API key is ever stored client-side (localStorage,
    // IndexedDB, or source). 'mock' is a fully offline, deterministic,
    // non-AI demo provider (default, free, no network). 'proxy' calls a
    // user-configured backend URL (not a secret) whose server holds any
    // real provider's key. See docs/ARCHITECTURE.md.
    provider: 'mock', // 'mock' | 'proxy'
    proxyUrl: '', // endpoint URL only — never a key
    timeoutMs: 15000,
  },
  units: 'metric',
  memory: {
    // Phase 3: no secrets ever stored here — see memory/README.md and
    // core/secretDetection.js. This only tracks a UI preference (how many
    // memories to recall per turn), never memory content itself (that
    // lives in IndexedDB, not this config store).
    recallLimit: 3,
  },
});

/** Keys that are considered secrets: never logged, never exported in plain reports. */
const SECRET_KEY_PATTERN = /(key|token|secret|password|auth)/i;

export class Config {
  constructor(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    this._storage = storage;
    this._data = structuredCloneSafe(DEFAULTS);
    this._loaded = false;
  }

  /** Loads persisted (non-default) settings from localStorage, merging over defaults. */
  load() {
    if (!this._storage) {
      log.warn('No storage backend available (localStorage missing); using defaults only.');
      this._loaded = true;
      return this._data;
    }
    try {
      const raw = this._storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this._data = deepMerge(structuredCloneSafe(DEFAULTS), parsed);
      }
    } catch (err) {
      log.error('Failed to load config from storage; falling back to defaults.', err);
      this._data = structuredCloneSafe(DEFAULTS);
    }
    this._loaded = true;
    return this._data;
  }

  /** Persists current settings (including user-entered keys) to localStorage. */
  save() {
    if (!this._storage) {
      throw new ConfigError('Cannot save config: no storage backend available in this environment.');
    }
    try {
      this._storage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    } catch (err) {
      throw new ConfigError('Failed to persist config to localStorage.', { cause: err });
    }
  }

  /** Dot-path getter, e.g. get('voice.ttsLang'). */
  get(path, fallback = undefined) {
    const val = path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), this._data);
    return val === undefined ? fallback : val;
  }

  /** Dot-path setter, e.g. set('ai.provider', 'openai'). Does not auto-save. */
  set(path, value) {
    const parts = path.split('.');
    let obj = this._data;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (typeof obj[k] !== 'object' || obj[k] === null) obj[k] = {};
      obj = obj[k];
    }
    obj[parts[parts.length - 1]] = value;
    return this;
  }

  /** Throws ConfigError if a required (non-secret) config path is missing/empty. */
  requireSet(path, message) {
    const val = this.get(path);
    if (val === undefined || val === null || val === '') {
      throw new ConfigError(message ?? `Missing required config: ${path}`, { context: { path } });
    }
    return val;
  }

  /**
   * Returns a redacted snapshot safe for logging/reporting: secret-looking
   * keys are replaced with '***SET***' or '***UNSET***'.
   */
  redactedSnapshot() {
    return redact(this._data);
  }

  isLoaded() {
    return this._loaded;
  }
}

function redact(obj) {
  if (Array.isArray(obj)) return obj.map(redact);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SECRET_KEY_PATTERN.test(k)) {
        out[k] = v ? '***SET***' : '***UNSET***';
      } else if (typeof v === 'object' && v !== null) {
        out[k] = redact(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return obj;
}

function deepMerge(target, source) {
  for (const [k, v] of Object.entries(source ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object' && target[k] !== null) {
      target[k] = deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

function structuredCloneSafe(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

// Singleton instance used across the app.
export const config = new Config();
