<?php
require_once '../config/db.php';

// Limpieza de buffer
while (ob_get_level()) ob_end_clean();
ini_set('display_errors', 0);

// 1. RECIBIMOS LA FECHA DEL SELECTOR
$fecha = $_POST['fecha'] ?? date('Y-m-d');
$incluirFisico = (isset($_POST['incluir_fisico']) && $_POST['incluir_fisico'] == '1');

$filename = "Ajuste_SICAR_" . date('Ymd_Hi') . ".xls";

header('Content-Type: application/vnd.ms-excel; charset=utf-8');
header("Content-Disposition: attachment; filename=\"$filename\"");

echo '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>';
?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">
    <Styles>
        <Style ss:ID="sHeader"><Font ss:Bold="1" ss:Color="#FFFFFF" /><Interior ss:Color="#4f46e5" ss:Pattern="Solid" /><Alignment ss:Horizontal="Center" /></Style>
        <Style ss:ID="sTexto"><NumberFormat ss:Format="@" /></Style>
    </Styles>
    <Worksheet ss:Name="Ajuste">
        <Table>
            <Row>
                <Cell ss:StyleID="sHeader"><Data ss:Type="String">Clave</Data></Cell>
                <Cell ss:StyleID="sHeader"><Data ss:Type="String">Cantidad</Data></Cell>
            </Row>
            <?php
            $listaFinal = [];
            $idsProcesados = []; 

            // 2. CONSULTA (Trae VENTA y CONSUMO)
            $sql = "SELECT id, codigo, clave_sicar, factor, cantidad_bultos, existencia, tipo_uso 
                    FROM historial_rapido 
                    WHERE DATE(fecha) = ? 
                    AND estatus = 1 
                    AND exportado = 0";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$fecha]);

            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $idsProcesados[] = $row['id'];

                $codigoCaja = trim($row['codigo']);
                $codigoPieza = trim($row['clave_sicar']); // Clave principal (la que descuenta stock)
                $bultos = floatval($row['cantidad_bultos']);
                $factor = floatval($row['factor']);
                $existenciaFisica = floatval($row['existencia']);
                $tipoUso = $row['tipo_uso'];

                // --- LÓGICA CORE ---

                if ($tipoUso === 'CONSUMO') {
                    // *** CASO 1: GASTO INTERNO (RESTAR) ***
                    // Calculamos el total de piezas consumidas
                    $totalConsumido = ($bultos * $factor) + $existenciaFisica;
                    
                    // Restamos directamente a la clave de la pieza
                    if ($totalConsumido > 0) {
                        $listaFinal[$codigoPieza] = ($listaFinal[$codigoPieza] ?? 0) - $totalConsumido;
                    }

                } else {
                    // *** CASO 2: INVENTARIO / VENTA (SUMAR O DESDOBLAR) ***
                    
                    // A. Manejo de Cajas (Desdoble)
                    if ($factor > 1 && $bultos > 0) {
                        // Restamos 1 al código de CAJA (porque se abrió)
                        $listaFinal[$codigoCaja] = ($listaFinal[$codigoCaja] ?? 0) - $bultos;
                        // Sumamos el contenido al código de PIEZA
                        $listaFinal[$codigoPieza] = ($listaFinal[$codigoPieza] ?? 0) + ($bultos * $factor);
                    } 
                    // B. Manejo de bultos directos (si no es caja compuesta)
                    elseif ($factor <= 1 && $bultos > 0) {
                        $listaFinal[$codigoPieza] = ($listaFinal[$codigoPieza] ?? 0) + $bultos;
                    }

                    // C. Manejo de Sueltos (Fisico)
                    if ($incluirFisico && $existenciaFisica > 0) {
                        $listaFinal[$codigoPieza] = ($listaFinal[$codigoPieza] ?? 0) + $existenciaFisica;
                    }
                }
            }

            // 3. IMPRIMIR RESULTADOS
            foreach ($listaFinal as $clave => $cant) {
                if ($cant == 0) continue;
                echo "<Row>\n";
                echo " <Cell ss:StyleID='sTexto'><Data ss:Type='String'>" . htmlspecialchars($clave) . "</Data></Cell>\n";
                echo " <Cell><Data ss:Type='Number'>{$cant}</Data></Cell>\n";
                echo "</Row>\n";
            }

            // 4. MARCAR COMO EXPORTADO
            if (!empty($idsProcesados)) {
                $idsString = implode(',', array_map('intval', $idsProcesados));
                $sqlUpdate = "UPDATE historial_rapido SET exportado = 1 WHERE id IN ($idsString)";
                $pdo->query($sqlUpdate);
            }
            ?>
        </Table>
    </Worksheet>
</Workbook>