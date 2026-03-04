<?php
// database/auto_migrar.php

try {
    // 1. Creamos la tabla de control (si no existe) de forma silenciosa
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `_migraciones_log` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `archivo` VARCHAR(255) NOT NULL UNIQUE,
            `fecha_ejecucion` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    // 2. Buscamos archivos .sql en la carpeta de migraciones
    $carpeta_migraciones = __DIR__ . '/migraciones';
    
    if (is_dir($carpeta_migraciones)) {
        $archivos = glob($carpeta_migraciones . '/*.sql');
        
        if ($archivos) {
            sort($archivos); // Ordenar alfabéticamente (001, 002, 003...)

            foreach ($archivos as $archivo) {
                $nombre_archivo = basename($archivo);

                // 3. Verificamos si este archivo ya se ejecutó antes
                $stmt = $pdo->prepare("SELECT id FROM _migraciones_log WHERE archivo = ?");
                $stmt->execute([$nombre_archivo]);
                
                if (!$stmt->fetch()) {
                    // 4. Si NO se ha ejecutado, leemos el SQL y lo inyectamos
                    $sql = file_get_contents($archivo);
                    $pdo->exec($sql);
                    
                    // 5. Lo guardamos en la bitácora para que no vuelva a ejecutarse mañana
                    $stmtInsert = $pdo->prepare("INSERT INTO _migraciones_log (archivo) VALUES (?)");
                    $stmtInsert->execute([$nombre_archivo]);
                }
            }
        }
    }
} catch (Exception $e) {
    // Si hay un error, lo guardamos en el registro de errores de PHP, 
    // pero NO le rompemos la pantalla al empleado.
    error_log("Error crítico en auto-migración: " . $e->getMessage());
}
?>