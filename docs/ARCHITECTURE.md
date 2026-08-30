# Arya — Architecture

## Constraint driving every decision here

Per explicit product requirement, Arya must run as a **pure HTML + CSS +
vanilla JavaScript** app, openable directly in Chrome (or via a trivial
static file server when module-script CORS requires it). No Flutter, no
Kotlin/Android Studio, no required build system, no paid framework.

This is a fundamentally different platform than the originally-sketched
Flutter/Android-native conceptual layout, so this document maps each
original module concept to its realistic browser equivalent, and is
explicit about the handful of things that are not physically possible from
inside a browser tab.

## Module layout (Phase 1 state)

```
core/
  logger.js         — leveled logging (DEBUG/INFO/WARN/ERROR), in-memory history, pluggable sinks
  errors.js         — AryaError hierarchy (ConfigError, NetworkError, PermissionError, ToolError,
                       UnsupportedFeatureError, StorageError) + safeAsync() wrapper
  config.js         — dot-path config store; defaults (non-secret, committed) merged with
                       localStorage-persisted user settings (may include user-supplied API keys)
  eventBus.js       — minimal pub/sub so modules stay decoupled
  capabilities.js   — runtime feature detection (SpeechRecognition, speechSynthesis, mediaDevices,
                       localStorage, etc.) plus a fixed set of "structural" flags that are always
                       false with a human-readable note explaining why
main.js             — bootstrap: loads config, applies log level, detects capabilities,
                       renders the capability report, wires the (placeholder) chat + settings UI
index.html / css/    — the Phase 1 shell UI
```

Future phases plug into `core/` rather than replacing it:

| Original concept        | Browser-app equivalent                                              | Phase |
|--------------------------|----------------------------------------------------------------------|-------|
| `ai/` provider layer     | `fetch()`-based calls to an LLM API from client JS, or via a small proxy if the user adds one | 2 |
| `memory/` short & long   | short-term = in-memory array for the session; long-term = `localStorage`/`IndexedDB` | 3 |
| `voice/` STT/TTS         | Web Speech API (`SpeechRecognition` / `speechSynthesis`)             | 4 |
| `wakeword/`              | `SpeechRecognition` in continuous mode while the tab is foregrounded (NOT a true background/native wake word) | 5 |
| `tools/`                 | plain JS functions + `fetch()` for online tools (weather, wiki, search) | 6 |
| Android-specific (`android/`) | Only browser-exposable subset: `navigator.onLine`, Battery Status API where supported, Notification API | 7 |
| `integrations/spotify.js`| Spotify Web Playback SDK (requires Spotify Premium + OAuth in-browser) | 8 |
| offline fallback         | calculator/time/date/local-memory work with no network; STT/weather/search do not | throughout |

## Data flow (once Phase 2+ land)

```
User (text or mic)
   ↓
voice/speech_to_text.js  (Phase 4, browser Web Speech API)  — only if voice input used
   ↓
main.js orchestrator
   ↓
ai/provider.js  (Phase 2, fetch() to chosen LLM API)
   ↓
tools/registry.js executes any tool calls the LLM requests (Phase 6)
   ↓
Response text
   ↓
voice/text_to_speech.js (Phase 4, speechSynthesis) — only if voice output enabled
   ↓
UI chat log
```

## Config & secrets model

There is no server, so there is no real `.env` file. The closest safe
equivalent implemented in `core/config.js`:

- `DEFAULTS` (in `core/config.js`) — non-secret settings, committed to the
  repo, safe to read by anyone.
- User settings, including any API key the user chooses to type into the
  Settings UI — stored **only** in that browser profile's `localStorage`,
  under key `arya:config:v1`. Never hard-coded, never committed.
- `Config.redactedSnapshot()` masks anything that looks like a
  key/token/secret/password before it is ever logged or shown in a debug
  report, so accidental leakage into `console.log` or `STATE.md`-style
  reports doesn't happen.

**Hard limitation, stated plainly:** once a key stored this way is used to
call a third-party API directly from browser JS, it is visible in that
request in DevTools → Network. A static site cannot hide it. If/when a
paid, rate-limited key needs real confidentiality, the only fix is a small
backend proxy — which is a deliberate scope boundary the user has accepted
by requiring "no build system" for this phase of the project. This is
flagged again in the Settings UI copy in a later phase when a key field is
actually added (Phase 2).

## Capability detection & honest degradation

