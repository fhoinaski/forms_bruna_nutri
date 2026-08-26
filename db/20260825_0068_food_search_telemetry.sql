-- F9.1 - Persistent, privacy-minimized food search telemetry.
-- This migration intentionally has no clinical, user, tenant or food-data identifiers.

CREATE TABLE IF NOT EXISTS food_search_events (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('FOOD_SEARCH_PERFORMED', 'FOOD_SEARCH_RESULT_SELECTED', 'FOOD_SEARCH_ZERO_RESULTS', 'FOOD_SEARCH_PORTION_SELECTED')),
  occurred_at TEXT NOT NULL,
  query_normalized_sanitized TEXT,
  query_length_bucket TEXT NOT NULL CHECK (query_length_bucket IN ('0', '1_16', '17_32', '33_64', '65_PLUS')),
  query_status TEXT NOT NULL CHECK (query_status IN ('STORED', 'REDACTED', 'HASH_ONLY', 'REJECTED')),
  result_count INTEGER,
  selected_rank INTEGER,
  canonical_food_id TEXT,
  source TEXT CHECK (source IN ('TBCA', 'IBGE_POF', 'TACO', 'USDA', 'CUSTOM', 'MANUFACTURER', 'COMPLEMENTARY')),
  preparation_code TEXT,
  portion_type TEXT CHECK (portion_type IN ('OFFICIAL', 'FALLBACK_100G')),
  duration_ms REAL,
  has_exact_match INTEGER CHECK (has_exact_match IN (0, 1)),
  top_result_source TEXT CHECK (top_result_source IN ('TBCA', 'IBGE_POF', 'TACO', 'USDA', 'CUSTOM', 'MANUFACTURER', 'COMPLEMENTARY')),
  platform TEXT CHECK (platform IN ('web')),
  viewport_class TEXT CHECK (viewport_class IN ('compact', 'regular', 'wide')),
  search_session_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_food_search_events_occurred_at
  ON food_search_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_food_search_events_type_occurred_at
  ON food_search_events(event_type, occurred_at);

CREATE TABLE IF NOT EXISTS food_search_daily_metrics (
  metric_date TEXT NOT NULL,
  query_key TEXT,
  query_status TEXT NOT NULL CHECK (query_status IN ('STORED', 'REDACTED', 'HASH_ONLY', 'REJECTED')),
  search_count INTEGER NOT NULL DEFAULT 0,
  zero_result_count INTEGER NOT NULL DEFAULT 0,
  selection_count INTEGER NOT NULL DEFAULT 0,
  top1_selection_count INTEGER NOT NULL DEFAULT 0,
  top3_selection_count INTEGER NOT NULL DEFAULT 0,
  selected_rank_sum INTEGER NOT NULL DEFAULT 0,
  selected_rank_count INTEGER NOT NULL DEFAULT 0,
  duration_sum REAL NOT NULL DEFAULT 0,
  duration_count INTEGER NOT NULL DEFAULT 0,
  source_selection_counts_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (metric_date, query_key, query_status)
);

CREATE INDEX IF NOT EXISTS idx_food_search_daily_metrics_date
  ON food_search_daily_metrics(metric_date);
