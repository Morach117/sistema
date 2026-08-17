# Clientes LAN Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir clientes y compras manuales que funcionen sin internet y se sincronicen entre tres sucursales mediante una central descubierta en LAN.

**Architecture:** Cada instalación conserva una base local con UUIDs, cola de operaciones y réplica de Clientes. Esta instalación puede ser Central; las sucursales se vinculan con código y credenciales, descubren la central por difusión UDP y verifican su huella persistente antes de sincronizar. IP y hostname no forman parte de la identidad.

**Tech Stack:** Node.js `crypto` y `dgram`, Express, mysql2/promise, React 19, TanStack Query 5, node:test, Supertest, Vitest.

## Global Constraints

- La LAN es el único medio de sincronización; no se usan IP pública, DNS dinámico, Tailscale ni MySQL remoto.
- Sin central o sin red, CRUD y registro de compras siguen disponibles localmente.
- No borrar clientes ni operaciones sincronizadas; desactivar y auditar.
- Folio de ticket es opcional y único por sucursal cuando exista.

---

### Task 1: Esquema, identidad y permisos

**Files:**
- Create: `database/migrations/005_clients_lan_sync.js`, `services/client-identity-service.js`
- Modify: `middleware/authorize.js`, `frontend/src/auth/permissions.js`, `frontend/src/pages/Usuarios.jsx`
- Test: `test/services/client-identity-service.test.js`, `test/database/migrations.test.js`

- [ ] Escribir pruebas de migración idempotente y generación/verificación de huella de central, código de vínculo y credencial de sucursal.
- [ ] Ejecutar los tests y confirmar fallos.
- [ ] Crear tablas aditivas `sucursales`, `clientes`, `cliente_compras`, `cliente_operaciones_sync`, `cliente_conflictos`, `cliente_bitacora` y `cliente_configuracion`; usar UUIDs, índices y claves únicas `(sucursal_id, folio_ticket)` donde el folio no sea nulo.
- [ ] Añadir los permisos `clientes` y `clientes-configuracion`; la configuración de central queda solo para administrador.
- [ ] Implementar identidad usando claves y firmas de `node:crypto`, nunca dirección IP; repetir pruebas.

### Task 2: Servicio local de clientes y compras

**Files:**
- Create: `services/clientes-service.js`, `routes/clientes.js`
- Modify: `app.js`
- Test: `test/services/clientes-service.test.js`, `test/routes/clientes.test.js`

- [ ] Escribir pruebas para crear/editar/desactivar cliente, registrar venta con folio y sin folio, y rechazar duplicado del mismo folio en la misma sucursal.
- [ ] Escribir prueba que cada mutación cree una operación UUID en la cola y bitácora en la misma transacción.
- [ ] Ejecutar pruebas y confirmar fallos por servicio/ruta ausentes.
- [ ] Implementar CRUD paginado/buscable y registro de compras. Obtener sucursal desde configuración local; nunca aceptar una sucursal elegida por el navegador.
- [ ] Añadir endpoints protegidos y montar el router. Ejecutar tests.

### Task 3: Emparejamiento, descubrimiento y sincronización LAN

**Files:**
- Create: `services/client-sync-service.js`, `services/client-discovery-service.js`, `routes/clientes-sync.js`
- Modify: `server.js`, `app.js`
- Test: `test/services/client-sync-service.test.js`, `test/services/client-discovery-service.test.js`, `test/routes/clientes-sync.test.js`

- [ ] Escribir pruebas con sockets simulados para anuncio/descubrimiento, rechazo de huella desconocida, vínculo con código y operación repetida idempotente.
- [ ] Escribir pruebas de sincronización: una sucursal sin central conserva cola; al recibir respuesta válida aplica cambios, marca operaciones y crea conflicto si ambas versiones divergen.
- [ ] Ejecutar pruebas y confirmar fallos.
- [ ] Implementar descubrimiento UDP limitado a la subred local y anuncio solo en modo Central. Implementar endpoints de vínculo/sync con solicitud firmada, credencial rotatoria y límites de lote.
- [ ] Iniciar/terminar los servicios de red junto al servidor sin impedir que la API local arranque si no hay red. Reintentar con espera progresiva.
- [ ] Repetir tests y comprobar que la IP no se persiste como identidad.

### Task 4: Interfaz de Clientes y estado de sincronización

**Files:**
- Create: `frontend/src/pages/Clientes.jsx`, `frontend/src/pages/Clientes.test.jsx`, `frontend/src/pages/ClientesConfiguracion.jsx`
- Modify: `frontend/src/App.jsx`, `frontend/src/components/layout/AppShell.jsx`

- [ ] Escribir pruebas de formulario CRUD, desactivación, venta con y sin folio, sucursal no editable y aviso offline/cola pendiente.
- [ ] Escribir prueba de que “Buscar central” llama solo a la API local y no solicita una IP manual.
- [ ] Ejecutar pruebas y confirmar fallos.
- [ ] Implementar listado, búsqueda, ficha de cliente, compras y formularios accesibles. Mostrar sucursal detectada, folio opcional, estado de sincronización y conflictos.
- [ ] Crear configuración administrativa de rol Central/Sucursal, nombre visible, código de vínculo, estado y botón Buscar central.
- [ ] Añadir rutas lazy y navegación condicionada por permisos; ejecutar tests frontend.

### Task 5: Paquete y prueba offline de tres roles

**Files:**
- Modify: `scripts/create-offline-release.js`, `docs/operations/offline-install.md`, `DOCUMENTACION.md`
- Test: `test/scripts/offline-release.test.js`

- [ ] Añadir al paquete offline el binario/configuración de la aplicación, build, caché de dependencias y guía de activación Central/Sucursal.
- [ ] Probar tres instalaciones de base aislada: una Central y dos Sucursal; registrar cambios sin red, reactivar LAN y comprobar sincronización y conflictos.
- [ ] Ejecutar `npm run verify`, pruebas backend/frontend y `git diff --check` antes de finalizar.
