-- 004_fleet_sessions.sql
CREATE TABLE fleet_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  eve_fleet_id     BIGINT,
  fc_character_id  BIGINT      NOT NULL REFERENCES eve_characters(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at        TIMESTAMPTZ,
  is_open          BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE INDEX ON fleet_sessions (fc_character_id);
CREATE INDEX ON fleet_sessions (is_open, created_at DESC);
