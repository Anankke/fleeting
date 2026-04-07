-- 002_eve_characters.sql
CREATE TABLE eve_characters (
  id               BIGINT      PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_name   TEXT        NOT NULL,
  access_token     TEXT,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ
);

CREATE INDEX ON eve_characters (user_id);
