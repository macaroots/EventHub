// Config – reads environment variables; fails fast if critical ones are missing.

function require(key) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required environment variable: ${key}`);
  return v;
}

function optional(key, fallback) {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optional('PORT', '3001'), 10),
  env: optional('NODE_ENV', 'development'),

  db: {
    url: require('DATABASE_URL'),
  },

  jwt: {
    secret: require('JWT_SECRET'),
    expiresIn: optional('JWT_EXPIRES_IN', '15m'),
  },

  rabbitmq: {
    url: optional('RABBITMQ_URL', 'amqp://localhost'),
  },

  internalToken: require('INTERNAL_API_TOKEN'),

  cors: {
    origin: optional('CORS_ORIGIN', 'http://localhost:3000'),
  },

  log: {
    level: optional('LOG_LEVEL', 'info'),
  },
};

