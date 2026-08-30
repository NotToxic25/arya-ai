/**
 * memory/indexedDBStore.js
 *
 * Real persistent storage for long-term memory, using the browser's
 * IndexedDB — the spec's preferred mechanism for local persistence.
 * Falls back is handled by the caller (main.js), not here: this class
 * fails loudly with StorageError if IndexedDB genuinely isn't available,
 * rather than silently doing nothing.
 */
import { StorageError } from '../core/errors.js';

export class IndexedDBStore {
  /**
   * @param {Object} opts
   * @param {string} [opts.dbName]
   * @param {string} [opts.storeName]
   * @param {number} [opts.version]
   * @param {IDBFactory} [opts.indexedDBImpl] - injectable for environments where `indexedDB` isn't global
   */
  constructor({ dbName = 'arya-memory', storeName = 'memories', version = 1, indexedDBImpl } = {}) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
    this._idb = indexedDBImpl ?? (typeof indexedDB !== 'undefined' ? indexedDB : null);
    this._dbPromise = null;
  }

  _openDB() {
    if (!this._idb) {
      return Promise.reject(new StorageError('IndexedDB is not available in this environment.'));
    }
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((resolve, reject) => {
      let req;
      try {
        req = this._idb.open(this.dbName, this.version);
      } catch (err) {
        reject(new StorageError('Failed to open IndexedDB.', { cause: err }));
        return;
      }
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new StorageError('Failed to open IndexedDB.', { cause: req.error }));
      req.onblocked = () => reject(new StorageError('IndexedDB open request was blocked (another tab may be holding an older version open).'));
    });
    return this._dbPromise;
  }

  async put(record) {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(new StorageError('Failed to save memory to IndexedDB.', { cause: tx.error }));
    });
  }

  async getAll() {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const req = tx.objectStore(this.storeName).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(new StorageError('Failed to read memories from IndexedDB.', { cause: req.error }));
    });
  }

  async get(id) {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const req = tx.objectStore(this.storeName).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(new StorageError('Failed to read memory from IndexedDB.', { cause: req.error }));
    });
  }

  async delete(id) {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(new StorageError('Failed to delete memory from IndexedDB.', { cause: tx.error }));
    });
  }

  async clear() {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(new StorageError('Failed to clear memories in IndexedDB.', { cause: tx.error }));
    });
  }
}

export default IndexedDBStore;
