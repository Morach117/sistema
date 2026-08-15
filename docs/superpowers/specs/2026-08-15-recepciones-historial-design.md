# Diseño: Recepciones, historial, clientes y evolución de precios

## Objetivo

Restituir las capacidades operativas de la recepción PHP en React y Node.js, recuperar el Historial de Remisiones sin borrado, corregir la ruta de Evolución de Precios y añadir Clientes con operación local distribuida entre tres sucursales.

## Alcance acordado

### Recepciones

- La importación XML debe identificar proveedor por RFC o nombre y conservar el folio normalizado.
- Cada concepto XML debe registrar automáticamente IVA y si contiene descuento. La importación no debe duplicar líneas ni reemplazar el conteo físico o las correcciones manuales de una recepción pendiente.
- Las reglas automáticas son: Paola/Operadora aplica el descuento configurado a sus líneas; Tony solo lo aplica cuando el XML marca descuento; Sin descuentos nunca lo aplica; Optivosa, Megamer y Manual parten sin descuento automático. Una corrección manual por línea tiene prioridad sobre la regla.
- Cada línea permite marcar que se recibe por caja y definir piezas por caja. La interfaz muestra `cantidad de factura / piezas por caja = cajas`; la cantidad original de factura se conserva.
- El costo mostrado debe indicar claramente el resultado de IVA, descuento y presentación por caja. Debe conservar los precios sugeridos de margen 20% y 30%.
- Se conservan faltante, rechazo a reclamación, selección de proveedor, descuento, descarga de Excel, finalización y guardado automático. Las mutaciones siguen autorizadas y serializadas en Node.
- Antes de finalizar se muestra una validación con productos sin SICAR, sin conteo físico, costo cero, rechazados y cajas sin piezas definidas. No se finaliza si existen errores bloqueantes; el usuario recibe la lista accionable.
- Antes de guardar una importación se muestra una vista previa con líneas nuevas, líneas que actualizarían una recepción pendiente y folios que ya fueron finalizados. Un folio finalizado no se modifica.
- La interfaz resalta diferencias entre cantidad de factura y conteo físico: faltante, sobrante o coincidencia.
- Se permiten acciones masivas sobre líneas seleccionadas para descuento y configuración de caja. El proveedor se mantiene en el encabezado porque pertenece a la remisión completa.
- Al abrir una línea se puede consultar su última compra: fecha, proveedor y costo histórico.
- Se permiten notas internas de remisión y de línea. No se exponen en el Excel de inventario.
- Se presenta un resumen previo a la finalización: productos, cajas, piezas, costo y artículos en revisión.
- Al exportar Excel el usuario puede activar “Incluir conteo físico”. La opción inicia desactivada. Sin ella se exporta la cantidad de factura convertida a cajas; con ella se suma el físico de manera visible en la previsualización.
- Al finalizar, el backend aprende relaciones válidas en una transacción: código de proveedor, SICAR, costo, caja, piezas por caja, IVA y descuento. No aprende `FALTANTE`, `DEVOLUCION`, rechazos ni líneas sin SICAR. En próximas importaciones, esas relaciones se recuperan automáticamente y el usuario puede corregirlas.

### Historial de Remisiones

- Existe una ruta React independiente con paginación y filtros ejecutados en Node: intervalo de fechas, proveedor, estado y búsqueda por folio, identificador o producto.
- El Historial no permite borrado a ningún usuario.
- Se introduce el permiso independiente `historial-recepciones`.
- Con ese permiso, el usuario puede consultar todas las remisiones, filtrar y abrir el detalle, pero no editar ni exportar.
- Los administradores pueden editar remisiones pendientes y descargar el Excel; las remisiones finalizadas siguen siendo de solo lectura.
- La pantalla incluye resumen de resultados y un aviso de folio duplicado/finalizado durante importación.
- Cada remisión muestra una bitácora con usuario, fecha, campo, valor anterior y valor nuevo para cambios de proveedor, SICAR, cantidad, caja, descuento, rechazo, notas y finalización.

### Evolución de Precios

- Se repara la ruta eliminando la inconsistencia entre el lockfile y las dependencias instaladas de Recharts/es-toolkit.
- La verificación de frontend debe compilar la pantalla de carga diferida para que una dependencia ausente se detecte antes de publicar.

### Clientes y Compras

