# Permisos de captura para empleados

## Objetivo

Limitar la recepción de un empleado a la captura operativa, sin exponer precios ni acciones administrativas, y aclarar la validación visual de SICAR.

## Alcance de empleado

Un usuario no administrador con permiso de Recepciones puede consultar una recepción pendiente y modificar únicamente:

- código SICAR;
- cantidad facturada, para corregir faltantes reales de proveedor;
- conteo físico;
- indicador de caja y piezas por caja.

No recibe ni puede solicitar por API costos, descuentos, IVA, precio de compra, sugerencias de 20/30 %, precio de venta o ganancia. Tampoco puede cambiar proveedor, importar XML/CSV, exportar Excel, finalizar, eliminar artículos, enviar a rectificación, consultar notas administrativas ni editar historial.

## Alcance de administrador

Un administrador conserva la recepción completa: precios, descuento e IVA, proveedor, carga y reimportación, Excel, eliminación, finalización, notas, historial y rectificación/re-conteo. Sólo la aceptación de una rectificación continúa siendo administrativa.

## Autorización

La pantalla oculta acciones no autorizadas, pero el servidor es la fuente de verdad. Las rutas de Recepciones distinguirán la captura operativa de las mutaciones administrativas. La respuesta de detalle para empleados se reducirá para no incluir los valores que alimentan precios, descuentos o ganancia.

## SICAR

Cuando el código exacto existe en catálogo pero su descripción es distinta de la descripción importada, se mostrará un aviso informativo, no de error: `El código <clave> pertenece a: <descripción de catálogo>`. El código seguirá disponible para que el operador confirme visualmente que escogió el producto correcto.

## Seguridad y pruebas

Las pruebas comprobarán tanto la interfaz como las rutas: el empleado no ve zonas ni botones administrativos, el API rechaza sus mutaciones administrativas, y la respuesta no entrega datos de precios. También se cubrirá el texto de pertenencia SICAR y la corrección de cantidad facturada por empleado.
