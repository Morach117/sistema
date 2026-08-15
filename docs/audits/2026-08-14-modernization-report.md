# Reporte de modernización segura — 2026-08-14

## Alcance y decisión de datos

Se auditó y modernizó la aplicación Node.js + React en la rama `codex/modernizacion-segura`. El catálogo `cat_productos` y todas las tablas/datos propios de cada sucursal se consideran reales. Durante esta implementación no se conectó a MySQL, no se creó/restauró un backup real y no se ejecutó ninguna migración. La aplicación sólo incorpora mecanismos y procedimientos para hacerlo de forma controlada posteriormente.

## Estado P0–P3

| Prioridad | Hallazgo original | Mitigación aplicada | Estado |
| --- | --- | --- | --- |
| P0 | Exportaciones y mutaciones podían depender de token/permisos del navegador | Bearer central, autenticación y autorización backend por módulo/acción | Mitigado con pruebas |
| P0 | SQL de permisos y actualizaciones de traspaso podían aceptar entradas inseguras o afectar detalles ajenos | SQL parametrizado, alcance por traspaso y transacciones | Mitigado con pruebas |
| P0 | Migración/backup podía continuar con dump fallido o cambiar el catálogo real | Backup fail-closed, historial/checksum, migraciones aditivas y snapshot determinista antes/después de `cat_productos` | Mitigado en código; despliegue pendiente |
| P1 | Secreto JWT fallback, errores internos, login enumerable, fuerza bruta y CORS abierto | JWT obligatorio ≥32, errores públicos normalizados con request ID, login uniforme y limitado, allowlist CORS | Mitigado con pruebas |
| P1 | Uploads sin límites/limpieza y operaciones compuestas no atómicas | Un archivo ≤10 MB, tipos permitidos, limpieza async y servicios transaccionales | Mitigado con pruebas |
| P1 | Cliente confiaba en permisos locales y exportaba fuera del cliente autenticado | Sesión/cliente API únicos, invalidación 401 observable, rutas protegidas y exportación blob autenticada | Mitigado con pruebas |
| P1 | Dashboard/Recepciones podían consultar módulos no autorizados y una descripción externa llegaba a `html` de SweetAlert | Consultas condicionadas por permiso, estados “no disponible” veraces y confirmaciones con texto inerte | Mitigado con pruebas |
| P2 | Pool, paginación, búsquedas y logs podían crecer sin límites o filtrar secretos | Pool/colas/timeouts acotados, límites de página/offset/búsqueda, logger estructurado con redacción | Mitigado con pruebas |
| P2 | UI monolítica, sin tema real, navegación móvil ni foco de diálogos consistente | Tokens semánticos, claro/oscuro, shell responsive, drawer con foco, diálogos Radix y estados comunes | Mitigado con pruebas |
| P2 | Bundle inicial único de más de 1 MB | `React.lazy` por ruta y `Suspense` accesible | Mitigado; medición abajo |
| P3 | Documentación histórica describía PHP y no un despliegue recuperable | Arquitectura vigente, runbooks, clasificación legado y evidencia | Mitigado |

No se encontraron P0 conocidos sin tratamiento en el código revisado. “Mitigado en código” no equivale a desplegado: cada sucursal debe superar el runbook y sus pruebas contra una copia restaurada.

## Evidencia de preservación

- Las migraciones Node no contienen `DROP`, `TRUNCATE`, `DELETE` ni actualizaciones masivas de tablas de negocio.
- `001_migration_history` sólo crea `_node_migrations` si no existe.
- `002_safe_indexes` inspecciona tabla, columnas e índices; aborta ante divergencia y sólo agrega índices BTREE faltantes.
- El migrador crea y verifica un dump antes de actuar y compara conteo + SHA-256 determinista de siete columnas ordenadas de `cat_productos` antes/después.
- La cantidad recibida de traspaso se mantiene en la columna histórica `traspaso_detalles.cantidad`; no exige una columna nueva a sucursales existentes.
- Las operaciones de bodega, permisos, uploads y traspasos usan transacciones/rollback donde hay múltiples escrituras.
- Dashboard no consulta reclamaciones sin permiso y Recepciones omite la validación cruzada de catálogo sin impedir la captura; ambas pantallas informan que la información no está disponible con esos permisos.
- Los cambios confirmados de Recepciones se pueden vaciar y esperar mediante una barrera explícita; finalizar y exportar quedan deshabilitados durante el guardado y se bloquean con un mensaje accionable si alguna escritura falla.
- Las descripciones provenientes de archivos/base de datos se entregan a SweetAlert como texto, sin interpolación en `html`.
- Esta rama no ejecutó el migrador ni una conexión contra los datos locales.

Riesgos operativos pendientes: el baseline completo para instalar una base vacía aún depende de artefactos históricos revisados; el migrador no tiene un advisory lock entre dos procesos simultáneos. Por ello se exige una sola persona/proceso, PM2 detenido y una copia restaurada antes de producción.

## Rendimiento de entrega

Medición con `npm.cmd --prefix frontend run build`, misma máquina y dependencias:

| Métrica | Antes (rutas eager) | Después (rutas lazy) | Cambio |
| --- | ---: | ---: | ---: |
| JS de entrada minificado | 1,374.61 kB | 298.44 kB | −78.29% |
| JS de entrada gzip | 407.30 kB | 93.09 kB | −77.14% |
| CSS | 85.34 kB / 13.23 kB gzip | 85.34 kB / 13.23 kB gzip | sin cambio |
| Chunk de ruta más grande | no separado | `EvolucionPrecios`, 366.44 kB / 106.03 kB gzip | carga bajo demanda |

