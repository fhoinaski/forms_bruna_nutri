import { d1Execute, d1Query } from "@/lib/d1/client";
import type { FoodSearchTelemetryEvent, SearchTelemetryAdapter } from "@/lib/nutrition/food-search-telemetry";

export const FOOD_SEARCH_RAW_RETENTION_DAYS = 30;
export const FOOD_SEARCH_AGGREGATE_RETENTION_DAYS = 180;

type QueryStorage = { value: string | null; status: "STORED" | "REDACTED" };

function queryStorage(event: FoodSearchTelemetryEvent): QueryStorage {
  if (event.type !== "FOOD_SEARCH_PERFORMED" && event.type !== "FOOD_SEARCH_ZERO_RESULTS") return { value: null, status: "REDACTED" };
  return event.query.kind === "RAW_ELIGIBLE"
    ? { value: event.query.normalizedQuery, status: "STORED" }
    : { value: null, status: "REDACTED" };
}

function queryLengthBucket(event: FoodSearchTelemetryEvent): string {
  return event.type === "FOOD_SEARCH_PERFORMED" || event.type === "FOOD_SEARCH_ZERO_RESULTS" ? event.queryLengthBucket : "0";
}

function isoNow(): string {
  return new Date().toISOString();
}

/** D1 implementation. Input validation remains in recordFoodSearchTelemetry. */
export class D1SearchTelemetryAdapter implements SearchTelemetryAdapter {
  async record(event: FoodSearchTelemetryEvent): Promise<void> {
    const query = queryStorage(event);
    const performed = event.type === "FOOD_SEARCH_PERFORMED" ? event : null;
    const selected = event.type === "FOOD_SEARCH_RESULT_SELECTED" ? event : null;
    const portion = event.type === "FOOD_SEARCH_PORTION_SELECTED" ? event : null;
    await d1Execute(`INSERT INTO food_search_events (
      id, schema_version, event_type, occurred_at, query_normalized_sanitized, query_length_bucket, query_status,
      result_count, selected_rank, canonical_food_id, source, preparation_code, portion_type, duration_ms,
      has_exact_match, top_result_source, platform, viewport_class, search_session_id, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)`, [
      crypto.randomUUID(), event.schemaVersion, event.type, isoNow(), query.value, queryLengthBucket(event), query.status,
      performed?.resultCount ?? selected?.resultCount ?? null, selected?.selectedRank ?? portion?.selectedRank ?? null,
      selected?.canonicalFoodId ?? portion?.canonicalFoodId ?? null, selected?.source ?? portion?.source ?? null,
      selected?.preparationCode ?? null, portion?.portionType ?? null, performed?.durationMs ?? null,
      performed === null ? null : Number(performed.hasExactMatch), performed?.topResultSource ?? null,
      performed?.platform ?? null, performed?.viewportClass ?? null, event.sessionSearchId, isoNow(),
    ]);
  }
}

