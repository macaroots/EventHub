import { DuplicateError, NotFoundError } from '../../../shared/domain/errors.js';
import { User } from '../domain/user.js';
import { sign } from '../../../shared/auth/jwt.js';

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

    // Cadastro público cria só 'user'; admin vem de seedAdmin.
    async signin({ username, password, email }, role = 'user') {
        const loginName = username || email;
        let exist = this.userRepository.getByUsername(loginName);
        if (exist) throw new DuplicateError('username');
        const user = new User(loginName, password, role);
        this.messageBus.transaction(() => {
            this.userRepository.add(user);
            this.messageBus.publish({ type: 'UserCreated', userId: user.id, username: user.username });
        });
        return user.id;
    }
    
    async seedAdmin({ username, password }) {
        if (!username || this.userRepository.getByUsername(username)) return;
        await this.signin({ username, password }, 'admin');
    }

    async authenticate({ username, password, email }) {
        const loginName = username || email;
        const user = await this.userRepository.getByUsername(loginName);
        if (!user || user.password != password) {
            throw new NotFoundError('username or password');
        }
        return { user, token: sign(user) };
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
