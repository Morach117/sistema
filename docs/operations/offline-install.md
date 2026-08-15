# Instalación offline

Este flujo prepara una entrega reproducible para una PC sin acceso a internet. El paquete incluye el frontend ya compilado, los `package-lock.json` y una caché npm dedicada para que `npm ci --offline` funcione tanto en backend como en frontend.

## 1. Generar el paquete

En la máquina conectada y desde `C:\xampp\htdocs\sistema`:

```powershell
npm.cmd install
npm.cmd --prefix frontend install
npm.cmd --prefix frontend run build
npm.cmd run release:offline
```

El comando escribe una carpeta `artifacts\offline-release\sistema-offline`. Copie esa carpeta completa al medio de transferencia que usará en la sucursal.

## 2. Instalar en la máquina sin red

Abra PowerShell en la carpeta transferida `sistema-offline` y ejecute:

```powershell
npm.cmd ci --offline --cache .npm-cache
npm.cmd --prefix frontend ci --offline --cache ..\.npm-cache
```

La segunda línea debe ejecutarse desde la raíz del paquete. `frontend/dist` ya viaja compilado, así que la interfaz puede servirse sin descargar fuentes ni dependencias externas.

## 3. Verificación mínima

Todavía dentro del paquete offline:

```powershell
npm.cmd run verify
```

Si necesita regenerar el frontend con la misma caché local:

```powershell
npm.cmd --prefix frontend run build
```

## 4. Qué revisar si falla

- Confirme que la carpeta `.npm-cache` existe y se copió completa.
- No elimine `package-lock.json` ni `frontend/package-lock.json`; `npm ci --offline` depende de ellos.
- Si `npm ci --offline` intenta salir a red, regenere el paquete desde una máquina conectada con `npm.cmd run release:offline`.
