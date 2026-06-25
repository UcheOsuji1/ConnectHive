import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Run a parameterised query through the pool.
 * Usage: await query('SELECT * FROM users WHERE id = $1', [id])
 */
export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log(`[db] ${duration}ms — ${text.slice(0, 80)}`);
  return result;
}

/**
 * Grab a dedicated client for multi-statement transactions.
 * Remember to call client.release() when done.
 */
export async function getClient() {
  return pool.connect();
}

/**
 * Verify the connection is alive.  Called once at server startup.
 */
export async function testConnection() {
  try {
    const { rows } = await pool.query('SELECT NOW() AS now');
    console.log(`[db] Connected to Neon — server time: ${rows[0].now}`);
  } catch (err) {
    console.error('[db] Connection failed:', err.message);
    console.error('     Check DATABASE_URL in server/.env and confirm SSL is enabled.');
    process.exit(1);
  }
}
