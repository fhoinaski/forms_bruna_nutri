import { d1Batch, d1Execute, d1Query } from "@/lib/d1/client";
import type { AnalyticsEventType, AnalyticsSessionRow, DeviceType, SourceCategory } from "@/lib/analytics/types";
import { createRawSessionToken, hashSessionToken, isSessionExpired } from "@/lib/analytics/session";

// ── Sessao: resolucao/criacao ──────────────────────────────────────────

interface SessionAttributes {
  landingPath: string;
  landingReferrer: string | null;
  referrerDomain: string | null;
  sourceCategory: SourceCategory;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  countryCode: string | null;
  deviceType: DeviceType;
  browserFamily: string | null;
  osFamily: string | null;
  isBot: boolean;
  isInternal: boolean;
}

async function getSessionByHash(hash: string): Promise<AnalyticsSessionRow | null> {
  const rows = await d1Query<AnalyticsSessionRow>(
    "SELECT * FROM analytics_sessions WHERE session_hash = ?1 LIMIT 1",
    [hash]
  );
  return rows[0] ?? null;
}

async function createSession(rawToken: string, attrs: SessionAttributes, now: string): Promise<AnalyticsSessionRow> {
  const id = crypto.randomUUID();
  const hash = hashSessionToken(rawToken);
  await d1Execute(
    `INSERT INTO analytics_sessions
       (id, session_hash, started_at, last_seen_at, landing_path, landing_referrer, referrer_domain,
        source_category, utm_source, utm_medium, utm_campaign, utm_term, utm_content, country_code,
        device_type, browser_family, os_family, is_bot, is_internal, pageview_count, event_count,
        converted, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,0,0,0,?20,?21)`,
    [
      id,
      hash,
      now,
      now,
      attrs.landingPath,
      attrs.landingReferrer,
      attrs.referrerDomain,
      attrs.sourceCategory,
      attrs.utmSource,
      attrs.utmMedium,
      attrs.utmCampaign,
      attrs.utmTerm,
      attrs.utmContent,
      attrs.countryCode,
      attrs.deviceType,
      attrs.browserFamily,
      attrs.osFamily,
      attrs.isBot ? 1 : 0,
      attrs.isInternal ? 1 : 0,
      now,
      now,
    ]
  );
  return {
    id,
    session_hash: hash,
    started_at: now,
    last_seen_at: now,
    landing_path: attrs.landingPath,
    landing_referrer: attrs.landingReferrer,
    referrer_domain: attrs.referrerDomain,
    source_category: attrs.sourceCategory,
    utm_source: attrs.utmSource,
    utm_medium: attrs.utmMedium,
    utm_campaign: attrs.utmCampaign,
    utm_term: attrs.utmTerm,
    utm_content: attrs.utmContent,
    country_code: attrs.countryCode,
    device_type: attrs.deviceType,
    browser_family: attrs.browserFamily,
    os_family: attrs.osFamily,
    is_bot: attrs.isBot ? 1 : 0,
    is_internal: attrs.isInternal ? 1 : 0,
    pageview_count: 0,
    event_count: 0,
    converted: 0,
    created_at: now,
    updated_at: now,
  };
}

export interface ResolveSessionResult {
  session: AnalyticsSessionRow;
  rawTokenToPersist: string;
  isNewSession: boolean;
}

/**
 * Resolve a sessao a partir do token cru do cookie (ou cria uma nova).
 * Regra de sessao: 30 minutos sem atividade = nova sessao. Se a sessao
 * encontrada estiver expirada, um NOVO token e emitido (rotacao) — nunca
 * reaproveita o mesmo hash, porque session_hash e UNIQUE.
 */
export async function resolveOrCreateSession(
  rawToken: string,
  attrsForNewSession: SessionAttributes,
  now: Date = new Date()
): Promise<ResolveSessionResult> {
  const nowIso = now.toISOString();
  const hash = hashSessionToken(rawToken);
  const existing = await getSessionByHash(hash);

  if (existing && !isSessionExpired(existing.last_seen_at, now)) {
    await d1Execute(
      "UPDATE analytics_sessions SET last_seen_at = ?1, updated_at = ?2 WHERE id = ?3",
      [nowIso, nowIso, existing.id]
    );
    return {
      session: { ...existing, last_seen_at: nowIso, updated_at: nowIso },
      rawTokenToPersist: rawToken,
      isNewSession: false,
    };
  }

  const newRawToken = existing ? createRawSessionToken() : rawToken;
  const created = await createSession(newRawToken, attrsForNewSession, nowIso);
  return { session: created, rawTokenToPersist: newRawToken, isNewSession: true };
}

