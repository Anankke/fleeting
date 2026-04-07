'use strict';

require('dotenv').config();

const Fastify = require('fastify');
const fastifySession = require('@fastify/session');
const fastifyCookie  = require('@fastify/cookie');
const fastifyCors    = require('@fastify/cors');
const fastifyRateLimit = require('@fastify/rate-limit');
const ConnectPgSimple = require('connect-pg-simple');
const { pool } = require('./db/pg');

const app = Fastify({ logger: true, trustProxy: true });

// ── Session store (PostgreSQL) ────────────────────────────────────────────────
const PgSession = ConnectPgSimple(/** compatible interface */({ Store: class {} }));

// connect-pg-simple expects a connect-compatible session store; we bridge it here
const pgStore = new (ConnectPgSimple(require('express-session')))(
  { pool, tableName: 'sessions' }
);

async function start() {
  await app.register(fastifyCookie);

  await app.register(fastifySession, {
    secret:     process.env.SESSION_SECRET,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
      maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
    },
    store: pgStore,
    saveUninitialized: false,
  });

  await app.register(fastifyCors, {
    origin: false, // same-origin only; Nginx handles CORS headers if needed
    credentials: true,
  });

  await app.register(fastifyRateLimit, {
    global: true,
    max: 1000,
    timeWindow: '1 minute',
  });

  // ── Routes ──────────────────────────────────────────────────────────────────
  await app.register(require('./routes/auth'));
  await app.register(require('./routes/pilot'));
  await app.register(require('./routes/fleet'));
  await app.register(require('./routes/war'));
  await app.register(require('./routes/history'));

  // ── Retention job ────────────────────────────────────────────────────────────
  const { startRetentionJob } = require('./lib/retentionJob');
  startRetentionJob();

  // ── Member tracker: re-register open fleets on restart ───────────────────────
  const { resumeOpenFleets } = require('./lib/memberTracker');
  await resumeOpenFleets();

  await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
