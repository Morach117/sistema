const test = require('node:test');
const assert = require('node:assert/strict');
const { responseRecorder } = require('../helpers/app');
const { authorize } = require('../../middleware/authorize');

test('denies a user without the requested module permission', () => {
  const req = { user: { rol: 'empleado', permisos: ['bodega'] } };
  const res = responseRecorder();

  authorize({ module: 'recepciones', action: 'write' })(req, res, () => assert.fail('next'));

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { success: false, error: 'Acceso denegado.' });
});

test('allows an administrator', () => {
  let called = false;

  authorize({ module: 'usuarios', action: 'write' })(
    { user: { rol: 'admin', permisos: [] } },
    {},
    () => { called = true; }
  );

  assert.equal(called, true);
});

test('allows a user with the requested module permission', () => {
  let called = false;

  authorize({ module: 'recepciones', action: 'read' })(
    { user: { rol: 'empleado', permisos: ['recepciones'] } },
    {},
    () => { called = true; }
  );

  assert.equal(called, true);
});
