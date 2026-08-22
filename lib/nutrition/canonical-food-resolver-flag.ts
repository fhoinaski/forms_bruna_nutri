/**
 * FASE 4 — feature flag explícita do Canonical Food Resolver Bridge.
 * NUNCA lida por lib/nutrition/food-resolver.ts (o resolver ATIVO) —
 * só por lib/nutrition/canonical-food-shadow.ts (o wrapper novo) e pelos
 * pontos de chamada que optarem, no futuro, por integrar de verdade.
 *
 * Default SEMPRE "off" — nunca ativa produção sozinha, mesmo sem a env var
 * definida (item 2 do pedido: "Nunca ativar produção automaticamente").
 *
 * FASE 6 (item 2) — flag granular por ESCOPO. Cada ponto de chamada real
 * (busca administrativa, substituições, IA de plano) pode ter um modo
 * PRÓPRIO, sem depender de uma única flag global pra tudo — assim
 * `admin_food_search` pode estar em `prefer_canonical` enquanto
 * `substitutions`/`meal_plan_ai` continuam em `shadow`, sem risco de um
 * ligar o outro por engano. Quando a env var especifica do escopo não
 * está definida, cai pro valor da flag GLOBAL (`CANONICAL_FOOD_RESOLVER_MODE`,
 * default "off") — nunca inventa um default "mais permissivo" por escopo.
 */
export type CanonicalFoodResolverMode = "off" | "shadow" | "prefer_canonical";
export type CanonicalFoodResolverScope = "admin_food_search" | "substitutions" | "meal_plan_ai";

const VALID_MODES: readonly CanonicalFoodResolverMode[] = ["off", "shadow", "prefer_canonical"];

const SCOPE_ENV_VAR: Record<CanonicalFoodResolverScope, string> = {
  admin_food_search: "CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH",
  substitutions: "CANONICAL_FOOD_RESOLVER_MODE_SUBSTITUTIONS",
  meal_plan_ai: "CANONICAL_FOOD_RESOLVER_MODE_MEAL_PLAN_AI",
};

function parseMode(raw: string | undefined): CanonicalFoodResolverMode | null {
  const normalized = raw?.trim().toLowerCase();
  if (normalized && (VALID_MODES as readonly string[]).includes(normalized)) return normalized as CanonicalFoodResolverMode;
  return null;
}

export function getCanonicalFoodResolverMode(): CanonicalFoodResolverMode {
  return parseMode(process.env.CANONICAL_FOOD_RESOLVER_MODE) ?? "off";
}

/** FASE 6 (item 2) — modo efetivo pra um escopo especifico: flag do escopo, senão a flag global, senão "off". */
export function getCanonicalFoodResolverModeForScope(scope: CanonicalFoodResolverScope): CanonicalFoodResolverMode {
  return parseMode(process.env[SCOPE_ENV_VAR[scope]]) ?? getCanonicalFoodResolverMode();
}
