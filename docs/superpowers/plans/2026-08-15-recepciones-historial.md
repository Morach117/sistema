# Recepciones, Historial y Evolución de Precios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restaurar las funciones de recepción e historial con APIs Node seguras y corregir la carga de Evolución de Precios.

**Architecture:** Extraer las reglas de costo, caja, importación y aprendizaje a servicios Node probables. Exponer APIs específicas para vista previa, historial y bitácora; React solo presenta el estado calculado y solicita mutaciones autorizadas. Las migraciones serán aditivas e idempotentes y se ejecutarán al iniciar la aplicación.

**Tech Stack:** Node.js, Express, mysql2/promise, React 19, TanStack Query 5, Vitest, Testing Library, node:test y Supertest.

## Global Constraints

- No borrar remisiones, items, historial ni datos existentes.
- Toda migración debe ser aditiva, idempotente y ejecutarse antes de iniciar el servidor.
- El permiso `historial-recepciones` permite solo consulta; administración conserva edición de pendientes y Excel.
- El conteo físico inicia excluido de toda exportación de recepción.
- No aprender `FALTANTE`, `DEVOLUCION`, artículos rechazados o líneas sin SICAR.

---

### Task 1: Ejecutar migraciones automáticamente y habilitar permisos

**Files:**
- Modify: `server.js`, `middleware/authorize.js`, `frontend/src/auth/permissions.js`, `frontend/src/pages/Usuarios.jsx`
- Create: `database/migrations/003_reception_history_audit.js`
- Test: `test/database/migrations.test.js`, `test/middleware/authorize.test.js`

- [ ] Escribir pruebas que demuestren que la migración se puede ejecutar dos veces y que crea tablas de notas/bitácora de recepción, además de aceptar `historial-recepciones`.
- [ ] Ejecutar `node --test test/database/migrations.test.js test/middleware/authorize.test.js` y confirmar el fallo por migración/permisos inexistentes.
- [ ] Crear la migración con `CREATE TABLE IF NOT EXISTS` para `recepcion_notas` y `recepcion_bitacora`; añadir índices por remisión, item y fecha. Añadir el módulo a las listas backend/frontend y a la edición de permisos.
- [ ] Cambiar el inicio para ejecutar `runMigrations({ pool })` antes de `listen`; si falla, no abrir el puerto y liberar el pool.
- [ ] Repetir las pruebas y confirmar que pasan.

### Task 2: Convertir las reglas de recepción en servicios probados

**Files:**
- Create: `services/reception-rules.js`
- Modify: `services/recepciones-service.js`, `routes/recepciones.js`
- Test: `test/services/reception-rules.test.js`, `test/services/recepciones-service.test.js`, `test/routes/recepciones-upload.test.js`

- [ ] Escribir pruebas para RFC/nombre de Tony, Paola/Operadora, Optivosa, Megamer y Manual; para descuento XML de Tony, descuento global de Paola y precedencia de `aplica_descuento_manual`.
- [ ] Escribir pruebas para `calculatePresentation({ cantidad: 100, esPaquete: true, piezasPorPaquete: 10 })` que devuelva 10 cajas, y para configuración de caja inválida.
- [ ] Ejecutar los tests y confirmar fallos porque el módulo de reglas aún no existe.
- [ ] Implementar funciones puras `providerFrom`, `resolveDiscount`, `calculatePresentation`, `calculateCost`, `validateReceptionItems` y `buildReceptionSummary`. Conservar costo de XML ya gravado y usar metadatos para explicarlo, sin volver a sumar IVA a compras históricas.
- [ ] Ajustar el parser XML para devolver proveedor, IVA detectado, descuento por concepto y datos de origen; una reimportación pendiente actualiza solo datos de factura y no el conteo físico ni ajustes manuales.
- [ ] Ejecutar tests de servicio/ruta y confirmar que pasan.

### Task 3: Vista previa, aprendizaje y exportación de recepción

**Files:**
- Modify: `routes/recepciones.js`, `services/recepciones-service.js`
- Test: `test/routes/recepciones-preview.test.js`, `test/services/recepciones-service.test.js`

- [ ] Escribir pruebas de `POST /api/recepciones/preview-upload` que clasifiquen nuevo, actualización de pendiente y folio finalizado sin mutar datos.
- [ ] Escribir pruebas para `finalizeReception` que haga upsert en `rel_codigos_proveedor` solo con líneas válidas, y pruebas que excluyan faltantes/devoluciones/rechazos.
- [ ] Escribir una prueba de exportación donde `incluir_fisico: false` no suma físico y `true` sí lo suma.
- [ ] Ejecutar los tres grupos y confirmar los fallos esperados.
- [ ] Añadir la vista previa reutilizando el parser sin guardar; bloquear la carga de folios finalizados con respuesta 409.
- [ ] Extender la transacción de finalización: validar los errores bloqueantes, escribir el aprendizaje y registrar bitácora antes de cambiar el estado.
- [ ] Extender el endpoint Excel para aceptar `incluir_fisico` booleano validado y devolver el total calculado por reglas.
- [ ] Repetir las pruebas y confirmar éxito.