export async function cleanupFoodSearchTelemetry(now = new Date()): Promise<{ rawDeleted: number; aggregatesDeleted: number }> {
  const rawCutoff = new Date(now.getTime() - FOOD_SEARCH_RAW_RETENTION_DAYS * 86_400_000).toISOString();
  const aggregateCutoff = new Date(now.getTime() - FOOD_SEARCH_AGGREGATE_RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
  const beforeRaw = await d1Query<{ count: number }>("SELECT COUNT(*) AS count FROM food_search_events WHERE occurred_at < ?1", [rawCutoff]);
  const beforeAggregates = await d1Query<{ count: number }>("SELECT COUNT(*) AS count FROM food_search_daily_metrics WHERE metric_date < ?1", [aggregateCutoff]);
  await d1Execute("DELETE FROM food_search_events WHERE occurred_at < ?1", [rawCutoff]);
  await d1Execute("DELETE FROM food_search_daily_metrics WHERE metric_date < ?1", [aggregateCutoff]);
  return { rawDeleted: Number(beforeRaw[0]?.count ?? 0), aggregatesDeleted: Number(beforeAggregates[0]?.count ?? 0) };
}

type AggregateRow = {
  metric_date: string; query_key: string | null; query_status: "STORED" | "REDACTED" | "HASH_ONLY" | "REJECTED";
  search_count: number; zero_result_count: number; selection_count: number; top1_selection_count: number; top3_selection_count: number;
  selected_rank_sum: number; selected_rank_count: number; duration_sum: number; duration_count: number; source_selection_counts_json: string;
};

/** Rebuilds every active raw-event day; deterministic replacement makes reruns idempotent. */
export async function aggregateFoodSearchTelemetry(now = new Date()): Promise<{ metricRows: number }> {
  const rawCutoff = new Date(now.getTime() - FOOD_SEARCH_RAW_RETENTION_DAYS * 86_400_000).toISOString();
  const rows = await d1Query<AggregateRow>(`WITH logical_events AS (
    SELECT substr(occurred_at, 1, 10) AS metric_date, query_normalized_sanitized AS query_key, query_status, event_type, selected_rank, source, duration_ms
    FROM food_search_events WHERE event_type IN ('FOOD_SEARCH_PERFORMED', 'FOOD_SEARCH_ZERO_RESULTS') AND occurred_at >= ?1
    UNION ALL
    SELECT substr(e.occurred_at, 1, 10), p.query_normalized_sanitized, p.query_status, e.event_type, e.selected_rank, e.source, NULL
    FROM food_search_events e JOIN food_search_events p ON p.search_session_id = e.search_session_id AND p.event_type = 'FOOD_SEARCH_PERFORMED'
    WHERE e.event_type = 'FOOD_SEARCH_RESULT_SELECTED' AND e.occurred_at >= ?1
  ), metrics AS (
    SELECT metric_date, query_key, query_status,
      SUM(CASE WHEN event_type = 'FOOD_SEARCH_PERFORMED' THEN 1 ELSE 0 END) AS search_count,
      SUM(CASE WHEN event_type = 'FOOD_SEARCH_ZERO_RESULTS' THEN 1 ELSE 0 END) AS zero_result_count,
      SUM(CASE WHEN event_type = 'FOOD_SEARCH_RESULT_SELECTED' THEN 1 ELSE 0 END) AS selection_count,
      SUM(CASE WHEN event_type = 'FOOD_SEARCH_RESULT_SELECTED' AND selected_rank = 1 THEN 1 ELSE 0 END) AS top1_selection_count,
      SUM(CASE WHEN event_type = 'FOOD_SEARCH_RESULT_SELECTED' AND selected_rank <= 3 THEN 1 ELSE 0 END) AS top3_selection_count,
      SUM(CASE WHEN event_type = 'FOOD_SEARCH_RESULT_SELECTED' THEN selected_rank ELSE 0 END) AS selected_rank_sum,
      SUM(CASE WHEN event_type = 'FOOD_SEARCH_RESULT_SELECTED' THEN 1 ELSE 0 END) AS selected_rank_count,
      SUM(CASE WHEN event_type = 'FOOD_SEARCH_PERFORMED' THEN duration_ms ELSE 0 END) AS duration_sum,
      SUM(CASE WHEN event_type = 'FOOD_SEARCH_PERFORMED' THEN 1 ELSE 0 END) AS duration_count
    FROM logical_events GROUP BY metric_date, query_key, query_status
  ), source_counts AS (
    SELECT metric_date, query_key, query_status, source, COUNT(*) AS count
    FROM logical_events WHERE event_type = 'FOOD_SEARCH_RESULT_SELECTED' AND source IS NOT NULL
    GROUP BY metric_date, query_key, query_status, source
  ), source_maps AS (
    SELECT metric_date, query_key, query_status, json_group_object(source, count) AS source_selection_counts_json
    FROM source_counts GROUP BY metric_date, query_key, query_status
  )
  SELECT metrics.*, COALESCE(source_maps.source_selection_counts_json, '{}') AS source_selection_counts_json
  FROM metrics LEFT JOIN source_maps ON source_maps.metric_date = metrics.metric_date
    AND source_maps.query_key IS metrics.query_key AND source_maps.query_status = metrics.query_status`, [rawCutoff]);
  const dates = [...new Set(rows.map((row) => row.metric_date))];
  for (const date of dates) await d1Execute("DELETE FROM food_search_daily_metrics WHERE metric_date = ?1", [date]);
  const timestamp = isoNow();
  for (const row of rows) {
    await d1Execute(`INSERT INTO food_search_daily_metrics (
      metric_date, query_key, query_status, search_count, zero_result_count, selection_count, top1_selection_count,
      top3_selection_count, selected_rank_sum, selected_rank_count, duration_sum, duration_count, source_selection_counts_json, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`, [
      row.metric_date, row.query_key, row.query_status, row.search_count, row.zero_result_count, row.selection_count,
      row.top1_selection_count, row.top3_selection_count, row.selected_rank_sum, row.selected_rank_count,
      row.duration_sum, row.duration_count, row.source_selection_counts_json, timestamp, timestamp,
    ]);
  }
  return { metricRows: rows.length };
}
