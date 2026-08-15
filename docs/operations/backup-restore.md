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

Antes de una migración, pruebe el dump en una instancia aislada con credenciales separadas. El archivo fue creado con `--databases`, por lo que contiene la base de origen: no lo cargue en un servidor que tenga una base activa con el mismo nombre.

En la instancia aislada:

```powershell
$env:MYSQL_PWD = 'CONTRASEÑA_DE_LA_COPIA'
& 'C:\xampp\mysql\bin\mysql.exe' --host='127.0.0.1' --port='PUERTO_AISLADO' --user='USUARIO_COPIA' --execute="SOURCE C:/ruta/exacta/backup.sql"
Remove-Item Env:MYSQL_PWD
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

```powershell
Set-Location C:\xampp\htdocs\sistema
npm.cmd run pm2:stop
$env:MYSQL_PWD = $env:DB_PASSWORD
& 'C:\xampp\mysql\bin\mysql.exe' --host=$env:DB_HOST --port=$env:DB_PORT --user=$env:DB_USER --execute="SOURCE C:/ruta/exacta/backup.sql"
Remove-Item Env:MYSQL_PWD
```

Use barras `/` dentro de `SOURCE`. No use una ruta calculada, un comodín ni “el archivo más reciente”: copie la ruta exacta del respaldo verificado. La restauración puede ejecutar `DROP TABLE` incluido por `mysqldump`; esto es correcto sólo dentro de este rollback completo y autorizado.

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
