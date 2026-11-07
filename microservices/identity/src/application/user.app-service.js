// Application service – use cases, dependencies injected.
import { User } from '../domain/user.js';
import { pool } from '../infrastructure/db.js';
import { logger } from '../infrastructure/logger.js';

export class UserAppService {
  /**
   * @param {import('../infrastructure/user.repository.js').UserRepository} userRepository
   * @param {import('../infrastructure/hasher.js').BcryptHasher} hasher
   * @param {import('../infrastructure/token.js').JwtTokenService} tokenService
   */
  constructor(userRepository, hasher, tokenService) {
    this.userRepository = userRepository;
    this.hasher = hasher;
    this.tokenService = tokenService;
  }

  async register({ name, username, email, password }, requestId) {
    const normalizedUsername = username.toLowerCase();
    const normalizedEmail = email.toLowerCase();

    const [existingUsername, existingEmail] = await Promise.all([
      this.userRepository.getByUsername(normalizedUsername),
      this.userRepository.getByEmail(normalizedEmail),
    ]);

    if (existingUsername) throw Object.assign(new Error('username already exists'), { code: 'USERNAME_TAKEN', status: 409 });
    if (existingEmail) throw Object.assign(new Error('email already exists'), { code: 'EMAIL_TAKEN', status: 409 });

    const passwordHash = await this.hasher.hash(password);

    const user = new User({
      name: name.trim(),
      username: normalizedUsername,
      email: normalizedEmail,
      passwordHash,
    });

    // Transactional outbox: insert user + outbox row in one transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (id, name, username, email, password_hash, active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [user.id, user.name, user.username, user.email, user.passwordHash, user.active, user.createdAt]
      );
      await this.#insertOutbox(client, 'identity.user.registered', {
        eventId: crypto.randomUUID(),
        type: 'UserRegistered',
        occurredAt: new Date().toISOString(),
        version: 1,
        data: { userId: user.id, name: user.name, email: user.email, requestId },
      });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    logger.info({ userId: user.id, requestId }, 'User registered');
    return user.toPublic();
  }

  async login({ username, password }) {
    // Support login by username or email
    let user = await this.userRepository.getByUsername(username.toLowerCase());
    if (!user) user = await this.userRepository.getByEmail(username.toLowerCase());

    // Generic error to avoid user enumeration
    const invalid = () => Object.assign(new Error('credenciais inválidas'), { code: 'INVALID_CREDENTIALS', status: 401 });

    if (!user) throw invalid();
    if (!user.active) throw invalid();

    const match = await this.hasher.compare(password, user.passwordHash);
    if (!match) throw invalid();

    const token = this.tokenService.sign({ userId: user.id });
    return { token, expiresIn: this.tokenService.expiresInSeconds() };
  }

  async getMe(userId) {
    const user = await this.userRepository.getById(userId);
    if (!user || !user.active) throw Object.assign(new Error('user not found'), { code: 'NOT_FOUND', status: 404 });
    return user.toPublic();
  }

  async updateMe(userId, { name, email }, requestId) {
    const user = await this.userRepository.getById(userId);
    if (!user || !user.active) throw Object.assign(new Error('user not found'), { code: 'NOT_FOUND', status: 404 });

    if (email !== undefined) {
      const normalizedEmail = email.toLowerCase();
      const existing = await this.userRepository.getByEmail(normalizedEmail);
      if (existing && existing.id !== userId) {
        throw Object.assign(new Error('email already exists'), { code: 'EMAIL_TAKEN', status: 409 });
      }
      user.email = normalizedEmail;
    }
    if (name !== undefined) user.name = name.trim();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users SET name=$1, email=$2 WHERE id=$3`,
        [user.name, user.email, user.id]
      );
      await this.#insertOutbox(client, 'identity.user.updated', {
        eventId: crypto.randomUUID(),
        type: 'UserUpdated',
        occurredAt: new Date().toISOString(),
        version: 1,
        data: { userId: user.id, name: user.name, email: user.email, requestId },
      });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    logger.info({ userId, requestId }, 'User updated');
    return user.toPublic();
  }

  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await this.userRepository.getById(userId);
    if (!user || !user.active) throw Object.assign(new Error('user not found'), { code: 'NOT_FOUND', status: 404 });

    const match = await this.hasher.compare(currentPassword, user.passwordHash);
    if (!match) throw Object.assign(new Error('current password is incorrect'), { code: 'WRONG_PASSWORD', status: 403 });

    user.passwordHash = await this.hasher.hash(newPassword);
    await this.userRepository.update(user);
    logger.info({ userId }, 'Password changed');
  }

  async deactivateMe(userId, requestId) {
    const user = await this.userRepository.getById(userId);
    if (!user || !user.active) throw Object.assign(new Error('user not found'), { code: 'NOT_FOUND', status: 404 });

    user.active = false;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE users SET active=false WHERE id=$1`, [user.id]);
      await this.#insertOutbox(client, 'identity.user.deactivated', {
        eventId: crypto.randomUUID(),
        type: 'UserDeactivated',
        occurredAt: new Date().toISOString(),
        version: 1,
        data: { userId: user.id, requestId },
      });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    logger.info({ userId, requestId }, 'User deactivated');
  }

  // ---- Internal use cases ----

  async getInternalById(id) {
    const user = await this.userRepository.getById(id);
    if (!user || !user.active) throw Object.assign(new Error('user not found'), { code: 'NOT_FOUND', status: 404 });
    return user.toInternal();
  }

  async findInternalByEmail(email) {
    const users = await this.userRepository.findByEmail(email);
    return users.map((u) => u.toInternal());
  }

  async findInternalByIds(ids) {
    if (ids.length > 500) throw Object.assign(new Error('too many ids (max 500)'), { code: 'VALIDATION', status: 400 });
    const users = await this.userRepository.findByIds(ids);
    return users.map((u) => u.toInternal());
  }

  // ---- Private helpers ----

  async #insertOutbox(client, routingKey, event) {
    await client.query(
      `INSERT INTO outbox (id, routing_key, payload, created_at)
       VALUES ($1, $2, $3, now())`,
      [crypto.randomUUID(), routingKey, JSON.stringify(event)]
    );
  }
}
