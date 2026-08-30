import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockProvider } from '../../ai/providers/mockProvider.js';
import { ConversationContext } from '../../ai/ConversationContext.js';

const CALC_TOOL_DESC = [{ name: 'calculator', description: 'evaluates arithmetic', parameters: {} }];

test('MockProvider requests a calculator tool call for a plain arithmetic message', async () => {
  const provider = new MockProvider();
  const ctx = new ConversationContext();
  ctx.addMessage({ role: 'user', content: '12 * (3 + 4)' });
  const response = await provider.generateResponse(ctx.getMessages(), { tools: CALC_TOOL_DESC });
  assert.ok(response.toolCalls);
  assert.equal(response.toolCalls[0].name, 'calculator');
  assert.equal(response.toolCalls[0].arguments.expression, '12 * (3 + 4)');
});

test('MockProvider requests a calculator tool call for a natural-language "what is" question', async () => {
  const provider = new MockProvider();
  const ctx = new ConversationContext();
  ctx.addMessage({ role: 'user', content: 'what is 5 + 6' });
  const response = await provider.generateResponse(ctx.getMessages(), { tools: CALC_TOOL_DESC });
  assert.ok(response.toolCalls);
  assert.equal(response.toolCalls[0].arguments.expression.trim(), '5 + 6');
});

test('MockProvider does not request a tool call when calculator tool is not offered', async () => {
  const provider = new MockProvider();
  const ctx = new ConversationContext();
  ctx.addMessage({ role: 'user', content: '2 + 2' });
  const response = await provider.generateResponse(ctx.getMessages(), { tools: [] });
  assert.equal(response.toolCalls, null);
  assert.ok(response.content.includes('offline demo provider'));
});

test('MockProvider summarizes a tool result instead of re-triggering the tool', async () => {
  const provider = new MockProvider();
  const ctx = new ConversationContext();
  ctx.addMessage({ role: 'user', content: '2 + 2' });
  ctx.addMessage({ role: 'assistant', content: null, toolCalls: [{ id: 'c1', name: 'calculator', arguments: { expression: '2 + 2' } }] });
  ctx.addMessage({ role: 'tool', toolCallId: 'c1', name: 'calculator', content: JSON.stringify({ expression: '2 + 2', result: 4 }) });
  const response = await provider.generateResponse(ctx.getMessages(), { tools: CALC_TOOL_DESC });
  assert.equal(response.toolCalls, null);
  assert.match(response.content, /Result: 4/);
});

test('MockProvider plain echo response always discloses it is not a real AI model', async () => {
  const provider = new MockProvider();
  const ctx = new ConversationContext();
  ctx.addMessage({ role: 'user', content: 'hello there' });
  const response = await provider.generateResponse(ctx.getMessages(), { tools: [] });
  assert.match(response.content, /not a real AI model/);
});

test('MockProvider never makes a network call (requiresNetwork is false)', () => {
  const provider = new MockProvider();
  assert.equal(provider.requiresNetwork, false);
  assert.equal(provider.requiresBackend, false);
});
