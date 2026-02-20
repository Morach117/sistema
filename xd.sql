-- --------------------------------------------------------
-- Host:                         127.0.0.1
-- Server version:               10.4.32-MariaDB - mariadb.org binary distribution
-- Server OS:                    Win64
-- HeidiSQL Version:             12.14.0.7165
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Dumping database structure for importador_papeleria
CREATE DATABASE IF NOT EXISTS `importador_papeleria` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;
USE `importador_papeleria`;

-- Dumping structure for table importador_papeleria.cat_productos
CREATE TABLE IF NOT EXISTS `cat_productos` (
  `clave_sicar` varchar(50) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `codigo_barras` varchar(50) DEFAULT NULL,
  `precio_compra` decimal(10,2) DEFAULT 0.00,
  `precio_venta` decimal(10,2) DEFAULT 0.00,
  `existencia` decimal(10,2) DEFAULT 0.00,
  `fecha_actualizacion` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`clave_sicar`),
  KEY `codigo_barras` (`codigo_barras`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table importador_papeleria.historial_items
CREATE TABLE IF NOT EXISTS `historial_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `remision_id` int(11) NOT NULL,
  `codigo_proveedor` varchar(50) DEFAULT NULL,
  `clave_sicar` varchar(50) DEFAULT NULL,
  `descripcion_original` varchar(255) DEFAULT NULL,
  `cantidad` decimal(10,2) DEFAULT NULL,
  `costo_unitario` decimal(10,2) DEFAULT NULL,
  `existencia_lapiz` decimal(10,2) DEFAULT 0.00,
  `precio_venta` decimal(10,2) DEFAULT 0.00,
  `clave_final` varchar(50) DEFAULT NULL,
  `estado_item` enum('OK','REVISION') DEFAULT 'OK',
  `notas_revision` varchar(255) DEFAULT NULL,
  `stock_sistema_momento` decimal(10,2) DEFAULT 0.00,
  `es_paquete` tinyint(1) DEFAULT NULL,
  `piezas_por_paquete` decimal(10,2) DEFAULT NULL,
  `aplica_iva` tinyint(1) DEFAULT NULL,
  `iva_tasa` decimal(5,4) DEFAULT 0.0000,
  `aplica_descuento` tinyint(1) DEFAULT NULL,
  `desc_tasa` decimal(5,4) DEFAULT 0.0000,
  `total_piezas_final` decimal(10,2) DEFAULT 0.00,
  `revision_pendiente` tinyint(4) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `remision_id` (`remision_id`),
  CONSTRAINT `historial_items_ibfk_1` FOREIGN KEY (`remision_id`) REFERENCES `historial_remisiones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1064 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table importador_papeleria.historial_remisiones
CREATE TABLE IF NOT EXISTS `historial_remisiones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `numero_remision` varchar(50) NOT NULL,
  `proveedor` varchar(100) DEFAULT 'PAOLA',
  `fecha_carga` timestamp NOT NULL DEFAULT current_timestamp(),
  `total_productos` int(11) DEFAULT 0,
  `monto_total` decimal(10,2) DEFAULT 0.00,
  `estado` enum('PENDIENTE','ENVIADO','REVISION','FINALIZADO') DEFAULT 'PENDIENTE',
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero_remision` (`numero_remision`)
) ENGINE=InnoDB AUTO_INCREMENT=227 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table importador_papeleria.rel_codigos_proveedor
CREATE TABLE IF NOT EXISTS `rel_codigos_proveedor` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo_proveedor` varchar(50) NOT NULL,
  `clave_sicar` varchar(50) NOT NULL,
  `ultimo_costo` decimal(10,2) DEFAULT NULL,
  `nombre_proveedor` varchar(100) DEFAULT 'PAOLA',
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `es_paquete` tinyint(1) DEFAULT 0,
  `piezas_por_paquete` decimal(10,2) DEFAULT 1.00,
  `aplica_iva` tinyint(1) DEFAULT 1,
  `aplica_descuento` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo_proveedor` (`codigo_proveedor`)
) ENGINE=InnoDB AUTO_INCREMENT=104 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

-- Dumping structure for table importador_papeleria.usuarios
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) DEFAULT NULL,
  `usuario` varchar(50) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `rol` enum('admin','empleado') DEFAULT 'empleado',
  `activo` tinyint(4) DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuario` (`usuario`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Data exporting was unselected.

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
