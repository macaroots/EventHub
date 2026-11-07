// Entry point – composes everything and starts the server.
import { config } from './config.js';
import { pool } from './infrastructure/db.js';
import { UserRepository } from './infrastructure/user.repository.js';
import { BcryptHasher } from './infrastructure/hasher.js';
import { JwtTokenService } from './infrastructure/token.js';
import { OutboxPublisher } from './infrastructure/outbox-publisher.js';
import { UserAppService } from './application/user.app-service.js';
import { createApp } from './interface/app.js';
import { logger } from './infrastructure/logger.js';

async function bootstrap() {
  // Verify DB connectivity
  await pool.query('SELECT 1');
  logger.info('Database connection OK');

  // Compose infrastructure
  const userRepository = new UserRepository();
  const hasher = new BcryptHasher();
  const tokenService = new JwtTokenService();

  // Compose application
  const userService = new UserAppService(userRepository, hasher, tokenService);

  // Start outbox publisher (non-blocking: RabbitMQ is optional)
  const outbox = new OutboxPublisher();
  await outbox.connect().catch((err) =>
    logger.warn({ err: err.message }, 'Outbox could not connect to RabbitMQ – continuing without broker')
  );
  outbox.start();

  // Start HTTP server
  const app = createApp(userService);
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, `Identity service listening`);
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down gracefully...');
    outbox.stop();
    server.close(async () => {
      await pool.end();
      logger.info('Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start identity service:', err);
  process.exit(1);
});