Antes Vite emitía un warning por chunk superior a 500 kB. Después no hay chunks superiores a ese umbral. Bibliotecas pesadas (`xlsx`, 282.27 kB) quedan fuera de la entrada y se descargan sólo con las rutas que las necesitan. La suma de chunks no representa descarga inicial; el beneficio medido es la reducción del arranque.

## EXPLAIN de índices

No se aplicaron índices ni se consultó la base real durante esta rama. En consecuencia, no existe una salida de `EXPLAIN` de producción y no se inventa evidencia. Antes de aplicar `002_safe_indexes`, el despliegue queda bloqueado hasta restaurar el backup en una instancia aislada y adjuntar salida antes/después para:

```sql
EXPLAIN SELECT * FROM historial_items WHERE clave_sicar = 'CLAVE_DE_PRUEBA';
EXPLAIN SELECT * FROM bodega_movimientos
 WHERE clave_sicar = 'CLAVE_DE_PRUEBA' ORDER BY fecha DESC LIMIT 50;
EXPLAIN SELECT * FROM logs_auditoria
 WHERE usuario_id = 1 ORDER BY fecha DESC LIMIT 50;
```

La plantilla y criterios exactos están en `docs/operations/sucursal-update.md`. Esta evidencia debe registrar `type`, `possible_keys`, `key`, `rows` y `Extra` antes y después. La ausencia de la evidencia impide migrar; cumple la restricción de no tocar la DB durante desarrollo.

## Clasificación de legado

Clasificación: A = retirar de la operación (conservar sólo como evidencia); B = refactorizar/absorber en migraciones Node revisadas; C = retener temporalmente por compatibilidad explícita. En esta tarea no se borró ningún archivo histórico.

| Artefacto | Clase | Tratamiento |
| --- | :---: | --- |
| `database/auto_migrar.php` | A | No invocar; carece del flujo de backup/snapshot/checksum Node |
| `actu.sql` | A | Dump parcial de estructura, no reproducible ni backup actual |
| `xd.sql` | A | DDL no idempotente de traspasos; referencia solamente |
| `setup_bodega.sql` | A | Setup manual fuera del historial versionado |
| `setup_logs.sql` | A | Setup manual fuera del historial versionado |
| `database/auditoria.sql` | B | Traducir a baseline Node aditivo tras comparar cada esquema de sucursal |
| `database/migraciones/001_crear_tablas_traspasos.sql` | B | Absorber en baseline compatible; conservar contrato `cantidad` |
| `database/migraciones/002_crear_ordenes_compra.sql` | B | Absorber sólo si el módulo se activa y tras auditar tablas existentes |
| `config/db.php` | C | Retener sólo mientras se confirma si existe un consumidor PHP externo; Node no lo carga |

Una sucursal no debe ejecutar artefactos A/B. El retiro físico se hará en otra versión después de confirmar que ningún proceso externo depende de ellos y que el baseline Node reproduce la estructura compatible.

## Dependencias y riesgos restantes

Auditoría del 2026-08-14:

- Backend: `pm2` 5.x y su `js-yaml` transitivo reportan 1 vulnerabilidad moderada y 1 alta. La corrección automática exige PM2 7.0.3 (major); se pospone hasta probar arranque, reload, logs y autostart Windows en una PC piloto.
- Frontend: se actualizó el `nanoid` transitivo a la versión corregida. Permanece 1 vulnerabilidad alta en `xlsx@0.18.5` sin fix disponible en el registro usado. Se debe evaluar reemplazo/migración de SheetJS; mientras tanto, aceptar sólo archivos controlados, conservar límites de upload backend y no abrir hojas de origen desconocido.
- No existe un endpoint dedicado `/health`; el runbook combina estado PM2, HTTP 200 de la SPA, logs y smoke test autenticado. Un health de proceso/DB sin exponer secretos queda como mejora P2.
- Algunas pantallas heredadas aún contienen estilos específicos oscuros; los tokens y la capa de compatibilidad permiten claro/oscuro, pero conviene migrarlas componente por componente.

No se usó `npm audit fix --force` ni se aceptó un salto major sin validación de sucursal.

## Verificación de la rama

La verificación final debe registrarse inmediatamente antes del commit:

| Comando | Resultado |
| --- | --- |
| `node --test` | PASS: 94/94, 0 fallos |
| `npm.cmd --prefix frontend run test -- --run` | PASS: 8 archivos, 41/41 pruebas |
| `npm.cmd --prefix frontend run lint` | PASS (exit 0): 11 warnings heredados, 0 errores |
| `npm.cmd --prefix frontend run build` | PASS: 2,555 módulos, 2.38 s |
| `git diff --check` | PASS (exit 0); Git sólo avisa normalización LF→CRLF en Windows |

Los 11 warnings de lint son: un aviso `only-export-components`, nueve símbolos/variables sin usar y una dependencia de hook heredada en `AdminTraspasos`. No se introdujeron errores de lint. Ninguna afirmación de despliegue sustituye esta verificación fresca ni la validación contra una copia restaurada por sucursal.

## Secuencia de entrega

La única secuencia aprobada es: **backup → verificación y copia externa → checkout/verificación del código aprobado → restauración aislada → ensayo/EXPLAIN con ese código → consola limpia de producción → migración → reinicio → healthcheck → smoke test → liberación**. Ante fallo: **detener → conservar evidencia → eliminar/recrear la base exacta desde el backup → volver al commit anterior → verificar**.

Los comandos exactos, criterios de parada y recuperación están en `docs/operations/sucursal-update.md` y `docs/operations/backup-restore.md`.
