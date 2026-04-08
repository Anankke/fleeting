import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max:                     parseInt(process.env.DB_POOL_MAX            ?? '20',    10),
  idleTimeoutMillis:       parseInt(process.env.DB_IDLE_TIMEOUT_MS     ?? '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS  ?? '5000',  10),
});

pool.on('error', (err: Error) => {
  console.error('[pg] Unexpected client error', err);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}

export async function getClient() {
  return pool.connect();
}
