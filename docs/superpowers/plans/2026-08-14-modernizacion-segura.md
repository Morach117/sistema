# Modernización segura de Sistema de Papelería Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar una aplicación Node.js + React segura, verificable y adaptable a sucursales sin eliminar ni alterar datos existentes.

**Architecture:** La primera entrega introduce límites transversales de configuración, autenticación, autorización, validación y errores sin cambiar los contratos de ruta. Las entregas posteriores extraen lógica gradualmente, añaden migraciones aditivas y modernizan el cliente sobre una API compatible; cada una conserva los datos y tablas de cada sucursal.

**Tech Stack:** Node.js, Express 4, mysql2/promise, React 19, React Router 7, TanStack Query 5, Tailwind CSS 4, node:test, Supertest, Vitest, Testing Library, Vite.

## Global Constraints

- `cat_productos` contiene datos reales: no se eliminará, truncará ni se alterarán masivamente sus filas.
- Las tablas y datos existentes en las sucursales se preservarán. Ninguna migración ejecutará `DROP`, `TRUNCATE`, `DELETE` global, recreación de tablas ni cambios destructivos de columna.
- Toda evolución de datos será aditiva y compatible: `CREATE ... IF NOT EXISTS`, nuevas tablas, índices, columnas anulables/con valor por defecto seguro y migraciones versionadas que detecten el estado actual antes de actuar.
- Antes de una migración de esquema se creará un respaldo local y se verificará su resultado. Las migraciones se probarán contra una copia de base de datos antes del despliegue en sucursales.
- El sistema seguirá funcionando durante la modernización; no se cambian reglas de negocio sin una decisión explícita documentada.
- No se expondrán secretos, tokens ni detalles internos al usuario final.
- Mantener rutas y formas de respuesta existentes mientras se incorporan adaptadores compatibles; los cambios incompatibles requieren una ruta nueva versionada y una migración documentada.

---

## File structure

| Ruta | Responsabilidad |
| --- | --- |
| `config/env.js` | Leer, validar y exponer configuración no secreta; impedir secretos JWT de respaldo. |
| `app.js` | Construir Express sin abrir el puerto, para pruebas y servidor. |
| `server.js` | Iniciar el proceso, gestionar el puerto configurado y apagado ordenado. |
| `middleware/authorize.js` | Aplicar permisos de módulo/acción en servidor. |
| `middleware/errors.js` | Correlation ID, error HTTP seguro y wrapper async. |
| `middleware/validate.js` | Validadores pequeños para ID, paginación y cuerpos de rutas críticas. |
| `services/*` | Reglas transaccionales extraídas de rutas críticas. |
| `database/migrations/*` | Migraciones Node idempotentes y aditivas. |
| `scripts/migrate.js` | Ejecutar, registrar y verificar migraciones. |
| `frontend/src/lib/api.js` | Cliente Axios, manejo de token y errores de API. |
| `frontend/src/auth/*` | Perfil de sesión, guardas de ruta y permisos de UI. |
| `frontend/src/components/layout/*` | Navegación responsive y selector de tema accesible. |
| `frontend/src/styles/tokens.css` | Tokens semánticos claro/oscuro. |
| `test/*`, `frontend/src/**/*.test.jsx` | Regresión de API y componentes críticos. |

## Release order

1. Seguridad y correcciones de integridad sin migración.
2. Migrador, backup y compatibilidad de esquema.
3. Servicios, observabilidad y pruebas de API.
4. Sesión React, rutas, responsive, accesibilidad y temas.
5. Rendimiento medido, limpieza de legado y runbook de sucursal.

### Task 1: Test harness and safe application bootstrap

**Files:**
- Create: `app.js`
- Create: `config/env.js`
- Create: `middleware/errors.js`
- Create: `test/helpers/app.js`
- Create: `test/config/env.test.js`
- Modify: `server.js:1-72`
- Modify: `package.json:6-18`

**Interfaces:**
- Produces: `createApp(): express.Express`, `loadEnv(source?: NodeJS.ProcessEnv): AppConfig`, `asyncHandler(handler)` and `errorHandler(error, req, res, next)`.
- Consumes: `config/database.js` retains the existing `mysql2` pool export.

- [ ] **Step 1: Write failing configuration tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEnv } = require('../../config/env');

