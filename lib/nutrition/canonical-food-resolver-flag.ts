/**
 * FASE 4 — feature flag explícita do Canonical Food Resolver Bridge.
 * NUNCA lida por lib/nutrition/food-resolver.ts (o resolver ATIVO) —
 * só por lib/nutrition/canonical-food-shadow.ts (o wrapper novo) e pelos
 * pontos de chamada que optarem, no futuro, por integrar de verdade.
 *
 * Default SEMPRE "off" — nunca ativa produção sozinha, mesmo sem a env var
 * definida (item 2 do pedido: "Nunca ativar produção automaticamente").
 */
export type CanonicalFoodResolverMode = "off" | "shadow" | "prefer_canonical";

const VALID_MODES: readonly CanonicalFoodResolverMode[] = ["off", "shadow", "prefer_canonical"];

export function getCanonicalFoodResolverMode(): CanonicalFoodResolverMode {
  const raw = process.env.CANONICAL_FOOD_RESOLVER_MODE?.trim().toLowerCase();
  if (raw && (VALID_MODES as readonly string[]).includes(raw)) return raw as CanonicalFoodResolverMode;
  return "off";
}
