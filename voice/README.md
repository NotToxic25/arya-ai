# voice

Phase 4 — browser voice interaction via the Web Speech API.

- `contracts.js` — normalized transcript results, `VoiceError`, states, and events
- `speechToText.js` — injectable `SpeechRecognition`/`webkitSpeechRecognition` adapter
- `textToSpeech.js` — injectable `speechSynthesis` adapter with queueing and voice selection
- `index.js` — public exports

The adapters are browser-only, require user microphone permission for STT, and
report unsupported APIs instead of fabricating success. Wake-word detection is
not part of Phase 4 and remains unimplemented.
