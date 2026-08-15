# Task 1 Report

## Summary

- Creé la migración aditiva e idempotente `database/migrations/005_clients_lan_sync.js`; se conservó `004_reception_xml_vat_persistence.js` y se usó el número corregido `005`.
- La migración crea `sucursales`, `clientes`, `cliente_compras`, `cliente_operaciones_sync`, `cliente_conflictos`, `cliente_bitacora` y `cliente_configuracion` con identificadores UUID, índices de consulta y `UNIQUE (sucursal_id, folio_ticket)` con `folio_ticket` nullable.
- Añadí un cursor monotónico por operación, avance enviado/recibido por sucursal y una configuración local singleton para soportar sincronización independiente entre la Central y dos sucursales.
- Implementé identidades Ed25519 en `services/client-identity-service.js`: generación de claves, huella SHA-256 canónica, código de vínculo firmado y con expiración, y credencial de sucursal ligada a UUID y clave pública.
- Los tokens exigen base64url canónico y firmas Ed25519 de 64 bytes. Ni los tokens ni el esquema persisten IP, hostname u otra dirección de red como identidad.
- Añadí `clientes` como permiso asignable a empleados y `clientes-configuracion` como módulo exclusivo de administradores en backend y frontend. La pantalla Usuarios informa esa restricción y no ofrece el permiso administrativo.

## TDD Evidence

- Primera fase roja:
  - `node --test test/services/client-identity-service.test.js test/database/migrations.test.js test/middleware/authorize.test.js`
  - Falló con los módulos nuevos ausentes y con `clientes` / `clientes-configuracion` fuera de las allowlists, como se esperaba.
- Tras la primera implementación, los tests aislaron dos defectos de integración:
  - `_node_migrations` forma parte del comportamiento normal del runner y no debía contarse como tabla del dominio.
  - Node 24 no permite volver a pasar un `KeyObject` público por `createPublicKey`.
  - Ambos se corrigieron por causa y se repitieron los tests.
- Después del review independiente se añadieron pruebas rojas para representaciones no canónicas del token, cursores por peer y configuración singleton. Fallaron por los contratos ausentes y pasaron tras la implementación.
- Suite focal final:
  - `node --test test/services/client-identity-service.test.js test/database/migrations.test.js test/middleware/authorize.test.js`
  - Passed: `59` tests, `0` failures.

## Verification

Executed on 2026-08-15:

- `npm run verify`
  - Passed with exit code `0`.
  - Backend: `200` node tests passed.
  - Frontend: `10` Vitest files / `59` tests passed.
  - `oxlint` exited successfully; it reported `10` existing warnings in unrelated frontend files.
  - Vite production build succeeded.
- Syntax checks passed for:
  - `services/client-identity-service.js`
  - `database/migrations/005_clients_lan_sync.js`
  - `middleware/authorize.js`
- Independent code review follow-up verdict: `Ready: Yes`, with no remaining Critical or Important issues.
- `git diff --check` passed before the final report was added and is repeated before commit/handoff.

## Notes

- No live database or branch installation was modified. Migration repeatability was verified by running `up()` twice through the isolated migration test pool and by running the migration runner twice.
- Applying and inspecting the migration twice against a disposable MariaDB instance remains an optional integration check for a later environment that explicitly provides such an isolated database.
- Private keys are intentionally local identity material. A later hardening task may add OS-backed or envelope encryption and explicit backup handling without changing IP/hostname into identity.
- Unrelated untracked plan files were left untouched:
  - `docs/superpowers/plans/2026-08-15-clientes-lan-offline.md`
  - `docs/superpowers/plans/2026-08-15-recepciones-historial.md`
