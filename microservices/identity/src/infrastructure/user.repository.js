// Infrastructure – PostgreSQL user repository
import { User } from '../domain/user.js';
import { pool } from './db.js';

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
  async add(user) {
    await pool.query(
      `INSERT INTO users (id, name, username, email, password_hash, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user.id, user.name, user.username, user.email, user.passwordHash, user.active, user.createdAt]
    );
  }

  async update(user) {
    await pool.query(
      `UPDATE users SET name=$1, email=$2, password_hash=$3, active=$4 WHERE id=$5`,
      [user.name, user.email, user.passwordHash, user.active, user.id]
    );
  }

  async getById(id) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
    return rowToUser(rows[0]);
  }

  async getByUsername(username) {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE lower(username)=lower($1)',
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

  async findByEmail(email) {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE lower(email)=lower($1) AND active=true`,
      [email]
    );
    return rows.map(rowToUser);
  }

  async findByIds(ids) {
    if (!ids.length) return [];
    // Build parameterized list: $1, $2, ...
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE id IN (${placeholders}) AND active=true`,
      ids
    );
    return rows.map(rowToUser);
  }
}
