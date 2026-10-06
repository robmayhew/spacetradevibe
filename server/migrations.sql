-- One-time migration for databases created before the current server/schema.sql.
-- Fresh installs should run schema.sql only.
-- Each ALTER fails if that column or key is already present. Skip the line and continue.

ALTER TABLE runs ADD COLUMN paced TINYINT UNSIGNED NOT NULL DEFAULT 1;
ALTER TABLE runs ADD COLUMN credits INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN pace SMALLINT UNSIGNED NOT NULL DEFAULT 100;
ALTER TABLE runs ADD COLUMN season VARCHAR(16) NOT NULL DEFAULT 'beta';
ALTER TABLE runs ADD KEY status_updated (status, updated_at);
ALTER TABLE party_rooms ADD COLUMN frame MEDIUMTEXT NULL;

CREATE TABLE IF NOT EXISTS run_auth (
  run_id CHAR(36) NOT NULL PRIMARY KEY,
  token_hash VARCHAR(64) NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_nonce VARCHAR(64) NULL,
  last_hash VARCHAR(64) NULL
);

CREATE TABLE IF NOT EXISTS rate_buckets (
  scope VARCHAR(24) NOT NULL,
  subject VARCHAR(64) NOT NULL,
  bucket INT UNSIGNED NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, subject, bucket)
);

ALTER TABLE party_signals ADD KEY created_at (created_at);
