# Arya — Browser-Based AI Assistant

Arya is a personal AI assistant that runs entirely as a static web app —
**pure HTML, CSS, and vanilla JavaScript, no build step, no framework, no
paid tooling required.** Open `index.html` in Chrome (via a local static
server — see below) and it runs.

This project is being built in ten phases (see `docs/STATE.md` for current
status). **This is Phase 1: Foundation.** It establishes the modular
architecture, logging, configuration, error handling, and an honest report
of what this browser actually supports — no other feature (AI replies,
memory, voice, wake word, tools) is implemented yet.

## Running it

Because `main.js` and `index.html` use native ES modules (`<script
type="module">`), most browsers refuse to load them over `file://` due to
CORS restrictions on module scripts. Serve the folder locally instead:

```bash
# Option A — Python (already installed on most systems)
cd arya
python3 -m http.server 8080
# then open http://localhost:8080 in Chrome

# Option B — Node, no install needed beyond npx
cd arya
npx serve .
```

Then open the printed URL in Google Chrome.

## Running the tests

Unit tests use Node's built-in test runner (no dependencies to install).
This is dev-tooling only — it is **not** required to run the app itself.

```bash
cd arya
node --test
```

At the end of Phase 1, all 25 unit tests pass (`core/logger.js`,
`core/errors.js`, `core/config.js`, `core/capabilities.js`). See
`docs/STATE.md` for the exact test run log.

## Project layout

```
arya/
├── index.html          # Phase 1 shell UI (chat placeholder, settings, capability report)
├── main.js              # App bootstrap — wires core modules together
├── css/style.css        # Styling for the shell UI
├── core/                # Logger, config, error classes, event bus, capability detection
├── ai/                   # (Phase 2) AI provider abstraction — not yet implemented
├── memory/               # (Phase 3) short/long-term memory — not yet implemented
├── voice/                # (Phase 4) STT/TTS — not yet implemented
├── wakeword/             # (Phase 5) wake-word detection — not yet implemented
├── tools/                # (Phase 6) tool system (calculator, weather, etc.) — not yet implemented
├── integrations/         # (Phase 8) Spotify etc. — not yet implemented
├── ui/                   # reserved for UI components as they grow beyond the Phase 1 shell
├── tests/unit/           # Node test-runner unit tests for core/
└── docs/                 # README (this file), ARCHITECTURE.md, STATE.md, CHANGELOG.md
```

## Important architectural limitations (read this before filing a "bug")

Arya is required to run as a pure static site opened in a browser tab, with
no backend server and no native Android app. That constraint makes a few
items in the original product vision **not literally achievable as
specified**, and this project does not pretend otherwise. Full detail is in
`docs/ARCHITECTURE.md`, but in short:

- **No true "always-on" wake word.** A browser tab can only listen for
  "Arya"/"Hey Jarvis" while that tab is open and in the foreground. It
  cannot listen when the browser is closed or the phone is locked — that
  requires a native Android app.
- **STT is not fully offline.** Chrome's built-in speech recognition sends
  audio to Google's servers to transcribe it.
- **No native app launching or full system info.** A webpage cannot launch
  arbitrary installed Android apps or read full device/system information;
  only a small, permissioned subset (e.g. network online/offline status) is
  available.
- **API keys typed into Settings are not cryptographically secret.** Any
  key used directly from client-side JavaScript is visible in the browser's
  DevTools Network tab. This build stores user-supplied keys only in
  `localStorage` (never hard-coded, never committed) — which is the closest
  safe equivalent to a `.env` file for a project with no backend — but true
  secret confidentiality would require a small server-side proxy, which is
  out of scope for "pure HTML/CSS/JS, no build system."

The live "Browser capability report" panel in the app shows exactly which
of these apply on the device you're using, with the same explanations.

## Security notes

- No secrets are hard-coded anywhere in this repository.
- `core/config.js` only reads user-supplied keys from `localStorage`,
  populated via the Settings UI (not yet wired to a real AI provider —
  that's Phase 2).
- `.gitignore` excludes any local-only config file conventions in case a
  future phase adds one.
