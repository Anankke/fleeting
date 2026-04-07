'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[pg] Unexpected client error', err);
});

/**
 * Execute a query with optional parameters.
 * @param {string} text
 * @param {any[]} [params]
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Get a raw client for transactions.
 */
async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
