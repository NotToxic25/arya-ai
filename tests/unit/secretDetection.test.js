import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLikelySecret } from '../../core/secretDetection.js';

test('flags OpenAI-style API keys', () => {
  assert.equal(isLikelySecret('here is my key sk-abcdefghij1234567890').isSecret, true);
});

test('flags GitHub personal access tokens', () => {
  assert.equal(isLikelySecret('token: ghp_1234567890abcdefghij1234567890').isSecret, true);
});

test('flags Google API keys', () => {
  assert.equal(isLikelySecret('AIzaSyD-1234567890abcdefghijklmno').isSecret, true);
});

test('flags AWS access key ids', () => {
  assert.equal(isLikelySecret('AKIAABCDEFGHIJKLMNOP').isSecret, true);
});

test('flags "password: value" style assignments', () => {
  assert.equal(isLikelySecret('my password: hunter2isnotenough').isSecret, true);
  assert.equal(isLikelySecret('api_key=abcdef123456').isSecret, true);
});

test('flags Bearer authorization headers', () => {
  assert.equal(isLikelySecret('Authorization: Bearer abc123def456ghi789').isSecret, true);
});

test('flags JWT-shaped tokens', () => {
  assert.equal(
    isLikelySecret('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQx7cVvzXX9C3g9GZ8').isSecret,
    true
  );
});

test('flags generic long opaque tokens', () => {
  assert.equal(isLikelySecret('zK9pQ7mN3xR8vT2wY6uB1aC4dE5fG0hJ').isSecret, true);
});

test('does NOT flag ordinary sentences', () => {
  assert.equal(isLikelySecret('My girlfriend likes anime and manga illustration.').isSecret, false);
  assert.equal(isLikelySecret('I prefer Celsius over Fahrenheit for weather.').isSecret, false);
  assert.equal(isLikelySecret('Remember my exam is on Friday at 10am.').isSecret, false);
});

test('does NOT flag empty or non-string input', () => {
  assert.equal(isLikelySecret('').isSecret, false);
  assert.equal(isLikelySecret('   ').isSecret, false);
  assert.equal(isLikelySecret(undefined).isSecret, false);
  assert.equal(isLikelySecret(null).isSecret, false);
});

test('provides a human-readable reason whenever isSecret is true', () => {
  const result = isLikelySecret('sk-abcdefghij1234567890');
  assert.equal(result.isSecret, true);
  assert.ok(result.reason && result.reason.length > 5);
});