`core/capabilities.js` is the single source of truth other modules must
check before claiming a feature works. It returns two kinds of flags:

1. **Runtime-detected** (`speechRecognition`, `speechSynthesis`,
   `mediaDevices`, `localStorage`, `indexedDB`, `notifications`, `onLine`)
   — actually probed against the current `window`/`navigator`.
2. **Structural** (`backgroundWakeWord`, `trueOfflineSTT`,
   `nativeAppLaunching`, `nativeSystemInfo`, `secureClientSideSecrets`) —
   always `false`, because no browser can do these things regardless of
   version. Each has a paired entry in `CAPABILITY_NOTES` explaining why,
   surfaced directly in the UI's "Browser capability report" panel.

This is how the project satisfies the rule "never pretend to perform
actions it did not actually execute" at an architectural level, not just
in AI response text.

## Phase 2 addendum: the key-exposure decision (2026-08-25)

Phase 1 flagged that a pure static site cannot hide a secret used in a
direct client→API call. When Phase 2 began, that tension became concrete:
the spec required both "no build system / pure frontend" and "do not
expose API keys in frontend code." Those two requirements are in direct
conflict for any provider that needs a real key (OpenAI, Gemini, etc.),
so per the project's own conflict-resolution rule, the conflict was
surfaced and a decision was requested rather than silently picked.

**Decision made by the user: Option 3.** Build the complete provider
abstraction now, and store **no API key anywhere in the frontend** — not
in source, not in `localStorage`, not in `IndexedDB` — full stop. The
interfaces are built so a secure backend/proxy can be wired in later
without touching orchestration code.

Concretely, this shipped as two providers:

1. **`ai/providers/mockProvider.js`** — the default. Fully offline,
   deterministic, zero network calls, zero keys. It proves the
   `AIProvider` interface, `ConversationContext`, tool-calling loop, and
   error handling all work correctly, without pretending to be a real
   language model (every reply says so explicitly).
2. **`ai/providers/proxyProvider.js`** — calls a plain URL the user
   configures in Settings (not a secret — just an endpoint). That
   endpoint is expected to be the user's *own* backend, which is
   responsible for attaching any real provider's key server-side. This
   project does not include or implement that backend. If no proxy URL is
   configured, `ProxyProvider` throws `ConfigError` immediately — it never
   fabricates a response.

This means: **as shipped, Arya cannot produce real LLM-generated replies**
without the user standing up their own backend proxy. That is a direct,
accepted consequence of prioritizing "never expose a key" over "make a
real AI provider work out of the box" — the tradeoff the user chose. The
UI is explicit about this (Settings copy + every mock reply says it's not
a real AI model), so the limitation is visible rather than hidden.

## Module layout (Phase 2 additions)

```
ai/
  AIProvider.js            — abstract provider interface (generateResponse, streamResponse)
  ConversationContext.js   — message history (system/user/assistant/tool), Hinglish system prompt, sliding window
  toolRegistry.js          — register/validate/execute tools; descriptors exposed to providers
  orchestrator.js          — generate → tool-call → re-generate loop; timeout handling; iteration cap
  index.js                 — getProvider(name, config) factory for config-driven provider switching
  providers/
    mockProvider.js         — offline, deterministic, default, zero keys
    proxyProvider.js         — calls a user-configured backend URL; the backend (not included) holds any real key
  demoTools/
    calculatorTool.js        — minimal safe (no eval) arithmetic tool proving the tool-calling loop
```

## AI response contract

```
AIResponse = {
  role: 'assistant',
  content: string | null,        // null when the model only wants to call tools
  toolCalls: [{ id, name, arguments }] | null,
  raw: any                        // provider-specific, debugging only
}
```

`Orchestrator.send(userText)` drives the loop: call the provider with
timeout protection (`core/errors.js` `NetworkError` on timeout) → if
`toolCalls` present, execute each via `toolRegistry.execute()` (failures
become recorded, non-fatal tool-result errors fed back to the model, never
silently dropped) → append tool results as `role: 'tool'` messages → call
the provider again → repeat, capped at `maxToolIterations` (default 4) to
guarantee termination (`ToolError` if exceeded) → return the final
`content` once the provider stops requesting tools.

## proxyProvider backend contract (for whoever builds the backend later)

```
POST {proxyUrl}
Content-Type: application/json
Body: { "messages": [...], "tools": [...] }

Response 200:
{ "role": "assistant", "content": string|null, "toolCalls": [...]|null }
```
The frontend never sends anything resembling a key in this request. Any
real provider's key must be added server-side by that backend.

