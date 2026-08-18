# Recepción limpia y detección LAN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplificar las tarjetas de Recepciones y permitir detectar una Central local antes de autorizarla con un código firmado.

**Architecture:** El descubrimiento UDP guardará candidatos efímeros firmados, pero no los confiará ni persistirá. Tras definir Central o Sucursal, la ruta de configuración arrancará de inmediato los servicios LAN. La UI mostrará candidatos seguros antes del código. Recepciones conserva sólo la captura esencial.

**Tech Stack:** Node.js, Express, UDP `dgram`, React, TanStack Query, Tailwind/shadcn, Node test runner y Vitest.

## Global Constraints

- Diseñar para 1366×768 sin recortar texto esencial.
- No persistir IP, hostname o candidatos como identidad.
- Exigir siempre código firmado para vincular.
- Conservar cantidad, SICAR, físico/caja, descuento automático y los cuatro precios.
- Aplicar TDD en cada comportamiento nuevo o corregido.

---

### Task 1: Candidatos LAN efímeros y arranque inmediato

**Files:**
- Modify: `services/client-discovery-service.js`, `routes/clientes-sync.js`, `server.js`
- Test: `test/services/client-discovery-service.test.js`, `test/routes/clientes-sync.test.js`, `test/server.test.js`

**Interfaces:** `discoveryService.listCandidates()` devuelve `{ name, fingerprint, seenAt }[]`; el estado añade `centralesDetectadas`; una configuración exitosa llama de inmediato a `syncService.start()` y `discoveryService.start()`.

- [ ] Escribir prueba fallida: una Sucursal lista una Central anunciada y firmada, pero `discover()` sin código sigue rechazando el vínculo.
- [ ] Ejecutar `node --test test/services/client-discovery-service.test.js` y confirmar que falla por la ausencia de candidatos.
- [ ] Añadir a los anuncios `centralName`; tras validar firma y subred, guardar sólo `{ name, fingerprint, seenAt }` en un mapa efímero limitado. Exponer copias sin IP ni llave.
- [ ] Escribir prueba fallida de ruta: `PUT /configuracion` inicia ambos servicios sin esperar el reintento.
- [ ] Ejecutar `node --test test/routes/clientes-sync.test.js test/server.test.js` y confirmar el fallo esperado.
- [ ] Arrancar ambos servicios después de configurar y publicar candidatos seguros desde `GET /estado`.
- [ ] Reejecutar las pruebas enfocadas y hacer commit `feat: detect local central before pairing`.

### Task 2: Vínculo LAN guiado

**Files:**
- Modify: `frontend/src/pages/ClientesConfiguracion.jsx`
- Test: `frontend/src/pages/ClientesConfiguracion.test.jsx`

**Interfaces:** Consume `centralesDetectadas: Array<{ name, fingerprint, seenAt }>` de `/api/clientes-sync/estado`; conserva `/codigo-vinculo`, `/descubrir` y `/emparejar`.

- [ ] Escribir prueba fallida: se ve “Central Matriz” antes de ingresar un código, pero no existe botón de vínculo utilizable sin código.
- [ ] Ejecutar `npm --prefix frontend run test -- ClientesConfiguracion.test.jsx` y confirmar el fallo.
- [ ] Mostrar un recorrido visual: “1. Central encontrada”, nombre, “2. Pega el código temporal”, y botón de buscar/autorizar. Refrescar estado cada pocos segundos mientras una Sucursal no esté vinculada.
- [ ] Añadir la prueba del estado sin candidatas con el texto “ambas instalaciones deben tener el sistema iniciado”.
- [ ] Ejecutar la suite enfocada y hacer commit `feat: guide LAN pairing with detected central`.

### Task 3: Captura de Recepciones limpia

**Files:**
- Modify: `frontend/src/pages/Recepciones.jsx`
- Test: `frontend/src/pages/Recepciones.test.jsx`, `frontend/src/pages/Recepciones.dialog.test.jsx`, `frontend/src/pages/modulePermissions.test.jsx`

**Interfaces:** Conserva `useReceptionEditor`, cálculos, descuento automático y comparación de precios. Elimina multiselección y panel secundario. Mantiene una papelera sólo con icono y `aria-label="Eliminar <producto>"`.

- [ ] Escribir pruebas fallidas: no hay “Seleccionar todo”, contador de seleccionados, “Más opciones” ni compras previas; la papelera conserva nombre accesible pero no texto visible.
- [ ] Ejecutar `npm --prefix frontend run test -- Recepciones.test.jsx Recepciones.dialog.test.jsx modulePermissions.test.jsx` y confirmar el fallo.
- [ ] Eliminar la selección y el bloque secundario; equilibrar las cuatro zonas con columnas `minmax` y permitir que los nombres se envuelvan en dos líneas con `title` completo.
- [ ] Reejecutar pruebas enfocadas y `npm --prefix frontend run build`.
- [ ] Hacer commit `refactor: simplify reception capture cards`.

### Task 4: Verificación y publicación

**Files:** Sólo verificación.

- [ ] Ejecutar `npm run verify`.
- [ ] Ejecutar `git diff --check` y confirmar árbol limpio.
- [ ] Publicar con `git push origin main`.
