-- 010_retention_config.sql
CREATE TABLE retention_config (
  id                   SERIAL  PRIMARY KEY,
  fleet_session_id     UUID    REFERENCES fleet_sessions(id) ON DELETE CASCADE,
  raw_events_ttl_days  INT     DEFAULT 30,
  snapshots_ttl_days   INT     DEFAULT 90,
  timeline_ttl_days    INT     -- NULL = keep forever
);

-- One global default row (no fleet_session_id)
INSERT INTO retention_config (fleet_session_id, raw_events_ttl_days, snapshots_ttl_days, timeline_ttl_days)
VALUES (NULL, 30, 90, NULL);
