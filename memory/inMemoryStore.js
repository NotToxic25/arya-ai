/**
 * memory/inMemoryStore.js
 *
 * Same storage interface as IndexedDBStore (put/getAll/get/delete/clear),
 * backed by a plain Map. Used in two honest, documented situations:
 *   1. As a graceful fallback when a browser genuinely has no IndexedDB
 *      (main.js checks capabilities and warns the user their memories
 *      will NOT survive a restart in that case — never silently claimed
 *      as persistent when it isn't).
 *   2. As an injectable test double, since Node has no real IndexedDB and
 *      this project intentionally avoids adding a network-installed
 *      polyfill package.
 */
export class InMemoryStore {
  constructor() {
    this._map = new Map();
  }

  async put(record) {
    this._map.set(record.id, { ...record });
    return { ...record };
  }

  async getAll() {
    return [...this._map.values()].map((r) => ({ ...r }));
  }

  async get(id) {
    return this._map.has(id) ? { ...this._map.get(id) } : null;
  }

  async delete(id) {
    return this._map.delete(id);
  }

  async clear() {
    this._map.clear();
    return true;
  }
}

export default InMemoryStore;
