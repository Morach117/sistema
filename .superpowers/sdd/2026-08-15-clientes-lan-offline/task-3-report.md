# Task 3 Report

## Summary

- Creé `services/client-discovery-service.js` con anuncios UDP firmados únicamente en modo Central, difusión dirigida por interfaz IPv4 y aceptación exclusiva de remitentes en la misma subred. La Sucursal vinculada exige la huella persistida; la activación inicial exige que el anuncio y el código de vínculo correspondan a la misma clave Central.
- La dirección y puerto descubiertos viven solo en memoria. Ningún `INSERT` o `UPDATE` de identidad, configuración, sucursal, cola o conflicto guarda IP, hostname o nombre de Windows.
- Creé `services/client-sync-service.js` con sobres canónicos Ed25519 para vínculo, sincronización y respuestas; códigos temporales; credenciales de Sucursal rotatorias; lotes limitados; cursor durable; validación de atribución; y reintentos UUID idempotentes.
- La rotación exige la credencial vigente para operaciones nuevas. Una credencial anterior solo puede repetir UUIDs ya aplicados, lo que permite recuperar una respuesta perdida sin reabrir la autorización a datos nuevos.
- El emparejamiento rechaza sustitución de clave, reactivación silenciosa y carreras con desactivación administrativa. La lectura de identidad se repite dentro de la transacción con `FOR UPDATE`; la rotación posterior actualiza solo la credencial.
- La aplicación remota usa versión base optimista. Un cambio secuencial basado en la versión recibida converge aunque una operación local siga pendiente de entrega a otro par; versiones base divergentes crean `cliente_conflictos` sin descartar el cambio local.
- Una Sucursal sin Central conserva todas sus operaciones pendientes. Una respuesta inválida no marca acuses ni cambia credenciales/cursor. Una respuesta firmada válida aplica cambios, registra conflictos, confirma solo UUIDs enviados y persiste el cursor recibido.
- Creé `routes/clientes-sync.js`: vínculo y sync máquina-a-máquina están limitados por dirección de socket a loopback/LAN y además exigen firmas; generación de código, activación y diagnóstico de descubrimiento exigen JWT y `clientes-configuracion` (solo administrador). No existe entrada de IP manual.
- `server.js` inicia HTTP después de migraciones y supervisa descubrimiento/sync en segundo plano. Un fallo LAN no bloquea la API; el arranque reintenta con espera exponencial. El sync periódico también usa espera progresiva y transporte HTTP con límite de 5 segundos. El cierre cancela reintentos y una inicialización pendiente no puede enlazar sockets ni programar trabajo después.

## TDD Evidence

- Primera fase roja:
  - `node --test test/services/client-sync-service.test.js test/services/client-discovery-service.test.js test/routes/clientes-sync.test.js test/app/client-network-lifecycle.test.js`
  - Falló por módulos ausentes y por falta de supervisión de red, como se esperaba.
- Los ciclos posteriores reprodujeron antes de corregir:
  - anuncio firmado fuera de subred;
  - cursor recibido no cargado después de reinicio;
  - activación inicial sin huella aún fijada;
  - credencial anterior usada para operación nueva;
  - toma de UUID de Sucursal con otra clave y reactivación de fila inactiva;
  - conflicto falso Central v1 → Sucursal v2 por confundir entrega pendiente con concurrencia;
  - atribución de origen falsificada;
  - HTTP máquina-a-máquina fuera de LAN;
  - inicio de UDP/sync después de `stop()` durante configuración pendiente;
  - reintento periódico fijo y transporte sin plazo;
  - carreras de desactivación entre la validación y la transacción.
- Suite focal final:
  - `node --test test/services/client-sync-service.test.js test/services/client-discovery-service.test.js test/routes/clientes-sync.test.js test/app/client-network-lifecycle.test.js`
  - Passed: `30` tests, `0` failures.

## Verification

Executed on 2026-08-15:

- `node --test`
  - Exit code `0`.
  - Backend: `254` tests passed, `0` failures.
- Regression subset for migrations, bootstrap, Task 1 identity and Task 2 clients:
  - `88` tests passed, `0` failures.
- Syntax checks passed for:
  - `services/client-sync-service.js`
  - `services/client-discovery-service.js`
  - `routes/clientes-sync.js`
  - `server.js`
- `git diff --check` passed.
- Independent code review initially found one Critical convergence defect and Important security/lifecycle gaps. Each was reproduced and fixed. Follow-up verdict: `Ready to merge: Yes`, with no remaining Critical or Important findings.

## Notes

- No se probaron paquetes UDP entre tres máquinas físicas ni se mutó una base MySQL real. Los límites de socket, firmas, transacciones, SQL parametrizado, bloqueos, idempotencia, conflicto, reintento y cierre se verificaron con dobles específicos y pruebas de integración Express.
- Los archivos de planes no relacionados que ya estaban sin seguimiento se dejaron intactos:
  - `docs/superpowers/plans/2026-08-15-clientes-lan-offline.md`
  - `docs/superpowers/plans/2026-08-15-recepciones-historial.md`
