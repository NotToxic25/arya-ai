/**
 * ai/providers/proxyProvider.js
 *
 * Calls a backend HTTP endpoint that the user configures (a plain URL,
 * not a secret). That backend — which this project does NOT include and
 * does not implement — is responsible for holding any real provider's
 * API key server-side and forwarding the request. This file never reads,
 * stores, or sends an API key from the browser.
 *
 * Expected backend contract (documented in docs/ARCHITECTURE.md):
 *   POST {proxyUrl}
 *   body: { messages: [...], tools: [...] }
 *   response: { role: 'assistant', content: string|null, toolCalls: [...]|null }
 *
 * If proxyUrl is not configured, this provider fails loudly with a
 * ConfigError immediately — it never fabricates a response.
 */
import { AIProvider } from '../AIProvider.js';
import { ConfigError, NetworkError } from '../../core/errors.js';

const DEFAULT_TIMEOUT_MS = 15000;

export class ProxyProvider extends AIProvider {
  /**
   * @param {Object} opts
   * @param {string} opts.proxyUrl - endpoint URL of the user's own backend proxy (not a secret)
   * @param {number} [opts.timeoutMs]
   * @param {typeof fetch} [opts.fetchImpl] - injectable for testing
   */
  constructor({ proxyUrl, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
    super({ name: 'proxy', supportsStreaming: false, requiresNetwork: true, requiresBackend: true });
    this.proxyUrl = proxyUrl;
    this.timeoutMs = timeoutMs;
    this._fetch = fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  }

  async generateResponse(messages, options = {}) {
    if (!this.proxyUrl) {
      throw new ConfigError(
        'No backend proxy URL configured. This provider never sends an API key from the browser; ' +
          'configure a proxy endpoint in Settings to enable real AI responses.'
      );
    }
    if (!this._fetch) {
      throw new NetworkError('No fetch implementation available in this environment.');
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(new NetworkError(`Request to proxy timed out after ${this.timeoutMs}ms.`)), this.timeoutMs)
      : null;

    try {
      let res;
      try {
        res = await this._fetch(this.proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, tools: options.tools ?? [] }),
          signal: controller ? controller.signal : options.signal,
        });
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw new NetworkError(`Request to proxy timed out after ${this.timeoutMs}ms.`, { cause: err });
        }
        throw new NetworkError(`Failed to reach backend proxy at ${this.proxyUrl}: ${err.message}`, { cause: err });
      }

      if (!res.ok) {
        let bodyText = '';
        try {
          bodyText = await res.text();
        } catch {
          /* ignore */
        }
        throw new NetworkError(`Backend proxy returned HTTP ${res.status}${bodyText ? `: ${bodyText}` : ''}`, {
          context: { status: res.status },
        });
      }

      let data;
      try {
        data = await res.json();
      } catch (err) {
        throw new NetworkError('Backend proxy returned a response that was not valid JSON.', { cause: err });
      }

      if (!data || typeof data !== 'object' || !('content' in data || 'toolCalls' in data)) {
        throw new NetworkError('Backend proxy response did not match the expected AIResponse shape.', { context: { data } });
      }

      return {
        role: 'assistant',
        content: data.content ?? null,
        toolCalls: data.toolCalls ?? null,
        raw: data,
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

export default ProxyProvider;