// ── Eventos: insercao com dedupe ───────────────────────────────────────

export interface AnalyticsEventToInsert {
  clientEventId: string;
  eventType: AnalyticsEventType;
  path: string;
  pageTitle: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  metadataJson: string | null;
  isBot: boolean;
  isInternal: boolean;
}

const CONVERSION_TYPES = new Set(["PRECONSULTATION_COMPLETED"]);

/**
 * Insere eventos com protecao de idempotencia via UNIQUE(session_id,
 * client_event_id): duplo submit, retry de rede ou double-fire do React
 * Strict Mode resultam em INSERT OR IGNORE — no maximo 1 linha efetiva por
 * client_event_id. So os inserts que realmente aconteceram (meta.changes=1)
 * contam para os contadores da sessao.
 */
export async function insertAnalyticsEvents(
  sessionId: string,
  events: AnalyticsEventToInsert[],
  now: Date = new Date()
): Promise<{ insertedCount: number; insertedPageviews: number; convertedNow: boolean }> {
  if (events.length === 0) return { insertedCount: 0, insertedPageviews: 0, convertedNow: false };
  const nowIso = now.toISOString();

  const statements = events.map((event) => ({
    sql: `INSERT OR IGNORE INTO analytics_events
      (id, session_id, client_event_id, event_type, path, page_title, referrer,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content, metadata_json,
       is_bot, is_internal, occurred_at, created_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`,
    params: [
      crypto.randomUUID(),
      sessionId,
      event.clientEventId,
      event.eventType,
      event.path,
      event.pageTitle,
      event.referrer,
      event.utmSource,
      event.utmMedium,
      event.utmCampaign,
      event.utmTerm,
      event.utmContent,
      event.metadataJson,
      event.isBot ? 1 : 0,
      event.isInternal ? 1 : 0,
      nowIso,
      nowIso,
    ],
  }));

  const results = await d1Batch(statements);

  let insertedCount = 0;
  let insertedPageviews = 0;
  let convertedNow = false;
  results.forEach((result, index) => {
    if ((result.meta?.changes ?? 0) < 1) return; // ignorado por dedupe
    insertedCount++;
    const event = events[index];
    if (event.eventType === "PAGE_VIEW") insertedPageviews++;
    if (CONVERSION_TYPES.has(event.eventType)) convertedNow = true;
  });

  if (insertedCount > 0) {
    await d1Execute(
      `UPDATE analytics_sessions
       SET pageview_count = pageview_count + ?1,
           event_count = event_count + ?2,
           converted = MAX(converted, ?3),
           last_seen_at = ?4,
           updated_at = ?5
       WHERE id = ?6`,
      [insertedPageviews, insertedCount, convertedNow ? 1 : 0, nowIso, nowIso, sessionId]
    );
  }

  return { insertedCount, insertedPageviews, convertedNow };
}

// ── Consultas para o dashboard admin ───────────────────────────────────

const HUMAN_SESSION_FILTER = "is_bot = 0 AND is_internal = 0";
const HUMAN_EVENT_FILTER = "is_bot = 0 AND is_internal = 0";

export interface AnalyticsOverview {
  sessions: number;
  pageviews: number;
  conversions: number;
  pagesPerSession: number;
  conversionRate: number;
  avgSessionDurationSeconds: number | null;
}

export async function getAnalyticsOverview(from: string, to: string): Promise<AnalyticsOverview> {
  const rows = await d1Query<{
    sessions: number;
    pageviews: number;
    conversions: number;
    avg_duration_seconds: number | null;
  }>(
    `SELECT
       COUNT(*) as sessions,
       COALESCE(SUM(pageview_count), 0) as pageviews,
       COALESCE(SUM(converted), 0) as conversions,
       AVG((julianday(last_seen_at) - julianday(started_at)) * 86400) as avg_duration_seconds
     FROM analytics_sessions
     WHERE started_at >= ?1 AND started_at <= ?2 AND ${HUMAN_SESSION_FILTER}`,
    [from, to]
  );
  const row = rows[0] ?? { sessions: 0, pageviews: 0, conversions: 0, avg_duration_seconds: null };
  const sessions = row.sessions ?? 0;
  const pageviews = row.pageviews ?? 0;
  const conversions = row.conversions ?? 0;
  return {
    sessions,
    pageviews,
    conversions,
    pagesPerSession: sessions > 0 ? Number((pageviews / sessions).toFixed(2)) : 0,
    conversionRate: sessions > 0 ? Number(((conversions / sessions) * 100).toFixed(2)) : 0,
    avgSessionDurationSeconds:
      row.avg_duration_seconds !== null && row.avg_duration_seconds !== undefined
        ? Math.round(row.avg_duration_seconds)
        : null,
  };
}

