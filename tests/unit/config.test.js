import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Config, DEFAULTS } from '../../core/config.js';
import { ConfigError } from '../../core/errors.js';

function makeMockStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
    _store: store,
  };
}

test('Config.load() falls back to defaults with no storage backend', () => {
  const cfg = new Config(null);
  const data = cfg.load();
  assert.equal(data.language, DEFAULTS.language);
});

test('Config get/set support dot-path access', () => {
  const cfg = new Config(makeMockStorage());
  cfg.load();
  assert.equal(cfg.get('voice.ttsLang'), 'hi-IN');
  cfg.set('voice.ttsLang', 'en-US');
  assert.equal(cfg.get('voice.ttsLang'), 'en-US');
  assert.equal(cfg.get('does.not.exist', 'fallback'), 'fallback');
});

test('Config.save() persists and a fresh Config.load() picks it up', () => {
  const storage = makeMockStorage();
  const cfg1 = new Config(storage);
  cfg1.load();
  cfg1.set('language', 'en');
  cfg1.set('ai.provider', 'openai');
  cfg1.save();

  const cfg2 = new Config(storage);
  cfg2.load();
  assert.equal(cfg2.get('language'), 'en');
  assert.equal(cfg2.get('ai.provider'), 'openai');
  // Unrelated defaults should still be present after merge.
  assert.equal(cfg2.get('voice.ttsLang'), 'hi-IN');
});

test('Config.save() throws ConfigError with no storage backend (fails loudly, not silently)', () => {
  const cfg = new Config(null);
  cfg.load();
  assert.throws(() => cfg.save(), (err) => err instanceof ConfigError);
});

test('Config.requireSet throws ConfigError when a required path is missing or empty', () => {
  const cfg = new Config(makeMockStorage());
  cfg.load();
  // ai.provider defaults to 'mock' (Phase 2), so use ai.proxyUrl, which
  // defaults to '' (empty = "not configured"), to test the missing case.
  assert.throws(() => cfg.requireSet('ai.proxyUrl'), (err) => err instanceof ConfigError);
  cfg.set('ai.proxyUrl', 'https://example.com/chat');
  assert.equal(cfg.requireSet('ai.proxyUrl'), 'https://example.com/chat');
});

test('redactedSnapshot masks secret-looking keys without mutating real data', () => {
  const cfg = new Config(makeMockStorage());
  cfg.load();
  cfg.set('ai.apiKey', 'sk-super-secret-value');
  const snap = cfg.redactedSnapshot();
  assert.equal(snap.ai.apiKey, '***SET***');
  assert.equal(cfg.get('ai.apiKey'), 'sk-super-secret-value'); // real value untouched
  assert.ok(!JSON.stringify(snap).includes('sk-super-secret-value'));
});

test('redactedSnapshot marks unset secret fields distinctly', () => {
  const cfg = new Config(makeMockStorage());
  cfg.load();
  cfg.set('ai.apiKey', '');
  const snap = cfg.redactedSnapshot();
  assert.equal(snap.ai.apiKey, '***UNSET***');
});

test('Config.load() recovers gracefully from corrupted JSON in storage', () => {
  const storage = makeMockStorage();
  storage.setItem('arya:config:v1', '{not valid json');
  const cfg = new Config(storage);
  const data = cfg.load();
  assert.equal(data.language, DEFAULTS.language);
});
