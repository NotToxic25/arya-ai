import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConversationContext } from '../../ai/ConversationContext.js';

test('getMessages always prepends the system prompt', () => {
  const ctx = new ConversationContext();
  const msgs = ctx.getMessages();
  assert.equal(msgs[0].role, 'system');
  assert.match(msgs[0].content, /Hinglish/);
});

test('addMessage appends and getMessages reflects it after system prompt', () => {
  const ctx = new ConversationContext();
  ctx.addMessage({ role: 'user', content: 'hello' });
  const msgs = ctx.getMessages();
  assert.equal(msgs.length, 2);
  assert.equal(msgs[1].role, 'user');
  assert.equal(msgs[1].content, 'hello');
});

test('addMessage rejects invalid roles', () => {
  const ctx = new ConversationContext();
  assert.throws(() => ctx.addMessage({ role: 'bogus', content: 'x' }), TypeError);
});

test('addMessage rejects non-object input', () => {
  const ctx = new ConversationContext();
  assert.throws(() => ctx.addMessage('not an object'), TypeError);
});

test('sliding window trims oldest messages beyond maxMessages', () => {
  const ctx = new ConversationContext({ maxMessages: 3 });
  for (let i = 0; i < 6; i++) ctx.addMessage({ role: 'user', content: `msg ${i}` });
  assert.equal(ctx.length, 3);
  const history = ctx.getHistory();
  assert.equal(history[0].content, 'msg 3');
  assert.equal(history[2].content, 'msg 5');
});

test('setSystemPrompt updates the prompt used by getMessages', () => {
  const ctx = new ConversationContext();
  ctx.setSystemPrompt('Custom prompt');
  assert.equal(ctx.getMessages()[0].content, 'Custom prompt');
});

test('setSystemPrompt rejects empty strings', () => {
  const ctx = new ConversationContext();
  assert.throws(() => ctx.setSystemPrompt('   '), TypeError);
});

test('clear() empties history but keeps system prompt', () => {
  const ctx = new ConversationContext();
  ctx.addMessage({ role: 'user', content: 'a' });
  ctx.clear();
  assert.equal(ctx.length, 0);
  assert.equal(ctx.getMessages().length, 1);
});
