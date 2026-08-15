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

## 3. Obtener y verificar el código aprobado en un worktree separado

Mantenga anotado el commit anterior. Sustituya `COMMIT_APROBADO` por el SHA revisado tanto en el comando como en el nombre de la carpeta. Prepare el release en un worktree separado: así no se sobrescribe el frontend servido ni el código activo durante el ensayo.

```powershell
Set-Location C:\xampp\htdocs\sistema
git fetch --all --prune
git worktree add --detach 'C:\xampp\htdocs\sistema-release-COMMIT_APROBADO' COMMIT_APROBADO
Set-Location 'C:\xampp\htdocs\sistema-release-COMMIT_APROBADO'
git rev-parse HEAD
npm.cmd ci
npm.cmd --prefix frontend ci
npm.cmd run verify
```

El SHA impreso debe ser exactamente el aprobado. `npm run verify` no toca la base. Deben pasar backend, frontend, lint y build. No continúe con fallos ni use `--force`. Todo ensayo posterior se ejecuta desde este worktree y commit, no desde el código anterior. No elimine el worktree hasta liberar o revertir la sucursal.

## 4. Ensayo obligatorio en una instancia aislada

Restaure el respaldo en otra instancia MySQL/MariaDB, nunca en el host/puerto activo. La instancia de prueba debe tener host o puerto distinto al registrado en el preflight y no debe atender usuarios. Siga [Prueba de restauración](backup-restore.md#prueba-de-restauración), que recrea la base de prueba para evitar residuos.

Abra una PowerShell nueva dedicada al ensayo. Desde el commit aprobado, establezca explícitamente las cinco variables de la copia. El ejemplo usa el puerto aislado `3310`; sustitúyalo por el valor comprobado:

```powershell
Set-Location 'C:\xampp\htdocs\sistema-release-COMMIT_APROBADO'
$copyCredential = Get-Credential -UserName 'USUARIO_COPIA' -Message 'Credencial de la instancia MySQL AISLADA'
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '3310'
$env:DB_USER = $copyCredential.UserName
$env:DB_PASSWORD = $copyCredential.GetNetworkCredential().Password
$env:DB_NAME = 'importador_papeleria'

try {
  $env:MYSQL_PWD = $env:DB_PASSWORD
  & 'C:\xampp\mysql\bin\mysql.exe' --host=$env:DB_HOST --port=$env:DB_PORT --user=$env:DB_USER --database=$env:DB_NAME --execute="SELECT @@hostname AS host, @@port AS port, DATABASE() AS db;"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo comprobar la instancia aislada' }
} finally {
  Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
}
```

Compare la salida con el endpoint de producción registrado. Si host y puerto coinciden, deténgase. Con estas variables todavía activas, capture `EXPLAIN` antes de ejecutar `002_safe_indexes`:

```sql
EXPLAIN SELECT * FROM historial_items WHERE clave_sicar = 'CLAVE_DE_PRUEBA';
EXPLAIN SELECT * FROM bodega_movimientos
 WHERE clave_sicar = 'CLAVE_DE_PRUEBA' ORDER BY fecha DESC LIMIT 50;
EXPLAIN SELECT * FROM logs_auditoria
 WHERE usuario_id = 1 ORDER BY fecha DESC LIMIT 50;
```

Guarde la salida completa (`type`, `possible_keys`, `key`, `rows`, `Extra`). Después ejecute el migrador aprobado dos veces contra la copia y repita los tres `EXPLAIN`:

```powershell
try {
  npm.cmd run migrate
  if ($LASTEXITCODE -ne 0) { throw 'Falló la primera migración aislada' }
  npm.cmd run migrate
  if ($LASTEXITCODE -ne 0) { throw 'Falló la comprobación de idempotencia' }
} finally {
  Remove-Item Env:DB_HOST,Env:DB_PORT,Env:DB_USER,Env:DB_PASSWORD,Env:DB_NAME,Env:MYSQL_PWD -ErrorAction SilentlyContinue
  $copyCredential = $null
}
```

Confirme que:

- la migración termina sin error y una segunda ejecución queda en `skipped`;
- no aparece ninguna tabla/columna incompatible;
- `cat_productos` conserva conteo y checksum;
- todas las tablas específicas de la sucursal siguen presentes;
- el plan posterior usa un índice BTREE equivalente y no aumenta de forma material las filas estimadas.

Si no existe una instancia aislada o no se registró esta evidencia, no se aplican migraciones en producción. Cierre la PowerShell de ensayo al terminar; las variables `DB_*` de la copia no se reutilizan.

## 5. Migrar y reiniciar

Abra otra PowerShell nueva, vuelva al checkout activo y compruebe que no existen overrides heredados. El proceso de producción debe leer exclusivamente el `.env` verificado en el preflight:

```powershell
Set-Location C:\xampp\htdocs\sistema
Get-ChildItem Env:DB_HOST,Env:DB_PORT,Env:DB_USER,Env:DB_PASSWORD,Env:DB_NAME -ErrorAction SilentlyContinue
```

La salida debe estar vacía. Si aparece una variable, cierre la consola y abra otra; no la corrija copiando credenciales. Detenga el proceso, aplique exactamente el commit ya ensayado y reconstruya dentro de la ventana:

```powershell
npm.cmd run pm2:stop
git fetch --all --prune
git checkout COMMIT_APROBADO
if ((git rev-parse HEAD) -ne 'COMMIT_APROBADO') { throw 'El checkout activo no coincide con el release ensayado' }
npm.cmd ci
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend run build
npm.cmd run migrate
if ($LASTEXITCODE -ne 0) { throw 'Migración detenida; iniciar rollback' }
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
