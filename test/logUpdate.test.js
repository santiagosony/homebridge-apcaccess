const test = require('node:test');
const assert = require('node:assert/strict');
const { logMin, logOnlyError } = require('../lib/logUpdate');

const recordingLog = () => {
  const calls = [];
  const log = () => {};
  ['info', 'warn', 'error', 'debug'].forEach((level) => {
    log[level] = (...args) => calls.push([level, ...args]);
  });
  return { log, calls };
};

test('logOnlyError keeps update.error and update.warn', () => {
  const { log, calls } = recordingLog();
  const errorsOnly = logOnlyError(log);

  errorsOnly.info('hidden');
  errorsOnly.update.info('Power:', 'Connected');
  errorsOnly.update.warn('Battery state:', 'Low');
  errorsOnly.update.error('Polling UPS service failed:', 'boom');

  assert.deepEqual(calls, [
    ['warn', 'Battery state:', 'Low'],
    ['error', 'Polling UPS service failed:', 'boom'],
  ]);
});

test('update logs repeated messages at debug level', () => {
  const { log, calls } = recordingLog();
  const min = logMin(log);

  min.update.info('Power:', 'Connected');
  min.update.info('Power:', 'Connected');

  assert.deepEqual(calls, [
    ['info', 'Power:', 'Connected'],
    ['debug', 'Power:', 'Connected'],
  ]);
});
