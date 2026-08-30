import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Orchestrator } from '../../ai/orchestrator.js';
import { ConversationContext } from '../../ai/ConversationContext.js';
import { ToolRegistry } from '../../ai/toolRegistry.js';
import { MockProvider } from '../../ai/providers/mockProvider.js';
import { AIProvider } from '../../ai/AIProvider.js';
import { registerDemoTools } from '../../ai/demoTools/calculatorTool.js';
import { NetworkError, ToolError } from '../../core/errors.js';

function makeOrchestrator(provider, { maxToolIterations, timeoutMs } = {}) {
  const context = new ConversationContext();
  const toolRegistry = new ToolRegistry();
  registerDemoTools(toolRegistry);
  return new Orchestrator({ provider, context, toolRegistry, maxToolIterations, timeoutMs });
}

test('end-to-end: user asks an arithmetic question, calculator tool is invoked, final answer is returned (Phase 2 acceptance criterion)', async () => {
  const orch = makeOrchestrator(new MockProvider());
  const result = await orch.send('what is 6 * 7');
  assert.equal(result.toolCalls, null);
  assert.match(result.content, /Result: 42/);
  assert.equal(result.toolTrace.length, 1);
  assert.equal(result.toolTrace[0].name, 'calculator');
  assert.equal(result.toolTrace[0].ok, true);
  assert.equal(result.toolTrace[0].result.result, 42);
});

test('a plain non-arithmetic message never triggers a tool call', async () => {
  const orch = makeOrchestrator(new MockProvider());
  const result = await orch.send('hello there');
  assert.equal(result.toolTrace.length, 0);
  assert.ok(result.content.length > 0);
});

test('conversation context accumulates messages across turns', async () => {
  const orch = makeOrchestrator(new MockProvider());
  await orch.send('hi');
  await orch.send('what is 3 + 3');
  // system + (user, assistant) x2 turns, but the arithmetic turn adds tool messages too
  const history = orch.context.getHistory();
  assert.ok(history.length >= 4);
  assert.equal(history[0].role, 'user');
});

test('a tool execution failure is fed back as an error result, not silently dropped or faked', async () => {
  const orch = makeOrchestrator(new MockProvider());
  const result = await orch.send('what is 1 / 0');
  assert.equal(result.toolTrace[0].ok, false);
  assert.match(result.toolTrace[0].error, /Division by zero/);
});

test('orchestrator throws NetworkError if the provider exceeds the timeout', async () => {
  class SlowProvider extends AIProvider {
    constructor() { super({ name: 'slow' }); }
    async generateResponse() {
      return new Promise((resolve) => setTimeout(() => resolve({ role: 'assistant', content: 'late', toolCalls: null }), 500));
    }
  }
  const orch = makeOrchestrator(new SlowProvider(), { timeoutMs: 30 });
  await assert.rejects(() => orch.send('hi'), NetworkError);
});

test('orchestrator aborts with ToolError after exceeding maxToolIterations (never loops forever)', async () => {
  class AlwaysCallsToolProvider extends AIProvider {
    constructor() { super({ name: 'loopy' }); }
    async generateResponse() {
      return { role: 'assistant', content: null, toolCalls: [{ id: 'x', name: 'calculator', arguments: { expression: '1+1' } }] };
    }
  }
  const orch = makeOrchestrator(new AlwaysCallsToolProvider(), { maxToolIterations: 2 });
  await assert.rejects(() => orch.send('loop please'), ToolError);
});

test('orchestrator rejects empty user input without calling the provider', async () => {
  const orch = makeOrchestrator(new MockProvider());
  await assert.rejects(() => orch.send('   '), TypeError);
});

test('provider switching: same orchestrator shape works with a different provider instance (Phase 2 acceptance criterion)', async () => {
  const orchA = makeOrchestrator(new MockProvider());
  const resultA = await orchA.send('2 + 2');
  assert.match(resultA.content, /Result: 4/);

  class EchoProvider extends AIProvider {
    constructor() { super({ name: 'echo2' }); }
    async generateResponse(messages) {
      const last = [...messages].reverse().find((m) => m.role === 'user');
      return { role: 'assistant', content: `echo: ${last.content}`, toolCalls: null };
    }
  }
  const orchB = makeOrchestrator(new EchoProvider());
  const resultB = await orchB.send('2 + 2');
  assert.equal(resultB.content, 'echo: 2 + 2');
});
