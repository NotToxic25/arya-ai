import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Orchestrator } from '../../ai/orchestrator.js';
import { ConversationContext } from '../../ai/ConversationContext.js';
import { ToolRegistry } from '../../ai/toolRegistry.js';
import { MockProvider } from '../../ai/providers/mockProvider.js';
import { MemoryManager } from '../../memory/memoryManager.js';
import { InMemoryStore } from '../../memory/inMemoryStore.js';
import { registerDemoTools } from '../../ai/demoTools/calculatorTool.js';

function makeOrchestratorWithMemory() {
  const context = new ConversationContext();
  const toolRegistry = new ToolRegistry();
  registerDemoTools(toolRegistry);
  const memoryManager = new MemoryManager({ store: new InMemoryStore() });
  const orchestrator = new Orchestrator({ provider: new MockProvider(), context, toolRegistry, memoryManager });
  return { orchestrator, memoryManager, context };
}

test('an explicit "remember that ..." command saves a memory without calling the AI provider', async () => {
  const { orchestrator, memoryManager } = makeOrchestratorWithMemory();
  const result = await orchestrator.send('remember that I prefer window seats on flights');
  assert.match(result.content, /Memory saved/);
  const list = await memoryManager.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].content, 'I prefer window seats on flights');
});

test('Hinglish-style remember command ("yaad rakho ...") also works', async () => {
  const { orchestrator, memoryManager } = makeOrchestratorWithMemory();
  await orchestrator.send('yaad rakho meri exam date 10 September hai');
  const list = await memoryManager.list();
  assert.equal(list.length, 1);
  assert.match(list[0].content, /10 September/);
});

test('an explicit remember command carrying secret-looking content is refused and NOT stored', async () => {
  const { orchestrator, memoryManager } = makeOrchestratorWithMemory();
  const result = await orchestrator.send('remember that my api key is sk-abcdefghij1234567890');
  assert.match(result.content, /couldn't save/i);
  assert.equal((await memoryManager.list()).length, 0);
});

test('a later turn retrieves a previously remembered fact and surfaces it in the memory trace', async () => {
  const { orchestrator, memoryManager } = makeOrchestratorWithMemory();
  await memoryManager.remember('User is a BCA student in Rajkot, Gujarat.', { tags: ['profile'] });

  // Phase 3 ranking is deliberately simple keyword-overlap scoring (per
  // spec: "simple relevance scoring is acceptable"), not semantic search —
  // so the query must share actual keywords with the stored memory.
  const result = await orchestrator.send('what do you know about my BCA studies in Rajkot');
  assert.ok(result.memoryTrace);
  assert.ok(result.memoryTrace.length >= 1);
  assert.match(result.memoryTrace[0].content, /BCA/);
  assert.ok(result.memoryTrace[0].reasons.length > 0);
});

test('a turn with no relevant memories has an empty memoryTrace, not a fabricated one', async () => {
  const { orchestrator } = makeOrchestratorWithMemory();
  const result = await orchestrator.send('hello there');
  assert.deepEqual(result.memoryTrace, []);
});

test('orchestrator works fully without a memoryManager (Phase 2 behavior unaffected)', async () => {
  const context = new ConversationContext();
  const toolRegistry = new ToolRegistry();
  registerDemoTools(toolRegistry);
  const orchestrator = new Orchestrator({ provider: new MockProvider(), context, toolRegistry }); // no memoryManager
  const result = await orchestrator.send('what is 3 + 3');
  assert.match(result.content, /Result: 6/);
  assert.equal(result.memoryTrace, null);
});

test('memory retrieval failure does not break the conversation turn', async () => {
  const context = new ConversationContext();
  const toolRegistry = new ToolRegistry();
  registerDemoTools(toolRegistry);
  const brokenMemoryManager = {
    retrieveRelevant: async () => { throw new Error('simulated store outage'); },
  };
  const orchestrator = new Orchestrator({ provider: new MockProvider(), context, toolRegistry, memoryManager: brokenMemoryManager });
  const result = await orchestrator.send('hello');
  assert.ok(result.content.length > 0); // conversation still completes
});

test('the memory note is used for the turn it is relevant to, then cleared so it does not leak into an unrelated later turn', async () => {
  const { orchestrator, memoryManager, context } = makeOrchestratorWithMemory();
  await memoryManager.remember('User loves cricket.', { tags: ['hobby'] });

  const turn1 = await orchestrator.send('what sport does the user like');
  assert.ok(turn1.memoryTrace.some((m) => /cricket/.test(m.content)));
  // The note is cleared immediately after the turn completes (by design,
  // so it can never leak into an unrelated future turn) — so it should
  // not still be sitting in context messages once send() has resolved.
  assert.ok(!context.getMessages().some((m) => m.role === 'system' && /cricket/.test(m.content)));

  const turn2 = await orchestrator.send('totally unrelated question about the weather');
  assert.deepEqual(turn2.memoryTrace, []); // not falsely re-surfaced on an unrelated turn
});
