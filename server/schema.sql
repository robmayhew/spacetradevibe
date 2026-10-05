CREATE TABLE IF NOT EXISTS runs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  run_id CHAR(36) NOT NULL,
  callsign VARCHAR(16) NOT NULL,
  score INT NOT NULL,
  time_ms INT UNSIGNED NOT NULL,
  earned INT UNSIGNED NOT NULL,
  kills INT UNSIGNED NOT NULL,
  bosses INT UNSIGNED NOT NULL,
  deaths INT UNSIGNED NOT NULL,
  deliveries INT UNSIGNED NOT NULL,
  seed BIGINT NOT NULL,
  status VARCHAR(8) NOT NULL DEFAULT 'done',
  paced TINYINT UNSIGNED NOT NULL DEFAULT 1,
  credits INT UNSIGNED NOT NULL DEFAULT 0,
  pace SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  season VARCHAR(16) NOT NULL DEFAULT 'beta',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  UNIQUE KEY run_id (run_id),
  KEY status_updated (status, updated_at),
  KEY season_status (season, status, score)
);

CREATE TABLE IF NOT EXISTS rate_hits (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ip_created (ip, created_at)
);

CREATE TABLE IF NOT EXISTS party_rooms (
  code CHAR(5) NOT NULL PRIMARY KEY,
  host_token CHAR(32) NOT NULL,
  host_peer CHAR(8) NOT NULL,
  escorts TEXT NOT NULL,
  frame MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  touched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY touched (touched_at)
);

CREATE TABLE IF NOT EXISTS party_signals (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room CHAR(5) NOT NULL,
  from_peer CHAR(8) NOT NULL,
  to_peer CHAR(8) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  payload TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY room_id (room, id)
);

CREATE TABLE IF NOT EXISTS party_live (
  peer CHAR(8) NOT NULL PRIMARY KEY,
  room CHAR(5) NOT NULL,
  mx FLOAT NOT NULL DEFAULT 0,
  my FLOAT NOT NULL DEFAULT 0,
  fire TINYINT UNSIGNED NOT NULL DEFAULT 0,
  hull FLOAT NOT NULL DEFAULT 1,
  max_hull FLOAT NOT NULL DEFAULT 1,
  mode VARCHAR(16) NOT NULL DEFAULT 'wait',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY room_updated (room, updated_at)
);

CREATE TABLE IF NOT EXISTS feedback (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  callsign VARCHAR(16) NOT NULL,
  game_version VARCHAR(32) NOT NULL,
  user_agent VARCHAR(512) NULL,
  ip VARCHAR(45) NOT NULL,
  hidden TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY kind_hidden_created (kind, hidden, created_at),
  KEY ip_created (ip, created_at)
);

-- Existing Plesk DBs: run these after pull if the columns are missing.
-- ALTER TABLE party_rooms ADD COLUMN frame MEDIUMTEXT NULL;
-- ALTER TABLE runs ADD COLUMN paced TINYINT UNSIGNED NOT NULL DEFAULT 1;
-- ALTER TABLE runs ADD KEY status_updated (status, updated_at);
-- CREATE TABLE feedback ... (see CREATE TABLE above if the table is missing).
