# Task 2 Report

## Summary

- Creé `services/clientes-service.js` con altas, lectura, edición y desactivación de clientes; no existe una operación de borrado.
- Añadí listado paginado y buscable por nombre, teléfono o correo, detalle individual y compras paginadas. La paginación exige enteros positivos completos, limita cada página a 100 filas y rechaza offsets excesivos antes de consultar la base.
- El alta, edición, desactivación y registro de compra funcionan solo contra la base local. Cada mutación obtiene `sucursal_id` exclusivamente de la fila singleton `cliente_configuracion` dentro de su transacción; ningún identificador de sucursal enviado por el navegador se propaga al servicio.
- Cada mutación escribe el registro de dominio, una operación pendiente con UUID en `cliente_operaciones_sync` y una entrada con UUID en `cliente_bitacora` antes del mismo `COMMIT`. Los fallos de cola o bitácora revierten toda la transacción y liberan la conexión.
- Las compras aceptan folio nullable. Solo una colisión de la restricción `uq_cliente_compras_sucursal_folio` se expone como conflicto 409; otras colisiones, como un UUID primario repetido, no se etiquetan erróneamente como folio duplicado.
- La fecha explícita de compra usa ISO-8601 UTC canónico con sufijo `Z`, rechaza fechas de calendario normalizadas por JavaScript y respeta el intervalo de `DATETIME` de MySQL (`1000..9999`). Si se omite, se genera una fecha UTC local al servicio.
- Creé `routes/clientes.js`, protegí todas las rutas con JWT y el permiso `clientes`, apliqué autorización de escritura a mutaciones, propagué el request ID y monté el router en `/api/clientes` desde `app.js`.

## TDD Evidence

- Primera fase roja:
  - `node --test test/services/clientes-service.test.js test/routes/clientes.test.js`
  - Falló con `MODULE_NOT_FOUND` para `services/clientes-service.js` y `routes/clientes.js`, como se esperaba.
- Primera fase verde:
  - La suite focal pasó inicialmente `16/16` tras implementar el servicio, router y montaje.
- El review independiente identificó dos gaps importantes y tres menores. Se reprodujeron con pruebas antes de cambiar comportamiento:
  - `2026-02-30T...Z` se normalizaba silenciosamente a marzo y el año `0999` llegaba a la base aunque MySQL no lo admite.
  - Se añadieron pruebas explícitas de rollback cuando fallan la inserción de cola o la de bitácora después del registro de dominio. Una mutación temporal que quitó el rollback hizo fallar ambas pruebas; al restaurarlo volvieron a pasar.
  - Se añadieron pruebas rojas para propagación de request ID, clasificación de colisión UUID y paginación malformada/no acotada.
- Suite focal final:
  - `node --test test/services/clientes-service.test.js test/routes/clientes.test.js`
  - Passed: `24` tests, `0` failures.

## Verification

Executed on 2026-08-15:

- `node --test`
  - Passed with exit code `0`.
  - Backend: `224` tests passed, `0` failures.
- Syntax checks passed for:
  - `services/clientes-service.js`
  - `routes/clientes.js`
  - `test/services/clientes-service.test.js`
  - `test/routes/clientes.test.js`
- `git diff --check` passed before the report and is repeated before commit.
- Independent code review follow-up verdict: `Ready to merge`, with no remaining Critical or Important issues.

## Notes

- No se contacta una central ni se usa la red durante operaciones locales; Task 3 agregará descubrimiento y sincronización sin cambiar este contrato offline.
- No se ejecutaron mutaciones contra una base de datos real. Las transacciones, bloqueos, SQL parametrizado, orden de escrituras, rollback y liberación se verificaron mediante conexiones aisladas y específicas por comportamiento.
- Los archivos de planes no relacionados que ya estaban sin seguimiento se dejaron intactos:
  - `docs/superpowers/plans/2026-08-15-clientes-lan-offline.md`
  - `docs/superpowers/plans/2026-08-15-recepciones-historial.md`