- Se añade un CRUD de clientes con identificador UUID global, datos de contacto, estado activo/inactivo y bitácora. Desactivar sustituye al borrado para preservar el historial.
- Se añade el registro manual de una venta/compra para un cliente. Cada registro incluye cliente, sucursal detectada, fecha y hora, confirmación de venta y folio de ticket opcional. No se requieren productos ni importes en esta entrega.
- Cuando existe, el folio se valida como único dentro de su sucursal. Si no está disponible, el evento se registra explícitamente como venta sin folio; no se inventa un folio.
- Esta instalación funciona como Central de Clientes y conserva la fuente central de clientes y compras. Los catálogos, facturas, recepciones, inventario y demás datos existentes continúan separados por sucursal.
- Cada sucursal mantiene una réplica local de clientes y una cola persistente de operaciones. Crear, editar, desactivar clientes o registrar compras funciona aunque la central o la red local no estén disponibles. Al volver la conexión, la sincronización se realiza automáticamente.
- Los identificadores UUID y operaciones idempotentes evitan duplicados durante reintentos. Los cambios concurrentes del mismo dato generan un conflicto visible y auditable; nunca se descarta silenciosamente un cambio local.
- La sucursal se activa una vez mediante código de vinculación y recibe una credencial propia. La central tiene una huella criptográfica persistente. Ni la IP, ni el nombre de Windows, ni el nombre de red identifican de forma confiable una sucursal o central.
- Las sucursales descubren la central por difusión local y verifican su huella antes de sincronizar. Si Windows o DHCP cambia su IP, la sucursal la redescubre sin configuración manual. La interfaz ofrece “Buscar central” como alternativa de diagnóstico.
- No se usa Tailscale, IP pública, DNS dinámico, puertos expuestos a internet ni servicios de pago. La sincronización usa exclusivamente la red local.

### Operación sin internet

- La interfaz, fuentes, iconos y dependencias de producción se entregan localmente; la aplicación no debe depender de CDN para funcionar.
- Cada entrega incluye un paquete offline reproducible con frontend compilado y dependencias Node verificadas, o una caché local suficiente para instalar sin red. La instalación y reinicio de una sucursal no dependen de descargar paquetes.
- La ausencia de internet nunca bloquea captura, recepción, clientes, historial local ni arranque. La sincronización de Clientes se reintenta con espera progresiva sin impedir el uso de la aplicación.

## Arquitectura

Node conserva toda regla de importación, validación, aprendizaje, autorización y persistencia. React consulta datos ya calculados o con metadatos explícitos y presenta la revisión interactiva; el navegador no es la fuente de verdad de costos ni permisos.

Las nuevas consultas de historial se exponen como una API paginada y autorizada. La bitácora es persistente y se escribe junto a cada mutación de recepción para que no dependa del estado de la interfaz.

Clientes se implementa como un servicio local con dos papeles configurables: Central de Clientes en esta instalación y Sucursal en las otras dos. La sincronización se comunica exclusivamente con la API local de la central encontrada por difusión, usando credenciales de vinculación y una huella criptográfica fijada durante el emparejamiento. La red cambia de dirección sin alterar identidades ni datos.

## Datos y compatibilidad

- Se preservan `historial_remisiones`, `historial_items` y `rel_codigos_proveedor` existentes.
- Las migraciones versionadas añaden solo los campos y tablas necesarios para notas, auditoría y metadatos de importación. Deben ser repetibles y seguras para bases con datos previos.
- Los registros históricos conservan su costo existente; los nuevos metadatos de IVA y descuento permiten explicar el cálculo sin recalcular ni alterar compras anteriores.
- Las API actuales de Recepciones se mantienen compatibles mientras las nuevas rutas especializadas se añaden de forma gradual.
- Las tablas de clientes, compras, sucursales, cola de sincronización, conflictos y bitácora se crean mediante migraciones aditivas e idempotentes. Las operaciones de sincronización se identifican con UUID para admitir reintentos sin efectos duplicados.

## Seguridad y permisos

- El permiso `historial-recepciones` habilita únicamente consulta para empleados.
- Las acciones administrativas de historial exigen rol administrador además de autorización de escritura.
- No se reintroduce ninguna ruta de eliminación de remisiones.
- Toda importación, edición, finalización, exportación y escritura de bitácora se ejecuta con autenticación, validación de entrada y transacciones donde afecte varias tablas.
- Los endpoints de vinculación, descubrimiento y sincronización de Clientes validan identidad de sucursal, credenciales rotables, huella de central y permisos mínimos. No exponen la base MySQL al resto de la red.

## Pruebas y criterios de aceptación

- Pruebas de servicio cubren detección de proveedor, IVA/descuento XML, reglas automáticas, precedencia de ajuste manual, caja y aprendizaje al finalizar.
- Pruebas de rutas cubren vista previa, protección de folio finalizado, paginación de historial, permisos, exportación y bitácora.
- Pruebas de React cubren indicadores de caja, diferencias, validación previa, selección masiva, permiso de historial y la opción de exportación sin físico como valor inicial.
- La compilación de frontend termina correctamente y `/evolucion-precios` carga sin pantalla vacía.
- Pruebas de Clientes cubren CRUD, venta con y sin folio, unicidad de folio por sucursal, operación sin central, reintentos idempotentes, descubrimiento, emparejamiento, sincronización, conflictos y rechazo de centrales no vinculadas.
- La entrega offline se prueba iniciando la aplicación con la red desconectada, sin peticiones a CDN ni instalaciones de paquetes.
