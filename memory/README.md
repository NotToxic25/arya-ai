# memory

Phase 3 — Memory. Fully implemented. See docs/STATE.md and
docs/ARCHITECTURE.md for the full design.

- `memoryManager.js` — main API (create, list, get, update, remove,
  clear-all, relevance retrieval, propose/approve/reject for
  confirmation-gated storage)
- `ranking.js` — explainable keyword/tag/recency/frequency scoring
- `indexedDBStore.js` — real persistence via the browser's IndexedDB
- `inMemoryStore.js` — honest fallback when IndexedDB is unavailable, and
  test double for Node's test runner

Never stores API keys, passwords, or auth tokens — see
`core/secretDetection.js`.
