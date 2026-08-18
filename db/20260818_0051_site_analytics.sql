-- Modulo de analytics first-party do site publico. Sessoes e eventos sao
-- pseudonimos: nunca gravamos IP completo, o cookie de sessao cru nunca
-- chega ao banco (so o HMAC dele), e nao ha vinculo com clients/pacientes.

CREATE TABLE IF NOT EXISTS analytics_sessions (
  id TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL UNIQUE,
  started_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  landing_path TEXT NOT NULL,
  landing_referrer TEXT NULL,
  referrer_domain TEXT NULL,
  source_category TEXT NOT NULL DEFAULT 'direct'
    CHECK(source_category IN ('direct','organic_search','social','paid','referral','email','whatsapp','other')),
  utm_source TEXT NULL,
  utm_medium TEXT NULL,
  utm_campaign TEXT NULL,
  utm_term TEXT NULL,
  utm_content TEXT NULL,
  country_code TEXT NULL,
  device_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK(device_type IN ('desktop','mobile','tablet','unknown')),
  browser_family TEXT NULL,
  os_family TEXT NULL,
  is_bot INTEGER NOT NULL DEFAULT 0,
  is_internal INTEGER NOT NULL DEFAULT 0,
  pageview_count INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  converted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_started_at ON analytics_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_seen_at ON analytics_sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_source_category ON analytics_sessions(source_category);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_utm_source ON analytics_sessions(utm_source);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_utm_campaign ON analytics_sessions(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_landing_path ON analytics_sessions(landing_path);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_is_bot_internal ON analytics_sessions(is_bot, is_internal);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES analytics_sessions(id),
  client_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'PAGE_VIEW',
    'CTA_CLICK',
    'WHATSAPP_CLICK',
    'PRECONSULTATION_OPENED',
    'PRECONSULTATION_STARTED',
    'PRECONSULTATION_COMPLETED',
    'BLOG_VIEW',
    'SERVICE_VIEW',
    'CONTACT_CLICK',
    'PORTAL_LOGIN_OPENED'
  )),
  path TEXT NOT NULL,
  page_title TEXT NULL,
  referrer TEXT NULL,
  utm_source TEXT NULL,
  utm_medium TEXT NULL,
  utm_campaign TEXT NULL,
  utm_term TEXT NULL,
  utm_content TEXT NULL,
  metadata_json TEXT NULL,
  is_bot INTEGER NOT NULL DEFAULT 0,
  is_internal INTEGER NOT NULL DEFAULT 0,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, client_event_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_occurred_at ON analytics_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_path ON analytics_events(path);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_occurred ON analytics_events(event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_is_bot_internal ON analytics_events(is_bot, is_internal);
