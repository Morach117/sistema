const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../app');
const { errorHandler } = require('../../middleware/errors');
const { request, responseRecorder } = require('../helpers/app');

test('does not expose unmarked client-error details', () => {
  const response = responseRecorder();

  errorHandler(
    { status: 400, message: 'SELECT password FROM usuarios' },
    { requestId: 'request-123' },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    error: 'Internal server error',
    requestId: 'request-123'
  });
});

test('exposes an explicitly safe client-error message', () => {
  const response = responseRecorder();

  errorHandler(
    { status: 400, isPublic: true, message: 'Invalid input' },
    { requestId: 'request-123' },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    error: 'Invalid input',
    requestId: 'request-123'
  });
});

test('adds a request ID and does not disclose Express', async () => {
  const response = await request(createApp()).get('/api/not-found');

  assert.equal(response.status, 404);
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/i);
  assert.equal(response.headers['x-powered-by'], undefined);
});

test('rejects JSON payloads larger than 1 MB without exposing parser details', async () => {
  const response = await request(createApp())
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send({ payload: 'a'.repeat(1024 * 1024) });

  assert.equal(response.status, 413);
  assert.deepEqual(response.body, {
    error: 'Internal server error',
    requestId: response.headers['x-request-id']
  });
});
