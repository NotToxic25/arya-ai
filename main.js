/**
 * main.js
 * Application bootstrap. Wires core modules together and renders the
 * Phase 1 shell UI. Later phases (AI brain, memory, voice, tools) hook
 * into this same bus/config/logger instead of creating parallel systems.
 */
import { rootLogger, LogLevel } from './core/logger.js';
import { config } from './core/config.js';
import { bus } from './core/eventBus.js';
import { detectCapabilities, CAPABILITY_NOTES } from './core/capabilities.js';
import { ConfigError } from './core/errors.js';
import { getProvider, ConversationContext, Orchestrator, toolRegistry } from './ai/index.js';
import { registerDemoTools } from './ai/demoTools/calculatorTool.js';
import { MemoryManager } from './memory/memoryManager.js';
import { IndexedDBStore } from './memory/indexedDBStore.js';
import { InMemoryStore } from './memory/inMemoryStore.js';
import { BrowserSpeechToText } from './voice/speechToText.js';
import { BrowserTextToSpeech } from './voice/textToSpeech.js';
import { VoiceEvent, VoiceState } from './voice/contracts.js';

const log = rootLogger.child('main');

// Phase 2: AI brain wiring. One shared context + tool registry for the
// session; the orchestrator is rebuilt whenever provider settings change
// so provider switching (Phase 2 acceptance criterion) works live.
registerDemoTools(toolRegistry);
const conversation = new ConversationContext();
let orchestrator = null;
let voiceStt = null;
let voiceTts = null;

// Phase 3: long-term memory. Built once at boot, based on real capability
// detection — never assumed. If IndexedDB genuinely isn't available, we
// fall back to an in-memory store and say so plainly instead of silently
// pretending memories will survive a restart when they won't.
let memoryManager = null;
let memoryIsPersistent = false;

function buildMemoryManager(caps) {
  if (caps.indexedDB) {
    memoryManager = new MemoryManager({ store: new IndexedDBStore() });
    memoryIsPersistent = true;
    log.info('Long-term memory backed by IndexedDB (persists across restarts).');
  } else {
    memoryManager = new MemoryManager({ store: new InMemoryStore() });
    memoryIsPersistent = false;
    log.warn('IndexedDB unavailable in this browser; memory will NOT survive a restart (using in-memory fallback).');
  }
}

function buildOrchestrator() {
  const providerName = config.get('ai.provider', 'mock');
  const provider = getProvider(providerName, {
    proxyUrl: config.get('ai.proxyUrl', ''),
    timeoutMs: config.get('ai.timeoutMs', 15000),
  });
  orchestrator = new Orchestrator({
    provider,
    context: conversation,
    toolRegistry,
    memoryManager,
    timeoutMs: config.get('ai.timeoutMs', 15000),
    memoryRecallLimit: config.get('memory.recallLimit', 3),
  });
  log.info(`AI orchestrator built with provider "${provider.name}".`);
}

function applyLogLevelFromConfig() {
  const levelName = config.get('logging.level', 'INFO');
  try {
    rootLogger.setLevel(levelName);
  } catch (err) {
    log.warn(`Invalid logging.level "${levelName}" in config; keeping INFO.`, err);
    rootLogger.setLevel(LogLevel.INFO);
  }
}

function renderCapabilityReport(caps) {
  const el = document.getElementById('capability-report');
  if (!el) return;
  el.innerHTML = '';
  const rows = Object.entries(caps);
  for (const [key, value] of rows) {
    const row = document.createElement('div');
    row.className = 'cap-row';
    const status = document.createElement('span');
    status.className = `cap-status ${value ? 'ok' : 'no'}`;
    status.textContent = value ? 'OK' : 'N/A';
    const label = document.createElement('span');
    label.className = 'cap-label';
    label.textContent = key;
    row.append(status, label);
    if (!value && CAPABILITY_NOTES[key]) {
      const note = document.createElement('span');
      note.className = 'cap-note';
      note.textContent = CAPABILITY_NOTES[key];
      row.append(note);
    }
    el.append(row);
  }
}

function renderStatus(message, kind = 'info') {
  const el = document.getElementById('status-line');
  if (!el) return;
  el.textContent = message;
  el.className = `status-line status-${kind}`;
}

