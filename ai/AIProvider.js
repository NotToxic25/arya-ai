/**
 * ai/AIProvider.js
 *
 * Abstract interface every AI provider must implement. This is the
 * abstraction layer that lets Arya switch providers via config without
 * touching orchestration code (Phase 2 acceptance criterion: "provider
 * switching capability").
 *
 * Contract:
 *   generateResponse(messages, options) -> Promise<AIResponse>
 *   streamResponse(messages, options)   -> AsyncGenerator<StreamChunk>  (optional)
 *
 * AIResponse shape:
 *   {
 *     role: 'assistant',
 *     content: string | null,        // null when the model only wants to call tools
 *     toolCalls: [{ id, name, arguments }] | null,
 *     raw: any                        // provider-specific raw payload, for debugging only
 *   }
 *
 * StreamChunk shape:
 *   { delta: string, done: boolean }
 *
 * `messages` is the plain array from ConversationContext.getMessages():
 *   [{ role: 'system'|'user'|'assistant'|'tool', content, toolCalls?, toolCallId?, name? }, ...]
 *
 * `options`:
 *   { tools: ToolDescriptor[], signal: AbortSignal }
 *   ToolDescriptor: { name, description, parameters } (JSON-schema-like)
 *
 * Providers MUST NOT silently return a fabricated response on failure —
 * throw a core/errors.js subclass (NetworkError, ConfigError, etc.) instead.
 */

import { UnsupportedFeatureError } from '../core/errors.js';

export class AIProvider {
  /**
   * @param {Object} opts
   * @param {string} opts.name - unique provider id, e.g. 'mock', 'proxy'
   * @param {boolean} [opts.supportsStreaming]
   * @param {boolean} [opts.requiresNetwork] - false for fully local/offline providers
   * @param {boolean} [opts.requiresBackend] - true if this provider needs an external service the app doesn't control
   */
  constructor({ name, supportsStreaming = false, requiresNetwork = true, requiresBackend = false } = {}) {
    if (new.target === AIProvider) {
      throw new TypeError('AIProvider is abstract and cannot be instantiated directly.');
    }
    this.name = name;
    this.supportsStreaming = supportsStreaming;
    this.requiresNetwork = requiresNetwork;
    this.requiresBackend = requiresBackend;
  }

  /**
   * @param {Array} messages
   * @param {Object} options
   * @returns {Promise<{role:'assistant', content:(string|null), toolCalls:(Array|null), raw:any}>}
   */
  // eslint-disable-next-line no-unused-vars
  async generateResponse(messages, options = {}) {
    throw new UnsupportedFeatureError(`Provider "${this.name}" does not implement generateResponse().`);
  }

  /**
   * Default streaming fallback: providers that don't truly support
   * streaming still get a single "chunk" so callers can use one code path.
   * @param {Array} messages
   * @param {Object} options
   */
  async *streamResponse(messages, options = {}) {
    const response = await this.generateResponse(messages, options);
    yield { delta: response.content ?? '', done: false, response };
    yield { delta: '', done: true, response };
  }
}

export default AIProvider;
