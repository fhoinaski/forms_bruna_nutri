import { z } from "zod";

/** F9 defines safe future events only. The default adapter is a zero-write no-op. */
export const FOOD_SEARCH_TELEMETRY_SCHEMA_VERSION = 1;
export const FOOD_SEARCH_TELEMETRY_MAX_QUERY_LENGTH = 64;

const sourceSchema = z.enum(["TBCA", "IBGE_POF", "TACO", "USDA", "CUSTOM", "MANUFACTURER", "COMPLEMENTARY"]);
const sessionSearchIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
const timestampBucketSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:00Z$/);
const queryLengthBucketSchema = z.enum(["0", "1_16", "17_32", "33_64", "65_PLUS"]);
const queryStorageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("RAW_ELIGIBLE"), normalizedQuery: z.string().min(1).max(FOOD_SEARCH_TELEMETRY_MAX_QUERY_LENGTH) }).strict(),
  z.object({ kind: z.literal("REDACTED"), reason: z.enum(["EMPTY", "TOO_LONG", "EMAIL_LIKE", "PHONE_LIKE", "IDENTIFIER_LIKE", "FREE_TEXT_LIKE"]) }).strict(),
]);

const commonSchema = z.object({ schemaVersion: z.literal(FOOD_SEARCH_TELEMETRY_SCHEMA_VERSION), sessionSearchId: sessionSearchIdSchema }).strict();
export const foodSearchTelemetryEventSchema = z.discriminatedUnion("type", [
  commonSchema.extend({ type: z.literal("FOOD_SEARCH_PERFORMED"), timestampBucket: timestampBucketSchema, query: queryStorageSchema, queryLengthBucket: queryLengthBucketSchema, resultCount: z.number().int().min(0).max(50), durationMs: z.number().min(0).max(30_000), hasExactMatch: z.boolean(), topResultSource: sourceSchema.nullable(), platform: z.enum(["web"]), viewportClass: z.enum(["compact", "regular", "wide"]) }).strict(),
  commonSchema.extend({ type: z.literal("FOOD_SEARCH_RESULT_SELECTED"), selectedRank: z.number().int().min(1).max(50), canonicalFoodId: z.string().min(1).max(128).nullable(), source: sourceSchema, preparationCode: z.string().min(1).max(32).nullable(), resultCount: z.number().int().min(1).max(50) }).strict(),
  commonSchema.extend({ type: z.literal("FOOD_SEARCH_ZERO_RESULTS"), query: queryStorageSchema, queryLengthBucket: queryLengthBucketSchema }).strict(),
  commonSchema.extend({ type: z.literal("FOOD_SEARCH_PORTION_SELECTED"), canonicalFoodId: z.string().min(1).max(128).nullable(), source: sourceSchema, portionType: z.enum(["OFFICIAL", "FALLBACK_100G"]), selectedRank: z.number().int().min(1).max(50).nullable() }).strict(),
]);

export type FoodSearchTelemetryEvent = z.infer<typeof foodSearchTelemetryEventSchema>;
export type FoodSearchTelemetrySource = z.infer<typeof sourceSchema>;
export type FoodSearchQueryStorage = z.infer<typeof queryStorageSchema>;
export type FoodSearchQuerySanitization = { query: FoodSearchQueryStorage; queryLengthBucket: z.infer<typeof queryLengthBucketSchema> };

function normalizeQuery(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function lengthBucket(length: number): FoodSearchQuerySanitization["queryLengthBucket"] {
  if (length === 0) return "0";
  if (length <= 16) return "1_16";
  if (length <= 32) return "17_32";
  if (length <= FOOD_SEARCH_TELEMETRY_MAX_QUERY_LENGTH) return "33_64";
  return "65_PLUS";
}

/** No LLM or clinical-term blacklist: structural minimization only. */
export function sanitizeFoodSearchQuery(input: string): FoodSearchQuerySanitization {
  const raw = String(input ?? "").trim();
  const queryLengthBucket = lengthBucket(raw.length);
  const redact = (reason: Extract<FoodSearchQueryStorage, { kind: "REDACTED" }>["reason"]): FoodSearchQuerySanitization => ({ query: { kind: "REDACTED", reason }, queryLengthBucket });
  if (!raw) return redact("EMPTY");
  if (raw.length > FOOD_SEARCH_TELEMETRY_MAX_QUERY_LENGTH) return redact("TOO_LONG");
  if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(raw)) return redact("EMAIL_LIKE");
  if (/\+?\d[\d\s().-]{7,}\d/.test(raw)) return redact("PHONE_LIKE");
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(raw) || /\b\d{11,}\b/.test(raw)) return redact("IDENTIFIER_LIKE");
  if (raw.split(/\s+/).length > 5) return redact("FREE_TEXT_LIKE");
  const normalizedQuery = normalizeQuery(raw);
  return normalizedQuery ? { query: { kind: "RAW_ELIGIBLE", normalizedQuery }, queryLengthBucket } : redact("EMPTY");
}

export function parseFoodSearchTelemetryEvent(input: unknown): FoodSearchTelemetryEvent {
  return foodSearchTelemetryEventSchema.parse(input);
}

export interface SearchTelemetryAdapter {
  record(event: FoodSearchTelemetryEvent): Promise<void>;
}

/** Zero-write default until persistence, retention, and privacy are explicitly approved. */
export const foodSearchTelemetry: SearchTelemetryAdapter = { record: async () => undefined };

/** Future adapters are best-effort; telemetry must never block food search UX. */
export async function recordFoodSearchTelemetry(adapter: SearchTelemetryAdapter, event: unknown): Promise<void> {
  try {
    await adapter.record(parseFoodSearchTelemetryEvent(event));
  } catch {
    // Never log the event because an eligible raw food query might be present.
  }
}