export interface TrafficSourceRow {
  sourceCategory: SourceCategory;
  sessions: number;
  conversions: number;
  conversionRate: number;
}

export async function getTrafficSources(from: string, to: string): Promise<TrafficSourceRow[]> {
  const rows = await d1Query<{ source_category: SourceCategory; sessions: number; conversions: number }>(
    `SELECT source_category, COUNT(*) as sessions, COALESCE(SUM(converted), 0) as conversions
     FROM analytics_sessions
     WHERE started_at >= ?1 AND started_at <= ?2 AND ${HUMAN_SESSION_FILTER}
     GROUP BY source_category
     ORDER BY sessions DESC`,
    [from, to]
  );
  return rows.map((row) => ({
    sourceCategory: row.source_category,
    sessions: row.sessions,
    conversions: row.conversions,
    conversionRate: row.sessions > 0 ? Number(((row.conversions / row.sessions) * 100).toFixed(2)) : 0,
  }));
}

export interface CampaignRow {
  campaign: string;
  source: string | null;
  medium: string | null;
  sessions: number;
  conversions: number;
  conversionRate: number;
}

export async function getCampaigns(from: string, to: string): Promise<CampaignRow[]> {
  const rows = await d1Query<{
    utm_campaign: string;
    utm_source: string | null;
    utm_medium: string | null;
    sessions: number;
    conversions: number;
  }>(
    `SELECT utm_campaign, utm_source, utm_medium, COUNT(*) as sessions, COALESCE(SUM(converted), 0) as conversions
     FROM analytics_sessions
     WHERE started_at >= ?1 AND started_at <= ?2 AND ${HUMAN_SESSION_FILTER} AND utm_campaign IS NOT NULL
     GROUP BY utm_campaign, utm_source, utm_medium
     ORDER BY sessions DESC
     LIMIT 25`,
    [from, to]
  );
  return rows.map((row) => ({
    campaign: row.utm_campaign,
    source: row.utm_source,
    medium: row.utm_medium,
    sessions: row.sessions,
    conversions: row.conversions,
    conversionRate: row.sessions > 0 ? Number(((row.conversions / row.sessions) * 100).toFixed(2)) : 0,
  }));
}

export interface PageStatsRow {
  path: string;
  views: number;
  sessions: number;
  entries: number;
  exits: number;
}

export async function getTopPages(from: string, to: string): Promise<PageStatsRow[]> {
  const [viewRows, entryRows, exitRows] = await Promise.all([
    d1Query<{ path: string; views: number; sessions: number }>(
      `SELECT path, COUNT(*) as views, COUNT(DISTINCT session_id) as sessions
       FROM analytics_events
       WHERE event_type = 'PAGE_VIEW' AND occurred_at >= ?1 AND occurred_at <= ?2 AND ${HUMAN_EVENT_FILTER}
       GROUP BY path ORDER BY views DESC LIMIT 25`,
      [from, to]
    ),
    d1Query<{ landing_path: string; entries: number }>(
      `SELECT landing_path, COUNT(*) as entries
       FROM analytics_sessions
       WHERE started_at >= ?1 AND started_at <= ?2 AND ${HUMAN_SESSION_FILTER}
       GROUP BY landing_path`,
      [from, to]
    ),
    d1Query<{ path: string; exits: number }>(
      `WITH ranked AS (
         SELECT session_id, path,
           ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY occurred_at DESC) as rn
         FROM analytics_events
         WHERE event_type = 'PAGE_VIEW' AND occurred_at >= ?1 AND occurred_at <= ?2 AND ${HUMAN_EVENT_FILTER}
       )
       SELECT path, COUNT(*) as exits FROM ranked WHERE rn = 1 GROUP BY path`,
      [from, to]
    ),
  ]);

  const entryMap = new Map(entryRows.map((row) => [row.landing_path, row.entries]));
  const exitMap = new Map(exitRows.map((row) => [row.path, row.exits]));

  return viewRows.map((row) => ({
    path: row.path,
    views: row.views,
    sessions: row.sessions,
    entries: entryMap.get(row.path) ?? 0,
    exits: exitMap.get(row.path) ?? 0,
  }));
}

