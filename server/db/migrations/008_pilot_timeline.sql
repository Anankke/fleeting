-- 008_pilot_timeline.sql
CREATE TABLE pilot_timeline (
  fleet_session_id       UUID        NOT NULL REFERENCES fleet_sessions(id),
  character_id           BIGINT      NOT NULL,
  bucket_at              TIMESTAMPTZ NOT NULL,
  avg_dps_out            NUMERIC,
  max_dps_out            NUMERIC,
  avg_dps_in             NUMERIC,
  avg_logi_out           NUMERIC,
  avg_logi_in            NUMERIC,
  avg_cap_transferred    NUMERIC,
  avg_cap_received       NUMERIC,
  avg_cap_damage_out     NUMERIC,
  avg_cap_damage_in      NUMERIC,
  avg_mined              NUMERIC,
  hit_quality_dist       JSONB,
  PRIMARY KEY (fleet_session_id, character_id, bucket_at)
);
