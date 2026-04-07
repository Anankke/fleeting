-- 007_pilot_snapshots.sql
CREATE TABLE pilot_snapshots (
  id                BIGSERIAL   PRIMARY KEY,
  fleet_session_id  UUID        NOT NULL REFERENCES fleet_sessions(id),
  character_id      BIGINT      NOT NULL,
  recorded_at       TIMESTAMPTZ NOT NULL,
  dps_out           NUMERIC,
  dps_in            NUMERIC,
  logi_out          NUMERIC,
  logi_in           NUMERIC,
  cap_transferred   NUMERIC,
  cap_received      NUMERIC,
  cap_damage_out    NUMERIC,
  cap_damage_in     NUMERIC,
  mined             NUMERIC,
  dmg_out_p50       NUMERIC,
  dmg_out_p90       NUMERIC,
  dmg_out_p95       NUMERIC,
  dmg_out_p99       NUMERIC,
  dmg_out_avg       NUMERIC,
  dmg_out_median    NUMERIC,
  hit_quality_dist  JSONB
);

CREATE INDEX ON pilot_snapshots (fleet_session_id, character_id, recorded_at);
