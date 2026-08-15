const test = require('node:test');
const assert = require('node:assert/strict');
const { serializeLog } = require('../../utils/logger');

test('redacts credentials from structured logs', () => {
  const serialized = serializeLog({
    message: 'failed',
    token: 'secret-token',
    nested: {
      password: 'secret-password',
      Authorization: 'Bearer secret-authorization',
      cookie: 'session=secret-cookie'
    }
  });

  assert.doesNotMatch(serialized, /secret-/);
  assert.match(serialized, /\[REDACTED\]/);
  assert.match(serialized, /failed/);
});

test('preserves diagnostic Error fields and redacts custom credentials', () => {
  const cause = new Error('socket closed');
  const error = new Error('query failed', { cause });
  error.code = 'ER_LOCK_WAIT_TIMEOUT';
  error.errno = 1205;
  error.sqlState = 'HY000';
  error.sqlMessage = 'Lock wait timeout exceeded';
  error.token = 'secret-error-token';

  const parsed = JSON.parse(serializeLog({ error }));

  assert.equal(parsed.error.message, 'query failed');
  assert.equal(parsed.error.cause.message, 'socket closed');
  assert.equal(parsed.error.code, 'ER_LOCK_WAIT_TIMEOUT');
  assert.equal(parsed.error.errno, 1205);
  assert.equal(parsed.error.sqlState, 'HY000');
  assert.equal(parsed.error.sqlMessage, 'Lock wait timeout exceeded');
  assert.equal(parsed.error.token, '[REDACTED]');
});
