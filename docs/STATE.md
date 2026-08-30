# Arya — Project State

**Last updated:** 2026-08-25
**Current phase:** Phase 2 — AI Brain
**Mode:** Execution Mode (approved by user)

## Phase 0 — Project Audit

**Status:** Skipped — not silently, explicitly.
No existing Arya project, uploaded files, or prior codebase existed anywhere
in the working environment (`/home/claude`, `/mnt/user-data/uploads`) at
the start of this session. User confirmed: start Phase 1 from zero. There
was nothing to audit, so Phase 0's deliverable (an audit report of existing
code) does not apply. This substitutes for that phase rather than skipping
the loop's INSPECT step in general — INSPECT was performed (the filesystem
was checked twice) and came back empty, which is itself the finding.

## Phase 1 — Foundation

**Status:** COMPLETE, pending user's own in-browser confirmation (see Known Issues)

**Files changed (all new):**
```
arya/index.html
arya/main.js
arya/css/style.css
arya/core/logger.js
arya/core/errors.js
arya/core/config.js
arya/core/eventBus.js
arya/core/capabilities.js
arya/package.json                 (dev-only, for running unit tests)
arya/tests/unit/logger.test.js
arya/tests/unit/errors.test.js
arya/tests/unit/config.test.js
arya/tests/unit/capabilities.test.js
arya/README.md
arya/docs/ARCHITECTURE.md
arya/docs/STATE.md                (this file)
arya/docs/CHANGELOG.md
arya/.gitignore
```

**Features implemented:**
- Modular directory structure (`core/`, and empty-but-scaffolded `ai/`,
  `memory/`, `voice/`, `wakeword/`, `tools/`, `integrations/`, `ui/` for
  future phases).
- Leveled logger (`core/logger.js`) — DEBUG/INFO/WARN/ERROR, in-memory
  history, namespacing via `.child()`, pluggable sinks that can't crash the
  logger.
- Standardized error hierarchy (`core/errors.js`) — `AryaError` base +
  6 typed subclasses + `safeAsync()` helper.
- Config management (`core/config.js`) — non-secret defaults committed to
  repo; user settings (including any future API keys) persisted only to
  `localStorage`, never hard-coded; `redactedSnapshot()` prevents
  accidental secret leakage into logs/reports; graceful fallback to
  defaults if storage is unavailable or corrupted.
- Event bus (`core/eventBus.js`) for decoupled module communication.
- Capability detection (`core/capabilities.js`) — real runtime detection
  for Web Speech API / mediaDevices / storage, plus explicit "structural"
  flags (background wake word, true offline STT, native app launching,
  native system info, client-side secret confidentiality) that are always
  false with a plain-language explanation, surfaced live in the UI.
- Phase 1 shell UI (`index.html` / `main.js` / `css/style.css`): a chat
  panel (placeholder — explicitly tells the user Phase 2's AI brain isn't
  built yet, rather than faking a reply), a settings form wired to
  `core/config.js`, and a live capability report table.
- `.gitignore` covering local-only artifacts (node_modules, any future
  local config file, OS junk files).

