/**
 * ai/ConversationContext.js
 * Manages the structured message list passed to an AI provider:
 * system / user / assistant / tool messages, with basic trimming so the
 * context doesn't grow unbounded across a long session.
 */

const DEFAULT_SYSTEM_PROMPT =
  'You are Arya, a helpful personal AI assistant. Respond primarily in ' +
  'Hinglish (a natural mix of Hindi and English) unless the user asks for ' +
  'a specific language. Be concise, honest, and never claim to have taken ' +
  'an action (like calling a tool or accessing a device feature) that you ' +
  'did not actually perform.';

export class ConversationContext {
  /**
   * @param {Object} opts
   * @param {string} [opts.systemPrompt]
   * @param {number} [opts.maxMessages] - max non-system messages retained (sliding window)
   */
  constructor({ systemPrompt = DEFAULT_SYSTEM_PROMPT, maxMessages = 40 } = {}) {
    this.systemPrompt = systemPrompt;
    this.maxMessages = maxMessages;
    this._messages = [];
    this._memoryNote = null;
  }

  /**
   * @param {Object} message - { role: 'user'|'assistant'|'tool', content, toolCalls?, toolCallId?, name? }
   */
  addMessage(message) {
    if (!message || typeof message !== 'object') {
      throw new TypeError('addMessage expects a message object.');
    }
    if (!['user', 'assistant', 'tool', 'system'].includes(message.role)) {
      throw new TypeError(`Invalid message role: ${message.role}`);
    }
    this._messages.push({ ...message, timestamp: message.timestamp ?? new Date().toISOString() });
    this._trim();
    return this;
  }

  /** Returns the full message array (system prompt first) ready for a provider. */
  getMessages() {
    const messages = [{ role: 'system', content: this.systemPrompt }];
    if (this._memoryNote) {
      messages.push({ role: 'system', content: this._memoryNote });
    }
    return [...messages, ...this._messages];
  }

  /**
   * Phase 3: injects a short note about relevant long-term memories into
   * the context as an additional system message, so the model (or the
   * mock provider) can see retrieved memories without them being
   * permanently baked into systemPrompt. Cleared per-turn by the caller
   * (Orchestrator) so stale memory notes don't linger across turns.
   */
  setMemoryNote(text) {
    this._memoryNote = text || null;
  }

  clearMemoryNote() {
    this._memoryNote = null;
  }

  /** Raw history without the injected system message, e.g. for persistence in Phase 3. */
  getHistory() {
    return [...this._messages];
  }

  setSystemPrompt(prompt) {
    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new TypeError('systemPrompt must be a non-empty string.');
    }
    this.systemPrompt = prompt;
  }

  clear() {
    this._messages = [];
  }

  /** Keeps only the most recent maxMessages entries so context doesn't grow unbounded. */
  _trim() {
    if (this._messages.length > this.maxMessages) {
      this._messages = this._messages.slice(this._messages.length - this.maxMessages);
    }
  }

  get length() {
    return this._messages.length;
  }
}

export default ConversationContext;
