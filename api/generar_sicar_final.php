<?php
// api/generar_sicar_final.php
session_start();
require_once '../config/db.php';

// Limpieza de búfer
while (ob_get_level()) ob_end_clean();
ini_set('display_errors', 0);
error_reporting(0);

$remision_input = $_REQUEST['remision_id'] ?? '';
if (empty($remision_input)) die("Error: No se especificó la remisión.");

$stmt = $pdo->prepare("SELECT id, numero_remision FROM historial_remisiones WHERE numero_remision = ? OR id = ? LIMIT 1");
$stmt->execute([$remision_input, $remision_input]);
$rem = $stmt->fetch();
if (!$rem) die("Remisión no encontrada.");

$id_db = $rem['id'];
$remision_clean = preg_replace('/[^A-Za-z0-9\-]/', '_', $rem['numero_remision']);
$filename = "Carga_Sicar_{$remision_clean}_" . date('Y-m-d') . ".xls";

header('Content-Type: application/vnd.ms-excel; charset=utf-8');
header("Content-Disposition: attachment; filename=\"$filename\"");
header("Pragma: no-cache");
header("Expires: 0");

echo '<?xml version="1.0"?>';
echo '<?mso-application progid="Excel.Sheet"?>';
?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">
    <Styles>
        <Style ss:ID="sHeader"><Font ss:Bold="1" ss:Color="#FFFFFF" /><Interior ss:Color="#2c3e50" ss:Pattern="Solid" /><Alignment ss:Horizontal="Center" /></Style>
        <Style ss:ID="sTexto"><NumberFormat ss:Format="@" /></Style>
    </Styles>
    <Worksheet ss:Name="Carga Inventario">
        <Table>
            <Column ss:Width="150" />
            <Column ss:Width="100" />
            <Row>
                <Cell ss:StyleID="sHeader"><Data ss:Type="String">Clave</Data></Cell>
                <Cell ss:StyleID="sHeader"><Data ss:Type="String">Existencia</Data></Cell>
            </Row>
            <?php
            // Se delega la jerarquía de selección a SQL. 
            // Evaluará: clave_final -> clave_sicar -> codigo_proveedor -> SIN_CLAVE
            $sql = "SELECT 
                        COALESCE(
                            NULLIF(TRIM(clave_final), ''), 
                            NULLIF(TRIM(clave_sicar), ''), 
                            NULLIF(TRIM(codigo_proveedor), ''), 
                            'SIN_CLAVE'
                        ) AS clave_definitiva,
                        cantidad, 
                        existencia_lapiz, 
                        es_paquete, 
                        piezas_por_paquete 
                    FROM historial_items 
                    WHERE remision_id = ? 
                    ORDER BY id ASC";
                    
            $stmtItems = $pdo->prepare($sql);
            $stmtItems->execute([$id_db]);
            
            $agrupados = [];
            while ($row = $stmtItems->fetch(PDO::FETCH_ASSOC)) {
                // 1. Determinar Clave (ya resuelta desde la base de datos)
                $clave = $row['clave_definitiva'];
                
                // 2. OBTENER DATOS
                $cantidadBD = floatval($row['cantidad']);       // Ej: 250
                $fisico = floatval($row['existencia_lapiz']);   // Ej: 0
                $esPaquete = intval($row['es_paquete']);        // 1 (Sí)
                $piezasPorCaja = floatval($row['piezas_por_paquete']); // Ej: 50

                // 3. LÓGICA DE DIVISIÓN (CONVERTIR A CAJAS)
                if ($esPaquete === 1 && $piezasPorCaja > 0) {
                    $cantidadCalculada = $cantidadBD / $piezasPorCaja;
                } else {
                    $cantidadCalculada = $cantidadBD;
                }

                // 4. SUMAR CON FÍSICO
                $totalProducto = $cantidadCalculada + $fisico;

                // 5. AGRUPAR
                if (isset($agrupados[$clave])) {
                    $agrupados[$clave] += $totalProducto;
                } else {
                    $agrupados[$clave] = $totalProducto;
                }
            }

            foreach ($agrupados as $clave => $cant) {
                echo "<Row>\n";
                echo " <Cell ss:StyleID='sTexto'><Data ss:Type='String'>" . htmlspecialchars($clave) . "</Data></Cell>\n";
                echo " <Cell><Data ss:Type='Number'>" . round($cant, 2) . "</Data></Cell>\n";
                echo "</Row>\n";
            }
            ?>
        </Table>
    </Worksheet>
</Workbook>
<?php exit(); ?>