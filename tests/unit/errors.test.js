import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AryaError,
  ConfigError,
  NetworkError,
  PermissionError,
  ToolError,
  UnsupportedFeatureError,
  StorageError,
  safeAsync,
} from '../../core/errors.js';

test('AryaError sets default code and captures message/context', () => {
  const err = new AryaError('boom', { context: { a: 1 } });
  assert.equal(err.code, 'ARYA_ERROR');
  assert.equal(err.message, 'boom');
  assert.deepEqual(err.context, { a: 1 });
  assert.ok(err.timestamp);
});

test('subclasses set the correct machine-readable code', () => {
  assert.equal(new ConfigError('x').code, 'CONFIG_ERROR');
  assert.equal(new NetworkError('x').code, 'NETWORK_ERROR');
  assert.equal(new PermissionError('x').code, 'PERMISSION_ERROR');
  assert.equal(new ToolError('x').code, 'TOOL_ERROR');
  assert.equal(new UnsupportedFeatureError('x').code, 'UNSUPPORTED_FEATURE');
  assert.equal(new StorageError('x').code, 'STORAGE_ERROR');
});

test('toJSON produces a serializable, non-crashing summary including cause message', () => {
  const cause = new Error('root cause');
  const err = new NetworkError('fetch failed', { cause });
  const json = err.toJSON();
  assert.equal(json.code, 'NETWORK_ERROR');
  assert.equal(json.cause, 'root cause');
  assert.doesNotThrow(() => JSON.stringify(json));
});

test('safeAsync passes through AryaError subclasses unchanged', async () => {
  await assert.rejects(
    () => safeAsync(async () => { throw new ToolError('bad tool'); }, { errorClass: NetworkError }),
    (err) => {
      assert.ok(err instanceof ToolError);
      assert.equal(err.message, 'bad tool');
      return true;
    }
  );
});

test('safeAsync wraps raw errors into the requested AryaError subclass', async () => {
  await assert.rejects(
    () => safeAsync(async () => { throw new Error('raw failure'); }, { errorClass: StorageError, message: 'storage broke' }),
    (err) => {
      assert.ok(err instanceof StorageError);
      assert.equal(err.message, 'storage broke');
      assert.equal(err.cause.message, 'raw failure');
      return true;
    }
  );
});

test('safeAsync resolves normally when no error occurs', async () => {
  const result = await safeAsync(async () => 42);
  assert.equal(result, 42);
});
