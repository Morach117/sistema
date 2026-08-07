CREATE TABLE IF NOT EXISTS `logs_sistema` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `usuario_id` int(11) DEFAULT NULL,
  `accion` varchar(50) NOT NULL,
  `modulo` varchar(50) NOT NULL,
  `detalles` text DEFAULT NULL,
  `fecha` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
