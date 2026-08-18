# Recepción limpia y vínculo LAN guiado

## Objetivo

Hacer que la captura de Recepciones sea legible en una pantalla de 1366×768 y que el vínculo de sucursales descubra automáticamente a la Central de la LAN, usando el código únicamente para autorizarla.

## Alcance de Recepciones

- Eliminar la selección masiva y las casillas de selección de cada renglón. Con ello desaparecen el contador “0 seleccionados” y las acciones masivas.
- Eliminar el bloque desplegable de acciones secundarias del renglón: descuento manual, nota interna, faltante, reclamación y compras previas. Esta decisión aplica la indicación de retirar el segundo bloque mostrado.
- Mantener la eliminación disponible sólo mediante un botón de icono de papelera con etiqueta accesible; no se mostrará el texto “Eliminar artículo”.
- Mantener en el renglón los datos necesarios para capturar: cantidad XML, producto/SICAR, físico/caja, costo, descuento automático, precios sugeridos 20% y 30%, precio actual y ganancia.
- Usar cuatro columnas equilibradas en escritorio, con mínimos de ancho y ajuste de texto. Si la ventana es menor que 1366 px, la tarjeta se apila sin recortar contenido. Los nombres largos se muestran en dos líneas con título completo al pasar el cursor, nunca en una sola línea truncada como única forma de leerlos.
- El descuento se mantiene automático según XML o regla de proveedor. Al no aplicar, se muestra una frase breve y no se requiere captura manual.

## Alcance de LAN

### Flujo para quien opera

1. En una instalación nueva se elige una vez “Central” o “Sucursal” y se le da un nombre visible.
2. Al guardar, los servicios LAN se inician de inmediato, sin esperar el reintento exponencial de hasta 60 segundos.
3. En una Sucursal, la pantalla busca automáticamente anuncios de Centrales de la misma subred y muestra una lista simple con el nombre de la Central encontrada y el estado “pendiente de autorización”. No muestra direcciones IP.
4. La persona elige la Central detectada y pega el código temporal generado por la Central. Sólo un anuncio cuya identidad firmada corresponda al código puede vincularse.
5. Si no se detecta ninguna Central, la pantalla explica que ambas instalaciones deben tener el sistema iniciado, estar en la misma red local y tener una identidad configurada; permite volver a buscar.

### Seguridad y datos

- La detección local se basa en difusión UDP dirigida en la misma subred, no en una IP persistente ni el nombre de Windows.
- Una Central puede anunciar públicamente en la LAN sólo su nombre visible, huella criptográfica y puerto transitorio. No anuncia claves privadas ni una identidad de sucursal.
- El código firmado sigue siendo obligatorio para crear un vínculo o sincronizar. Encontrar una Central no concede acceso.
- El nombre de la Central se obtiene de la configuración local y se firma dentro del anuncio; la lista de candidatos no es una fuente de confianza hasta validar el código.

## Causa confirmada y corrección

Los registros del servidor muestran que `client-sync-service` y `client-discovery-service` repiten “No hay identidad LAN configurada”. Los dos servicios inician antes de que el operador elija Central/Sucursal y luego esperan hasta 60 segundos entre reintentos. La corrección es reiniciar ambos servicios inmediatamente tras una configuración válida, además de mostrar el estado de configuración y la búsqueda automática en la interfaz.

## Manejo de errores

- Si el puerto UDP no puede usarse o la Central no responde, se conserva el modo local y aparece una explicación accionable, nunca un mensaje técnico crudo.
- Un código vencido, modificado o de otra Central no cambia la configuración local y muestra que debe generarse uno nuevo en la Central.
- La Central detectada desaparece de la lista si deja de anunciarse; un vínculo ya confirmado no depende de que la IP siga igual.

## Pruebas

- Pruebas de servicio para que el anuncio incluya el nombre visible, para que una Sucursal descubra un candidato no confiable y para que la validación con código sea obligatoria.
- Prueba de ruta para confirmar que guardar Central/Sucursal reactiva los servicios LAN inmediatamente.
- Pruebas de interfaz que validen: lista de Central detectada antes del código, mensaje de ausencia entendible, y que el vínculo no se habilite sin código válido.
- Pruebas de Recepciones que garanticen que no hay selección masiva ni panel secundario, que la papelera mantiene nombre accesible y que la tarjeta no use columnas que recorten sus datos a 1366 px.
