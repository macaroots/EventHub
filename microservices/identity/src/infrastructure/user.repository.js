// Infrastructure – PostgreSQL user repository
import { User } from '../domain/user.js';
import { pool } from './db.js';

function rowToUser(row) {
  if (!row) return null;
  return new User(
    row.username,
    row.password_hash,
    'user',
    row.id
  );
}

export class UserRepository {
  async add(user) {
    const passwordHash = user.password || user.passwordHash;
    const email = user.email || (user.username.includes('@') ? user.username : `${user.username}@eventhub.local`);
    const name = user.name || user.username;
    await pool.query(
      `INSERT INTO users (id, name, username, email, password_hash, active, created_at)
       VALUES ($1, $2, $3, $4, $5, true, now())
       ON CONFLICT (id) DO NOTHING`,
      [user.id, name, user.username, email, passwordHash]
    );
  }

  async update(user) {
    await pool.query(
      `UPDATE users SET username=$1, password_hash=$2 WHERE id=$3`,
      [user.username, user.password || user.passwordHash, user.id]
    );
  }

  async getById(id) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
    return rowToUser(rows[0]);
  }

  async getByUsername(username) {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($1)',
      [username]
    );
    return rowToUser(rows[0]);
  }

  async getByEmail(email) {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE lower(email)=lower($1)',
      [email]
    );
    return rowToUser(rows[0]);
  }

  async list() {
    const { rows } = await pool.query('SELECT * FROM users');
    return rows.map(rowToUser);
  }

  async findByEmail(email) {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE lower(email)=lower($1) AND active=true`,
      [email]
    );
    return rows.map(rowToUser);
  }

  async findByIds(ids) {
    if (!ids.length) return [];
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE id IN (${placeholders}) AND active=true`,
      ids
    );
    return rows.map(rowToUser);
  }
}
