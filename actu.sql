DROP TABLE IF EXISTS `historial_rapido`;

CREATE TABLE `historial_rapido` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) NOT NULL,
  `codigo` varchar(50) NOT NULL,
  `clave_sicar` varchar(50) DEFAULT NULL,
  `descripcion_cache` varchar(255) DEFAULT NULL,
  
  -- CANTIDADES (Lo importante para sueltos vs cajas)
  `cantidad_bultos` decimal(10,2) NOT NULL DEFAULT 0.00, -- Cuántas cajas cerradas
  `factor` int(11) NOT NULL DEFAULT 1,                   -- Cuántas piezas trae la caja
  `existencia` decimal(10,2) NOT NULL DEFAULT 0.00,      -- Cuántas piezas SUELTAS contaste
  `total_unidades` decimal(10,2) NOT NULL DEFAULT 0.00,  -- La suma total matemática
  
  -- CONTROLES INTELIGENTES
  `fecha` datetime NOT NULL DEFAULT current_timestamp(),
  `estatus` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=Valido, 0=Borrado',
  `tipo_uso` enum('VENTA','CONSUMO') NOT NULL DEFAULT 'VENTA' COMMENT 'Para saber si es gasto',
  `exportado` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Para que no se descargue doble',
  
  PRIMARY KEY (`id`),
  KEY `idx_fecha` (`fecha`),
  KEY `idx_estatus` (`estatus`),
  KEY `idx_exportado` (`exportado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `configuracion_cajas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo_barras` varchar(50) NOT NULL,  -- El código que escaneas
  `clave_sicar` varchar(50) NOT NULL,    -- Tu clave interna corta
  `cantidad_unidades` decimal(10,2) NOT NULL DEFAULT 1.00 COMMENT 'Si es 1, es SUELTO. Si es >1, es CAJA',
  `descripcion` varchar(255) DEFAULT NULL,
  `estado` enum('ACTIVO','INACTIVO') DEFAULT 'ACTIVO',
  
  -- MEMORIA INTELIGENTE (Lo nuevo)
  `modo_preferido` enum('VENTA','CONSUMO') DEFAULT 'VENTA', -- Recuerda si prefieres usarlo para gasto
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo_barras` (`codigo_barras`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;