**Tests run:** `node --test` (Node's built-in test runner, 22.x)

**Test results:** 25/25 passing, 0 failing.
```
tests 25
suites 0
pass 25
fail 0
cancelled 0
skipped 0
```
Covers: log-level filtering, string-level parsing, history trimming, child
logger namespacing/shared history, sink error isolation, history filtering;
every AryaError subclass code, `toJSON()` serialization, `safeAsync()`
pass-through and wrapping behavior; config dot-path get/set,
save/load round-trip via a mock storage, graceful no-storage handling,
`requireSet` validation, secret redaction (masks value, doesn't mutate real
data, doesn't leak into JSON), and recovery from corrupted JSON in storage;
capability detection against an empty stub window, a malformed window
object (must not throw), and a fully-featured stub window, plus verifying
every "structural" always-false flag ships a real explanation string.

Additional verification performed:
- `node --check` on every new `.js` file — all pass (no syntax errors).
- Python's `html.parser` used to confirm `index.html` parses without
  errors (well-formed markup).
- Confirmed every path referenced by `index.html`/`main.js`
  (`main.js`, `css/style.css`, `core/logger.js`, `core/config.js`,
  `core/errors.js`, `core/capabilities.js`, `core/eventBus.js`) exists on
  disk at the expected relative path.

**Known issues / explicitly NOT verified:**
- **Live in-browser rendering was not verified.** This development
  sandbox has no GUI browser binary and no network access to install one
  (e.g. via Playwright), and an attempt to run a local static server +
  curl loopback test in this sandbox hung and was aborted rather than
  reported as a false pass. What **is** verified: correct JS syntax, all
  file paths resolve, well-formed HTML, and all logic-level unit tests
  passing. What is **not yet independently verified**: that Chrome
  actually renders the page correctly, that the Settings form saves and
  reloads correctly through real `localStorage`, and that ES module
  loading works via `file://` vs a local server as documented. **Action
  for user:** run `python3 -m http.server 8080` (or `npx serve .`) inside
  `arya/` and open it in Chrome to confirm — please report back anything
  that doesn't match this document so it can be fixed before Phase 2.
- No AI provider is wired up yet (by design — that's Phase 2). The chat
  panel currently only echoes an explicit "not implemented yet" message.

**Next phase:** Phase 2 — AI Brain (waiting for your approval)

---

## Phase 2 — AI Brain

**Status:** COMPLETE, pending your own in-browser confirmation (same caveat as Phase 1 — see Known Issues)

**Continuity check:** Confirmed working inside the same canonical
`arya/` project created in Phase 1 — no new/duplicate project, no second
`index.html`. `index.html`, `core/`, `css/style.css` from Phase 1 are
modified in place, not replaced. All 25 Phase 1 tests still pass
unmodified (see Test Results below) — no regressions.

**Architectural conflict surfaced and resolved (see docs/ARCHITECTURE.md
"Phase 2 addendum" for full detail):** the spec required both "pure
frontend, no backend" and "never expose an API key in frontend code."
These conflict for any real keyed LLM provider. Per the user's own
conflict-resolution rule, this was surfaced explicitly rather than
silently resolved. **User decision: build the full provider abstraction,
store no key anywhere in the frontend (not in source, not in
localStorage, not in IndexedDB), and design clean interfaces so a secure
backend/proxy can be connected later.**

**Files changed:**
```
ai/AIProvider.js                    (new) — abstract provider interface
ai/ConversationContext.js           (new) — message history + Hinglish system prompt
ai/toolRegistry.js                  (new) — tool registration/validation/execution
ai/orchestrator.js                  (new) — generate/tool-call/re-generate loop, timeouts, iteration cap
ai/index.js                         (new) — getProvider() factory for config-driven provider switching
ai/providers/mockProvider.js        (new) — offline, deterministic, default, zero keys
ai/providers/proxyProvider.js       (new) — calls a user-configured backend URL, never a key
ai/demoTools/calculatorTool.js      (new) — safe (no eval) arithmetic tool proving the tool-call loop
ai/README.md                        (updated)
core/config.js                      (modified) — DEFAULTS.ai now { provider:'mock', proxyUrl:'', timeoutMs:15000 }
main.js                             (modified) — wires orchestrator into chat form; adds AI provider settings wiring
index.html                          (modified) — adds AI provider select + proxy URL field to Settings
css/style.css                       (modified) — msg-assistant style, settings-divider, url input style
tests/unit/conversationContext.test.js  (new)
tests/unit/toolRegistry.test.js         (new)
tests/unit/aiProvider.test.js           (new)
tests/unit/mockProvider.test.js         (new)
tests/unit/proxyProvider.test.js        (new)
tests/unit/orchestrator.test.js         (new)
tests/unit/config.test.js               (modified — 1 test updated, see Errors Found & Fixed)
docs/ARCHITECTURE.md, docs/STATE.md (this file), docs/CHANGELOG.md  (updated)
```

**Features implemented (mapped to Phase 2 acceptance criteria):**
- ✅ Provider abstraction (`AIProvider`) with `generateResponse` /
  `streamResponse` — two concrete providers implemented (`MockProvider`,
  `ProxyProvider`).
- ✅ Conversation context (`ConversationContext`) — structured
  system/user/assistant/tool messages, Hinglish default system prompt,
  sliding-window trimming.
- ✅ Streaming supported at the interface level (`AIProvider.streamResponse`,
  with a default single-chunk fallback for non-streaming providers).
  `MockProvider` declares `supportsStreaming: true` at the interface level;
  no provider currently needs true token-by-token streaming since neither
  ships with real network calls to a streaming LLM API (that requires the
  backend proxy in a future phase).
- ✅ Tool/function calling — `toolRegistry` + `orchestrator`'s loop:
  provider requests a tool call → core executes it → result is fed back →
  provider is called again. Proven end-to-end with the calculator demo
  tool (Phase 2's literal acceptance example).
- ✅ Error handling — timeouts (`NetworkError` via `Orchestrator`'s
  `Promise.race` timeout and `ProxyProvider`'s `AbortController`), network
  errors, malformed/unexpected response shapes, tool execution failures —
  all typed via `core/errors.js`, all tested.
- ✅ Timeout handling — default 15000ms (within the 10-15s range the spec
  requested), configurable via `config.ai.timeoutMs`.
- ✅ Provider switching via config — `getProvider(name, config)` factory;
  `main.js` rebuilds the orchestrator when Settings are saved; verified
  live in the integration script (mock → proxy switch without touching
  orchestration code).
- ⚠️ **No AI provider produces real LLM output "out of the box."** This is
  the direct, accepted consequence of the "no key exposure" decision (see
  conflict note above) — not an oversight. `MockProvider` is honest about
  being a non-AI demo in every reply; `ProxyProvider` requires the user to
  supply their own backend, which this project does not include.

**Tests run:** `node --test` (Node built-in runner) + a Node-based
end-to-end integration script (scratch file, not committed) simulating
the real browser bootstrap sequence (localStorage → config.load() →
provider factory → orchestrator → tool call → config.save() → live
provider switch → proxy failing loudly without a URL).

**Test results:** 68/68 unit tests passing, 0 failing (25 from Phase 1,
unmodified and still green + 43 new Phase 2 tests). Integration script:
all steps passed, including the two "must fail loudly" cases (empty user
input rejected; ProxyProvider with no URL throws ConfigError immediately
rather than fabricating a reply).

```
# tests 68
# suites 0
# pass 68
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

**Errors found & fixed during this phase (per the mandatory debug-loop
reporting format):**

1. **ERROR:** `config.test.js` — "Config.requireSet throws ConfigError
   when a required path is missing" failed after Phase 2 changes.
   **ROOT CAUSE:** Phase 2 changed `DEFAULTS.ai.provider` from `null` to
   `'mock'` (needed so a default provider always exists), which meant the
   test's target path (`ai.provider`) was no longer actually unset, so
   `requireSet` correctly stopped throwing — the test's assumption, not
   the code, was stale.
   **FIX:** Updated the test to target `ai.proxyUrl` (which legitimately
   defaults to `''`, i.e. "not configured") instead.
   **VERIFICATION:** Re-ran `node --test`; that test and all others pass.

2. **ERROR:** `MockProvider` was stuck in an infinite tool-call loop —
   surfaced as 5 failing tests, all hitting `orchestrator`'s
   `maxToolIterations` guard (which itself worked correctly and prevented
   a real infinite loop).
   **ROOT CAUSE:** `generateResponse()` checked "does the last *user*
   message look like arithmetic?" before checking "was the most recent
   message actually a tool result?" — so after the calculator tool
   returned a result, the provider looked at the same original user
   message again and asked for the *same* tool call a second time,
   forever.
   **FIX:** Reordered the checks so "is the most recent message a tool
   result?" (→ summarize it) is evaluated first, before falling through
   to the arithmetic-detection path.
   **VERIFICATION:** Re-ran `node --test` (68/68 passing) and the
   end-to-end integration script, which now correctly shows one tool call
   followed immediately by a final summarized answer.

No error recurred 3 times on the same root cause, so the "BLOCKED" escape
hatch was never needed.

**Known issues / explicitly NOT verified:**
- Same in-browser rendering caveat as Phase 1: not independently verified
  in a real Chrome instance (no GUI browser available in this sandbox).
  Please run the app (`python3 -m http.server 8080` inside `arya/`, open
  in Chrome) and confirm the Settings AI-provider dropdown, proxy URL
  field, and chat flow (try asking "what is 12 * 8") behave as documented.
- Real LLM output is not available without you standing up your own
  backend proxy and pointing Settings → Backend proxy URL at it (see
  docs/ARCHITECTURE.md "proxyProvider backend contract" for the exact
  request/response shape it expects).
- True token-by-token streaming is not exercised by either shipped
  provider (neither talks to a real streaming LLM API yet); the interface
  supports it and has a tested default fallback, but end-to-end streaming
  UI behavior is unverified until a real streaming backend exists.

**Next phase:** Phase 3 — Memory (short-term session memory, long-term
persisted preferences/facts, retrieval, deletion). Will not start until
Phase 2 is confirmed/approved.

---

## Roadmap Reconciliation (2026-08-29)

Mid-way through Phase 3 implementation, three additional documents arrived
re-describing the project under a different phase numbering ("Phase 3:
Provider Abstraction", "Phase 4: Intelligence Layer", plus a general
autonomous-loop prompt). Per the user's explicit ruling, these are **not**
a replacement for the original 10-phase roadmap — they are treated as
supplementary *technical requirements* to be folded into the relevant
existing phase, without renumbering or restarting anything.

**Mapping:**

| New document | Original roadmap phase it actually belongs to | Status |
|---|---|---|
| New "Phase 3" (Provider Abstraction: `AIProvider.generate()/stream()/health_check()/metadata()`, provider registry, mock provider, timeout/retry, no hardcoded keys) | Original **Phase 2 — AI Brain** | Already complete & approved. Interface method names differ (`generateResponse()`/`streamResponse()` vs. `generate()`/`stream()`) but are functionally equivalent — not renamed, to avoid destabilizing 68 already-passing tests for a cosmetic difference. `health_check()`/`metadata()` and a formal retry-count (beyond the existing timeout + tool-iteration cap) are **not implemented** — noted as an optional future refinement, not a gap in what Phase 2 was actually asked to deliver and approved for. |
| New "Phase 4" memory requirements (`MemoryStore`/`MemoryManager`/`MemoryEntry`/`MemoryQuery` interfaces, retrieval, relevance filtering, duplicate prevention, structured logging) | Original **Phase 3 — Memory** (this phase, in progress) | Folded in now. `MemoryManager` already matches that name; `store` parameter plays the `MemoryStore` role; a memory record plays the `MemoryEntry` role — kept as plain objects/duck-typed interfaces rather than introducing formal classes for these, since the existing shape already satisfies every acceptance criterion and a class wrapper would add indirection with no behavior change. There is no formal `MemoryQuery` object — `retrieveRelevant(query, options)` takes a plain string + options, which is simpler and already fully tested; introducing a class here was judged not worth the churn. **Duplicate prevention and structured logging were genuinely missing and have been added** (see Phase 3 completion section below). |
| New "Phase 4" tool registry / permission layer / intent router / agent-loop refinements | Original **Phase 6 — Tool System** (not started) and, for the permission-declaration piece, also **Phase 7 — Android Integration** | Deferred. Building an intent router or permission manager now, ahead of Phase 6, would mean building tooling infrastructure before there are enough real tools to justify it, and would be out of the master roadmap's sequence. Will be addressed when Phase 6 starts. |

No existing, already-approved code was rewritten or renamed as a result of
this reconciliation. The only functional changes made because of it are
additive: duplicate prevention in `MemoryManager.remember()` and
structured logging across memory operations (both documented in the Phase
3 completion section below, both covered by new passing tests).

---

## Phase 3 — Memory

**Status:** COMPLETE, pending your own in-browser confirmation (same
caveat as Phases 1 & 2 — no GUI browser available in this sandbox)

**Continuity check:** Same canonical `arya/` project. `main.js`,
`index.html`, `css/style.css`, `ai/ConversationContext.js`,
`ai/orchestrator.js` modified in place, not replaced. All 68 Phase 1+2
tests still pass unmodified.

**Files changed:**
```
core/secretDetection.js              (new) — shared heuristic secret detector
memory/indexedDBStore.js             (new) — real IndexedDB persistence
memory/inMemoryStore.js              (new) — fallback + test double, same interface
memory/ranking.js                    (new) — explainable keyword/tag/recency/frequency scoring
memory/memoryManager.js              (new) — create/list/get/update/remove/clearAll/retrieveRelevant, duplicate prevention, logging
memory/README.md                     (updated)
core/config.js                       (modified) — added memory.recallLimit default
ai/ConversationContext.js            (modified) — setMemoryNote()/clearMemoryNote()
ai/orchestrator.js                   (modified) — optional memoryManager wiring, explicit "remember"/"yaad rakho" command handling, per-turn memory retrieval + note injection + cleanup
main.js                              (modified) — capability-aware store selection, orchestrator wiring, memory panel UI wiring
index.html                           (modified) — memory panel (list/add/edit/delete/clear-all UI)
css/style.css                        (modified) — memory panel styles
tests/unit/secretDetection.test.js          (new, 11 tests)
tests/unit/ranking.test.js                  (new, 7 tests)
tests/unit/inMemoryStore.test.js            (new, 6 tests)
tests/unit/memoryManager.test.js            (new, 23 tests)
tests/unit/memoryOrchestratorIntegration.test.js (new, 8 tests)
docs/ARCHITECTURE.md, docs/STATE.md (this file), docs/CHANGELOG.md  (updated)
```

**Features implemented (mapped to the requirement list you approved):**
- ✅ Short-term conversation memory — this is `ai/ConversationContext.js`
  from Phase 2 (in-memory, per-session, cleared on restart); Phase 3
  didn't duplicate it, just confirmed it already satisfies this
  requirement and left it alone.
- ✅ Persistent long-term memory — `MemoryManager` + `IndexedDBStore`.
- ✅ IndexedDB/local persistence — `memory/indexedDBStore.js`, real
  browser IndexedDB API usage (open/upgrade/transactions), with
  `InMemoryStore` as an honest, clearly-labeled fallback when IndexedDB is
  unavailable (never silently claimed as persistent when it isn't — see
  Browser Limitations).
- ✅ Memory creation — `remember()` (immediate) and manual "Add" in the UI panel.
- ✅ Explicit memory commands and/or confirmation before automatic storage
  — both implemented: explicit chat commands ("remember that …" / "yaad
  rakho …") save immediately (the command itself is the confirmation);
  `proposeMemory()`/`approvePending()`/`rejectPending()` implement a
  separate propose-then-confirm path for any future automatic-detection
  use, so nothing is ever silently auto-saved.
- ✅ Memory retrieval based on relevance — `retrieveRelevant()`.
- ✅ Memory ranking — `memory/ranking.js`: keyword overlap + tag match +
  recency + frequency, with the fix (see Errors Found & Fixed) ensuring
  recency/frequency only ever boost an already-relevant match rather than
  manufacturing relevance from nothing.
- ✅ List memories — `list()` + the Settings memory panel.
- ✅ Edit memories — `update()` + panel "Edit" button (re-runs the secret
  check on the new content).
- ✅ Delete individual memories — `remove()` + panel "Delete" button.
- ✅ Clear all memories with explicit confirmation — `clearAll({confirm:
  true})` throws if `confirm` isn't literally `true`; UI additionally
  requires a native `confirm()` dialog before calling it.
- ✅ Explainable memory retrieval — every `retrieveRelevant()` result
  includes a numeric `score` and a `reasons` array in plain language
  (e.g. "keyword match: pizza", "recently referenced").
- ✅ Memory must survive browser/app restart — true when IndexedDB is
  available (verified via a "simulated restart" test: a fresh
  `MemoryManager` instance over the same store still sees prior data);
  honestly **not** true when IndexedDB is unavailable (documented, not
  hidden).
- ✅ Never store API keys / passwords / auth tokens —
  `core/secretDetection.js`, enforced in both `remember()` and `update()`,
  fails loudly with `StorageError` rather than silently dropping content.
- ✅ Test that secrets are rejected/not persisted — `secretDetection.test.js`
  (11 tests) + `memoryManager.test.js` secret-rejection tests + the
  chat-level integration test confirming a "remember my api key is sk-…"
  command is refused end-to-end and nothing is written to the store.
- ✅ Unit tests for creation, retrieval, ranking, editing, deletion,
  persistence — see Tests Run below.
- ✅ Integration testing between memory and the AI orchestrator —
  `memoryOrchestratorIntegration.test.js` (8 tests) + a Node end-to-end
  integration script exercising the full boot-simulated flow.
- ✅ Offline functionality — the entire memory system is 100% local/offline
  by construction (IndexedDB is on-device storage; no network call
  anywhere in `memory/`).
- ✅ (Reconciliation addition) Duplicate prevention — `remember()` now
  detects near-identical existing content (normalized, case/punctuation
  insensitive) and refreshes that record instead of creating a duplicate.
- ✅ (Reconciliation addition) Structured logging — memory creation,
  update, removal, clear-all, and retrieval are all logged via
  `core/logger.js`, at `INFO`/`WARN`/`DEBUG` as appropriate; memory
  *content* is never included in `INFO`-level logs (only ids/counts), and
  no secret ever reaches a log line because secret-looking content is
  refused before it's ever stored or logged.

**Tests run:** `node --test` (Node built-in runner) + a Node-based
end-to-end integration script (scratch file, not committed) simulating
the real browser boot sequence including the "no IndexedDB → fallback to
in-memory store" branch.

**Test results:** 123/123 passing, 0 failing (68 from Phases 1–2,
unmodified and still green + 55 new Phase 3 tests: 11 secret detection, 7
ranking, 6 in-memory store, 23 memory manager, 8 memory↔orchestrator
integration).

```
# tests 123
# suites 0
# pass 123
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

**Errors found & fixed during this phase:**

1. **ERROR:** `rankMemories` test "sorts descending and excludes
   zero-score entries" failed — an unrelated memory was still coming back
   with a nonzero score.
   **ROOT CAUSE:** `scoreMemory()` applied the recency/frequency boost
   unconditionally, so any freshly-created memory (which is always
   "recent") scored above zero even with zero keyword/tag overlap with the
   query — i.e., being new was enough to look "relevant" to any query,
   which isn't real, explainable relevance.
   **FIX:** Recency/frequency boosts now only apply when the memory
   already has at least one keyword or tag match (`score > 0` first).
   **VERIFICATION:** Re-ran `ranking.test.js` (7/7) and the full suite.

2. **ERROR:** `memoryOrchestratorIntegration.test.js` — 3 failures on
   first run (empty `memoryTrace` expected `[]` but got `null`; a test
   incorrectly expecting the memory note to still be visible in context
   messages after `send()` had already completed; a retrieval test using
   a query with zero real keyword overlap with the stored memory).
   **ROOT CAUSE (real bug, #1 of the 3):** `Orchestrator.send()` left
   `memoryTrace` as `null` whenever `memoryManager` was present but no
   memories matched, instead of `[]` — inconsistent with "has a manager
   but nothing matched."
   **ROOT CAUSE (test-only, #2 and #3):** one test asserted on an
   internal implementation detail (the note being inspectable via
   `getMessages()` *after* the turn completed) that contradicts the
   intentional design of clearing the note immediately after each turn so
   it can't leak into an unrelated future turn; another used a query
   ("what do you know about my education") with no literal keyword
   overlap with the stored memory's text ("... student ..."), which
   Phase 3's deliberately simple keyword-based ranking (per spec: "simple
   relevance scoring is acceptable") cannot be expected to match via
   synonym understanding.
   **FIX:** `memoryTrace` now initializes to `[]` (not `null`) whenever a
   `memoryManager` is configured; the two tests were corrected to test
   real, intended behavior instead of an implementation detail or an
   unrealistic keyword expectation.
   **VERIFICATION:** Re-ran the file (8/8) and the full suite (123/123).

3. **ERROR (timing flake, not a functional bug):** one `memoryManager`
   test asserting `lastUsedAt` changes after `retrieveRelevant()` touch
   occasionally failed when both timestamps landed in the same
   millisecond.
   **FIX:** Added a small `setTimeout` between the two timestamped
   operations in that specific test.
   **VERIFICATION:** Re-ran repeatedly; stable.

No error recurred 3 times on the same root cause; the "BLOCKED" escape
hatch was never needed.

**Browser limitations (per your explicit requirement to document these,
not hide them):**
- **IndexedDB availability is genuinely checked, never assumed.**
  `main.js` calls `detectCapabilities()` and only uses `IndexedDBStore`
  when `caps.indexedDB` is actually true; otherwise it falls back to
  `InMemoryStore` and the UI's persistence note says plainly "memories
  will be lost when this tab closes" — this is never silently hidden.
- **This is one browser profile's storage, not a cross-device account.**
  IndexedDB is per-origin, per-browser-profile storage — memories don't
  sync across devices or browsers, unlike a real native app's account-tied
  memory. This is a structural property of "pure static site, no backend,"
  not a bug.
- **The mock AI provider does not actually use retrieved memories to
  reason.** The memory system genuinely retrieves and injects relevant
  memories into the conversation context (verified — see the integration
  check's `memoryTrace` output), but `MockProvider` is a scripted
  pattern-matcher, not a real language model, so it doesn't read that
  injected context to produce a smarter answer. This will only become
  visibly useful once a real backend proxy (Phase 2's `ProxyProvider`) is
  configured with an actual LLM behind it. Not claiming otherwise.
- **Duplicate detection is exact-normalized-text matching, not semantic.**
  "User likes hiking" and "User enjoys trekking" will NOT be recognized as
  duplicates — "where practical" was interpreted as a lightweight,
  dependency-free check, not a semantic similarity model (which would
  need either a network call to an embedding API — reintroducing the
  key-exposure problem — or a much larger local model than fits "no build
  system, no paid services").

**Requirement audit (explicit line-by-line against your Phase 3
approval message):** all 20 listed requirements — short-term memory,
persistent long-term memory, IndexedDB/local persistence, memory
creation, explicit commands/confirmation, relevance retrieval, ranking,
list/edit/delete/clear-with-confirmation, explainable retrieval,
survive-restart, never-store-secrets (3 categories), secret-rejection
tests, unit tests across all 6 named operations, orchestrator integration
testing, and offline functionality — are implemented and covered by
passing tests, with the two honest exceptions above (fallback-mode
persistence, mock provider not reasoning over memory) called out rather
than glossed over.

**Known issues / explicitly NOT verified:**
- Real in-browser IndexedDB persistence across an actual tab close/reopen
  was not independently verified (no GUI browser in this sandbox). Please
  run the app, add a memory, close the tab, reopen it, and confirm it's
  still there.
- The memory panel's UI interactions (Edit/Delete/Clear buttons,
  `prompt()`/`confirm()` dialogs) are wired but not clicked in a real
  browser by anyone other than the static checks performed here (DOM id
  cross-reference, syntax checks).

**Next phase:** Phase 4 — Voice (STT/TTS via Web Speech API, per the
original roadmap; the "Intelligence Layer" document's tool/router/
permission content is deferred to Phase 6 per the reconciliation above).
Will not start until Phase 3 is confirmed/approved.


## Phase 4 — Voice Interaction

**Status:** Implemented in code; browser verification remains outstanding.

Added browser-based STT and TTS adapters under `voice/`, normalized voice
contracts/errors, configured STT/TTS settings, and a voice path from final
recognition through the existing orchestrator to speech synthesis. Typed chat
continues to use its existing path.

Focused voice tests use fake browser APIs. The full Node suite passes 128/128.
No wake-word detection was implemented; that remains Phase 5.

Known limitations: Web Speech API support and microphone permission vary by
browser; STT may be browser/cloud-backed and is not true offline recognition;
real microphone, browser speech behavior, and Android compatibility are not
verified in this Termux environment.
