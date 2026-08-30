import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProxyProvider } from '../../ai/providers/proxyProvider.js';
import { ConfigError, NetworkError } from '../../core/errors.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('ProxyProvider throws ConfigError immediately when no proxyUrl is configured (never fabricates a response)', async () => {
  const provider = new ProxyProvider({});
  await assert.rejects(() => provider.generateResponse([]), ConfigError);
});

test('ProxyProvider never accepts or forwards an apiKey option', () => {
  const provider = new ProxyProvider({ proxyUrl: 'https://example.com/chat' });
  assert.equal(provider.apiKey, undefined);
  assert.equal('apiKey' in provider, false);
});

test('ProxyProvider returns a normalized AIResponse on success', async () => {
  const fetchImpl = async () => jsonResponse(200, { role: 'assistant', content: 'hi from backend', toolCalls: null });
  const provider = new ProxyProvider({ proxyUrl: 'https://example.com/chat', fetchImpl });
  const response = await provider.generateResponse([{ role: 'user', content: 'hi' }]);
  assert.equal(response.content, 'hi from backend');
  assert.equal(response.toolCalls, null);
});

test('ProxyProvider throws NetworkError on non-2xx status', async () => {
  const fetchImpl = async () => jsonResponse(500, { error: 'server exploded' });
  const provider = new ProxyProvider({ proxyUrl: 'https://example.com/chat', fetchImpl });
  await assert.rejects(() => provider.generateResponse([]), NetworkError);
});

test('ProxyProvider throws NetworkError when fetch itself rejects (e.g. DNS/connection failure)', async () => {
  const fetchImpl = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
  const provider = new ProxyProvider({ proxyUrl: 'https://example.com/chat', fetchImpl });
  await assert.rejects(() => provider.generateResponse([]), NetworkError);
});

test('ProxyProvider throws NetworkError when the response body is not valid JSON', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => { throw new SyntaxError('Unexpected token'); },
    text: async () => 'not json',
  });
  const provider = new ProxyProvider({ proxyUrl: 'https://example.com/chat', fetchImpl });
  await assert.rejects(() => provider.generateResponse([]), NetworkError);
});

test('ProxyProvider throws NetworkError when the response shape does not match the AIResponse contract', async () => {
  const fetchImpl = async () => jsonResponse(200, { unexpected: true });
  const provider = new ProxyProvider({ proxyUrl: 'https://example.com/chat', fetchImpl });
  await assert.rejects(() => provider.generateResponse([]), NetworkError);
});

test('ProxyProvider times out and throws NetworkError if the backend never responds', async () => {
  const fetchImpl = (url, { signal } = {}) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(jsonResponse(200, { content: 'too late' })), 500);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      }
    });
  const provider = new ProxyProvider({ proxyUrl: 'https://example.com/chat', timeoutMs: 50, fetchImpl });
  await assert.rejects(() => provider.generateResponse([]), NetworkError);
});
