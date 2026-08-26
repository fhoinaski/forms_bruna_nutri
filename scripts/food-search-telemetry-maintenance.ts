import { existsSync, readFileSync } from "node:fs";

for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split(/\r?\n/) : []) {
  const separator = line.indexOf("=");
  if (separator <= 0 || line.trimStart().startsWith("#")) continue;
  const key = line.slice(0, separator).trim();
  const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  if (!process.env[key]) process.env[key] = value;
}

const command = process.argv[2];
if (command !== "cleanup" && command !== "aggregate") throw new Error("Use cleanup or aggregate.");
const target = process.env.FOOD_SEARCH_TELEMETRY_TARGET;
const baseUrl = process.env.CLOUDFLARE_D1_API_BASE_URL ?? "";
if (!(["local", "test"].includes(target ?? "") && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseUrl))) {
  throw new Error("Telemetry maintenance permits only local/test D1 shim targets. Set FOOD_SEARCH_TELEMETRY_TARGET and a localhost CLOUDFLARE_D1_API_BASE_URL.");
}
const telemetry = await import("../lib/repositories/food-search-telemetry");
const result = command === "cleanup" ? await telemetry.cleanupFoodSearchTelemetry() : await telemetry.aggregateFoodSearchTelemetry();
console.log(JSON.stringify({ command, target, result }, null, 2));