function wireSettingsForm(caps) {
  const form = document.getElementById('settings-form');
  if (!form) return;

  const langSelect = form.querySelector('#lang-select');
  const logSelect = form.querySelector('#log-select');
  const wakeToggle = form.querySelector('#wake-toggle');
  const providerSelect = form.querySelector('#ai-provider-select');
  const proxyUrlInput = form.querySelector('#ai-proxy-url');

  langSelect.value = config.get('language', 'hinglish');
  logSelect.value = config.get('logging.level', 'INFO');
  wakeToggle.checked = !!config.get('wakeWord.enabled', false);
  wakeToggle.disabled = !caps.speechRecognition;
  if (!caps.speechRecognition) {
    wakeToggle.title = 'Speech recognition is not supported in this browser.';
  }
  providerSelect.value = config.get('ai.provider', 'mock');
  proxyUrlInput.value = config.get('ai.proxyUrl', '');
  proxyUrlInput.disabled = providerSelect.value !== 'proxy';

  providerSelect.addEventListener('change', () => {
    proxyUrlInput.disabled = providerSelect.value !== 'proxy';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      config.set('language', langSelect.value);
      config.set('logging.level', logSelect.value);
      config.set('wakeWord.enabled', wakeToggle.checked);
      config.set('ai.provider', providerSelect.value);
      // This is a plain endpoint URL, never a key — see docs/ARCHITECTURE.md.
      config.set('ai.proxyUrl', proxyUrlInput.value.trim());
      config.save();
      applyLogLevelFromConfig();
      buildOrchestrator();
      bus.emit('config:changed', config.redactedSnapshot());
      renderStatus(`Settings saved. AI provider: ${providerSelect.value}.`, 'ok');
      log.info('Settings saved by user.', config.redactedSnapshot());
    } catch (err) {
      renderStatus(`Failed to save settings: ${err.message}`, 'error');
      log.error('Failed to save settings', err);
    }
  });
}

function renderMemoryList(container) {
  memoryManager
    .list()
    .then((memories) => {
      container.innerHTML = '';
      if (!memories.length) {
        const empty = document.createElement('p');
        empty.className = 'hint';
        empty.textContent = 'No memories saved yet.';
        container.append(empty);
        return;
      }
      for (const mem of memories) {
        const row = document.createElement('div');
        row.className = 'memory-row';

        const text = document.createElement('span');
        text.className = 'memory-content';
        text.textContent = mem.content;

        const meta = document.createElement('span');
        meta.className = 'memory-meta';
        meta.textContent = `used ${mem.useCount}x · updated ${new Date(mem.updatedAt).toLocaleString()}`;

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'memory-btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', async () => {
          const next = prompt('Edit memory:', mem.content);
          if (next === null) return; // cancelled
          try {
            await memoryManager.update(mem.id, { content: next });
            renderMemoryList(container);
          } catch (err) {
            alert(`Could not save edit: ${err.message}`);
            log.warn('Memory edit failed', err);
          }
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'memory-btn memory-btn-danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async () => {
          await memoryManager.remove(mem.id);
          renderMemoryList(container);
        });

        row.append(text, meta, editBtn, deleteBtn);
        container.append(row);
      }
    })
    .catch((err) => {
      container.innerHTML = '';
      const errEl = document.createElement('p');
      errEl.className = 'hint';
      errEl.textContent = `Failed to load memories: ${err.message}`;
      container.append(errEl);
      log.error('Failed to render memory list', err);
    });
}

function wireMemoryPanel(caps) {
  const listEl = document.getElementById('memory-list');
  const addForm = document.getElementById('memory-add-form');
  const addInput = document.getElementById('memory-add-input');
  const clearBtn = document.getElementById('memory-clear-btn');
  const persistenceNote = document.getElementById('memory-persistence-note');
  if (!listEl || !addForm || !addInput || !clearBtn) return;

  persistenceNote.textContent = memoryIsPersistent
    ? 'Stored in IndexedDB — survives closing and reopening this browser.'
    : (caps.indexedDB === false
        ? 'IndexedDB is not available in this browser — memories will be lost when this tab closes.'
        : 'Using an in-memory fallback — memories will be lost when this tab closes.');

  renderMemoryList(listEl);

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = addInput.value.trim();
    if (!text) return;
    try {
      await memoryManager.remember(text);
      addInput.value = '';
      renderMemoryList(listEl);
    } catch (err) {
      alert(`Could not save memory: ${err.message}`);
      log.warn('Manual memory add failed', err);
    }
  });

  clearBtn.addEventListener('click', async () => {
    const confirmed = confirm('Delete ALL saved memories? This cannot be undone.');
    if (!confirmed) return;
    try {
      await memoryManager.clearAll({ confirm: true });
      renderMemoryList(listEl);
    } catch (err) {
      alert(`Could not clear memories: ${err.message}`);
      log.error('Clear all memories failed', err);
    }
  });

  bus.on('memory:changed', () => renderMemoryList(listEl));
}

function wireChatShell() {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const log_el = document.getElementById('chat-log');
  const sendBtn = form ? form.querySelector('button[type="submit"]') : null;
  if (!form || !input || !log_el) return null;

  function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `msg msg-${role}`;
    div.textContent = text;
    log_el.append(div);
    log_el.scrollTop = log_el.scrollHeight;
    return div;
  }

  async function submitText(text, { speak = false } = {}) {
    const cleanText = text.trim();
    if (!cleanText) return;
    appendMessage('user', cleanText);
    input.value = '';
    if (!orchestrator) buildOrchestrator();
    if (sendBtn) sendBtn.disabled = true;
    const pending = appendMessage('system', 'Thinking…');
    try {
      const result = await orchestrator.send(cleanText);
      pending.remove();
      const responseText = result.content ?? '(no content returned)';
      appendMessage('assistant', responseText);
      if (speak && voiceTts && config.get('voice.ttsEnabled', true)) {
        try { await voiceTts.speak(responseText); } catch (err) { log.warn('Voice response playback failed.', err); }
      }
      if (result.toolTrace && result.toolTrace.length) log.info('Tool trace for this turn:', result.toolTrace);
      if (memoryManager) bus.emit('memory:changed');
    } catch (err) {
      pending.remove();
      appendMessage('system', `Error: ${err.message}`);
      log.error('Orchestrator failed to produce a response.', err);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); submitText(input.value); });
  return submitText;
}

