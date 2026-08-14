class TraspasoError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'TraspasoError';
    this.statusCode = statusCode;
  }
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TraspasoError(`${field} debe ser un entero positivo.`, 422);
  }
  return number;
}

async function completeTraspaso({ pool, traspasoId, detalles, actorId }) {
  const transferId = positiveInteger(traspasoId, 'El traspaso');
  positiveInteger(actorId, 'El usuario');
  if (!Array.isArray(detalles) || detalles.length === 0) {
    throw new TraspasoError('Debe incluir al menos un detalle.', 422);
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [headers] = await connection.execute(
      "SELECT id FROM traspasos WHERE id = ? AND estado = 'PENDIENTE' FOR UPDATE",
      [transferId]
    );
    if (headers.length !== 1) {
      throw new TraspasoError('El traspaso no esta pendiente o ya no existe.', 409);
    }

    for (const detalle of detalles) {
      const detailId = positiveInteger(detalle?.id, 'El detalle');
      const quantity = Number(detalle?.cantidad_recibida);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new TraspasoError('La cantidad recibida debe ser un numero positivo.', 422);
      }

      const [result] = await connection.execute(
        'UPDATE traspaso_detalles SET cantidad_recibida = ? WHERE id = ? AND traspaso_id = ?',
        [quantity, detailId, transferId]
      );
      if (result.affectedRows !== 1) {
        throw new TraspasoError('Un detalle no pertenece al traspaso indicado.', 409);
      }
    }

    const [headerResult] = await connection.execute(
      "UPDATE traspasos SET estado = 'COMPLETADO' WHERE id = ? AND estado = 'PENDIENTE'",
      [transferId]
    );
    if (headerResult.affectedRows !== 1) {
      throw new TraspasoError('El traspaso cambio de estado durante la operacion.', 409);
    }

    await connection.commit();
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

module.exports = { completeTraspaso, TraspasoError };
