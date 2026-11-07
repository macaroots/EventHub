// Infrastructure – PostgreSQL connection pool
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.db.url,
});

pool.on('error', (err) => {
  // Don't crash the process on idle client errors
  console.error('Unexpected idle client error', err.message);
});

