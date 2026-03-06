CREATE TABLE IF NOT EXISTS `ordenes_compra` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`usuario_id` INT(11) NOT NULL,
	`proveedor_marca` VARCHAR(100) NOT NULL COLLATE 'utf8mb4_general_ci',
	`fecha_pedido` DATETIME NOT NULL DEFAULT current_timestamp(),
	`estado` ENUM('BORRADOR','PEDIDO','RECIBIDO','CANCELADO') NOT NULL DEFAULT 'PEDIDO' COLLATE 'utf8mb4_general_ci',
	`total_estimado` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
	PRIMARY KEY (`id`) USING BTREE
) COLLATE='utf8mb4_general_ci' ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `ordenes_compra_detalles` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`orden_id` INT(11) NOT NULL,
	`clave_sicar` VARCHAR(50) NOT NULL COLLATE 'utf8mb4_general_ci',
	`descripcion` VARCHAR(255) NULL DEFAULT NULL COLLATE 'utf8mb4_general_ci',
	`cantidad_pedida` DECIMAL(10,2) NOT NULL DEFAULT '1.00',
	`costo_unitario_pactado` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
	PRIMARY KEY (`id`) USING BTREE,
	INDEX `orden_id` (`orden_id`) USING BTREE,
	CONSTRAINT `fk_orden_compra` FOREIGN KEY (`orden_id`) REFERENCES `ordenes_compra` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) COLLATE='utf8mb4_general_ci' ENGINE=InnoDB;