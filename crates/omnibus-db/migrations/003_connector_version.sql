-- B4: connectors self-report a product/build version on hello. Persisted
-- alongside capabilities so a known connector's last-reported version survives
-- across restarts. Nullable: older connectors report none.
ALTER TABLE connectors ADD COLUMN version TEXT;
