/**
 * ai/orchestrator.js
 * Drives one user turn: send to provider, execute any requested tool
 * calls, feed results back, repeat until the provider returns plain
 * content or a safety iteration cap is hit.
 */
import { NetworkError, ToolError } from '../core/errors.js';
import { rootLogger } from '../core/logger.js';

const log = rootLogger.child('ai:orchestrator');
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_TOOL_ITERATIONS = 4;

// Matches explicit "remember" commands so memory creation always has a
// clear, user-driven trigger rather than silently guessing intent.
// Supports English and common Hinglish phrasing.
const REMEMBER_COMMAND_RE = /^(?:remember(?: that)?|please remember(?: that)?|yaad rakh(?:o|na)?)[:\s]+(.+)$/i;

export class Orchestrator {
  /**
   * @param {Object} opts
   * @param {import('./AIProvider.js').AIProvider} opts.provider
   * @param {import('./ConversationContext.js').ConversationContext} opts.context
   * @param {import('./toolRegistry.js').ToolRegistry} opts.toolRegistry
   * @param {import('../memory/memoryManager.js').MemoryManager} [opts.memoryManager] - optional (Phase 3); orchestrator works fine without it
   * @param {number} [opts.timeoutMs]
   * @param {number} [opts.maxToolIterations]
   * @param {number} [opts.memoryRecallLimit]
   */
  constructor({
    provider,
    context,
    toolRegistry,
    memoryManager = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxToolIterations = DEFAULT_MAX_TOOL_ITERATIONS,
    memoryRecallLimit = 3,
  }) {
    if (!provider) throw new TypeError('Orchestrator requires a provider.');
    if (!context) throw new TypeError('Orchestrator requires a context.');
    if (!toolRegistry) throw new TypeError('Orchestrator requires a toolRegistry.');
    this.provider = provider;
    this.context = context;
    this.toolRegistry = toolRegistry;
    this.memoryManager = memoryManager;
    this.timeoutMs = timeoutMs;
    this.maxToolIterations = maxToolIterations;
    this.memoryRecallLimit = memoryRecallLimit;
  }

  /**
   * @param {string} userText
   * @returns {Promise<{role:'assistant', content:string, toolCalls:null, toolTrace:Array, memoryTrace:Object|null}>}
   */
  async send(userText) {
    if (typeof userText !== 'string' || !userText.trim()) {
      throw new TypeError('userText must be a non-empty string.');
    }

    // Explicit memory command: handled deterministically, without ever
    // going through the AI provider — this is a system action, not
    // something that should be "generated," so it can never be fabricated.
    if (this.memoryManager) {
      const match = userText.trim().match(REMEMBER_COMMAND_RE);
      if (match) {
        return this._handleRememberCommand(userText, match[1]);
      }
    }

    this.context.addMessage({ role: 'user', content: userText });

    let memoryTrace = null;
    if (this.memoryManager) {
      memoryTrace = [];
      try {
        const results = await this.memoryManager.retrieveRelevant(userText, { limit: this.memoryRecallLimit });
        if (results.length) {
          const note =
            'Relevant memory (for your own context only — do not claim the user just said these things):\n' +
            results.map((r) => `- ${r.memory.content}`).join('\n');
          this.context.setMemoryNote(note);
          memoryTrace = results.map((r) => ({ id: r.memory.id, content: r.memory.content, score: r.score, reasons: r.reasons }));
        } else {
          this.context.clearMemoryNote();
        }
      } catch (err) {
        // Memory retrieval failing must never block the conversation —
        // log it and continue without memory context.
        log.warn('Memory retrieval failed; continuing without memory context.', err.message);
        this.context.clearMemoryNote();
      }
    }

    const toolTrace = [];
    let iterations = 0;

    while (true) {
      iterations++;
      if (iterations > this.maxToolIterations) {
        throw new ToolError(
          `Exceeded maximum tool-call iterations (${this.maxToolIterations}) without a final answer. Aborting to avoid an infinite loop.`
        );
      }

      const response = await this._generateWithTimeout();

      if (response.toolCalls && response.toolCalls.length > 0) {
        this.context.addMessage({ role: 'assistant', content: response.content ?? null, toolCalls: response.toolCalls });
        log.info(`Provider requested ${response.toolCalls.length} tool call(s).`, response.toolCalls.map((c) => c.name));

        for (const call of response.toolCalls) {
          let resultPayload;
          try {
            const result = await this.toolRegistry.execute(call.name, call.arguments ?? {});
            resultPayload = { ok: true, result };
          } catch (err) {
            log.warn(`Tool "${call.name}" failed:`, err.message);
            resultPayload = { ok: false, error: err.message };
          }
          toolTrace.push({ name: call.name, arguments: call.arguments, ...resultPayload });
          this.context.addMessage({
            role: 'tool',
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify(resultPayload.ok ? resultPayload.result : { error: resultPayload.error }),
          });
        }
        continue; // loop back to the provider with tool results appended
      }

      this.context.addMessage({ role: 'assistant', content: response.content });
      if (this.memoryManager) this.context.clearMemoryNote();
      return { role: 'assistant', content: response.content, toolCalls: null, toolTrace, memoryTrace };
    }
  }

  async _handleRememberCommand(originalUserText, contentToRemember) {
    this.context.addMessage({ role: 'user', content: originalUserText });
    let content;
    try {
      const record = await this.memoryManager.remember(contentToRemember);
      content = `Memory saved: "${record.content}"`;
      log.info('Memory saved via explicit user command.', { id: record.id });
    } catch (err) {
      content = `I couldn't save that as a memory: ${err.message}`;
      log.warn('Explicit remember command failed.', err.message);
    }
    this.context.addMessage({ role: 'assistant', content });
    return { role: 'assistant', content, toolCalls: null, toolTrace: [], memoryTrace: null };
  }

  async _generateWithTimeout() {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        if (controller) controller.abort();
        reject(new NetworkError(`AI provider "${this.provider.name}" did not respond within ${this.timeoutMs}ms.`));
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([
        this.provider.generateResponse(this.context.getMessages(), {
          tools: this.toolRegistry.list(),
          signal: controller ? controller.signal : undefined,
        }),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

export default Orchestrator;
