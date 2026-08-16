-- FASE 9 — Registro rastreavel de importacoes controladas.

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  dataset_version TEXT NULL,
  planned_foods INTEGER NOT NULL DEFAULT 0,
  created_foods INTEGER NOT NULL DEFAULT 0,
  created_nutrients INTEGER NOT NULL DEFAULT 0,
  noop_foods INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT NULL
);
