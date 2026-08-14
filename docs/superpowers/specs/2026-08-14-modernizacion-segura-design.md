# Modernización segura de Sistema de Papelería — Diseño

## Objetivo

Modernizar de forma incremental el sistema Node.js + React para que sea seguro, mantenible, accesible, responsive y operable en sucursales Windows, conservando las reglas de negocio y todos los datos y tablas ya existentes en cada instalación.

## Restricciones no negociables

- `cat_productos` contiene datos reales: no se eliminará, truncará ni se alterarán masivamente sus filas.
- Las tablas y datos existentes en las sucursales se preservarán. Ninguna migración ejecutará `DROP`, `TRUNCATE`, `DELETE` global, recreación de tablas ni cambios destructivos de columna.
- Toda evolución de datos será aditiva y compatible: `CREATE ... IF NOT EXISTS`, nuevas tablas, índices, columnas anulables/con valor por defecto seguro y migraciones versionadas que detecten el estado actual antes de actuar.
- Antes de una migración de esquema se creará un respaldo local y se verificará su resultado. Las migraciones se probarán contra una copia de base de datos antes del despliegue en sucursales.
- El sistema seguirá funcionando durante la modernización; no se cambian reglas de negocio sin una decisión explícita documentada.
- No se expondrán secretos, tokens ni detalles internos al usuario final.

## Alcance y orden de entrega

### Bloque 1 — Seguridad y correcciones de integridad urgentes

Se eliminarán accesos públicos y elevaciones de privilegio: autenticación obligatoria para exportaciones, autorización backend por módulo/acción, secreto JWT obligatorio, validación de solicitudes, SQL parametrizado, límites de carga de archivos y manejo de errores centralizado. Se corregirán los defectos confirmados que provocan SQL inválido y escrituras de traspaso que no comprueban pertenencia.

El inicio de sesión pasará a mensajes uniformes y protección frente a fuerza bruta. La API mantendrá las rutas existentes mientras se añade una capa común de autenticación, autorización, validación y respuestas de error para evitar romper clientes de sucursal.

### Bloque 2 — Datos, migraciones y operaciones seguras

Se reemplazará el bootstrap divergente por un ejecutor de migraciones Node versionado. El ejecutor tendrá una tabla de historial, checksums y migraciones idempotentes. Los artefactos PHP y SQL históricos se mantendrán inicialmente como referencia, pero se retirarán de la ruta de ejecución sólo después de que las migraciones Node puedan reproducir el esquema actual sin pérdida de datos.

Se añadirá comprobación de backup, configuración de conexión validada, health endpoint, límites del pool y documentación de despliegue. Los cambios de índices se basarán en consultas y planes de ejecución; no se modificarán datos de catálogo. Las operaciones compuestas de inventario, permisos y traspasos se envolverán en transacciones.

### Bloque 3 — Arquitectura backend, observabilidad y pruebas

Las rutas conservarán sus contratos HTTP y delegarán paulatinamente en servicios, repositorios y validadores enfocados. Se añadirá un manejador de errores, logger estructurado con redacción, identificador de petición, límites de tamaño de body y encabezados HTTP seguros. Las primeras pruebas cubrirán login, autorización, exportación, carga de archivos y transacciones de inventario/traspasos.

### Bloque 4 — Frontend React, diseño y accesibilidad

Se centralizarán cliente API, sesión y permisos. La fuente de autorización será siempre el backend; el frontend sólo mejora la experiencia ocultando acciones no disponibles. Se dividirán las páginas grandes de forma gradual en hooks, componentes de pantalla y componentes de dominio; las rutas se cargarán diferidamente.

Se definirá un sistema de tokens semánticos con temas claro y oscuro reales, preferencia de sistema y conmutador persistente. El shell tendrá navegación móvil con drawer y layouts adaptables. Los modales usarán componentes accesibles con foco gestionado, y las tablas elegirán una representación móvil adecuada por vista. Formularios, loading, empty y error states serán consistentes.

### Bloque 5 — Calidad, limpieza y entrega a sucursales

Se reforzarán lint, formato, pruebas y build. La documentación describirá arquitectura, variables de entorno, backup/restauración, ejecución de migraciones, healthcheck y actualización de sucursales. Se clasificarán los artefactos PHP: se conservará la compatibilidad bcrypt `$2y$` como válida, se archivarán los migradores PHP no invocados tras sustituirlos y se retirarán de la operación los dumps no reproducibles.

## Arquitectura objetivo

```text
React pages → domain hooks → API client → Express routes
                                       → auth + authorization + validation
                                       → services → repositories → MySQL pool
                                       → error handler + structured logger
```

Las capas no son una reescritura total: se extraerán sólo cuando se toque un flujo, dejando adaptadores de ruta compatibles. Las respuestas de éxito existentes se conservarán durante el periodo de transición; los errores se normalizarán a un contrato seguro con código, mensaje público e identificador de petición.

## Modelo de autorización

El JWT identificará al usuario, pero el servidor decidirá si puede ejecutar cada acción. Un middleware autenticará el token y un middleware de autorización comprobará `rol` y permiso de módulo. Las mutaciones recibirán un permiso explícito. El frontend consultará/almacenará el perfil sólo para navegación, sin ser una barrera de seguridad.

## Estrategia de datos y migración

1. Detectar e inventariar la estructura actual, incluidos índices y filas de `cat_productos`.
2. Crear y verificar backup antes de cambios de esquema.
3. Registrar migraciones en una tabla propia sin modificar tablas de negocio.
4. Aplicar únicamente cambios aditivos e idempotentes; si se necesita endurecer una restricción existente, primero auditar datos y crear una migración de compatibilidad.
5. Validar post-migración: conteos de tablas críticas, `cat_productos` sin cambios de conteo/checksum representativo, prueba funcional y posibilidad de restauración.

## Criterios de aceptación

- Ningún endpoint protegido permite lectura o mutación sin autenticación y permiso backend apropiado.
- Exportación, uploads, parámetros y SQL no aceptan entradas inseguras; las respuestas no filtran errores internos.
- Migraciones nuevas se pueden ejecutar repetidamente y no eliminan/modifican datos existentes salvo actualizaciones explícitas y verificadas necesarias para corregir un defecto.
- La aplicación compila, pasa lint y pruebas añadidas; el build de producción sigue siendo servido por Express.
- Las pantallas críticas funcionan en 360 px, teclado y modo claro/oscuro con contraste adecuado.
- Existe un procedimiento documentado y verificable para actualizar una sucursal y recuperarse de una migración fallida mediante backup.

## Riesgos y mitigaciones

- **Permisos actuales ambiguos:** se construirá una matriz de permisos basada en los módulos existentes y se probará con perfiles admin/empleado antes de activarla.
- **Esquemas de sucursal divergentes:** el migrador inspeccionará esquema, registrará el estado y abortará con un diagnóstico antes de cambios incompatibles.
- **Clientes que dependan de rutas actuales:** se mantendrán rutas y formatos donde sea posible; se validarán mediante pruebas de integración.
- **Cambios de UI durante operación:** cada vista se migrará y verificará por separado, sin reemplazo global de estilos.