### Task 4: API de historial, notas y bitácora

**Files:**
- Create: `routes/historial-recepciones.js`, `test/routes/historial-recepciones.test.js`
- Modify: `app.js`, `routes/recepciones.js`

- [ ] Escribir pruebas de listado paginado por fecha, proveedor, estado, folio y producto; verificar que usuarios con solo `historial-recepciones` pueden leer pero reciben 403 al exportar/editar.
- [ ] Escribir pruebas de detalle finalizado de solo lectura, edición administrativa de pendiente, notas y bitácora con valor anterior/nuevo.
- [ ] Ejecutar `node --test test/routes/historial-recepciones.test.js` y confirmar el fallo por ruta ausente.
- [ ] Implementar `GET /api/historial-recepciones`, `GET /:id`, `GET /:id/excel`, y endpoints administrativos de notas/edición. Usar parámetros paginados, límites máximos, consultas preparadas y `recepcion_bitacora` dentro de la misma transacción de cada cambio.
- [ ] Registrar toda mutación existente de Recepciones en la misma bitácora, incluyendo proveedor, SICAR, cantidad, caja, descuento, rechazo y finalización.
- [ ] Montar el router en `app.js`; repetir las pruebas.

### Task 5: React: recepción completa e historial recuperado

**Files:**
- Create: `frontend/src/pages/HistorialRecepciones.jsx`, `frontend/src/pages/HistorialRecepciones.test.jsx`, `frontend/src/features/recepciones/receptionCalculations.js`
- Modify: `frontend/src/pages/Recepciones.jsx`, `frontend/src/App.jsx`, `frontend/src/components/layout/AppShell.jsx`, `frontend/src/features/recepciones/useReceptionEditor.js`
- Test: `frontend/src/pages/Recepciones.test.jsx`, `frontend/src/pages/HistorialRecepciones.test.jsx`

- [ ] Escribir pruebas de cálculo visible de cajas, aplicación automática de descuento, excepción manual, diferencias físico/factura, selección múltiple, validación previa y exportación sin físico inicial.
- [ ] Escribir pruebas de historial: consulta con permiso propio, controles de solo lectura para empleado y controles de edición/Excel para administrador.
- [ ] Ejecutar `npm --prefix frontend run test -- --run` y confirmar fallos por componentes ausentes.
- [ ] Crear la página de historial con filtros, búsqueda con debounce, paginación de servidor, resumen, detalle, notas y bitácora. Añadir la ruta y enlace visible según permiso.
- [ ] En Recepciones añadir tarjetas de presentación/caja, selección masiva, resumen, panel de validación, vista previa de archivos, notas, historial rápido de compra y selector de exportación. Mantener la barrera de guardados pendientes existente.
- [ ] Ejecutar las pruebas focales y luego el conjunto frontend completo.

### Task 6: Corregir Evolución y entrega offline

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/index.css`, `package.json`
- Create: `scripts/create-offline-release.js`, `test/scripts/offline-release.test.js`, `docs/operations/offline-install.md`

- [ ] Escribir una prueba/build que cargue el chunk de Evolución y falle si `es-toolkit/compat/range` no se resuelve.
- [ ] Escribir prueba de paquete offline que exija `frontend/dist`, lockfiles y caché o dependencias empaquetadas.
- [ ] Ejecutar las pruebas y confirmar el fallo actual de resolución.
- [ ] Declarar y bloquear la dependencia de Recharts requerida, ejecutar una instalación limpia y verificar `npm --prefix frontend run build`.
- [ ] Eliminar fuentes/CDNs remotos restantes y entregar fuentes/fallbacks locales. Crear el script que arma un archivo offline con build y caché npm de backend/frontend; documentar `npm ci --offline`.
- [ ] Ejecutar `npm run verify` y la prueba de paquete sin acceso de red.

### Task 7: Verificación y migración local

**Files:**
- Modify: `DOCUMENTACION.md`, `docs/operations/sucursal-update.md`

- [ ] Añadir instrucciones de respaldo, inicio con migración automática, permiso de historial y actualización offline.
- [ ] Ejecutar `npm run verify`, `node --test`, `npm --prefix frontend run build` y una segunda ejecución de migraciones en una copia de base.
- [ ] Verificar manualmente importación de un XML, vista previa, caja, finalización/aprendizaje, historial con usuario y administrador, y Evolución de Precios.
- [ ] Confirmar que `git diff --check` no informa errores antes de commit.
