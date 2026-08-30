# ai

Phase 2 — AI Brain. See docs/STATE.md and docs/ARCHITECTURE.md for the
full design and the key-exposure decision (no API key is ever stored in
this project; providers either run fully offline or call a user-configured
backend proxy that holds its own key server-side).

- `AIProvider.js` — abstract provider interface
- `ConversationContext.js` — message history management, Hinglish system prompt
- `toolRegistry.js` — tool registration/validation/execution
- `orchestrator.js` — the generate → tool-call → re-generate loop, with timeouts
- `providers/mockProvider.js` — deterministic offline provider (no network, no key) used as the default and for testing the interface
- `providers/proxyProvider.js` — calls a user-configured HTTP backend; that backend (not this frontend) is where a real provider's key would live
- `demoTools/calculatorTool.js` — minimal tool used only to prove the tool-calling loop end-to-end in Phase 2; the full multi-tool system is Phase 6