test('rejects a missing JWT_SECRET outside test mode', () => {
  assert.throws(() => loadEnv({ NODE_ENV: 'production' }), /JWT_SECRET/);
});

test('accepts an explicit secret and bounded port', () => {
  const env = loadEnv({ NODE_ENV: 'test', JWT_SECRET: 'a'.repeat(32), PORT: '3001' });
  assert.equal(env.port, 3001);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/config/env.test.js`

Expected: FAIL because `config/env.js` does not exist.

- [ ] **Step 3: Implement the bootstrap boundary**

```js
// config/env.js
function loadEnv(source = process.env) {
  const jwtSecret = source.JWT_SECRET;
  if (source.NODE_ENV !== 'test' && (!jwtSecret || jwtSecret.length < 32)) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  return { env: source.NODE_ENV || 'development', port: Number(source.PORT || 3000), jwtSecret };
}
module.exports = { loadEnv };
```

Move all Express middleware and route registration from `server.js` to `createApp`; add `app.disable('x-powered-by')`, JSON/urlencoded limits of `1mb`, a request ID middleware and a terminal error handler. Leave only `createApp().listen(config.port)` in `server.js`; do not auto-increment the configured port.

In `test/helpers/app.js`, export the exact helpers used by later tests: `responseRecorder()` returns `{ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }`; `transactionPool(results)` exposes `getConnection`, `beginTransaction`, `execute`, `commit`, `rollback` and `release`; and `fakeMigrationPool()` records executed statements. Add `supertest` as a development dependency and export it as `request` from that helper.

- [ ] **Step 4: Run focused and baseline verification**

Run: `node --test test/config/env.test.js && node --check app.js && node --check server.js`

Expected: PASS with zero failing tests and no syntax errors.

- [ ] **Step 5: Commit**

```bash
git add app.js server.js config/env.js middleware/errors.js test package.json
git commit -m "feat: add safe Express bootstrap"
```

### Task 2: Authentication, authorization and critical route protection

**Files:**
- Create: `middleware/authorize.js`
- Create: `test/middleware/authorize.test.js`
- Modify: `middleware/auth.js:1-25`
- Modify: `routes/auth.js:1-75`
- Modify: `routes/recepciones.js:1-110,454-500`
- Modify: `routes/usuarios.js:1-105`
- Modify: `routes/captura.js:1-476`
- Modify: `routes/reclamaciones.js:1-67`
- Modify: `routes/traspasos.js:1-147`

**Interfaces:**
- Consumes: `req.user = { id, rol, permisos }` from `authMiddleware`.
- Produces: `authorize({ module, action }): RequestHandler`; denies with `{ success: false, error: 'Acceso denegado.' }` and status 403.

- [ ] **Step 1: Write failing authorization tests**

```js
test('denies a user without the requested module permission', () => {
  const req = { user: { rol: 'empleado', permisos: ['bodega'] } };
  const res = responseRecorder();
  authorize({ module: 'recepciones', action: 'write' })(req, res, () => assert.fail('next'));
  assert.equal(res.statusCode, 403);
});

test('allows an administrator', () => {
  let called = false;
  authorize({ module: 'usuarios', action: 'write' })({ user: { rol: 'admin', permisos: [] } }, {}, () => { called = true; });
  assert.equal(called, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/middleware/authorize.test.js`

Expected: FAIL because `middleware/authorize.js` does not exist.

- [ ] **Step 3: Implement server-side access control and input safety**

Implement `authorize` with an allowlist of existing module names: `dashboard`, `bodega`, `traspasos`, `captura`, `recepciones`, `reclamaciones`, `catalogo`, `evolucion-precios`, `usuarios`, `auditoria`, `admin-traspasos`. Require `authMiddleware` then `authorize` for every non-auth route, including `POST /api/recepciones/generar_excel`; remove acceptance of a token in the export body.

Use `pool.execute` parameters for each permission row in `POST /api/usuarios/permisos/guardar`, validate integer `usuario_id` and the module allowlist, and execute delete/insert in one transaction. Give login failures one generic 401 message. Apply rate limiting to login and a strict CORS allowlist configured in `env.js`.

- [ ] **Step 4: Add HTTP regression tests and run them**

```js
test('rejects unauthenticated Excel exports', async () => {
  const response = await request(createApp()).post('/api/recepciones/generar_excel').send({ id: 1 });
  assert.equal(response.status, 401);
});

test('never interpolates a permission module in SQL', async () => {
  await assert.rejects(() => savePermissions({ usuario_id: 1, permisos: ["x'); DROP TABLE usuarios; --"] }), /módulo/);
});
```

Run: `node --test test/middleware/authorize.test.js test/routes/authz.test.js`

Expected: PASS; the export returns 401 unauthenticated and malformed modules are rejected before database access.

- [ ] **Step 5: Commit**

```bash
git add middleware routes test app.js config/env.js package.json package-lock.json
git commit -m "fix: enforce API authorization and input validation"
```

### Task 3: Upload, error and transaction hardening

**Files:**
- Create: `services/recepciones-service.js`
- Create: `services/traspasos-service.js`
- Create: `test/services/traspasos-service.test.js`
- Modify: `routes/recepciones.js:1-503`
- Modify: `routes/traspasos.js:1-147`
- Modify: `routes/bodega.js:1-253`
- Modify: `config/database.js:1-27`

**Interfaces:**
- Produces: `completeTraspaso({ pool, traspasoId, detalles, actorId }): Promise<void>`.
- Produces: `parseUpload({ file, maxRows }): Promise<ParsedReception>` and always removes temporary files in `finally`.

- [ ] **Step 1: Write failing transaction tests**

```js
test('rolls back when a detail does not belong to its transfer', async () => {
  const pool = transactionPool([{ affectedRows: 0 }]);
  await assert.rejects(() => completeTraspaso({ pool, traspasoId: 4, detalles: [{ id: 9, cantidad_recibida: 2 }], actorId: 1 }), /detalle/);
  assert.equal(pool.rollbackCalled, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/services/traspasos-service.test.js`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement bounded uploads and atomic writes**

Configure Multer with an explicit destination, `files: 1`, safe MIME/extension checks and a `10 * 1024 * 1024` byte limit. Replace synchronous read/unlink calls with async filesystem APIs and `finally` cleanup. Reject oversized rows/inputs before parsing; retain the existing accepted XML/CSV formats.

In `completeTraspaso`, begin a transaction, lock the pending header, validate positive numeric quantities and issue `UPDATE traspaso_detalles SET cantidad_recibida = ? WHERE id = ? AND traspaso_id = ?`; update the header only if all details match, then commit. Roll back and return a public 409/422 error otherwise. Correct bodega search by appending `AND (...)` to its existing `WHERE` clause.

- [ ] **Step 4: Run focused verification**

Run: `node --test test/services/traspasos-service.test.js && node --check routes/recepciones.js && node --check routes/traspasos.js`

Expected: PASS; failed ownership checks cause rollback and the routes are syntactically valid.

- [ ] **Step 5: Commit**

```bash
git add services routes config/database.js test
git commit -m "fix: harden uploads and transactional inventory flows"
```

### Task 4: Additive migrations, backup verification and database safety

**Files:**
- Create: `database/migrations/001_migration_history.js`
- Create: `database/migrations/002_safe_indexes.js`
- Create: `scripts/migrate.js`
- Create: `scripts/verify-backup.js`
- Create: `test/database/migrations.test.js`
- Modify: `package.json:6-18`
- Modify: `backup_bd.js:1-45`
- Modify: `migrar_base_datos.js:1-266`
- Modify: `.gitignore:1-40`

**Interfaces:**
- Produces: `runMigrations({ pool, migrationsDir }): Promise<MigrationResult[]>`.
- Produces: `assertCatalogUnchanged({ before, after }): void`.

- [ ] **Step 1: Write failing migrator safety tests**

```js
test('records an idempotent migration once without modifying cat_productos', async () => {
  const pool = fakeMigrationPool();
  await runMigrations({ pool, migrations: [safeIndexMigration] });
  await runMigrations({ pool, migrations: [safeIndexMigration] });
  assert.equal(pool.appliedMigrationIds.length, 1);
  assert.equal(pool.catalogWriteStatements.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/database/migrations.test.js`

Expected: FAIL because `scripts/migrate.js` does not exist.

- [ ] **Step 3: Implement only additive migration mechanics**

Create `_node_migrations` with `id`, `checksum`, `applied_at` and `app_version`; never alter business tables from the migration runner itself. Each migration exports `{ id, checksum, up(connection) }`. `002_safe_indexes` first queries `information_schema.statistics`; only then adds missing indexes using a fixed allowlist. It must not include `DROP`, `TRUNCATE`, `DELETE`, `UPDATE cat_productos` or `ALTER ... DROP`.

Replace `exec` in `backup_bd.js` with `spawn` and argument arrays; direct output to a temporary file, check its size and atomically rename on success. Make `npm run migrate` invoke `scripts/migrate.js`; keep legacy scripts unused but present until an explicit post-upgrade review. Ignore `config/.active_port` and do not create an `.env` with credentials automatically.

- [ ] **Step 4: Verify repeatability and safety**

Run: `node --test test/database/migrations.test.js && rg -n "DROP|TRUNCATE|DELETE FROM|UPDATE cat_productos" database/migrations scripts/migrate.js`

Expected: test PASS and no destructive SQL matches.

- [ ] **Step 5: Commit**

```bash
git add database/migrations scripts test backup_bd.js migrar_base_datos.js package.json .gitignore
git commit -m "feat: add safe versioned database migrations"
```

### Task 5: Backend observability, performance boundaries and API regression suite

**Files:**
- Create: `utils/logger.js`
- Create: `middleware/request-context.js`
- Create: `test/routes/catalogo.test.js`
- Create: `test/routes/bodega.test.js`
- Modify: `app.js:1-120`
- Modify: `routes/catalogo.js:1-89`
- Modify: `routes/dashboard.js:1-67`
- Modify: `config/database.js:1-40`

**Interfaces:**
- Produces: `log(level, message, context)` that redacts `password`, `token`, `authorization` and `cookie` keys.
- Produces: bounded `parsePagination(query): { offset: number, limit: number }` where `1 <= limit <= 100`.

- [ ] **Step 1: Write failing pagination and redaction tests**

```js
test('clamps catalog pagination to 100 rows', () => {
  assert.deepEqual(parsePagination({ start: '0', length: '99999' }), { offset: 0, limit: 100 });
});

test('redacts credentials from structured logs', () => {
  assert.doesNotMatch(serializeLog({ token: 'secret', message: 'failed' }), /secret/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/routes/catalogo.test.js test/utils/logger.test.js`

Expected: FAIL because pagination/log helpers do not exist.

- [ ] **Step 3: Implement bounded data access and useful diagnostics**

Add request IDs to all responses/logs and make the error handler log internal causes while returning `{ success:false, error:'Ocurrió un error interno.', requestId }`. Bound pool waits with connection/acquire timeouts and finite queue size. Replace dashboard sequential aggregates with one parameterized aggregate query where equivalent; use date ranges instead of `DATE(column)` in modified queries. Do not add an index before capturing `EXPLAIN` against a representative backup.

- [ ] **Step 4: Run API suite**

Run: `node --test test/routes/catalogo.test.js test/routes/bodega.test.js test/utils/logger.test.js`

Expected: PASS; bad page input is bounded, logging redacts secrets, and bodega search uses valid SQL.

- [ ] **Step 5: Commit**

```bash
git add utils middleware routes config app.js test
git commit -m "feat: add API observability and query safeguards"
```

### Task 6: Central React API session and real route authorization

**Files:**
- Create: `frontend/src/lib/api.js`
- Create: `frontend/src/auth/session.js`
- Create: `frontend/src/auth/ProtectedRoute.jsx`
- Create: `frontend/src/auth/permissions.js`
- Create: `frontend/src/auth/ProtectedRoute.test.jsx`
- Modify: `frontend/src/App.jsx:1-81`
- Modify: `frontend/src/main.jsx:1-30`
- Modify: `frontend/src/pages/Login.jsx:1-92`
- Modify: `frontend/src/pages/Recepciones.jsx:180-220`
- Modify: `frontend/package.json:6-40`

**Interfaces:**
- Produces: `canAccess(user, module): boolean`, `readSession(): Session | null`, `clearSession(): void` and `<ProtectedRoute module="recepciones">`.
- Produces: default Axios instance with bearer header and a 401 handler that clears the session.

- [ ] **Step 1: Write failing route tests**

```jsx
it('redirects an employee without usuarios permission', () => {
  saveSession({ token: 'signed-token', user: { rol: 'empleado', permisos: ['bodega'] } });
  renderAt('/usuarios', <ProtectedRoute module="usuarios"><p>Users</p></ProtectedRoute>);
  expect(screen.queryByText('Users')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd --prefix frontend run test -- ProtectedRoute.test.jsx`

Expected: FAIL because test runner and reusable guard do not exist.

- [ ] **Step 3: Implement centralized client behavior**

Add Vitest, Testing Library and a `test` script only if no existing frontend test runner is available. Move Axios interceptors out of `App.jsx`; parse stored session defensively. Guard every route, including `admin-traspasos`, `auditoria`, `catalogo`, `evolucion-precios` and `usuarios`. Replace the HTML form export in Recepciones with the API client and blob download so the token never becomes form data. Change `Reclamaciones` from `isAdmin = true` to `canAccess(session.user, 'reclamaciones')`; retain backend enforcement from Task 2.

- [ ] **Step 4: Run frontend focused verification**

Run: `npm.cmd --prefix frontend run test -- --run ProtectedRoute.test.jsx && npm.cmd --prefix frontend run lint`

Expected: tests PASS and no new lint errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src frontend/package.json frontend/package-lock.json
git commit -m "feat: centralize React session and route guards"
```

### Task 7: Design tokens, theme and responsive accessible application shell

**Files:**
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/components/layout/AppShell.jsx`
- Create: `frontend/src/components/layout/ThemeToggle.jsx`
- Create: `frontend/src/components/layout/AppShell.test.jsx`
- Modify: `frontend/src/index.css:1-74`
- Modify: `frontend/src/components/Layout.jsx:1-137`
- Modify: `frontend/src/main.jsx:1-30`

**Interfaces:**
- Produces: `<AppShell><Outlet /></AppShell>` and `<ThemeToggle />` with `aria-label="Cambiar tema"`.
- Produces: semantic CSS variables `--background`, `--surface`, `--text-primary`, `--border`, `--focus`, `--success`, `--warning`, `--danger` for both themes.

- [ ] **Step 1: Write failing shell accessibility tests**

```jsx
it('opens the mobile navigation with an accessible control', async () => {
  render(<AppShell><p>Contenido</p></AppShell>);
  await userEvent.click(screen.getByRole('button', { name: /abrir navegación/i }));
  expect(screen.getByRole('navigation')).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd --prefix frontend run test -- --run AppShell.test.jsx`

Expected: FAIL because `AppShell` does not exist.

- [ ] **Step 3: Implement themes and mobile navigation**

Define distinct `:root` (light) and `.dark` tokens; remove forced dark `body` colors and unhide the persisted `next-themes` toggle. Replace fixed `w-72 h-screen` shell with `min-h-dvh`, a desktop sidebar and a mobile drawer triggered by a named button. Preserve links and permission filtering. Use focus-visible styles, 44px minimum touch targets, semantic `<nav>` and visible keyboard focus.

- [ ] **Step 4: Run verification**

Run: `npm.cmd --prefix frontend run test -- --run AppShell.test.jsx && npm.cmd --prefix frontend run build`

Expected: test and production build PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat: add responsive accessible themed app shell"
```

### Task 8: Refactor critical React flows and accessible dialogs

**Files:**
- Create: `frontend/src/components/ui/dialog.jsx`
- Create: `frontend/src/components/ui/LoadingState.jsx`
- Create: `frontend/src/components/ui/EmptyState.jsx`
- Create: `frontend/src/features/recepciones/useReceptionEditor.js`
- Create: `frontend/src/features/captura/CaptureDetails.jsx`
- Create: `frontend/src/components/ui/dialog.test.jsx`
- Modify: `frontend/src/pages/Recepciones.jsx:1-504`
- Modify: `frontend/src/pages/CapturaInteligente.jsx:1-978`
- Modify: `frontend/src/pages/Bodega.jsx:1-919`
- Modify: `frontend/src/pages/AuditoriaCaptura.jsx:1-623`

**Interfaces:**
- Produces: `Dialog` based on Radix primitives with labelled title, focus trap and focus restoration.
- Produces: `useReceptionEditor(remisionId)` that exposes controlled draft fields and an explicit `saveField` mutation; it never writes on every keystroke.

- [ ] **Step 1: Write failing dialog and mutation timing tests**

```jsx
it('returns focus to its trigger after closing', async () => {
  render(<DialogDemo />);
  const trigger = screen.getByRole('button', { name: /abrir detalles/i });
  await userEvent.click(trigger);
  await userEvent.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
});

it('saves a reception field only after explicit confirmation', () => {
  const editor = createEditor();
  editor.setClaveSicar('A-2');
  expect(editor.mutate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd --prefix frontend run test -- --run dialog.test.jsx useReceptionEditor.test.js`

Expected: FAIL because reusable dialog and editor hook do not exist.

- [ ] **Step 3: Implement focused component boundaries**

Build the dialog on the already-installed Radix Dialog package or add only `@radix-ui/react-dialog` if absent. Replace hand-built critical modals with it. Replace DaisyUI-only loading classes with local loading components. Move reception field edits to controlled state and save on blur/Enter with a debounced, cancellable mutation. Render capture labels as React nodes rather than `dangerouslySetInnerHTML`; keep plain text from API untrusted. Convert clickable `div`s to named buttons and associate every form label with an input ID.

- [ ] **Step 4: Run component and build verification**

Run: `npm.cmd --prefix frontend run test -- --run dialog.test.jsx useReceptionEditor.test.js && npm.cmd --prefix frontend run lint && npm.cmd --prefix frontend run build`

Expected: all commands PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src frontend/package.json frontend/package-lock.json
git commit -m "refactor: make critical React flows accessible"
```

### Task 9: Performance evidence, legacy classification and branch handoff

**Files:**
- Create: `docs/operations/sucursal-update.md`
- Create: `docs/operations/backup-restore.md`
- Create: `docs/audits/2026-08-14-modernization-report.md`
- Modify: `DOCUMENTACION.md:1-160`
- Modify: `frontend/src/App.jsx:1-120`
- Modify: `package.json:1-40`

**Interfaces:**
- Produces: a documented deploy command sequence: backup → verify → migrate → healthcheck → smoke test → rollback restore.
- Produces: lazy React routes using `React.lazy` and `Suspense` while retaining existing URL paths.

- [ ] **Step 1: Write failing route lazy-load test**

```jsx
it('shows a loading fallback while a lazy route resolves', async () => {
  renderAt('/auditoria', <App />);
  expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: /auditoría/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd --prefix frontend run test -- --run App.lazy.test.jsx`

Expected: FAIL because routes are eagerly imported and lack a fallback.

- [ ] **Step 3: Implement measured delivery safeguards**

Convert page imports to `React.lazy` and add a named accessible Suspense fallback. Capture production build asset sizes before/after in the report. For database changes, record `EXPLAIN` output against a backup before applying any index migration. Document each legacy PHP/SQL artifact as A (remove from operation), B (refactor) or C (retain); do not delete historical files in this task. Document the current P0–P3 audit, mitigations, remaining risks, data-preservation checks and exact sucursal update/rollback sequence.

- [ ] **Step 4: Run complete verification**

Run: `node --test && npm.cmd --prefix frontend run test -- --run && npm.cmd --prefix frontend run lint && npm.cmd --prefix frontend run build && git diff --check`

Expected: all suites, lint, build and diff check PASS. Record actual command output and any unresolved warnings in the audit report.

- [ ] **Step 5: Commit**

```bash
git add docs DOCUMENTACION.md frontend/src package.json
git commit -m "docs: add safe branch deployment and modernization report"
```

## Plan self-review

- Spec coverage: Tasks 1–3 cover security and core integrity; Task 4 protects data and migrations; Task 5 covers observability/performance; Tasks 6–8 cover React, responsive UX, accessibility and themes; Task 9 documents legacy status, measurements and sucursal deployment.
- Preservation: Tasks 4 and 9 explicitly prohibit destructive SQL and require backup, idempotence, schema checks and `cat_productos` validation.
- Dependencies: Task 1 precedes all backend tests; Task 2 precedes UI-only guards; Task 4 follows critical route safety; Task 6 establishes the frontend testing/client boundary needed by Tasks 7–9.
- No task may be marked complete without its listed fresh verification commands and a review of the staged diff.