function wireVoice(caps, submitText) {
  const startBtn = document.getElementById('voice-start-btn');
  const stopBtn = document.getElementById('voice-stop-btn');
  const cancelBtn = document.getElementById('voice-cancel-btn');
  const stateEl = document.getElementById('voice-state');
  if (!startBtn || !stopBtn || !cancelBtn || !stateEl) return;

  const setState = (text, kind = 'info') => { stateEl.textContent = text; stateEl.className = `voice-state voice-state-${kind}`; };
  startBtn.disabled = !caps.speechRecognition;
  stopBtn.disabled = true;
  cancelBtn.disabled = !caps.speechSynthesis;

  if (!caps.speechRecognition) setState('Speech recognition is not supported in this browser.', 'error');
  if (!caps.speechSynthesis) cancelBtn.title = 'Speech synthesis is not supported in this browser.';

  if (caps.speechRecognition) {
    voiceStt = new BrowserSpeechToText({ language: config.get('voice.sttLang', 'en-IN') });
    voiceStt.on(VoiceEvent.START, () => { setState('Listening…', 'active'); startBtn.disabled = true; stopBtn.disabled = false; });
    voiceStt.on(VoiceEvent.PARTIAL, (result) => { setState(`Listening: ${result.text}`, 'active'); });
    voiceStt.on(VoiceEvent.FINAL, (result) => { setState('Processing recognized speech…', 'info'); submitText(result.text, { speak: true }); });
    voiceStt.on(VoiceEvent.END, () => { if (voiceStt.state === VoiceState.IDLE) { startBtn.disabled = false; stopBtn.disabled = true; if (stateEl.classList.contains('voice-state-active')) setState('Ready.'); } });
    voiceStt.on(VoiceEvent.ERROR, (error) => { setState(error.message, 'error'); startBtn.disabled = false; stopBtn.disabled = true; log.warn('Speech recognition failed.', error); });
    startBtn.addEventListener('click', () => { try { voiceStt.start(); } catch (err) { setState(err.message, 'error'); } });
    stopBtn.addEventListener('click', () => voiceStt.stop());
  } else {
    startBtn.title = 'Speech recognition is not supported in this browser.';
  }

  if (caps.speechSynthesis) {
    voiceTts = new BrowserTextToSpeech({ language: config.get('voice.ttsLang', 'hi-IN'), preferredGender: config.get('voice.ttsPreferredGender', 'male'), rate: config.get('voice.ttsRate', 1), volume: config.get('voice.ttsVolume', 1) });
    voiceTts.on(VoiceEvent.SPEAK_START, () => { setState('Speaking…', 'active'); cancelBtn.disabled = false; });
    voiceTts.on(VoiceEvent.SPEAK_END, () => { setState('Ready.'); cancelBtn.disabled = false; });
    voiceTts.on(VoiceEvent.ERROR, (error) => { setState(error.message, 'error'); log.warn('Speech synthesis failed.', error); });
    cancelBtn.addEventListener('click', () => voiceTts.cancel());
  } else {
    cancelBtn.title = 'Speech synthesis is not supported in this browser.';
  }
}

function boot() {
  try {
    config.load();
  } catch (err) {
    log.error('Config failed to load; continuing with defaults.', err);
  }
  applyLogLevelFromConfig();

  const caps = detectCapabilities(window);
  log.info('Capabilities detected', caps);

  try {
    config.requireSet('language');
  } catch (err) {
    if (err instanceof ConfigError) {
      log.warn('Non-fatal config issue on boot:', err.message);
    }
  }

  buildMemoryManager(caps);
  buildOrchestrator();
  renderCapabilityReport(caps);
  wireSettingsForm(caps);
  wireMemoryPanel(caps);
  const submitText = wireChatShell();
  wireVoice(caps, submitText);
  renderStatus(`Arya running. AI provider: ${config.get('ai.provider', 'mock')}.`, 'ok');
  bus.emit('app:ready', { caps, config: config.redactedSnapshot() });
  log.info('Arya foundation booted successfully.');
}

document.addEventListener('DOMContentLoaded', boot);

// Exposed for debugging in the browser console and for future phases.
window.Arya = { config, bus, logger: rootLogger, conversation, getOrchestrator: () => orchestrator, toolRegistry, getMemoryManager: () => memoryManager, getSpeechToText: () => voiceStt, getTextToSpeech: () => voiceTts };
