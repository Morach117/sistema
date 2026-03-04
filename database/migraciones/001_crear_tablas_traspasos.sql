CREATE TABLE IF NOT EXISTS `traspasos` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`usuario_creador_id` INT(11) NOT NULL DEFAULT '0',
	`fecha` DATETIME NOT NULL DEFAULT current_timestamp(),
	`estado` ENUM('PENDIENTE','COMPLETADO','CANCELADO') NOT NULL DEFAULT 'PENDIENTE' COLLATE 'utf8mb4_general_ci',
	PRIMARY KEY (`id`) USING BTREE
) COLLATE='utf8mb4_general_ci' ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `traspaso_detalles` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`traspaso_id` INT(11) NOT NULL,
	`clave_sicar` VARCHAR(50) NOT NULL COLLATE 'utf8mb4_general_ci',
	`cantidad` DECIMAL(10,2) NOT NULL DEFAULT '0.00',
	PRIMARY KEY (`id`) USING BTREE,
	INDEX `traspaso_id` (`traspaso_id`) USING BTREE,
	CONSTRAINT `fk_traspaso_detalle` FOREIGN KEY (`traspaso_id`) REFERENCES `traspasos` (`id`) ON UPDATE CASCADE ON DELETE CASCADE
) COLLATE='utf8mb4_general_ci' ENGINE=InnoDB;