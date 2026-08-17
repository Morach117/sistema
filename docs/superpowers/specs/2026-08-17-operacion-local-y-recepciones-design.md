# Diseño: operación local y Recepciones legibles

## Objetivo

Conservar la velocidad de captura directa de la versión PHP y actualizarla para
React/Node, corrigiendo los fallos actuales de Clientes y Configuración LAN. La
interfaz conservará el tema oscuro, pero con menos ruido visual y controles
entendibles para personal no técnico.

## Decisiones de experiencia

- El tema base es oscuro calmado: fondos azul marino, contraste alto, una sola
  acción principal por contexto y tarjetas con bordes suaves.
- Recepciones mantiene el esquema de captura por renglón de la versión
  anterior. No se sustituye por un formulario o pantalla distinta por producto.
- Cada renglón muestra únicamente cantidad del XML, producto/SICAR, conteo
  físico, caja/piezas, costo y el descuento ya aplicado. Rechazo, faltante,
  reclamación, nota y excepción de descuento viven en un menú o panel de
  “Más opciones”.
- Historial conserva su lista y filtros al abrir una factura; el detalle se
  presenta en un modal accesible y amplio, no en una página de reemplazo.
- El primer arranque muestra un asistente de dos decisiones explícitas:
  “Esta es la computadora Central” o “Esta es una Sucursal”. Las sucursales se
  vinculan con un código temporal creado por la Central. IP, hostname y DHCP no
  definen la identidad.

## Recepciones: reglas y datos preservados

### Importación y aprendizaje

- La importación XML identifica folio, proveedor, IVA, descuentos por concepto
  y regla del proveedor antes de presentar la recepción.
- Se respetan Paola/Operadora, Tony condicionado al XML, Sin descuentos,
  Optivosa, Megamer y Manual. La regla o XML determina el descuento automático;
  una excepción manual sólo se ofrece dentro de opciones avanzadas.
- Si existe una configuración aprendida para el código del proveedor, se
  recuperan SICAR, presentación, piezas por caja, IVA, descuento y costo. Al
  finalizar se aprende únicamente de líneas válidas, no faltantes, devoluciones
  ni rechazos.
- La vista previa de importación explica líneas nuevas, actualizaciones de una
  recepción pendiente y folios finalizados. Un folio finalizado nunca cambia.

### Caja, conteos y costos

- “Es caja” habilita piezas por caja y muestra siempre la relación
  `cantidad de factura ÷ piezas por caja = cajas`; la cantidad original no se
  modifica. Se aceptan resultados decimales para que reflejen exactamente las
  cajas selladas indicadas por el usuario.
- Conteo físico es opcional para todos los productos, incluida la finalización.
  Si se captura, se comparan factura y físico como coincide, faltante o
  sobrante. El faltante también puede marcarse manualmente.
- Se muestran costo final, IVA, descuento aplicado, costo neto y precios
  sugeridos de margen. Excel permite elegir si incluye conteo físico; por
  defecto no lo incluye.

### Operación y validación

- Se conservan proveedor, descuento, faltante, rechazo/reclamación, Excel,
  finalización, guardado automático seguro de Node, notas internas, historial
  rápido de compra y acciones masivas para caja/descuento.
- La barra de revisión sólo resume problemas que requieren acción: piezas por
  caja inválidas cuando “Es caja” está activo, costos imposibles, datos
  contradictorios o error de guardado. Falta de SICAR y conteo físico vacío no
  bloquean ni se repiten como una lista larga.
- Las acciones masivas aparecen sólo al seleccionar al menos un producto. El
  resumen de recepción muestra artículos, cajas, piezas, costo y artículos en
  revisión.

## Historial de recepciones

- No existe borrado de remisiones.
- Se conservan filtros, paginación, permisos de solo consulta para usuarios
  autorizados y edición/Excel de pendientes para administración.
- Al seleccionar un folio se abre un modal de detalle con líneas, cantidades,
  decisiones, notas y bitácora; cerrar devuelve al listado y sus filtros sin
  recargarlo.

## Clientes y LAN

- La API de estado debe informar explícitamente cuando la instalación aún no
  está configurada. La pantalla no puede quedar en “Consultando...” ni mostrar
  “Endpoint not found” sin una explicación accionable.
- La primera pantalla explica cuál PC será la Central: es la que almacena y
  comparte Clientes. Las otras se etiquetan como Sucursales y reciben sus datos
  mediante vínculo LAN seguro. Productos, facturas y recepciones permanecen
  locales e independientes.
- Clientes muestra estado de carga, vacío, error y reintento explícitos; nunca
  una pantalla blanca. El CRUD y las compras con folio opcional siguen
  funcionando cuando la Central no está disponible y la cola pendiente se
  comunica en lenguaje sencillo.

## Arquitectura y compatibilidad

- Node conserva cálculos, reglas de proveedor/XML, permisos, persistencia,
  aprendizaje y validación. React sólo presenta metadatos calculados y envía
  decisiones explícitas del usuario.
- Se corrige el DTO de estado LAN sin exponer claves, IPs o datos internos. Un
  backend reiniciado expone la ruta actual; el frontend muestra recuperación
  clara si la versión de servidor todavía no la tiene.
- No se añaden servicios de pago, CDN ni dependencia de Internet. La LAN y la
  cola local permanecen como las implementaciones ya aprobadas.

## Criterios de aceptación

- El usuario puede configurar una Central o una Sucursal desde una instalación
  sin configurar y el estado se actualiza sin recargar ni dejar controles
  bloqueados.
- La ruta de Clientes maneja carga, error y datos vacíos de forma visible y
  recuperable.
- Una factura del historial se abre y cierra en modal preservando filtros y
  listado.
- Una recepción puede capturarse de principio a fin desde los renglones,
  incluyendo caja/piezas/cálculo, descuentos automáticos, físico opcional,
  notas, rechazo y exportación.
- Las pruebas cubren el nuevo contrato LAN, los estados de pantalla, el modal
  de historial, la visibilidad condicional de controles y la validación no
  bloqueante de SICAR/conteo físico. La compilación, pruebas y lint finalizan
  sin fallos nuevos.
