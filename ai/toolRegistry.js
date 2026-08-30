/**
 * ai/toolRegistry.js
 *
 * Minimal tool registry used to prove Phase 2's tool-calling loop end to
 * end. The FULL tool system (many tools, permission declarations, richer
 * validation UI) is Phase 6 — this is intentionally small.
 */
import { ToolError } from '../core/errors.js';

export class ToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  /**
   * @param {Object} tool
   * @param {string} tool.name
   * @param {string} tool.description
   * @param {Object} tool.parameters - JSON-schema-like description, for the provider
   * @param {(args:Object) => (void|string)} [tool.validate] - throw or return an error string on invalid args
   * @param {(args:Object) => Promise<any>} tool.execute
   */
  register(tool) {
    if (!tool || typeof tool.name !== 'string' || !tool.name) {
      throw new TypeError('Tool must have a non-empty string name.');
    }
    if (typeof tool.execute !== 'function') {
      throw new TypeError(`Tool "${tool.name}" must implement execute().`);
    }
    if (this._tools.has(tool.name)) {
      throw new ToolError(`Tool "${tool.name}" is already registered.`);
    }
    this._tools.set(tool.name, tool);
    return this;
  }

  unregister(name) {
    this._tools.delete(name);
  }

  has(name) {
    return this._tools.has(name);
  }

  /** Descriptors safe to hand to an AI provider (no implementation details). */
  list() {
    return [...this._tools.values()].map(({ name, description, parameters }) => ({ name, description, parameters }));
  }

  /** Validates and executes a tool by name; always returns a result or throws a ToolError. */
  async execute(name, args = {}) {
    const tool = this._tools.get(name);
    if (!tool) {
      throw new ToolError(`Unknown tool: "${name}"`, { context: { name, args } });
    }
    if (typeof tool.validate === 'function') {
      const validationError = tool.validate(args);
      if (validationError) {
        throw new ToolError(`Invalid arguments for tool "${name}": ${validationError}`, { context: { name, args } });
      }
    }
    try {
      return await tool.execute(args);
    } catch (err) {
      if (err instanceof ToolError) throw err;
      throw new ToolError(`Tool "${name}" execution failed: ${err.message}`, { cause: err, context: { name, args } });
    }
  }
}

// Singleton used by the app; tests may construct their own instance.
export const toolRegistry = new ToolRegistry();

export default ToolRegistry;
