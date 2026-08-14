function loadEnv(source = process.env) {
  const jwtSecret = source.JWT_SECRET;
  if (source.NODE_ENV !== 'test' && (!jwtSecret || jwtSecret.length < 32)) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  return {
    env: source.NODE_ENV || 'development',
    port: Number(source.PORT || 3000),
    jwtSecret
  };
}

module.exports = { loadEnv };
