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
    PDO::ATTR_TIMEOUT            => 1,    // Timeout rápido para pruebas de conexión
];

// Archivo para recordar cuál fue el último puerto que funcionó correctamente
$portCacheFile = __DIR__ . '/.active_port';
$portsToTry = [3307, 3306]; // Intentamos primero el 3307 (o el que esté en caché)

// Si ya sabemos qué puerto funciona, lo ponemos como primera opción
$lastKnownPort = null;
if (file_exists($portCacheFile)) {
    $lastKnownPort = (int) file_get_contents($portCacheFile);
    if (in_array($lastKnownPort, $portsToTry)) {
        // Removerlo y ponerlo al inicio para probarlo primero
        $portsToTry = array_diff($portsToTry, [$lastKnownPort]);
        array_unshift($portsToTry, $lastKnownPort);
    }
}

$pdo = null;

// Intentar los puertos de manera inteligente
foreach ($portsToTry as $port) {
    try {
        $pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=$charset", $user, $pass, $options);
        
        // Si la conexión fue exitosa y es un puerto diferente al que teníamos guardado, actualizar el caché
        if ($lastKnownPort !== $port) {
            file_put_contents($portCacheFile, (string)$port);
        }
        
        // Conexión exitosa, salir del bucle
        break;
        
    } catch (PDOException $e) {
        // Si falla, el bucle simplemente intentará con el siguiente puerto
        continue;
    }
}

if (!$pdo) {
    // Mensaje de error profesional si la base de datos está apagada en ambos
    header('Content-Type: text/html; charset=utf-8');
    die("<div style='font-family:sans-serif; text-align:center; padding:50px;'>
            <h2 style='color:#dc3545;'>⚠️ Error de Base de Datos</h2>
            <p>No se pudo establecer conexión en los puertos 3306 ni 3307.</p>
            <p style='color:#666;'>Asegúrate de que XAMPP o MySQL esté iniciado.</p>
            <button onclick='location.reload()' style='padding:10px 20px; cursor:pointer; background:#007bff; color:white; border:none; border-radius:5px;'>Reintentar Conexión</button>
         </div>");
}
?>