CREATE TABLE IF NOT EXISTS `logs_auditoria` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` INT(11) NOT NULL,
  `accion` VARCHAR(255) NOT NULL,
  `detalle` TEXT DEFAULT NULL,
  `fecha` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_log_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `historial_rapido` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `codigo` varchar(50) NOT NULL,
    `clave_sicar` varchar(50) DEFAULT NULL,
    `factor` decimal(10,2) DEFAULT 1.00,
    `cantidad_bultos` decimal(10,2) DEFAULT 0.00,
    `existencia` decimal(10,2) DEFAULT 0.00,
    `tipo_uso` enum('VENTA','CONSUMO') DEFAULT 'VENTA',
    `descripcion_actual` varchar(255) DEFAULT NULL,
    `estatus` tinyint(4) DEFAULT 1,
    `exportado` tinyint(4) DEFAULT 0,
    `fecha` datetime DEFAULT current_timestamp(),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
