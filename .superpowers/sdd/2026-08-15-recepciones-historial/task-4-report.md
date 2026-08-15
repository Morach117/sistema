# Task 4 Report: API de historial, notas y bitácora

## Estado

Completado.

## RED/GREEN

- RED:
  - Se añadieron pruebas que fallaban porque `ENVIADO` y `REVISION` todavía permitían acciones administrativas de historial.
  - Se añadió una prueba que fallaba porque la reimportación XML pendiente actualizaba encabezado e ítems sin escribir `recepcion_bitacora`.
- GREEN:
  - El historial ahora permite editar, anotar y exportar solo cuando la remisión está exactamente en `PENDIENTE`; `ENVIADO` y `REVISION` quedan en solo lectura.
  - La reimportación XML pendiente escribe bitácora transaccional para cambios de proveedor y campos de factura actualizados.

## Entregado

- Nueva API `GET /api/historial-recepciones` con paginación acotada y filtros parametrizados por fecha, proveedor, estado, folio y producto.
- Nuevo detalle `GET /api/historial-recepciones/:id` con permisos derivados, notas y bitácora.
- Nuevo export `GET /api/historial-recepciones/:id/excel` solo para administradores y solo para remisiones pendientes.
- Nuevas notas `POST /api/historial-recepciones/:id/notas` con escritura en `recepcion_notas` y bitácora en la misma transacción.
- Edición administrativa de historial reutilizando `POST /api/historial-recepciones/actualizar_campo` y `POST /api/historial-recepciones/asignar_proveedor`.
- Auditoría transaccional para mutaciones existentes de recepción en `services/recepciones-service.js`: proveedor, SICAR, cantidad, caja, descuento, rechazo y finalización.
- Router montado en `app.js`.

## Archivos

- Modificados:
  - `app.js`
  - `routes/recepciones.js`
  - `services/recepciones-service.js`
  - `test/services/recepciones-service.test.js`
- Nuevos:
  - `routes/historial-recepciones.js`
  - `test/routes/historial-recepciones.test.js`

## Verificación

- `node --test test/routes/historial-recepciones.test.js test/routes/recepciones-upload.test.js`
  - Resultado: 15/15 pruebas pasan.
- `node --test test/routes/historial-recepciones.test.js`
  - Resultado: 7/7 pruebas pasan.
- `node --test test/services/recepciones-service.test.js`
  - Resultado: 20/20 pruebas pasan.
- `node --test test/routes/historial-recepciones.test.js test/routes/recepciones-upload.test.js test/routes/recepciones-preview.test.js test/routes/authz.test.js test/services/recepciones-service.test.js`
  - Resultado: 52/52 pruebas pasan.

## Notas

- No se añadieron endpoints de borrado.
- Las remisiones finalizadas quedan en solo lectura para historial; exportación y edición responden error de estado.
