-- 005_fleet_members.sql
CREATE TABLE fleet_members (
  fleet_session_id UUID        NOT NULL REFERENCES fleet_sessions(id) ON DELETE CASCADE,
  character_id     BIGINT      NOT NULL REFERENCES eve_characters(id),
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  PRIMARY KEY (fleet_session_id, character_id)
);
