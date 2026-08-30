# Changelog

All notable changes to Arya are documented here.

## [Phase 1] — 2026-08-25 — Foundation

### Added
- Modular project structure (`core/`, plus scaffolded empty directories for
  `ai/`, `memory/`, `voice/`, `wakeword/`, `tools/`, `integrations/`, `ui/`).
- `core/logger.js` — leveled logging with history and pluggable sinks.
- `core/errors.js` — `AryaError` hierarchy (`ConfigError`, `NetworkError`,
  `PermissionError`, `ToolError`, `UnsupportedFeatureError`,
  `StorageError`) and `safeAsync()`.
- `core/config.js` — dot-path config store, `localStorage`-backed user
  settings, secret redaction for safe logging, graceful degradation with
  no storage or corrupted storage.
- `core/eventBus.js` — minimal pub/sub.
- `core/capabilities.js` — runtime + structural browser capability
  detection with human-readable limitation notes.
- `index.html`, `main.js`, `css/style.css` — Phase 1 shell UI: placeholder
  chat panel, settings form, live capability report.
- `tests/unit/*.test.js` — 25 unit tests via Node's built-in test runner,
  all passing.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/STATE.md` (this phase's
  status), `.gitignore`.

### Known limitations (see docs/ARCHITECTURE.md for full detail)
- No true background wake word (browser tab must stay open/foregrounded).
- Web Speech API STT is cloud-backed, not offline.
- No native Android app launching or full system info from a webpage.
- API keys stored via Settings live in `localStorage` only — not
  cryptographically secret once used in a client-side network request.

### Not yet implemented (future phases)
- Memory persistence beyond raw config (Phase 3)
- Voice input/output (Phase 4)
- Wake word (Phase 5)
- Full tool system (Phase 6)
- Android/browser device integration (Phase 7)
- Spotify integration (Phase 8)

## [Phase 2] — 2026-08-25 — AI Brain

### Added
- `ai/AIProvider.js` — abstract provider interface (`generateResponse`,
  `streamResponse` with a tested default fallback).
- `ai/ConversationContext.js` — structured message history, Hinglish
  default system prompt, sliding-window trimming.
- `ai/toolRegistry.js` — tool registration, argument validation, execution,
  with descriptors exposed to providers.
- `ai/orchestrator.js` — the generate → tool-call → re-generate loop, with
  timeout handling (`NetworkError`) and a max-iteration safety cap
  (`ToolError`) to guarantee termination.
- `ai/index.js` — `getProvider(name, config)` factory enabling provider
  switching via config alone.
- `ai/providers/mockProvider.js` — default, fully offline, deterministic,
  zero network calls, zero keys; every reply discloses it is not a real
  AI model.
- `ai/providers/proxyProvider.js` — calls a user-configured backend URL
  (not a secret); fails loudly with `ConfigError` if unconfigured; never
  reads/stores/sends an API key.
- `ai/demoTools/calculatorTool.js` — safe (no `eval`/`Function`)
  arithmetic tool proving the tool-calling loop end-to-end.
- 43 new unit tests across 6 new test files; all passing alongside the
  original 25 Phase 1 tests (68/68 total).
- `main.js` / `index.html` / `css/style.css` updated in place (same
  canonical project, no duplication) to wire the chat form to the real
  orchestrator and add AI-provider Settings controls.

### Architectural decision
- **No API key is stored anywhere in the frontend** (not in source, not
  in `localStorage`, not in `IndexedDB`) — resolving a direct conflict
  between "pure frontend, no backend" and "never expose an API key,"
  surfaced explicitly per the project's conflict-resolution rule rather
  than silently picked. Consequence: real LLM output requires the user to
  supply their own backend proxy; none is included. Full detail in
  `docs/ARCHITECTURE.md`.

### Fixed (found during this phase's test/fix/retest loop)
- `config.test.js` had a test asserting on `ai.provider`, which stopped
  being a valid "missing" case once Phase 2 gave it a `'mock'` default;
  retargeted the test at `ai.proxyUrl`.
- `MockProvider` looped forever re-requesting the same tool call because
  it checked "is the last user message arithmetic?" before checking "was
  the most recent message already a tool result?"; reordered the checks.

### Known limitations
- Real AI replies require a user-supplied backend proxy (not included).
- True token-by-token streaming is untested end-to-end pending a real
  streaming backend; the interface and its fallback path are tested.

## [Phase 3] — 2026-08-29 — Memory

### Added
- `core/secretDetection.js` — shared heuristic secret detector (API keys,
  passwords, Bearer tokens, JWTs, generic opaque tokens), reused by memory
  writes to refuse storing anything that looks like a credential.
- `memory/indexedDBStore.js` — real persistent storage via the browser's
  IndexedDB.
- `memory/inMemoryStore.js` — same interface, honest fallback when
  IndexedDB is unavailable, and test double for Node's test runner.
- `memory/ranking.js` — explainable relevance scoring (keyword + tag
  match, with recency/frequency only boosting an already-relevant match).
- `memory/memoryManager.js` — full memory API: create (`remember`),
  propose/approve/reject (explicit confirmation path), list, get, update,
  remove, clear-all (requires `confirm:true`), relevance retrieval
  (`retrieveRelevant`, explainable via per-result `reasons`), duplicate
  prevention, structured logging.
- `ai/ConversationContext.js` — `setMemoryNote()`/`clearMemoryNote()` for
  per-turn memory-augmented context.
- `ai/orchestrator.js` — optional `memoryManager` integration: explicit
  "remember that …"/"yaad rakho …" chat commands, per-turn relevant-memory
  retrieval and note injection, automatic note cleanup after each turn,
  memory-retrieval-failure isolation (never blocks the conversation).
- Memory panel in the Settings UI: list, manual add, edit (prompt), delete,
  clear-all (with a native confirm dialog), and a live persistence-status
  note (honest about IndexedDB vs. fallback storage).
- 55 new unit/integration tests across 5 new test files; 123/123 passing
  alongside all prior Phase 1–2 tests.

### Roadmap reconciliation
- A later "Phase 3/Phase 4" document set proposed different phase
  numbering. Per explicit user decision, the original 10-phase roadmap
  stays authoritative; the new documents' content was mapped onto the
  relevant existing/future phases instead (see docs/STATE.md "Roadmap
  Reconciliation" and docs/ARCHITECTURE.md). Two genuinely new,
  additive requirements from that reconciliation were implemented this
  phase: duplicate prevention and structured memory logging.

### Fixed (found during this phase's test/fix/retest loop)
- `ranking.js` applied recency/frequency boosts unconditionally, so a
  freshly-created but topically unrelated memory could still score above
  zero; fixed so those boosts only apply on top of an existing
  keyword/tag match.
- `orchestrator.js` left `memoryTrace` as `null` (instead of `[]`) when a
  memoryManager was configured but nothing matched; fixed for consistency.
- Two test-design issues were corrected: one asserted on an internal
  implementation detail that contradicted the intended per-turn note
  cleanup; another used a query with no real keyword overlap with the
  target memory, which Phase 3's intentionally simple keyword-based
  ranking cannot be expected to match without synonym understanding.

### Known limitations
- IndexedDB persistence is real when available, but not independently
  verified in an actual browser tab-close/reopen cycle in this sandbox
  (no GUI browser available) — flagged for manual confirmation.
- Memory storage is per-browser-profile (IndexedDB), not a cross-device
  account — structural to a backend-less static site.
- The offline `MockProvider` does not reason over retrieved memory
  context (it's a scripted pattern-matcher, not a real model) — memory
  retrieval and injection are real and tested, but won't visibly improve
  replies until a real backend proxy is configured.
- Duplicate detection is exact-normalized-text matching, not semantic.
