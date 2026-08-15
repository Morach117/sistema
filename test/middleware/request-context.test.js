const test = require('node:test');
const assert = require('node:assert/strict');
const { requestContext } = require('../../middleware/request-context');

test('creates a request ID and returns it in the response header', () => {
  const req = {};
  const headers = {};
  const res = { setHeader(name, value) { headers[name] = value; } };
  let nextCalled = false;

  requestContext(req, res, () => { nextCalled = true; });

  assert.match(req.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(headers['X-Request-Id'], req.requestId);
  assert.equal(nextCalled, true);
});
