# Respaldo y restauración

El respaldo es un dump completo de la base configurada en `DB_NAME`. Incluye tablas conocidas y tablas particulares de cada sucursal. El flujo normal nunca restaura automáticamente: una restauración reemplaza el estado de la base y sólo se ejecuta durante una recuperación autorizada.

## Crear y verificar

Desde la raíz de la aplicación:

```powershell
npm.cmd run backup
```

`backup_bd.js` usa exactamente `DB_HOST`, `DB_PORT` y `DB_NAME` de la configuración validada que consume el pool. Antes de crear un archivo abre esa conexión, comprueba servidor/puerto/base y consulta el motor de cada tabla base. Después ejecuta `mysqldump` sin shell, incluyendo `--host` y `--port`, pasa la contraseña mediante el entorno del proceso, escribe primero un archivo temporal exclusivo, exige salida exitosa y contenido no vacío, y finalmente hace un rename atómico. Usa `--single-transaction`, `--quick`, `--skip-lock-tables`, `utf8mb4` y `--databases`.

En `npm run migrate`, host, puerto, usuario y base se resuelven una sola vez y quedan en un objeto inmutable compartido por el pool y el respaldo. Un cambio posterior en `config/.active_port` no puede redirigir el dump ni la migración en curso; se usa la identidad ya resuelta o se aborta.

`--single-transaction` sólo ofrece la consistencia requerida cuando todas las tablas base son InnoDB. Si la inspección encuentra MyISAM, MEMORY, un motor desconocido o no puede verificar los motores, el comando aborta antes de invocar `mysqldump` y no publica ningún respaldo. No convierta una tabla automáticamente: inventar o cambiar su motor puede bloquear o alterar una sucursal. Registre la tabla, detenga el despliegue y prepare una ventana de mantenimiento revisada o una estrategia de respaldo con bloqueo total probada en una copia aislada.

Verifique de nuevo usando la ruta exacta impresa:

```powershell
npm.cmd run backup:verify -- 'C:\ruta\exacta\backup.sql'
Get-FileHash -Algorithm SHA256 'C:\ruta\exacta\backup.sql'
```

Conserve dos copias con el mismo SHA-256, una fuera de `C:\xampp\htdocs\sistema`. El ticket debe registrar ruta, tamaño, hash, hora, base, sucursal y responsable. No incluya `.env`, contraseñas ni tokens.

## Prueba de restauración

Antes de una migración, pruebe el dump en una instancia aislada con credenciales separadas. El archivo fue creado con `--databases`, por lo que contiene la base de origen: no lo cargue en un servidor que tenga una base activa con el mismo nombre. Compruebe primero que el archivo declara exactamente la base esperada:

```powershell
$expectedDatabase = 'importador_papeleria'
$createPattern = '^CREATE DATABASE(?:\s+/\*![0-9]{5}\s+IF NOT EXISTS\*/|\s+IF NOT EXISTS)\s+`(?<name>[^`]+)`(?:\s+/\*![0-9]{5}\s+(?:DEFAULT CHARACTER SET|DEFAULT COLLATE|COLLATE)\s+[^*]+\*/)*;$'
$usePattern = '^USE `(?<name>[^`]+)`;$'
$createLines = @(Select-String -Path 'C:\ruta\exacta\backup.sql' -Pattern '^CREATE DATABASE')
$useLines = @(Select-String -Path 'C:\ruta\exacta\backup.sql' -Pattern '^USE `')
if ($createLines.Count -ne 1 -or $useLines.Count -ne 1) { throw 'El dump debe declarar exactamente una sola base' }
if ($createLines[0].Line -notmatch $createPattern -or $Matches['name'] -cne $expectedDatabase) { throw 'La declaración CREATE DATABASE del dump no es la esperada' }
if ($useLines[0].Line -notmatch $usePattern -or $Matches['name'] -cne $expectedDatabase) { throw 'La declaración USE del dump no es la esperada' }
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
Set-Location C:\xampp\htdocs\sistema -ErrorAction Stop
$ErrorActionPreference = 'Stop'
npm.cmd run pm2:stop
if ($LASTEXITCODE -ne 0) { throw 'No se pudo detener PM2 antes de restaurar' }
$expectedDatabase = 'importador_papeleria'
$createPattern = '^CREATE DATABASE(?:\s+/\*![0-9]{5}\s+IF NOT EXISTS\*/|\s+IF NOT EXISTS)\s+`(?<name>[^`]+)`(?:\s+/\*![0-9]{5}\s+(?:DEFAULT CHARACTER SET|DEFAULT COLLATE|COLLATE)\s+[^*]+\*/)*;$'
$usePattern = '^USE `(?<name>[^`]+)`;$'
$createLines = @(Select-String -Path 'C:\ruta\exacta\backup.sql' -Pattern '^CREATE DATABASE')
$useLines = @(Select-String -Path 'C:\ruta\exacta\backup.sql' -Pattern '^USE `')
if ($createLines.Count -ne 1 -or $useLines.Count -ne 1) { throw 'El dump debe declarar exactamente una sola base' }
if ($createLines[0].Line -notmatch $createPattern -or $Matches['name'] -cne $expectedDatabase) { throw 'La declaración CREATE DATABASE del dump no es la esperada' }
if ($useLines[0].Line -notmatch $usePattern -or $Matches['name'] -cne $expectedDatabase) { throw 'La declaración USE del dump no es la esperada' }
$expectedHost = 'HOST_PRODUCCION_VERIFICADO'
$expectedPort = 'PUERTO_PRODUCCION_VERIFICADO'
$expectedMysqlHostname = 'MYSQL_HOSTNAME_REGISTRADO_EN_PREFLIGHT'
$restoreCredential = $null
try {
  $restoreCredential = Get-Credential -UserName 'USUARIO_MYSQL_PRODUCCION' -Message 'Credencial MySQL de ESTA sucursal'
  $env:MYSQL_PWD = $restoreCredential.GetNetworkCredential().Password
  $identityLines = @(& 'C:\xampp\mysql\bin\mysql.exe' --host=$expectedHost --port=$expectedPort --user=$restoreCredential.UserName --database=$expectedDatabase --batch --skip-column-names --execute="SELECT CONCAT(@@hostname, '|', @@port, '|', DATABASE()); SELECT COUNT(*) FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = 'importador_papeleria';")
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo validar el servidor/base de restauración' }
  $expectedIdentity = "$expectedMysqlHostname|$expectedPort|$expectedDatabase"
  if ($identityLines.Count -ne 2 -or $identityLines[0].Trim() -cne $expectedIdentity -or $identityLines[1].Trim() -cne '1') { throw 'La identidad, puerto o base de restauración no coincide exactamente con el ticket' }
  Read-Host 'Identidad exacta comprobada. Escriba RESTAURAR para continuar' | ForEach-Object { if ($_ -cne 'RESTAURAR') { throw 'Restauración cancelada' } }
  & 'C:\xampp\mysql\bin\mysql.exe' --host=$expectedHost --port=$expectedPort --user=$restoreCredential.UserName --execute="DROP DATABASE ``importador_papeleria``; SOURCE C:/ruta/exacta/backup.sql"
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
