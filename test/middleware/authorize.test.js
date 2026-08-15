const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
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

test('allows the reception history module for a permitted employee', () => {
  let called = false;

  authorize({ module: 'historial-recepciones', action: 'read' })(
    { user: { rol: 'empleado', permisos: ['historial-recepciones'] } },
    {},
    () => { called = true; }
  );

  assert.equal(called, true);
});

test('frontend permissions expose reception history as routable and assignable', async () => {
  const permissionsModule = await import(
    `${pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src', 'auth', 'permissions.js')).href}?t=${Date.now()}`
  );

  assert.equal(
    permissionsModule.canAccess(
      { rol: 'empleado', permisos: ['historial-recepciones'] },
      'historial-recepciones'
    ),
    true
  );
  assert.equal(
    permissionsModule.defaultPathFor({
      rol: 'empleado',
      permisos: ['historial-recepciones'],
    }),
    '/historial-recepciones'
  );
  assert.deepEqual(
    permissionsModule.EMPLOYEE_PERMISSION_OPTIONS.find(
      ({ module }) => module === 'historial-recepciones'
    ),
    {
      module: 'historial-recepciones',
      label: 'Historial Recepciones',
    }
  );
});
