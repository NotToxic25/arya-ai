/**
 * core/eventBus.js
 * Minimal pub/sub so modules (voice, tools, ai, ui) can communicate without
 * direct imports of each other, keeping the architecture modular.
 */
export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  once(event, handler) {
    const off = this.on(event, (...args) => {
      off();
      handler(...args);
    });
    return off;
  }

  off(event, handler) {
    this._listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    for (const h of [...handlers]) {
      try {
        h(payload);
      } catch (err) {
        // A misbehaving listener must not break other listeners or the emitter.
        // eslint-disable-next-line no-console
        console.error(`[EventBus] listener for "${event}" threw:`, err);
      }
    }
  }
}

export const bus = new EventBus();
