<?php
// crear_usuarios.php
// Ajusta la ruta si tu archivo db.php está en otro lado
require 'config/db.php'; 

try {
    echo "<h3>Iniciando creación de usuarios...</h3>";

    // 1. Limpiar la tabla (Opcional: quítalo si no quieres borrar los existentes)
    $pdo->exec("TRUNCATE TABLE usuarios");
    echo "✔ Tabla de usuarios limpiada.<br>";

    // 2. Configuración del ADMIN
    $userAdmin = 'admin';
    $passAdmin = 'morach117'; // Tu contraseña real
    $hashAdmin = password_hash($passAdmin, PASSWORD_DEFAULT); // Encriptación segura

    // 3. Configuración del EMPLEADO (Para pruebas)
    $userEmp = 'empleado';
    $passEmp = '12345';
    $hashEmp = password_hash($passEmp, PASSWORD_DEFAULT);

    // 4. Insertar en Base de Datos
    $sql = "INSERT INTO usuarios (nombre, usuario, password, rol, activo) VALUES 
            (:nombre, :user, :pass, :rol, 1)";
    
    $stmt = $pdo->prepare($sql);

    // Crear Admin
    $stmt->execute([
        ':nombre' => 'Administrador Principal',
        ':user'   => $userAdmin,
        ':pass'   => $hashAdmin,
        ':rol'    => 'admin'
    ]);
    echo "✔ Usuario <b>admin</b> creado exitosamente.<br>";

    // Crear Empleado
    $stmt->execute([
        ':nombre' => 'Vendedor de Mostrador',
        ':user'   => $userEmp,
        ':pass'   => $hashEmp,
        ':rol'    => 'empleado'
    ]);
    echo "✔ Usuario <b>empleado</b> creado exitosamente.<br>";

    echo "<hr><h2 style='color:green'>¡Listo! Ya puedes iniciar sesión.</h2>";
    echo "<a href='index.php'>Ir al Login</a>";

} catch (PDOException $e) {
    echo "<h2 style='color:red'>Error: " . $e->getMessage() . "</h2>";
}
?>