const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../../middleware/auth');
const { responseRecorder } = require('../helpers/app');

function requestWithToken(token) {
  return { header: () => `Bearer ${token}` };
}

test('attaches a token verified with the configured JWT secret', () => {
  const previousSecret = process.env.JWT_SECRET;
  const secret = 'configured-secret-that-is-at-least-32-chars';
  process.env.JWT_SECRET = secret;
  const token = jwt.sign({ id: 8, rol: 'empleado', permisos: ['captura'] }, secret);
  let called = false;
  const req = requestWithToken(token);

  try {
    authMiddleware(req, responseRecorder(), () => { called = true; });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }

  assert.equal(called, true);
  assert.equal(req.user.id, 8);
  assert.deepEqual(req.user.permisos, ['captura']);
});

test('does not accept tokens signed with the removed fallback secret', () => {
  const previousSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  const token = jwt.sign({ id: 8, rol: 'admin', permisos: [] }, 'super_secret_key_12345');
  const response = responseRecorder();

  try {
    authMiddleware(requestWithToken(token), response, () => assert.fail('next'));
  } finally {
    if (previousSecret !== undefined) process.env.JWT_SECRET = previousSecret;
  }

  assert.equal(response.statusCode, 401);
});
