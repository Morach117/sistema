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

module.exports = { asyncHandler, errorHandler };
