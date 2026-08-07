CREATE TABLE IF NOT EXISTS `bodega_inventario` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `clave_sicar` VARCHAR(50) NOT NULL,
  `existencia` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `ubicacion` VARCHAR(100) DEFAULT 'Bodega Principal',
  `fecha_actualizacion` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_bodega_producto` (`clave_sicar`),
  CONSTRAINT `fk_bodega_producto` FOREIGN KEY (`clave_sicar`) REFERENCES `cat_productos` (`clave_sicar`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `bodega_movimientos` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `clave_sicar` VARCHAR(50) NOT NULL,
  `tipo` ENUM('ENTRADA','SALIDA','AJUSTE') NOT NULL,
  `cantidad` DECIMAL(10,2) NOT NULL,
  `usuario_id` INT(11) DEFAULT NULL,
  `fecha` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `notas` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_movimiento_producto` (`clave_sicar`),
  CONSTRAINT `fk_movimiento_producto` FOREIGN KEY (`clave_sicar`) REFERENCES `cat_productos` (`clave_sicar`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
