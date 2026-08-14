function asyncHandler(handler) {
  return function wrappedAsyncHandler(req, res, next) {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}

function errorHandler(error, req, res, next) {
  const statusCode = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status
    : 500;
  const message = error.isPublic === true && typeof error.message === 'string'
    ? error.message
    : 'Internal server error';

  res.status(statusCode).json({
    error: message,
    requestId: req.requestId
  });
}

function sendInternalError(error, req, res) {
  console.error('Unhandled request error', {
    requestId: req.requestId,
    error
  });
  return errorHandler(error, req, res);
}

async function rollbackTransaction(connection, requestId) {
  if (!connection) return;
  try {
    await connection.rollback();
  } catch (error) {
    console.error('Transaction rollback failed', { requestId, error });
  }
}

function releaseConnection(connection, requestId) {
  if (!connection) return;
  try {
    connection.release();
  } catch (error) {
    console.error('Database connection release failed', { requestId, error });
  }
}

module.exports = {
  asyncHandler,
  errorHandler,
  releaseConnection,
  rollbackTransaction,
  sendInternalError
};
