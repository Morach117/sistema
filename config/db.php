<?php
// config/db.php

$host = '127.0.0.1'; // Usar IP es más rápido que 'localhost' en Windows
$db   = 'importador_papeleria';
$user = 'root';
$pass = ''; 
$charset = 'utf8mb4';

/**
 * CONFIGURACIÓN PARA VELOCIDAD INSTANTÁNEA
 */
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
    PDO::ATTR_PERSISTENT         => true, // Mantiene la conexión abierta para clics rápidos
    PDO::ATTR_TIMEOUT            => 1,    // Timeout de 1 segundo
];

try {
    /**
     * PASO 1: Intentar el puerto 3306 (Tu equipo de desarrollo)
     */
    $pdo = new PDO("mysql:host=$host;port=3306;dbname=$db;charset=$charset", $user, $pass, $options);
} 
catch (PDOException $e) {
    try {
        /**
         * PASO 2: Si el 3306 falla, intentar el 3307 (Tu equipo de operación)
         * El salto ocurre en milisegundos.
         */
        $pdo = new PDO("mysql:host=$host;port=3307;dbname=$db;charset=$charset", $user, $pass, $options);
    } 
    catch (PDOException $e2) {
        // Mensaje de error profesional si la base de datos está apagada en ambos
        header('Content-Type: text/html; charset=utf-8');
        die("<div style='font-family:sans-serif; text-align:center; padding:50px;'>
                <h2 style='color:#dc3545;'>⚠️ Error de Base de Datos</h2>
                <p>No se pudo establecer conexión en los puertos 3306 ni 3307.</p>
                <p style='color:#666;'>Asegúrate de que XAMPP o MySQL esté iniciado.</p>
                <button onclick='location.reload()' style='padding:10px 20px; cursor:pointer; background:#007bff; color:white; border:none; border-radius:5px;'>Reintentar Conexión</button>
             </div>");
    }
}
?>