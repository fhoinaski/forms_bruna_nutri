-- Portal self-scheduling availability.

CREATE TABLE IF NOT EXISTS availability_rules (
  id TEXT PRIMARY KEY,
  weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 60,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS availability_blocks (
  id TEXT PRIMARY KEY,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_availability_rules_weekday_active
ON availability_rules(weekday, is_active);

CREATE INDEX IF NOT EXISTS idx_availability_blocks_range
ON availability_blocks(starts_at, ends_at);
