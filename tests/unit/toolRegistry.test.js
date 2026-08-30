import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolRegistry } from '../../ai/toolRegistry.js';
import { calculatorTool, evaluateExpression, registerDemoTools } from '../../ai/demoTools/calculatorTool.js';
import { ToolError } from '../../core/errors.js';

test('evaluateExpression handles basic arithmetic with precedence and parentheses', () => {
  assert.equal(evaluateExpression('2 + 3'), 5);
  assert.equal(evaluateExpression('2 + 3 * 4'), 14);
  assert.equal(evaluateExpression('(2 + 3) * 4'), 20);
  assert.equal(evaluateExpression('10 / 4'), 2.5);
  assert.equal(evaluateExpression('-5 + 3'), -2);
});

test('evaluateExpression throws ToolError on division by zero', () => {
  assert.throws(() => evaluateExpression('1 / 0'), ToolError);
});

test('evaluateExpression throws ToolError on malformed expression', () => {
  assert.throws(() => evaluateExpression('2 + '), ToolError);
  assert.throws(() => evaluateExpression('2 $ 3'), ToolError);
  assert.throws(() => evaluateExpression('(2 + 3'), ToolError);
});

test('evaluateExpression never uses eval or Function (no injection surface)', () => {
  // Guard against a regression that reintroduces eval()-style evaluation.
  const src = calculatorToolSource();
  assert.ok(!/\beval\(/.test(src));
  assert.ok(!/new Function\(/.test(src));
});

function calculatorToolSource() {
  // Re-read is unnecessary for a unit test; this is just a static string
  // check on the imported function's own source, which is available via
  // Function.prototype.toString for our hand-written parser functions.
  return evaluateExpression.toString();
}

test('ToolRegistry.register rejects duplicate names', () => {
  const reg = new ToolRegistry();
  reg.register(calculatorTool);
  assert.throws(() => reg.register(calculatorTool), ToolError);
});

test('ToolRegistry.list returns descriptors without exposing execute()', () => {
  const reg = new ToolRegistry();
  registerDemoTools(reg);
  const list = reg.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'calculator');
  assert.equal(list[0].execute, undefined);
});

test('ToolRegistry.execute validates arguments before running', async () => {
  const reg = new ToolRegistry();
  registerDemoTools(reg);
  await assert.rejects(() => reg.execute('calculator', {}), ToolError);
});

test('ToolRegistry.execute runs the tool and returns its result', async () => {
  const reg = new ToolRegistry();
  registerDemoTools(reg);
  const result = await reg.execute('calculator', { expression: '6 * 7' });
  assert.equal(result.result, 42);
});

test('ToolRegistry.execute throws ToolError for unknown tool names', async () => {
  const reg = new ToolRegistry();
  await assert.rejects(() => reg.execute('does-not-exist', {}), ToolError);
});

test('ToolRegistry.execute wraps unexpected execution errors as ToolError', async () => {
  const reg = new ToolRegistry();
  reg.register({
    name: 'flaky',
    description: 'always throws',
    parameters: {},
    async execute() {
      throw new Error('boom');
    },
  });
  await assert.rejects(() => reg.execute('flaky', {}), ToolError);
});
