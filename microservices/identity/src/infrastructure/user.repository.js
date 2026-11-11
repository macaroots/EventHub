// Infrastructure – PostgreSQL user repository
import { User } from '../domain/user.js';
import { pool } from './db.js';
import { randomUUID } from 'node:crypto';

function rowToUser(row) {
  if (!row) return null;
  return new User({
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    active: row.active,
    createdAt: row.created_at,
  });
}

export class UserRepository {
  constructor(database = pool) { this.database = database; }

  async transaction(fn) {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(new UserRepository(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async publish(type, data, requestId) {
    const payload = { eventId: randomUUID(), type, occurredAt: new Date().toISOString(), data, requestId };
    await this.database.query('INSERT INTO outbox (routing_key, payload) VALUES ($1, $2)', [type, JSON.stringify(payload)]);
  }

  async add(user) {
    await this.database.query(
      `INSERT INTO users (id, name, username, email, password_hash, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user.id, user.name, user.username, user.email, user.passwordHash, user.active, user.createdAt]
    );
  }

  async update(user) {
    await this.database.query(
      `UPDATE users SET name=$1, email=$2, password_hash=$3, active=$4 WHERE id=$5`,
      [user.name, user.email, user.passwordHash, user.active, user.id]
    );
  }

  async getById(id) {
    const { rows } = await this.database.query('SELECT * FROM users WHERE id=$1', [id]);
    return rowToUser(rows[0]);
  }

  async getByUsername(username) {
    const { rows } = await this.database.query(
      'SELECT * FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($1)',
      [username]
    );
    return rowToUser(rows[0]);
  }

  async getByEmail(email) {
    const { rows } = await this.database.query(
      'SELECT * FROM users WHERE lower(email)=lower($1)',
      [email]
    );
    return rowToUser(rows[0]);
  }

  async list() {
    const { rows } = await this.database.query('SELECT * FROM users');
    return rows.map(rowToUser);
  }

  async findByEmail(email) {
    const { rows } = await this.database.query(
      `SELECT * FROM users WHERE lower(email)=lower($1) AND active=true`,
      [email]
    );
    return rows.map(rowToUser);
  }

  async findByIds(ids) {
    if (!ids.length) return [];
    // Build parameterized list: $1, $2, ...
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await this.database.query(
      `SELECT * FROM users WHERE id IN (${placeholders}) AND active=true`,
      ids
    );
    return rows.map(rowToUser);
  }
}
