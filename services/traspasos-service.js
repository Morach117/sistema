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

const MAX_TRANSFER_LINES = 500;
const MAX_TRANSFER_KEY_LENGTH = 50;
const MAX_TRANSFER_QUANTITY = 99_999_999.99;

function positiveFiniteNumber(value, field) {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    throw new TraspasoError(`${field} debe ser un numero positivo finito.`, 422);
  }
  const number = Number(value);
  const decimalShapeValid = typeof value === 'string'
    ? /^\d+(?:\.\d{1,2})?$/.test(value.trim())
    : Math.abs(number * 100 - Math.round(number * 100)) <= 1e-7;
  if (
    !Number.isFinite(number) ||
    number <= 0 ||
    number > MAX_TRANSFER_QUANTITY ||
    !decimalShapeValid
  ) {
    throw new TraspasoError(
      `${field} debe ser positivo, no mayor a ${MAX_TRANSFER_QUANTITY} y usar maximo 2 decimales.`,
      422
    );
  }
  return number;
}

function validateUniqueDetailIds(detalles) {
  if (!Array.isArray(detalles) || detalles.length === 0 || detalles.length > MAX_TRANSFER_LINES) {
    throw new TraspasoError(`Los detalles deben contener entre 1 y ${MAX_TRANSFER_LINES} lineas.`, 422);
  }
  const ids = detalles.map((detalle) => positiveInteger(detalle?.id, 'El detalle'));
  if (new Set(ids).size !== ids.length) {
    throw new TraspasoError('No se permiten detalles duplicados.', 422);
  }
  return ids;
}

function validateTransferProducts(productos) {
  if (!Array.isArray(productos) || productos.length === 0 || productos.length > MAX_TRANSFER_LINES) {
    throw new TraspasoError(`Los productos deben contener entre 1 y ${MAX_TRANSFER_LINES} lineas.`, 422);
  }
  const seen = new Set();
  return productos.map((producto) => {
    const clave = typeof producto?.id === 'string' ? producto.id.trim() : '';
    const normalizedKey = clave.toUpperCase();
    const cantidad = positiveFiniteNumber(producto?.cantidad, 'Cada cantidad');
    if (!clave || clave.length > MAX_TRANSFER_KEY_LENGTH) {
      throw new TraspasoError('Cada producto requiere una clave valida.', 422);
    }
    if (seen.has(normalizedKey)) {
      throw new TraspasoError('No se permiten claves de producto duplicadas.', 422);
    }
    seen.add(normalizedKey);
    return { id: clave, cantidad };
  });
}

async function completeTraspaso({ pool, traspasoId, detalles, actorId }) {
  const transferId = positiveInteger(traspasoId, 'El traspaso');
  positiveInteger(actorId, 'El usuario');
  const submittedIds = validateUniqueDetailIds(detalles);
  const normalizedDetails = detalles.map((detalle) => ({
    id: positiveInteger(detalle?.id, 'El detalle'),
    cantidad_recibida: positiveFiniteNumber(detalle?.cantidad_recibida, 'La cantidad recibida')
  }));

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

    const [persistedDetails] = await connection.execute(
      'SELECT id FROM traspaso_detalles WHERE traspaso_id = ? ORDER BY id FOR UPDATE',
      [transferId]
    );
    const persistedIds = persistedDetails.map(({ id }) => Number(id));
    const submittedSorted = [...submittedIds].sort((left, right) => left - right);
    if (
      persistedIds.length !== submittedSorted.length ||
      persistedIds.some((id, index) => id !== submittedSorted[index])
    ) {
      throw new TraspasoError('Las lineas enviadas no coinciden con todos los detalles persistidos.', 409);
    }

    for (const detalle of normalizedDetails) {
      const detailId = detalle.id;
      const quantity = detalle.cantidad_recibida;

      const [result] = await connection.execute(
        'UPDATE traspaso_detalles SET cantidad = ? WHERE id = ? AND traspaso_id = ?',
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

module.exports = {
  completeTraspaso,
  MAX_TRANSFER_LINES,
  TraspasoError,
  validateTransferProducts,
  validateUniqueDetailIds
};
