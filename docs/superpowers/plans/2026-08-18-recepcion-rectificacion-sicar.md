# Rectificación e identificación SICAR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir enviar un artículo de Recepciones a Incidencias para re-conteo/rectificación, validar SICAR con permisos de Recepciones y despejar la captura para 1366×768.

**Architecture:** Una ruta protegida de Recepciones consulta el catálogo sólo para validar visualmente SICAR. Reclamaciones reutiliza el estado persistido `revision_pendiente = 2` como una cola de rectificación: Recepciones lo asigna mediante una ruta auditada, Incidencias actualiza el conteo y administración lo libera. La interfaz mantiene los datos de captura y elimina únicamente el bloque superior de métricas.

**Tech Stack:** Node.js, Express, MySQL, React, TanStack Query, Tailwind, Node test runner y Vitest.

## Global Constraints

- Diseñar para 1366×768 sin truncar controles esenciales.
- No modificar reglas automáticas de IVA, descuento, caja o aprendizaje ya existentes.
- Sólo usuarios con permisos de Recepciones pueden validar SICAR o enviar a rectificar; Reclamaciones conserva su control de permisos.
- Aplicar TDD: cada comportamiento se prueba en rojo antes de escribir producción.

---

### Task 1: Rutas seguras de Recepciones

**Files:**
- Modify: `routes/recepciones.js`
- Test: `test/routes/recepciones-sicar.test.js`

**Interfaces:** `GET /api/recepciones/catalogo-exacto?code=<clave>` responde `{ data: { clave_sicar, codigo_barras, descripcion } | null }`. `POST /api/recepciones/enviar-a-rectificar` recibe `{ id_item }`, cambia la línea a `revision_pendiente = 2` y registra auditoría.

- [ ] Escribir una prueba de ruta que permita a `recepciones` consultar un código y devuelva sólo clave, barras y descripción.
- [ ] Ejecutar `node --test test/routes/recepciones-sicar.test.js` y confirmar el fallo por ruta ausente.
- [ ] Añadir la consulta parametrizada de Catálogo en la ruta de Recepciones y conservar `404` lógico como `{ data: null }`.
- [ ] Escribir una prueba de ruta que envíe un artículo a rectificación, actualice sólo su estado y audite la acción.
- [ ] Ejecutar `node --test test/routes/recepciones-sicar.test.js` y confirmar el fallo por ruta ausente.
- [ ] Implementar la ruta autorizada de rectificación con actualización parametrizada y `logAudit`.
- [ ] Ejecutar la suite de ruta y hacer commit.

### Task 2: Captura y cola de rectificación claras

**Files:**
- Modify: `frontend/src/pages/Recepciones.jsx`, `frontend/src/pages/Reclamaciones.jsx`
- Test: `frontend/src/pages/Recepciones.dialog.test.jsx`, `frontend/src/pages/Recepciones.test.jsx`, `frontend/src/pages/Reclamaciones.test.jsx`

**Interfaces:** `SicarInput` consume `/api/recepciones/catalogo-exacto`. Una línea no finalizada presenta `Mandar a rectificar`; tras éxito se invalida el detalle. Incidencias muestra el título “Rectificación y re-conteo”.

- [ ] Escribir una prueba de diálogo que haga fallar la petición de validación y espere “Validación SICAR pendiente”, sin el mensaje de catálogo inaccesible.
- [ ] Ejecutar `npm --prefix frontend run test -- Recepciones.dialog.test.jsx` y confirmar el fallo esperado.
- [ ] Cambiar `SicarInput` a la ruta de Recepciones y diferenciar coincidencia, discrepancia y validación temporalmente pendiente.
- [ ] Escribir una prueba de captura que compruebe que no se muestran las seis tarjetas de resumen y que `Mandar a rectificar` hace la petición con el id correcto.
- [ ] Ejecutar `npm --prefix frontend run test -- Recepciones.test.jsx` y confirmar el fallo esperado.
- [ ] Retirar el bloque de métricas, añadir el botón compacto con estado de envío y actualizar las consultas al completar la acción.
- [ ] Escribir una prueba para que Incidencias use el nombre “Rectificación y re-conteo” y conserve el control de guardar/aceptar conteo.
- [ ] Ejecutar `npm --prefix frontend run test -- Reclamaciones.test.jsx` y confirmar el fallo esperado.
- [ ] Ajustar encabezado y textos de Incidencias sin cambiar el flujo de re-conteo.
- [ ] Ejecutar las tres suites de interfaz, lint y build; hacer commit.

### Task 3: Verificación y publicación

**Files:** Sólo verificación.

- [ ] Ejecutar `npm run verify`.
- [ ] Ejecutar `git diff --check` y comprobar los cambios previstos.
- [ ] Hacer revisión de código del diff y corregir hallazgos importantes antes de publicar.
- [ ] Confirmar árbol limpio y publicar con `git push origin main`.
