-- 006_combat_events.sql
-- Partitioned by fleet_session_id using LIST partitioning.
-- New partitions are created dynamically per fleet session via application code.
-- Retention is achieved by dropping individual partitions.

CREATE TABLE combat_events (
  id                   BIGSERIAL,
  fleet_session_id     UUID        NOT NULL,
  source_character_id  BIGINT      NOT NULL,
  target_name          TEXT,
  weapon_type          TEXT,
  ship_type            TEXT,
  category             TEXT        NOT NULL,
  amount               NUMERIC     NOT NULL,
  hit_quality          TEXT,
  occurred_at          TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (fleet_session_id, id)
) PARTITION BY LIST (fleet_session_id);

-- Default partition catches rows before a dedicated partition is created
CREATE TABLE combat_events_default PARTITION OF combat_events DEFAULT;

CREATE INDEX ON combat_events (fleet_session_id, source_character_id, occurred_at);
CREATE INDEX ON combat_events (fleet_session_id, occurred_at);
CREATE INDEX ON combat_events (fleet_session_id, category, occurred_at);
