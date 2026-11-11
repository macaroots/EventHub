import { config } from './config.js';
import { pool } from './infrastructure/db.js';
import { UserRepository } from './infrastructure/user.repository.js';
import { BcryptHasher } from './infrastructure/hasher.js';
import { JwtTokenService } from './infrastructure/token.js';
import { OutboxPublisher } from './infrastructure/outbox-publisher.js';
import { UserAppService } from './application/user.app-service.js';
import { createApp } from './interface/app.js';

await pool.query('SELECT 1');
const service = new UserAppService(new UserRepository(), new BcryptHasher(), new JwtTokenService());
const publisher = new OutboxPublisher();
await publisher.connect();
publisher.start();
createApp(service).listen(config.port, () => console.log(`Identity listening on port ${config.port}`));