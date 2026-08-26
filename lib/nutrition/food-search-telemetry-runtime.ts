import { D1SearchTelemetryAdapter } from "@/lib/repositories/food-search-telemetry";
import { foodSearchTelemetry, type SearchTelemetryAdapter } from "@/lib/nutrition/food-search-telemetry";

export type FoodSearchTelemetryMode = "OFF" | "NOOP" | "PERSIST";

export function getFoodSearchTelemetryMode(value = process.env.SEARCH_TELEMETRY_MODE): FoodSearchTelemetryMode {
  return value === "PERSIST" ? "PERSIST" : value === "NOOP" ? "NOOP" : "OFF";
}

export function getFoodSearchTelemetryAdapter(mode = getFoodSearchTelemetryMode()): SearchTelemetryAdapter | null {
  if (mode === "OFF") return null;
  return mode === "PERSIST" ? new D1SearchTelemetryAdapter() : foodSearchTelemetry;
}
