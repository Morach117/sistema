# Task 5 report: React recepción completa e historial recuperado

## Estado

Completado. La recepción activa y el historial de recepciones tienen UI React funcional, rutas protegidas por permiso, contratos HTTP alineados con Tasks 1–4 y cobertura de regresión. No se añadió ninguna acción de eliminación al historial.

## TDD aplicado

1. Se ejecutó la línea base del frontend: 8 archivos y 45 pruebas pasaban.
2. Se escribieron primero las pruebas visibles de recepción e historial. La primera ejecución RED produjo 9 fallos esperados por componentes y conductas ausentes.
3. Se implementó la funcionalidad mínima y se mantuvieron las regresiones existentes.
4. La revisión independiente encontró cinco casos importantes. Se añadieron primero 6 regresiones RED para descuento `null`, validación de finalización, barrera de importación, refresco tras reimportación y accesibilidad; después se corrigió producción hasta GREEN.
5. La re-revisión independiente terminó en **Pass**, sin hallazgos Critical o Important.

## Entrega funcional

### Recepciones activas

- Cálculo visible y exacto de presentación: `cantidad / piezas_por_paquete`, sin conversión suelta entre cajas y piezas.
- Factura y conteo físico se muestran y editan por separado, con diferencia explícita y unidad correspondiente.
- Descuento automático fijo de backend de 5%, excepción manual aplicar/no aplicar y retorno persistente a automático mediante `null`.
- Configuración masiva para artículos seleccionados: presentación, piezas por caja y excepción de descuento.
- Resumen previo con artículos, cajas, piezas, costo, revisión y errores.
- Lista bloqueante equivalente a finalización del backend: SICAR, costo, caja válida, conteo físico positivo salvo `FALTANTE`/`DEVOLUCION`, y artículos rechazados. El rechazo puede restaurarse antes de finalizar.
- Previsualización XML/CSV antes de importación definitiva, con clasificación, resumen e incidencias por folio.
- La importación/reimportación respeta la barrera de guardados pendientes o fallidos; una reimportación del folio abierto invalida y vuelve a consultar el detalle.
- Notas administrativas por factura o artículo e historial rápido de compras condicionado al permiso `evolucion-precios`.
- Excel envía `incluir_fisico: false` por defecto; el usuario debe marcar explícitamente el conteo físico.
- Etiquetas accesibles distinguen los campos repetidos por descripción de artículo.

### Historial de recepciones

- Nueva ruta lazy `/historial-recepciones` y enlace de navegación filtrado por el permiso propio `historial-recepciones`.
- Filtros de folio, producto, proveedor, estado y fechas ejecutados en backend; búsqueda con debounce de 400 ms.
- Paginación de servidor con `page` y `limit`.
- Detalle con resumen, artículos, notas y bitácora.
- Usuario con permiso limitado: consulta y detalle en modo solo lectura.
- Administrador: edición solo de recepciones pendientes usando la misma barrera de guardados, notas y exportación Excel.
- Exportación histórica también inicia con `incluir_fisico: false`.
- No existe control ni solicitud DELETE en esta página.

## Archivos

- Creados:
  - `frontend/src/features/recepciones/receptionCalculations.js`
  - `frontend/src/pages/Recepciones.test.jsx`
  - `frontend/src/pages/HistorialRecepciones.jsx`
  - `frontend/src/pages/HistorialRecepciones.test.jsx`
- Modificados:
  - `frontend/src/pages/Recepciones.jsx`
  - `frontend/src/features/recepciones/useReceptionEditor.js`
  - `frontend/src/features/recepciones/useReceptionEditor.test.jsx`
  - `frontend/src/App.jsx`
  - `frontend/src/App.lazy.test.jsx`
  - `frontend/src/components/layout/AppShell.jsx`
  - `frontend/src/auth/ProtectedRoute.test.jsx`
  - `frontend/src/pages/modulePermissions.test.jsx`

## Verificación

- `npm --prefix frontend run test -- --run`
  - **10 archivos pasaron, 59 pruebas pasaron**.
- `npm --prefix frontend run lint`
  - Exit 0. Conserva 10 warnings preexistentes en archivos ajenos a Task 5; los archivos de esta tarea no generan warnings.
- `git diff --check`
  - Sin errores; únicamente avisos informativos LF/CRLF de Git en Windows.
- Revisión independiente focal:
  - **Pass**, sin hallazgos Critical o Important después de las correcciones.
- Prueba local de ruta protegida:
  - `/historial-recepciones` carga el módulo lazy y redirige correctamente al login sin sesión.

## Limitación conocida

`npm --prefix frontend run build` transforma y genera los chunks de Task 5, pero el proceso global termina al resolver Recharts porque falta `es-toolkit/compat/sortBy` en las dependencias instaladas. El plan asigna explícitamente esa declaración/corrección de dependencias a Task 6. No se alteraron dependencias fuera del alcance de Task 5.

La utilidad CLI de `ui-ux-pro-max` no pudo ejecutarse porque Python no está disponible en el entorno. La interfaz se construyó con los tokens, patrones Tailwind/shadcn y componentes accesibles ya establecidos por el proyecto.
