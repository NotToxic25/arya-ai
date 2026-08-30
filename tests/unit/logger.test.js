import { test } from 'node:test';
import assert from 'node:assert/strict';
import Logger, { LogLevel } from '../../core/logger.js';

test('logger respects minimum level and does not record below-threshold logs', () => {
  const logger = new Logger({ level: LogLevel.WARN, namespace: 'test' });
  logger.debug('should not appear');
  logger.info('should not appear');
  logger.warn('should appear');
  logger.error('should appear too');
  assert.equal(logger.history.length, 2);
  assert.equal(logger.history[0].level, 'WARN');
  assert.equal(logger.history[1].level, 'ERROR');
});

test('logger.setLevel accepts string level names', () => {
  const logger = new Logger({ level: LogLevel.INFO, namespace: 'test' });
  logger.setLevel('ERROR');
  logger.warn('hidden');
  logger.error('shown');
  assert.equal(logger.history.length, 1);
  assert.equal(logger.history[0].level, 'ERROR');
});

test('logger.setLevel rejects unknown level names', () => {
  const logger = new Logger();
  assert.throws(() => logger.setLevel('NOT_A_LEVEL'), /Unknown log level/);
});

test('logger history trims to maxHistory', () => {
  const logger = new Logger({ level: LogLevel.DEBUG, maxHistory: 3 });
  for (let i = 0; i < 10; i++) logger.info(`msg ${i}`);
  assert.equal(logger.history.length, 3);
  assert.equal(logger.history[2].message[0], 'msg 9');
});

test('child logger shares history buffer with parent and inherits level', () => {
  const parent = new Logger({ level: LogLevel.WARN, namespace: 'parent' });
  const child = parent.child('module');
  child.warn('from child');
  assert.equal(parent.history.length, 1);
  assert.equal(child.namespace, 'parent:module');
});

test('a throwing sink does not crash the logger', () => {
  const logger = new Logger({ level: LogLevel.INFO });
  logger.addSink(() => { throw new Error('sink boom'); });
  assert.doesNotThrow(() => logger.info('still works'));
  assert.equal(logger.history.length, 1);
});

test('getHistory filters by level', () => {
  const logger = new Logger({ level: LogLevel.DEBUG });
  logger.info('a');
  logger.error('b');
  logger.info('c');
  assert.equal(logger.getHistory('INFO').length, 2);
  assert.equal(logger.getHistory('ERROR').length, 1);
});