export interface LandingPageRow {
  landingPath: string;
  sessions: number;
  conversions: number;
  conversionRate: number;
}

export async function getLandingPages(from: string, to: string): Promise<LandingPageRow[]> {
  const rows = await d1Query<{ landing_path: string; sessions: number; conversions: number }>(
    `SELECT landing_path, COUNT(*) as sessions, COALESCE(SUM(converted), 0) as conversions
     FROM analytics_sessions
     WHERE started_at >= ?1 AND started_at <= ?2 AND ${HUMAN_SESSION_FILTER}
     GROUP BY landing_path
     ORDER BY sessions DESC
     LIMIT 25`,
    [from, to]
  );
  return rows.map((row) => ({
    landingPath: row.landing_path,
    sessions: row.sessions,
    conversions: row.conversions,
    conversionRate: row.sessions > 0 ? Number(((row.conversions / row.sessions) * 100).toFixed(2)) : 0,
  }));
}

export interface ConversionFunnelStage {
  stage: string;
  count: number;
  percentOfPrevious: number | null;
  percentOfTotal: number;
}

export async function getConversionFunnel(from: string, to: string): Promise<ConversionFunnelStage[]> {
  const [visitorsRows, servicesRows, openedRows, startedRows, completedRows] = await Promise.all([
    d1Query<{ c: number }>(
      `SELECT COUNT(*) as c FROM analytics_sessions WHERE started_at >= ?1 AND started_at <= ?2 AND ${HUMAN_SESSION_FILTER}`,
      [from, to]
    ),
    d1Query<{ c: number }>(
      `SELECT COUNT(DISTINCT session_id) as c FROM analytics_events
       WHERE event_type = 'PAGE_VIEW' AND path = '/servicos' AND occurred_at >= ?1 AND occurred_at <= ?2 AND ${HUMAN_EVENT_FILTER}`,
      [from, to]
    ),
    d1Query<{ c: number }>(
      `SELECT COUNT(DISTINCT session_id) as c FROM analytics_events
       WHERE event_type = 'PRECONSULTATION_OPENED' AND occurred_at >= ?1 AND occurred_at <= ?2 AND ${HUMAN_EVENT_FILTER}`,
      [from, to]
    ),
    d1Query<{ c: number }>(
      `SELECT COUNT(DISTINCT session_id) as c FROM analytics_events
       WHERE event_type = 'PRECONSULTATION_STARTED' AND occurred_at >= ?1 AND occurred_at <= ?2 AND ${HUMAN_EVENT_FILTER}`,
      [from, to]
    ),
    d1Query<{ c: number }>(
      `SELECT COUNT(DISTINCT session_id) as c FROM analytics_events
       WHERE event_type = 'PRECONSULTATION_COMPLETED' AND occurred_at >= ?1 AND occurred_at <= ?2 AND ${HUMAN_EVENT_FILTER}`,
      [from, to]
    ),
  ]);

  const counts = [
    visitorsRows[0]?.c ?? 0,
    servicesRows[0]?.c ?? 0,
    openedRows[0]?.c ?? 0,
    startedRows[0]?.c ?? 0,
    completedRows[0]?.c ?? 0,
  ];
  const labels = ["Visitantes", "Visitaram serviços", "Abriram pré-consulta", "Iniciaram", "Concluíram"];
  const total = counts[0] || 1;

  return labels.map((stage, index) => ({
    stage,
    count: counts[index],
    percentOfPrevious:
      index === 0 ? null : counts[index - 1] > 0 ? Number(((counts[index] / counts[index - 1]) * 100).toFixed(1)) : 0,
    percentOfTotal: Number(((counts[index] / total) * 100).toFixed(1)),
  }));
}

export interface BlogPostAnalyticsRow {
  path: string;
  views: number;
  sessions: number;
  preconsultationStarts: number;
  conversions: number;
}

