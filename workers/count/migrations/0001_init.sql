-- Visitor counter schema. Every table is an aggregate keyed by UTC day.
-- Nothing in here identifies a person: no IP, no user agent, no cookie id.

CREATE TABLE IF NOT EXISTS days (
  day TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hits (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);

CREATE TABLE IF NOT EXISTS refs (
  day TEXT NOT NULL,
  host TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, host)
);

CREATE TABLE IF NOT EXISTS geo (
  day TEXT NOT NULL,
  cc TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, cc)
);

CREATE TABLE IF NOT EXISTS devices (
  day TEXT NOT NULL,
  class TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, class)
);

-- One random salt per day. It exists so the same visitor counts once per day,
-- and it is deleted the next morning along with the hashes it produced.
CREATE TABLE IF NOT EXISTS salts (
  day TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);

-- hash = sha256(salt:ip:user-agent), truncated. Meaningless without the salt.
CREATE TABLE IF NOT EXISTS uniques (
  day TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (day, hash)
);