## Phase 3: Memory architecture

```
memory/
  memoryManager.js    — main API: remember, proposeMemory/approvePending/rejectPending,
                         list, get, update, remove, clearAll, retrieveRelevant
  ranking.js           — explainable scoring: keyword overlap + tag match, then
                         recency/frequency boost ONLY on an already-relevant match
  indexedDBStore.js    — real persistence via the browser's IndexedDB
  inMemoryStore.js     — same interface, used as an honest fallback when IndexedDB
                         is unavailable, and as a test double (Node has no IndexedDB)
core/secretDetection.js — shared heuristic used by MemoryManager to refuse
                          storing anything that looks like a key/password/token
```

Storage selection happens once at boot in `main.js`, based on a real
capability check (`core/capabilities.js`), never assumed:

```
if (caps.indexedDB) → IndexedDBStore  (persists across restarts)
else                → InMemoryStore   (does NOT persist — UI says so plainly)
```

**Memory record shape:**
```
{
  id, content, tags: string[], source: 'user'|'auto-approved',
  createdAt, updatedAt, lastUsedAt, useCount
}
```

**Explicit confirmation before automatic storage** is implemented as a
two-path system: `remember()` persists immediately (used when the user's
own chat command, like "remember that …", already constitutes explicit
confirmation), while `proposeMemory()` registers a candidate in an
in-memory pending queue and does **not** write anything until
`approvePending()` is called — this is the hook for any future
auto-detected-fact flow to require a real confirmation step rather than
silently saving.

**Orchestrator integration:** each turn, if a `memoryManager` is
configured, `Orchestrator.send()`:
1. Checks for an explicit "remember that …" / "yaad rakho …" command —
   if matched, saves directly and returns, without ever calling the AI
   provider (this is a deterministic system action, not something to
   "generate").
2. Otherwise calls `memoryManager.retrieveRelevant(userText)`, and if
   anything scores above zero, injects a note listing those memories into
   `ConversationContext` via `setMemoryNote()` (a second system message,
   separate from the main system prompt) before calling the provider.
3. Clears the note immediately after the turn completes, so it can never
   leak into an unrelated later turn.
4. If memory retrieval itself throws, the error is logged and the turn
   continues without memory context — memory must never be able to block
   the conversation.

**Duplicate prevention:** `remember()` normalizes new content
(lowercased, tokenized, punctuation-stripped) and compares it against
existing memories' normalized content. An exact-normalized match refreshes
the existing record (bumping `updatedAt`, merging tags) instead of
creating a new one. This is intentionally simple text-normalization
matching, not semantic similarity — a semantic version would need either
a network call to an embedding API (reintroducing the Phase 2 key-exposure
problem) or a nontrivial local model, neither of which fits "no build
system, no paid services, free-first."

## Roadmap reconciliation note (2026-08-29)

A later set of documents proposed a different phase-numbering scheme
("Phase 3: Provider Abstraction", "Phase 4: Intelligence Layer"). Per an
explicit user decision, the original 10-phase roadmap remains the
authoritative sequence; those documents were treated as supplementary
technical requirements and folded into the phase where their content
actually belongs (mostly already-complete Phase 2, and this Phase 3), not
as a renumbering or restart. Full mapping table is in `docs/STATE.md`
under "Roadmap Reconciliation." No already-approved code was renamed or
rewritten because of this — only genuinely new, additive requirements
(duplicate prevention, structured memory logging) were implemented.

## Testing approach

`tests/unit/` uses Node's built-in `node:test` runner (zero extra
dependencies) to test all of `core/` and `ai/` in isolation (with a mock
`localStorage` and an injectable `fetch`, since Node has neither by
default). `package.json` is dev-tooling only — the shipped app itself
needs no `npm install` and no build step, consistent with the "no
unnecessary build system" requirement.

Full in-browser DOM/interaction testing (e.g. clicking Settings, watching
the chat shell) could not be executed inside this development sandbox,
which has no GUI browser binary and no network access to install one. That
verification step is called out explicitly as outstanding in
`docs/STATE.md` rather than claimed as done. Phase 2 additionally used a
Node-based integration script (a scratch file, deleted after use, not
committed) that exercised the real module graph end-to-end outside of
isolated unit tests: config load → provider factory → orchestrator →
tool-calling loop → config save → live provider switch → proxy provider
failing loudly (not silently) with no URL configured. All of that passed.
