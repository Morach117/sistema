const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { authorize, denyAccess } = require('../middleware/authorize');
const { sendInternalError } = require('../middleware/errors');
const { log } = require('../utils/logger');

router.use(authMiddleware);

// Verificar (Buscar) un código
router.post('/verificar', authorize({ module: 'captura', action: 'read' }), async (req, res) => {
    const { codigo } = req.body;
    if (!codigo) return res.status(400).json({ error: 'Código vacío' });

    try {
        let baseMatch = null;

        // 1. Buscar en configuracion_cajas (Prioridad 1: Memoria / Aprendizaje)
        const sqlCaja = `SELECT r.clave_sicar, r.cantidad_unidades as factor, r.descripcion, r.modo_preferido 
                         FROM configuracion_cajas r
                         WHERE r.codigo_barras = ? AND r.estado = 'ACTIVO'`;
        const [prodsRel] = await pool.execute(sqlCaja, [codigo]);

        if (prodsRel.length > 0) {
            const c = prodsRel[0];
            const [s] = await pool.execute('SELECT descripcion FROM cat_productos WHERE clave_sicar = ?', [c.clave_sicar]);
            baseMatch = {
                clave_sicar: c.clave_sicar,
                descripcion_caja: s[0]?.descripcion ? `CAJA: ${s[0].descripcion}` : ('Caja de ' + c.clave_sicar),
                factor: parseFloat(c.factor) || 1,
                tipo: 'EMPAQUE',
                modo_preferido: c.modo_preferido || 'VENTA'
            };
        }

        // 2. Buscar en cat_productos directo (Prioridad 2: Catálogo Oficial)
        if (!baseMatch) {
            const sqlCat = `SELECT clave_sicar, descripcion 
                            FROM cat_productos 
                            WHERE clave_sicar = ? OR codigo_barras = ? LIMIT 1`;
            const [prodsDirectos] = await pool.execute(sqlCat, [codigo, codigo]);

            if (prodsDirectos.length > 0) {
                baseMatch = {
                    clave_sicar: prodsDirectos[0].clave_sicar,
                    descripcion_caja: prodsDirectos[0].descripcion,
                    factor: 1,
                    tipo: 'NUEVO_CATALOGO',
                    modo_preferido: 'VENTA'
                };
            }
        }

        // 3. Buscar en rel_codigos_proveedor (Prioridad 3: Relaciones antiguas)
        if (!baseMatch) {
            const sqlRel = `SELECT r.clave_sicar, c.descripcion 
                            FROM rel_codigos_proveedor r
                            JOIN cat_productos c ON r.clave_sicar = c.clave_sicar
                            WHERE r.codigo_proveedor = ? LIMIT 1`;
            const [relLegacy] = await pool.execute(sqlRel, [codigo]);

            if (relLegacy.length > 0) {
                baseMatch = {
                    clave_sicar: relLegacy[0].clave_sicar,
                    descripcion_caja: relLegacy[0].descripcion,
                    factor: 1,
                    tipo: 'NUEVO_CATALOGO',
                    modo_preferido: 'VENTA'
                };
            }
        }

        // 4. Si no existe en ningún lado
        if (!baseMatch) {
            return res.json({
                success: true,
                multiple: false,
                match: {
                    clave_sicar: codigo,
                    descripcion_caja: 'PRODUCTO NUEVO (SIN REGISTRO)',
                    factor: 1,
                    tipo: 'NUEVO_DESCONOCIDO',
                    modo_preferido: 'VENTA'
                }
            });
        }

        // --- BÚSQUEDA DE VARIANTES GLOBALES PARA EL SUELTO ---
        const [variantes] = await pool.execute('SELECT * FROM producto_variantes WHERE clave_sicar = ? AND estado = "ACTIVO"', [baseMatch.clave_sicar]);

        if (variantes.length > 0) {
            let matches = [];
            
            // Agregar la presentación original si es que viene de un empaque o tiene factor definido
            if (baseMatch.tipo === 'EMPAQUE') {
                matches.push({
                    clave_sicar: baseMatch.clave_sicar,
                    descripcion_caja: `${baseMatch.descripcion_caja} (Factor Original: ${baseMatch.factor} pz)`,
                    nombre_corto: `Original (${baseMatch.factor} pz)`,
                    factor: baseMatch.factor,
                    tipo: 'EMPAQUE',
                    modo_preferido: baseMatch.modo_preferido
                });
            } else {
                matches.push({
                    ...baseMatch,
                    descripcion_caja: `${baseMatch.descripcion_caja} (Factor Original: 1 pz)`,
                    nombre_corto: `Suelto Original (1 pz)`
                });
            }

            // Agregar todas las variantes
            for (let v of variantes) {
                matches.push({
                    clave_sicar: baseMatch.clave_sicar,
                    descripcion_caja: `${baseMatch.descripcion_caja} ➔ Variante: ${v.nombre}`,
                    nombre_corto: `Variante: ${v.nombre}`,
                    factor: parseFloat(v.factor) || 1,
                    tipo: 'EMPAQUE',
                    modo_preferido: baseMatch.modo_preferido
                });
            }

            return res.json({ success: true, matches: matches, multiple: true });
        } else {
            return res.json({ success: true, match: baseMatch, multiple: false });
        }

    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Agregar Variante
router.post('/agregar_variante', authorize({ module: 'captura', action: 'write' }), async (req, res) => {
    const { clave_sicar, descripcion, factor } = req.body;
    try {
        await pool.execute(
            'INSERT INTO producto_variantes (clave_sicar, nombre, factor, estado) VALUES (?, ?, ?, "ACTIVO")',
            [clave_sicar, descripcion, factor]
        );
        
        try {
            await pool.execute(
                `INSERT INTO logs_sistema (usuario_id, accion, modulo, detalles, fecha) VALUES (?, 'VARIANTE', 'CAPTURA', ?, NOW())`,
                [req.user?.id || 1, `Nueva variante global para suelto ${clave_sicar}: ${descripcion} (${factor}pz)`]
            );
        } catch (error) {
            log('error', 'Failed to record VARIANTE audit event', {
                requestId: req.requestId,
                error
            });
        }

        res.json({ success: true });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Revincular (Corregir vínculo)
router.post('/revincular', authorize({ module: 'captura', action: 'write' }), async (req, res) => {
    const { codigo_caja, nueva_clave_sicar, nuevo_factor } = req.body;
    try {
        const factor = parseInt(nuevo_factor) || 1;
        
        // Obtener vínculo anterior para log
        const [antiguo] = await pool.execute('SELECT clave_sicar, cantidad_unidades as piezas_por_paquete FROM configuracion_cajas WHERE codigo_barras = ?', [codigo_caja]);
        
        // Actualizar
        await pool.execute(
            'UPDATE configuracion_cajas SET clave_sicar = ?, cantidad_unidades = ? WHERE codigo_barras = ?',
            [nueva_clave_sicar, factor, codigo_caja]
        );

        // Registro en logs_sistema
        const notas = "Re-vinculación: " + (antiguo.length > 0 ? `De ${antiguo[0].clave_sicar} (${antiguo[0].piezas_por_paquete}pz) a ` : "Nuevo a ") + `${nueva_clave_sicar} (${factor}pz)`;
        try {
            await pool.execute(
                `INSERT INTO logs_sistema (usuario_id, accion, modulo, detalles, fecha) VALUES (?, 'REVINCULAR', 'CAPTURA', ?, NOW())`,
                [req.user?.id || 1, notas]
            );
        } catch (error) {
            log('error', 'Failed to record REVINCULAR audit event', {
                requestId: req.requestId,
                error
            });
        }

        res.json({ success: true });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Guardar captura
router.post('/guardar', authorize({ module: 'captura', action: 'write' }), async (req, res) => {
    const { 
        codigo, existencia, bultos, factor, clave_sicar, descripcion_actual, tipo_uso, registrar_nuevo 
    } = req.body;

    try {
        const usuario_id = req.user?.id || 1;
        const numFactor = parseFloat(factor) || 1;
        const total_unidades = (parseFloat(bultos) || 0) * numFactor + (parseFloat(existencia) || 0);
        
        // APRENDIZAJE / ACTUALIZACIÓN EN configuracion_cajas
        if (registrar_nuevo) {
            const [check] = await pool.execute("SELECT id FROM configuracion_cajas WHERE codigo_barras = ?", [codigo]);
            if (check.length === 0) {
                await pool.execute(
                    "INSERT INTO configuracion_cajas (codigo_barras, clave_sicar, cantidad_unidades, descripcion, estado, modo_preferido) VALUES (?, ?, ?, ?, 'ACTIVO', ?)",
                    [codigo, clave_sicar, numFactor, descripcion_actual, tipo_uso || 'VENTA']
                );
                try {
                    await pool.execute(
                        "INSERT INTO logs_sistema (usuario_id, accion, modulo, detalles, fecha) VALUES (?, 'VINCULAR', 'CAPTURA', ?, NOW())",
                        [usuario_id, `Nuevo código vinculado: ${codigo} -> ${clave_sicar} (${numFactor} pz)`]
                    );
                } catch (error) {
                    log('error', 'Failed to record VINCULAR audit event', {
                        requestId: req.requestId,
                        error
                    });
                }
            }
        } else {
            // Actualizar modo_preferido
            await pool.execute("UPDATE configuracion_cajas SET modo_preferido = ? WHERE codigo_barras = ?", [tipo_uso || 'VENTA', codigo]);
        }

        const sql = `INSERT INTO historial_rapido 
            (usuario_id, codigo, clave_sicar, factor, cantidad_bultos, existencia, total_unidades, tipo_uso, descripcion_cache, estatus, fecha) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`;
        
        await pool.execute(sql, [
            usuario_id, codigo, clave_sicar, numFactor, bultos || 0, existencia || 0, total_unidades,
            tipo_uso || 'VENTA', descripcion_actual || 'Producto Manual'
        ]);

        // Audit log insertion
        try {
            await pool.execute(
                `INSERT INTO logs_auditoria (usuario_id, accion, detalle, fecha) VALUES (?, 'CAPTURA', ?, NOW())`,
                [usuario_id, `Captura ${tipo_uso || 'VENTA'}: ${descripcion_actual} (${codigo}) - Total: ${total_unidades} pzs`]
            );
        } catch (e) {
            log('error', 'Failed to record CAPTURA audit event', {
                requestId: req.requestId,
                error: e
            });
        }

        res.json({ success: true });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Historial (últimos registros)
router.get('/historial', authorize({ module: 'captura', action: 'read' }), async (req, res) => {
    try {
        const sql = `SELECT h.*, COALESCE(u.nombre, u.usuario, 'Sistema') as capturista 
                     FROM historial_rapido h
                     LEFT JOIN usuarios u ON h.usuario_id = u.id
                     WHERE DATE(h.fecha) = CURDATE() AND h.estatus = 1 
                     ORDER BY h.id DESC LIMIT 50`;
        const [rows] = await pool.execute(sql);
        res.json({ success: true, data: rows });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Admin: Listar capturas
router.get('/admin_list', authorize({ module: 'auditoria', action: 'read' }), async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    const { fecha, todos_pendientes } = req.query; // YYYY-MM-DD
    try {
        let sql = `
            SELECT h.*, COALESCE(u.nombre, u.usuario, 'Sistema') as capturista 
            FROM historial_rapido h
            LEFT JOIN usuarios u ON h.usuario_id = u.id
            WHERE h.estatus = 1
        `;
        let params = [];
        
        if (todos_pendientes === '1') {
            sql += ` AND h.exportado = 0`;
        } else if (fecha) {
            sql += ` AND DATE(h.fecha) = ?`;
            params.push(fecha);
        } else {
            sql += ` AND DATE(h.fecha) = CURDATE()`;
        }
        
        sql += ` ORDER BY h.fecha DESC`;
        
        const [rows] = await pool.execute(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Admin: Marcar como exportados
router.post('/marcar_exportados', authorize({ module: 'auditoria', action: 'write' }), async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.json({ success: true });

    try {
        const placeholders = ids.map(() => '?').join(',');
        await pool.execute(`UPDATE historial_rapido SET exportado = 1 WHERE id IN (${placeholders})`, ids);
        res.json({ success: true });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Admin o Dueño: Descartar / Eliminar registro
router.post('/eliminar', authorize({ module: 'captura', action: 'write' }), async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });
    try {
        const [rows] = await pool.execute('SELECT usuario_id FROM historial_rapido WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
        
        if (req.user.rol !== 'admin' && rows[0].usuario_id !== req.user.id) {
            return denyAccess(res);
        }
        
        await pool.execute('UPDATE historial_rapido SET estatus = 0 WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Admin: Registrar log de descarga
router.post('/registrar_descarga', authorize({ module: 'auditoria', action: 'write' }), async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    const { fecha_captura, tipo_exportacion, total_registros, nombre_archivo } = req.body;
    try {
        await pool.execute(
            `INSERT INTO historial_descargas_captura (usuario_id, fecha_captura, tipo_exportacion, total_registros, nombre_archivo, fecha_descarga) 
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [req.user.id || 1, fecha_captura, tipo_exportacion || 'SICAR', total_registros || 0, nombre_archivo || 'Auditoria.xlsx']
        );

        // Registro en logs_sistema
        try {
            await pool.execute(
                `INSERT INTO logs_sistema (usuario_id, accion, modulo, detalles, fecha) VALUES (?, 'DESCARGAR', 'AUDITORIA', ?, NOW())`,
                [req.user.id || 1, `Exportación ${tipo_exportacion} (${total_registros} registros)`]
            );
        } catch (error) {
            log('error', 'Failed to record DESCARGAR audit event', {
                requestId: req.requestId,
                error
            });
        }

        res.json({ success: true });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Admin: Listar historial de descargas
router.get('/historial_descargas', authorize({ module: 'auditoria', action: 'read' }), async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    try {
        const sql = `
            SELECT hd.*, u.usuario as capturista 
            FROM historial_descargas_captura hd
            LEFT JOIN usuarios u ON hd.usuario_id = u.id
            ORDER BY hd.fecha_descarga DESC
            LIMIT 50
        `;
        const [rows] = await pool.execute(sql);
        res.json({ success: true, data: rows });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Admin: Ver logs globales del sistema (logs_sistema)
router.get('/logs_sistema', authorize({ module: 'auditoria', action: 'read' }), async (req, res) => {
    if (req.user.rol !== 'admin') return denyAccess(res);
    try {
        const sql = `
            SELECT l.id, l.accion, l.modulo, l.detalles, l.fecha, u.nombre as usuario
            FROM logs_sistema l
            LEFT JOIN usuarios u ON l.usuario_id = u.id
            ORDER BY l.fecha DESC
            LIMIT 200
        `;
        const [rows] = await pool.execute(sql);
        res.json({ success: true, data: rows });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Obtener factores conocidos (piezas por paquete) de un producto
router.get('/factores/:clave', authorize({ module: 'captura', action: 'read' }), async (req, res) => {
    try {
        const sql = `SELECT DISTINCT cantidad_unidades as factor FROM configuracion_cajas WHERE clave_sicar = ? AND estado = 'ACTIVO' ORDER BY cantidad_unidades ASC`;
        const [rows] = await pool.execute(sql, [req.params.clave]);
        const factores = rows.map(r => r.factor).filter(f => f > 1);
        res.json({ success: true, data: factores });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

// Obtener variantes (CRUD)
router.get('/variantes/:clave_sicar', authorize({ module: 'captura', action: 'read' }), async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM producto_variantes WHERE clave_sicar = ? AND estado = "ACTIVO"', [req.params.clave_sicar]);
        res.json({ success: true, data: rows });
    } catch (e) {
        return sendInternalError(e, req, res);
    }
});

// Eliminar variante (CRUD)
router.delete('/variante/:id', authorize({ module: 'captura', action: 'write' }), async (req, res) => {
    try {
        await pool.execute('DELETE FROM producto_variantes WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        return sendInternalError(e, req, res);
    }
});

// Corregir un registro en historial y su vínculo
router.post('/corregir_captura', authorize({ module: 'auditoria', action: 'write' }), async (req, res) => {
    const { id_historial, codigo_barras, nueva_clave_sicar, nuevo_factor } = req.body;
    if (!id_historial || !codigo_barras || !nueva_clave_sicar) {
        return res.status(400).json({ error: 'Faltan datos' });
    }
    
    try {
        const factor = parseInt(nuevo_factor) || 1;
        
        // 1. Obtener la nueva descripción desde cat_productos
        const [prodRows] = await pool.execute('SELECT descripcion FROM cat_productos WHERE clave_sicar = ?', [nueva_clave_sicar]);
        const nueva_desc = prodRows.length > 0 ? ('CAJA: ' + prodRows[0].descripcion) : ('Producto ' + nueva_clave_sicar);
        
        // 2. Actualizar vínculo en configuracion_cajas para el futuro
        const [antiguo] = await pool.execute('SELECT clave_sicar FROM configuracion_cajas WHERE codigo_barras = ?', [codigo_barras]);
        await pool.execute(
            'UPDATE configuracion_cajas SET clave_sicar = ?, cantidad_unidades = ?, descripcion = ? WHERE codigo_barras = ?',
            [nueva_clave_sicar, factor, nueva_desc, codigo_barras]
        );
        
        // 3. Obtener el historial para recalcular el total de unidades
        const [histRows] = await pool.execute('SELECT cantidad_bultos, existencia FROM historial_rapido WHERE id = ?', [id_historial]);
        if (histRows.length === 0) return res.status(404).json({ error: 'Historial no encontrado' });
        
        const bultos = parseFloat(histRows[0].cantidad_bultos) || 0;
        const existencia = parseFloat(histRows[0].existencia) || 0;
        const nuevo_total = (bultos * factor) + existencia;
        
        // 4. Actualizar el historial_rapido
        await pool.execute(
            'UPDATE historial_rapido SET clave_sicar = ?, factor = ?, descripcion_cache = ?, total_unidades = ? WHERE id = ?',
            [nueva_clave_sicar, factor, nueva_desc, nuevo_total, id_historial]
        );

        // 5. Log
        const notas = `Captura corregida: de ${antiguo.length > 0 ? antiguo[0].clave_sicar : '?'} a ${nueva_clave_sicar}`;
        try {
            await pool.execute(
                `INSERT INTO logs_sistema (usuario_id, accion, modulo, detalles, fecha) VALUES (?, 'CORREGIR', 'CAPTURA', ?, NOW())`,
                [req.user?.id || 1, notas]
            );
        } catch (error) {
            log('error', 'Failed to record CORREGIR audit event', {
                requestId: req.requestId,
                error
            });
        }

        res.json({ success: true, nueva_desc, nuevo_total, nueva_clave_sicar, factor });
    } catch (error) {
        return sendInternalError(error, req, res);
    }
});

module.exports = router;
