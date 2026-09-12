# Sucursales remotas con Tailscale

El sistema primero busca la Central en la red local. Si no la encuentra, busca equipos en la red privada de Tailscale y valida el anuncio firmado de la Central. No usa una IP pública, no necesita abrir puertos del módem y no muestra las direcciones internas en la pantalla.

## Preparar cada computadora

1. Ejecuta PowerShell como administrador y corre:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\scripts\install-tailscale.ps1
   ```

2. Inicia sesión con **la misma cuenta de Tailscale** en la Central y en cada sucursal. Ese único inicio de sesión es necesario para que Tailscale autorice cada computadora en tu red privada.
3. Abre el sistema en todas las computadoras. Configura una sola como **Central** y las demás como **Sucursal**.
4. En cada Sucursal, abre *Clientes → Configuración*. La Central aparecerá sola, con el texto “red privada de sucursales”, y el vínculo se crea automáticamente. El botón **Conectar** permanece como alternativa manual si se requiere reintentar.

La aplicación mantiene su sincronización local cuando una sucursal se queda sin Internet. Al recuperar la conexión, reintenta automáticamente y envía los cambios pendientes.

## Comprobación rápida

En cualquier computadora, ejecuta:

```powershell
& 'C:\Program Files\Tailscale\tailscale.exe' status
```

La Central y las sucursales deben aparecer como conectadas. Si no aparece ninguna Central en el sistema, confirma primero esa salida y que el servidor Node esté iniciado en la Central.
