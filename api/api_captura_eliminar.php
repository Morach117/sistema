<?php
session_start();
require_once '../config/db.php';
// Soft Delete (Marcamos estatus 0 en lugar de borrar)
if(isset($_POST['id'])){
    $stmt = $pdo->prepare("UPDATE historial_rapido SET estatus = 0 WHERE id = ?");
    $stmt->execute([$_POST['id']]);
}
?>