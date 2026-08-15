# Actualización segura de una sucursal

Este procedimiento actualiza una PC Windows de sucursal sin perder tablas ni datos locales. Requiere una ventana de mantenimiento y un commit o tag aprobado. No use dumps SQL históricos como migradores.

## Responsables y datos que se registran

Antes de empezar, registre en el ticket de la sucursal:

- sucursal, responsable, fecha y ventana;
- commit actual y commit objetivo;
- ruta absoluta, tamaño y copia externa del respaldo;
- inventario de tablas y conteo de `cat_productos` antes/después;
- salida de `EXPLAIN` de la copia restaurada;
- resultado de migraciones, healthcheck y pruebas de humo.

Una persona ejecuta y otra verifica el respaldo y los resultados. Si cualquiera de los pasos obligatorios falla, se detiene el despliegue.

## 1. Preflight, sin cambiar datos

Abra PowerShell como el usuario que opera el sistema:

```powershell
Set-Location C:\xampp\htdocs\sistema
git status --short
git rev-parse HEAD
node --version
npm.cmd --version
& 'C:\xampp\mysql\bin\mysql.exe' --version
npm.cmd run pm2:status
```

El árbol debe estar limpio. Si hay cambios locales, consérvelos y escálelos; no los descarte. Verifique `.env` sin copiar secretos al ticket: `JWT_SECRET` debe tener al menos 32 caracteres, las variables `DB_*` deben apuntar a la base de esta sucursal y `CORS_ORIGINS` debe listar sólo orígenes permitidos.

## 2. Respaldo completo y verificado

Avise a los usuarios que comienza la ventana y evite nuevas capturas. Ejecute:

```powershell
npm.cmd run backup
```

El comando imprime la ruta absoluta del archivo terminado. Copie exactamente esa ruta en el siguiente comando:

```powershell
npm.cmd run backup:verify -- 'C:\xampp\htdocs\sistema\backups\backup_importador_papeleria_FECHA.sql'
```

Copie el archivo a un medio fuera de la carpeta de la aplicación y calcule su hash:

```powershell
Get-FileHash -Algorithm SHA256 'C:\ruta\exacta\backup.sql'
```

No continúe si el archivo no existe, está vacío, no puede copiarse o su hash no coincide en la segunda ubicación. Consulte también [respaldo y restauración](backup-restore.md).

## 3. Ensayo obligatorio en una copia aislada

Restaure el respaldo en otra instancia o base de prueba, nunca sobre la base activa. Sobre esa copia capture `EXPLAIN` antes de ejecutar `002_safe_indexes`:

```sql
EXPLAIN SELECT * FROM historial_items WHERE clave_sicar = 'CLAVE_DE_PRUEBA';
EXPLAIN SELECT * FROM bodega_movimientos
 WHERE clave_sicar = 'CLAVE_DE_PRUEBA' ORDER BY fecha DESC LIMIT 50;
EXPLAIN SELECT * FROM logs_auditoria
 WHERE usuario_id = 1 ORDER BY fecha DESC LIMIT 50;
```

Guarde la salida completa (`type`, `possible_keys`, `key`, `rows`, `Extra`). Después ejecute `npm run migrate` contra la copia y repita los tres `EXPLAIN`. Confirme que:

- la migración termina sin error y una segunda ejecución queda en `skipped`;
- no aparece ninguna tabla/columna incompatible;
- `cat_productos` conserva conteo y checksum;
- todas las tablas específicas de la sucursal siguen presentes;
- el plan posterior usa un índice BTREE equivalente y no aumenta de forma material las filas estimadas.

Si no existe una copia aislada o no se registró esta evidencia, no se aplican migraciones en producción.

## 4. Obtener y verificar el código aprobado

Mantenga anotado el commit anterior. Sustituya `COMMIT_APROBADO` por un SHA o tag revisado:

```powershell
git fetch --all --prune
git switch main
git pull --ff-only
git checkout COMMIT_APROBADO
npm.cmd ci
npm.cmd --prefix frontend ci
npm.cmd run verify
```

`npm run verify` no toca la base. Deben pasar backend, frontend, lint y build. No continúe con fallos ni use `--force` para instalar o cambiar dependencias.

## 5. Migrar y reiniciar

Detenga el proceso para impedir escrituras concurrentes durante el cambio:

```powershell
npm.cmd run pm2:stop
npm.cmd run migrate
npm.cmd run pm2:start
npm.cmd run pm2:save
```

`npm run migrate` crea otro respaldo antes de cualquier migración, registra el historial en `_node_migrations` y compara snapshots deterministas de `cat_productos`. Un error detiene el despliegue: no edite el historial ni ejecute SQL manual para “terminar” la migración.

## 6. Healthcheck y pruebas de humo

Compruebe proceso y entrega HTTP:

```powershell
npm.cmd run pm2:status
Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3000/' | Select-Object StatusCode
Get-Content '.\logs\pm2-error.log' -Tail 100
```

El estado esperado es `online`, HTTP `200` y sin errores nuevos. Después, con una cuenta de prueba autorizada:

1. iniciar sesión y cerrar sesión;
2. abrir Dashboard, Bodega, Catálogo, Traspasos, Recepciones y Auditoría según permisos;
3. buscar una clave conocida de `cat_productos` sin editarla;
4. comprobar filtros/paginación y una exportación controlada;
5. crear y eliminar sólo un registro de prueba acordado, nunca un dato real;
6. verificar tema claro/oscuro, navegación por teclado y vista de 360 px.

Compare inventario de tablas y conteos críticos con el registro previo. El migrador ya valida de forma exacta que `cat_productos` no cambie durante su ejecución.

## 7. Criterios de éxito y rollback

Se libera la sucursal sólo si todos los pasos anteriores están documentados y pasan. Si falla la migración, el inicio, el login, una consulta crítica o la comprobación de datos:

1. mantenga PM2 detenido;
2. conserve logs y, si es posible, un dump de diagnóstico de la base fallida;
3. restaure el respaldo previo siguiendo `backup-restore.md`;
4. vuelva al commit anterior registrado;
5. instale sus dependencias, reconstruya y arranque PM2;
6. repita healthcheck y pruebas de humo;
7. documente el incidente antes de reintentar.

No haga rollback parcial de tablas ni elimine `_node_migrations` manualmente. La restauración completa y el commit anterior forman una sola unidad de recuperación.