export async function getBlogAnalytics(from: string, to: string): Promise<BlogPostAnalyticsRow[]> {
  const viewRows = await d1Query<{ path: string; views: number; sessions: number }>(
    `SELECT path, COUNT(*) as views, COUNT(DISTINCT session_id) as sessions
     FROM analytics_events
     WHERE event_type = 'BLOG_VIEW' AND occurred_at >= ?1 AND occurred_at <= ?2 AND ${HUMAN_EVENT_FILTER}
     GROUP BY path ORDER BY views DESC LIMIT 25`,
    [from, to]
  );
  if (viewRows.length === 0) return [];

  // Atribuicao aproximada: sessao que viu o post E tambem iniciou/concluiu
  // a pre-consulta em algum momento da mesma sessao (nao e last-touch).
  const sessionRows = await d1Query<{ path: string; session_id: string }>(
    `SELECT path, session_id FROM analytics_events
     WHERE event_type = 'BLOG_VIEW' AND occurred_at >= ?1 AND occurred_at <= ?2 AND ${HUMAN_EVENT_FILTER}`,
    [from, to]
  );
  const sessionIdsByPath = new Map<string, Set<string>>();
  for (const row of sessionRows) {
    if (!sessionIdsByPath.has(row.path)) sessionIdsByPath.set(row.path, new Set());
    sessionIdsByPath.get(row.path)!.add(row.session_id);
  }

  const allSessionIds = Array.from(new Set(sessionRows.map((row) => row.session_id)));
  if (allSessionIds.length === 0) {
    return viewRows.map((row) => ({ path: row.path, views: row.views, sessions: row.sessions, preconsultationStarts: 0, conversions: 0 }));
  }

  const placeholders = allSessionIds.map((_, index) => `?${index + 1}`).join(",");
  const [startedRows, completedRows] = await Promise.all([
    d1Query<{ session_id: string }>(
      `SELECT DISTINCT session_id FROM analytics_events WHERE event_type = 'PRECONSULTATION_STARTED' AND session_id IN (${placeholders})`,
      allSessionIds
    ),
    d1Query<{ session_id: string }>(
      `SELECT DISTINCT session_id FROM analytics_events WHERE event_type = 'PRECONSULTATION_COMPLETED' AND session_id IN (${placeholders})`,
      allSessionIds
    ),
  ]);
  const startedSet = new Set(startedRows.map((row) => row.session_id));
  const completedSet = new Set(completedRows.map((row) => row.session_id));

  return viewRows.map((row) => {
    const sessionsForPath = sessionIdsByPath.get(row.path) ?? new Set();
    let starts = 0;
    let conversions = 0;
    for (const sessionId of sessionsForPath) {
      if (startedSet.has(sessionId)) starts++;
      if (completedSet.has(sessionId)) conversions++;
    }
    return { path: row.path, views: row.views, sessions: row.sessions, preconsultationStarts: starts, conversions };
  });
}

export interface DailySessionsPoint {
  dateKey: string;
  sessions: number;
  conversions: number;
}

// Agrupa por dia no fuso de Sao Paulo (offset fixo -03:00, sem horario de
// verao desde 2019 — deslocar 3 horas antes de truncar em `date()` basta).
export async function getSessionsByDay(from: string, to: string): Promise<DailySessionsPoint[]> {
  const rows = await d1Query<{ date_key: string; sessions: number; conversions: number }>(
    `SELECT date(datetime(started_at, '-3 hours')) as date_key,
            COUNT(*) as sessions,
            COALESCE(SUM(converted), 0) as conversions
     FROM analytics_sessions
     WHERE started_at >= ?1 AND started_at <= ?2 AND ${HUMAN_SESSION_FILTER}
     GROUP BY date_key
     ORDER BY date_key ASC`,
    [from, to]
  );
  return rows.map((row) => ({ dateKey: row.date_key, sessions: row.sessions, conversions: row.conversions }));
}

export interface AnalyticsHealth {
  trackingActive: boolean;
  lastEventAt: string | null;
  events24h: number;
  botsFiltered24h: number;
  internalFiltered24h: number;
}

export async function getAnalyticsHealth(now: Date = new Date()): Promise<AnalyticsHealth> {
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [lastEventRows, counts] = await Promise.all([
    d1Query<{ occurred_at: string }>("SELECT occurred_at FROM analytics_events ORDER BY occurred_at DESC LIMIT 1", []),
    d1Query<{ total: number; bots: number; internal: number }>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) as bots,
         SUM(CASE WHEN is_internal = 1 THEN 1 ELSE 0 END) as internal
       FROM analytics_events WHERE occurred_at >= ?1`,
      [since24h]
    ),
  ]);
  const lastEventAt = lastEventRows[0]?.occurred_at ?? null;
  const trackingActive = lastEventAt ? new Date(lastEventAt).getTime() >= now.getTime() - 60 * 60 * 1000 : false;
  const row = counts[0] ?? { total: 0, bots: 0, internal: 0 };
  return {
    trackingActive,
    lastEventAt,
    events24h: row.total ?? 0,
    botsFiltered24h: row.bots ?? 0,
    internalFiltered24h: row.internal ?? 0,
  };
}
