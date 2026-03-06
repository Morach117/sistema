CREATE TABLE IF NOT EXISTS `estadisticas_ventas` (
	`clave_sicar` VARCHAR(50) NOT NULL COLLATE 'utf8mb4_general_ci',
	`cantidad_vendida` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
	PRIMARY KEY (`clave_sicar`) USING BTREE
) COLLATE='utf8mb4_general_ci' ENGINE=InnoDB;