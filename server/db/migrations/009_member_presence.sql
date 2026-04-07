-- 009_member_presence.sql
CREATE TABLE member_presence (
  id                SERIAL      PRIMARY KEY,
  fleet_session_id  UUID        NOT NULL REFERENCES fleet_sessions(id) ON DELETE CASCADE,
  character_id      BIGINT      NOT NULL,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  solar_system_id   INT         NOT NULL,
  ship_type_id      INT         NOT NULL
);

CREATE INDEX ON member_presence (fleet_session_id, recorded_at);
CREATE INDEX ON member_presence (fleet_session_id, character_id, recorded_at);
