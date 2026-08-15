const REDACTED = '[REDACTED]';
const sensitiveKeys = new Set(['password', 'token', 'authorization', 'cookie']);

function redact(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (value instanceof Error) {
    return redact({
      ...Object.fromEntries(Object.entries(value)),
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: value.cause
    }, seen);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveKeys.has(key.toLowerCase()) ? REDACTED : redact(entry, seen)
    ])
  );
}

function serializeLog(entry) {
  return JSON.stringify(redact(entry));
}

function log(level, message, context = {}) {
  const serialized = serializeLog({
    timestamp: new Date().toISOString(),
    level,
    message,
    context
  });
  const writer = typeof console[level] === 'function' ? console[level] : console.log;
  writer(serialized);
}

module.exports = { log, serializeLog };
