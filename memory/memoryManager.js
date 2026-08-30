/**
 * memory/memoryManager.js
 *
 * Long-term memory API. Storage-agnostic — accepts any store implementing
 * { put, getAll, get, delete, clear } (IndexedDBStore or InMemoryStore).
 *
 * Every write path (remember/update) refuses secret-looking content via
 * core/secretDetection.js and fails loudly (StorageError), never silently
 * storing it anyway and never silently dropping it without telling the
 * caller why.
 */
import { isLikelySecret } from '../core/secretDetection.js';
import { StorageError } from '../core/errors.js';
import { rankMemories, tokenize } from './ranking.js';
import { rootLogger } from '../core/logger.js';

const log = rootLogger.child('memory:manager');

function genId() {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalizes content for duplicate comparison: lowercase, trimmed, punctuation-insensitive. */
function normalizeForDuplicateCheck(content) {
  return tokenize(content).join(' ');
}

export class MemoryManager {
  /** @param {Object} opts @param {{put,getAll,get,delete,clear}} opts.store */
  constructor({ store }) {
    if (!store) throw new TypeError('MemoryManager requires a store.');
    this.store = store;
    // Proposals awaiting explicit user confirmation before being persisted.
    this._pending = new Map();
  }

  _assertNotSecret(content) {
    const check = isLikelySecret(content);
    if (check.isSecret) {
      throw new StorageError(
        `Refused to store memory: content ${check.reason}. Arya never stores API keys, passwords, or auth tokens.`,
        { context: { reason: check.reason } }
      );
    }
  }

  /**
   * Persists a memory immediately. Used for explicit user commands
   * ("remember that ...") where no separate confirmation step is needed
   * because the user's instruction already IS the confirmation.
   *
   * Duplicate prevention (per the Phase 4-doc requirement, "where
   * practical"): if a memory with essentially the same normalized content
   * already exists, that existing record is refreshed (updatedAt bumped)
   * and returned instead of creating a second, redundant entry. This is a
   * simple exact/near-exact match on normalized text — not semantic
   * deduplication — which is what "where practical" calls for without
   * adding a heavyweight similarity model.
   */
  async remember(content, { tags = [], source = 'user' } = {}) {
    if (typeof content !== 'string' || !content.trim()) {
      throw new TypeError('content must be a non-empty string.');
    }
    this._assertNotSecret(content);

    const normalized = normalizeForDuplicateCheck(content);
    const existingAll = await this.store.getAll();
    const duplicate = existingAll.find((m) => normalizeForDuplicateCheck(m.content) === normalized);
    if (duplicate) {
      const refreshed = { ...duplicate, updatedAt: new Date().toISOString(), tags: [...new Set([...(duplicate.tags || []), ...tags])] };
      await this.store.put(refreshed);
      log.info('remember() matched an existing memory; refreshed instead of duplicating.', { id: refreshed.id });
      return { ...refreshed, wasDuplicate: true };
    }

    const now = new Date().toISOString();
    const record = {
      id: genId(),
      content: content.trim(),
      tags: [...tags],
      source,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      useCount: 0,
    };
    await this.store.put(record);
    log.info('Memory created.', { id: record.id, source });
    return { ...record, wasDuplicate: false };
  }

  /**
   * Registers a candidate memory (e.g. something the AI noticed) WITHOUT
   * persisting it. Satisfies "explicit confirmation before automatic
   * storage." Nothing is written until approvePending() is called.
   */
  proposeMemory(content, { tags = [] } = {}) {
    if (typeof content !== 'string' || !content.trim()) {
      throw new TypeError('content must be a non-empty string.');
    }
    const check = isLikelySecret(content);
    const id = genId();
    const pending = { id, content: content.trim(), tags: [...tags], secretFlag: check.isSecret, secretReason: check.reason };
    this._pending.set(id, pending);
    return pending;
  }

  listPending() {
    return [...this._pending.values()];
  }

  async approvePending(id) {
    const pending = this._pending.get(id);
    if (!pending) throw new StorageError(`No pending memory proposal with id "${id}".`);
    this._pending.delete(id);
    return this.remember(pending.content, { tags: pending.tags, source: 'auto-approved' });
  }

  rejectPending(id) {
    return this._pending.delete(id);
  }

  /** All memories, most recently updated first. */
  async list() {
    const all = await this.store.getAll();
    return all.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async get(id) {
    return this.store.get(id);
  }

  async update(id, changes = {}) {
    const existing = await this.store.get(id);
    if (!existing) throw new StorageError(`No memory found with id "${id}".`);
    if (typeof changes.content === 'string') {
      this._assertNotSecret(changes.content);
    }
    const updated = {
      ...existing,
      ...changes,
      content: typeof changes.content === 'string' ? changes.content.trim() : existing.content,
      updatedAt: new Date().toISOString(),
    };
    await this.store.put(updated);
    log.info('Memory updated.', { id });
    return updated;
  }

  async remove(id) {
    const result = await this.store.delete(id);
    log.info('Memory removed.', { id });
    return result;
  }

  /** Requires confirm:true so accidental data loss needs an explicit, unambiguous caller decision. */
  async clearAll({ confirm } = {}) {
    if (confirm !== true) {
      throw new StorageError('clearAll() requires explicit confirm:true to prevent accidental data loss.');
    }
    const result = await this.store.clear();
    log.warn('All memories cleared (explicit confirm:true).');
    return result;
  }

  /**
   * Returns the most relevant memories for a query, each with a numeric
   * score and human-readable reasons — satisfies "explainable memory
   * retrieval: the user should be able to see what the assistant
   * remembers and why it was retrieved."
   */
  async retrieveRelevant(query, { limit = 5, touch = true } = {}) {
    const all = await this.store.getAll();
    const ranked = rankMemories(query, all, { limit });
    log.debug(`Memory retrieval for query returned ${ranked.length} result(s).`, { resultIds: ranked.map((r) => r.memory.id) });
    if (touch) {
      for (const entry of ranked) {
        entry.memory.useCount = (entry.memory.useCount || 0) + 1;
        entry.memory.lastUsedAt = new Date().toISOString();
        await this.store.put(entry.memory);
      }
    }
    return ranked;
  }
}

export default MemoryManager;
