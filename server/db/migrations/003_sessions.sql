-- 003_sessions.sql
-- Used by connect-pg-simple for @fastify/session storage
CREATE TABLE sessions (
  sid     TEXT        NOT NULL PRIMARY KEY,
  sess    JSONB       NOT NULL,
  expire  TIMESTAMPTZ NOT NULL
);

CREATE INDEX ON sessions (expire);
