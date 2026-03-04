<?php
// api/descargar_traspaso_sicar.php
session_start();
require_once '../config/db.php';

// Limpieza de búfer de salida para no corromper el Excel
while (ob_get_level()) ob_end_clean();
ini_set('display_errors', 0);
error_reporting(0);

$traspaso_id = $_GET['id'] ?? null;
if (!$traspaso_id) die("Error: Falta ID.");

try {
    // 1. Obtener datos de la orden (Cruzado con cat_productos)
    $sql = "SELECT td.clave_sicar as codigo, cp.descripcion, td.cantidad 
            FROM traspaso_detalles td
            LEFT JOIN cat_productos cp ON td.clave_sicar = cp.clave_sicar
            WHERE td.traspaso_id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$traspaso_id]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($items)) die("Error: Orden vacía.");

} catch (Exception $e) {
    die("Error BD: " . $e->getMessage());
}

// 2. CONFIGURAR DESCARGA
$fecha = date('Y-m-d_H-i');
$filename = "Traspaso_Sicar_Orden_{$traspaso_id}_{$fecha}.xls";

header('Content-Type: application/vnd.ms-excel; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header("Pragma: no-cache");
header("Expires: 0");

// 3. CONSTRUIR FILAS XML (Salida y Entrada)
$filas_salida = "";
$filas_entrada = "";

foreach ($items as $row) {
    $codigo = htmlspecialchars($row['codigo']);
    $cant_pos = (float)$row['cantidad'];
    
    // Si en la validación marcaron que llegaron 0, no lo ponemos en el Excel
    if ($cant_pos <= 0) continue; 
    
    $cant_neg = $cant_pos * -1;

    // --- PESTAÑA SALIDA (Negativos) ---
    $filas_salida .= "   <Row>\n";
    $filas_salida .= "    <Cell ss:StyleID='sTexto'><Data ss:Type='String'>$codigo</Data></Cell>\n";
    $filas_salida .= "    <Cell><Data ss:Type='Number'>$cant_neg</Data></Cell>\n";
    $filas_salida .= "   </Row>\n";

    // --- PESTAÑA ENTRADA (Positivos) ---
    $filas_entrada .= "   <Row>\n";
    $filas_entrada .= "    <Cell ss:StyleID='sTexto'><Data ss:Type='String'>$codigo</Data></Cell>\n";
    $filas_entrada .= "    <Cell><Data ss:Type='Number'>$cant_pos</Data></Cell>\n";
    $filas_entrada .= "   </Row>\n";
}

// 4. IMPRIMIR XML COMPLETO EXACTO AL SOLICITADO
echo '<?xml version="1.0"?>';
echo '<?mso-application progid="Excel.Sheet"?>';
?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 
 <Styles>
  <Style ss:ID="sHeader">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#435ebe" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center"/>
  </Style>
  <Style ss:ID="sTexto"><NumberFormat ss:Format="@"/></Style>
 </Styles>

 <Worksheet ss:Name="Salida Matriz (-)">
  <Table>
   <Column ss:Width="100"/><Column ss:Width="80"/>
   <Row>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">Clave</Data></Cell>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">Cantidad</Data></Cell>
   </Row>
   <?php echo $filas_salida; ?>
  </Table>
 </Worksheet>

 <Worksheet ss:Name="Entrada Sucursal (+)">
  <Table>
   <Column ss:Width="100"/><Column ss:Width="80"/>
   <Row>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">Clave</Data></Cell>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">Cantidad</Data></Cell>
   </Row>
   <?php echo $filas_entrada; ?>
  </Table>
 </Worksheet>
</Workbook>
<?php exit(); ?>