# Sistema de Papelería: arquitectura y operación

Esta aplicación usa React para la interfaz, Express para la API y MySQL/MariaDB para los datos de cada sucursal. La modernización mantiene los contratos HTTP y los datos existentes; `cat_productos` es el catálogo real y no se elimina, trunca ni modifica durante las migraciones de infraestructura.

## Documentos operativos

- [Actualización segura de una sucursal](docs/operations/sucursal-update.md): preparación, respaldo, actualización, migraciones, healthcheck, pruebas de humo y reversión.
- [Respaldo y restauración](docs/operations/backup-restore.md): creación, verificación, custodia y restauración de un dump completo.
- [Auditoría de modernización](docs/audits/2026-08-14-modernization-report.md): hallazgos P0–P3, mitigaciones, evidencia, rendimiento, legado y riesgos pendientes.
- [Diseño aprobado](docs/superpowers/specs/2026-08-14-modernizacion-segura-design.md) y [plan de implementación](docs/superpowers/plans/2026-08-14-modernizacion-segura.md).

## Arquitectura actual

```text
React routes (lazy) → cliente API central → Express routes
                                         → autenticación + autorización
                                         → validación + servicios transaccionales
                                         → pool MySQL limitado
                                         → errores y logs estructurados
```

- `server.js` valida el entorno y levanta la aplicación creada por `app.js`.
- `app.js` aplica CORS por allowlist, límites de body, contexto de petición, rutas y errores seguros.
- `routes/` conserva las URLs usadas por las sucursales. Los permisos se comprueban en el servidor; ocultar una acción en React no concede ni sustituye autorización.
- `services/` contiene operaciones compuestas que requieren transacciones y limpieza de archivos.
- `database/migrations/` contiene migraciones Node versionadas, aditivas e idempotentes.
- `frontend/src/lib/api.js` centraliza token, errores 401 y solicitudes autenticadas.
- `frontend/src/auth/` centraliza sesión, permisos de navegación y rutas protegidas.
- `frontend/src/components/layout/` proporciona shell responsive, navegación móvil, temas claro/oscuro y accesibilidad.

## Variables de entorno

Configure `.env` localmente y no lo suba a Git:

```dotenv
NODE_ENV=production
PORT=3000
JWT_SECRET=valor-aleatorio-de-al-menos-32-caracteres
CORS_ORIGINS=http://127.0.0.1:3000,http://localhost:3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=usuario_aplicacion
DB_PASSWORD=secreto-local
DB_NAME=importador_papeleria
```

`JWT_SECRET` es obligatorio fuera de pruebas. `CORS_ORIGINS` acepta una lista separada por comas. En producción se recomienda una cuenta MySQL exclusiva con los permisos mínimos necesarios.

## Módulos y flujo de datos

### Auditoría de captura

Consulta capturas por fecha, separa pendientes/exportadas y calcula el ajuste para SICAR. Las acciones de corregir, descartar, registrar o exportar requieren autenticación y permiso del módulo. El historial y los logs se presentan en diálogos accesibles.

### Recepciones y facturas

Lista remisiones, revisa líneas, vincula claves SICAR, calcula presentaciones/costos y genera el archivo final. Las escrituras se serializan para conservar su orden; cerrar un diálogo no guarda silenciosamente cambios pendientes.

### Traspasos

Registra envíos y permite su recepción por personal autorizado. La cantidad recibida se guarda en la columna histórica `traspaso_detalles.cantidad` para mantener compatibilidad con los esquemas existentes. Las actualizaciones validan la pertenencia del detalle y se ejecutan dentro de una transacción.

### Bodega y catálogo

El catálogo consulta `cat_productos` sin migrar ni reemplazar sus filas. Bodega registra inventario y movimientos de forma transaccional, con búsqueda y paginación limitadas.

## Desarrollo y verificación

```powershell
npm.cmd ci
npm.cmd --prefix frontend ci
npm.cmd run verify
```

`npm run verify` ejecuta pruebas backend, pruebas frontend, lint y build. No crea respaldos, no ejecuta migraciones y no inicia PM2.

Para una actualización real no use solamente `npm run setup`: siga el runbook de sucursales, que separa explícitamente respaldo, verificación, migración y recuperación.

## Regla de datos

No ejecute archivos `.sql` históricos ni `database/auto_migrar.php` en una sucursal. El único camino autorizado para cambios nuevos es `npm run migrate`, después de restaurar y probar un respaldo en una base aislada y de aprobar el plan de ejecución. El migrador crea un respaldo, registra checksums y comprueba que el conteo y hash determinista de `cat_productos` no cambien.
