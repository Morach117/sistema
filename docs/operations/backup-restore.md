# Respaldo y restauración

El respaldo es un dump completo de la base configurada en `DB_NAME`. Incluye tablas conocidas y tablas particulares de cada sucursal. El flujo normal nunca restaura automáticamente: una restauración reemplaza el estado de la base y sólo se ejecuta durante una recuperación autorizada.

## Crear y verificar

Desde la raíz de la aplicación:

```powershell
npm.cmd run backup
```

`backup_bd.js` ejecuta `mysqldump` sin shell, pasa la contraseña mediante el entorno del proceso, escribe primero un archivo temporal exclusivo, exige salida exitosa y contenido no vacío, y finalmente hace un rename atómico. Usa `--single-transaction`, `--quick`, `--skip-lock-tables`, `utf8mb4` y `--databases`.

Verifique de nuevo usando la ruta exacta impresa:

```powershell
npm.cmd run backup:verify -- 'C:\ruta\exacta\backup.sql'
Get-FileHash -Algorithm SHA256 'C:\ruta\exacta\backup.sql'
```

Conserve dos copias con el mismo SHA-256, una fuera de `C:\xampp\htdocs\sistema`. El ticket debe registrar ruta, tamaño, hash, hora, base, sucursal y responsable. No incluya `.env`, contraseñas ni tokens.

## Prueba de restauración

Antes de una migración, pruebe el dump en una instancia aislada con credenciales separadas. El archivo fue creado con `--databases`, por lo que contiene la base de origen: no lo cargue en un servidor que tenga una base activa con el mismo nombre. Compruebe primero que el archivo declara exactamente la base esperada:

```powershell
$declaresDatabase = Select-String -Path 'C:\ruta\exacta\backup.sql' -SimpleMatch 'CREATE DATABASE IF NOT EXISTS `importador_papeleria`'
$usesDatabase = Select-String -Path 'C:\ruta\exacta\backup.sql' -SimpleMatch 'USE `importador_papeleria`;'
if (-not $declaresDatabase -or -not $usesDatabase) { throw 'El dump no corresponde a la base esperada' }
```

Ambas líneas deben existir. En la instancia aislada y vacía use una credencial interactiva. El `DROP DATABASE` sólo elimina la base homónima de esa instancia de prueba y evita que sobrevivan tablas de ensayos anteriores:

```powershell
$copyCredential = Get-Credential -UserName 'USUARIO_COPIA' -Message 'Credencial de la instancia MySQL AISLADA'
$env:MYSQL_PWD = $copyCredential.GetNetworkCredential().Password
try {
  & 'C:\xampp\mysql\bin\mysql.exe' --host='127.0.0.1' --port='3310' --user=$copyCredential.UserName --execute="DROP DATABASE IF EXISTS ``importador_papeleria``; SOURCE C:/ruta/exacta/backup.sql"
  if ($LASTEXITCODE -ne 0) { throw 'La restauración aislada falló' }
} finally {
  Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
  $copyCredential = $null
}
```

Valide en esa copia:

```sql
SHOW FULL TABLES WHERE Table_type = 'BASE TABLE';
SELECT COUNT(*) AS productos FROM cat_productos;
SELECT COUNT(*) AS usuarios FROM usuarios;
SELECT COUNT(*) AS remisiones FROM historial_remisiones;
SELECT COUNT(*) AS items FROM historial_items;
SELECT COUNT(*) AS traspasos FROM traspasos;
```

Añada consultas para todas las tablas particulares inventariadas en la sucursal. Compruebe una muestra autorizada de claves SICAR y fechas; no exporte datos sensibles al ticket.

## Restauración de emergencia en la sucursal

Requisitos: autorización, respaldo verificado, commit anterior conocido, usuarios fuera del sistema y PM2 detenido. La base dañada se preserva primero como evidencia si MySQL todavía permite crear un dump.

La restauración exacta debe eliminar la base de destino antes de importar, porque un dump creado con `--databases` elimina/recrea sus tablas conocidas pero no elimina tablas creadas después del respaldo. Sin este paso podría sobrevivir, por ejemplo, una `_node_migrations` posterior con historial incompatible.

Antes de la acción destructiva, verifique manualmente las dos líneas del dump y el nombre literal de la base. Si el `.env` de esta sucursal usa otro `DB_NAME`, deténgase y genere un procedimiento con ese nombre exacto; no sustituya el valor mediante una variable calculada.

```powershell
Set-Location C:\xampp\htdocs\sistema
npm.cmd run pm2:stop
$declaresDatabase = Select-String -Path 'C:\ruta\exacta\backup.sql' -SimpleMatch 'CREATE DATABASE IF NOT EXISTS `importador_papeleria`'
$usesDatabase = Select-String -Path 'C:\ruta\exacta\backup.sql' -SimpleMatch 'USE `importador_papeleria`;'
if (-not $declaresDatabase -or -not $usesDatabase) { throw 'El dump no corresponde a la base esperada' }
$restoreCredential = Get-Credential -UserName 'USUARIO_MYSQL_PRODUCCION' -Message 'Credencial MySQL de ESTA sucursal'
$env:MYSQL_PWD = $restoreCredential.GetNetworkCredential().Password
try {
  & 'C:\xampp\mysql\bin\mysql.exe' --host='127.0.0.1' --port='3306' --user=$restoreCredential.UserName --execute="SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = 'importador_papeleria';"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo validar el destino de restauración' }
  & 'C:\xampp\mysql\bin\mysql.exe' --host='127.0.0.1' --port='3306' --user=$restoreCredential.UserName --execute="DROP DATABASE ``importador_papeleria``; SOURCE C:/ruta/exacta/backup.sql"
  if ($LASTEXITCODE -ne 0) { throw 'La restauración de emergencia falló' }
} finally {
  Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
  $restoreCredential = $null
}
```

Use barras `/` dentro de `SOURCE`. No use una ruta calculada, un comodín ni “el archivo más reciente”: copie la ruta exacta del respaldo verificado. El `DROP DATABASE` literal y la importación forman una sola recuperación autorizada; si el import falla después del drop, mantenga PM2 detenido, corrija el acceso al mismo respaldo y repita la importación.

Restaure también el código como unidad:

```powershell
git checkout COMMIT_ANTERIOR_VERIFICADO
npm.cmd ci
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend run build
npm.cmd run pm2:start
npm.cmd run pm2:save
npm.cmd run pm2:status
Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3000/' | Select-Object StatusCode
```

Repita login, consulta de catálogo, módulos críticos y conteos. Si cualquier validación falla, mantenga la sucursal fuera de servicio y escale; no mezcle datos de otro respaldo ni intente reparaciones SQL ad hoc.

## Retención y seguridad

- Restrinja lectura a administradores del sistema y operadores de recuperación.
- Cifre copias extraíbles y elimínelas según la política de retención aprobada.
- Pruebe una restauración periódicamente; un archivo existente pero no restaurable no es un respaldo útil.
- Nunca suba dumps a Git, correo o tickets.
- No use `xd.sql`, `actu.sql`, `setup_bodega.sql`, `setup_logs.sql` ni `database/migraciones/*.sql` como respaldo: son artefactos históricos de estructura, no copias completas de los datos actuales.
