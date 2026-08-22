import { createHash } from "node:crypto";
import type { CanonicalFoodSource } from "@/lib/nutrition-import/types";

/**
 * ID canonico estavel: {source_lowercase}:{collection_short}:{source_food_id}
 * (ver "IDs canonicos" em docs/canonical-nutrition-model.md). O
 * source_food_id pode conter caracteres nao seguros para uma PK legivel
 * (raro, mas POF usa "codigo:preparo" com ':' dentro) — normalizamos so o
 * suficiente para manter o id determinístico e legivel, nunca opaco.
 */
const COLLECTION_SHORT: Record<string, string> = {
  composicao_alimentos_medidas_caseiras: "medidas_caseiras",
  composicao_informacao_estatistica: "estatistica",
  composicao_informacao_estatistica_produtos: "produtos",
  biodiversidade_e_alimentos_regionais: "biodiversidade",
};

function sanitizeIdSegment(value: string): string {
  return value.trim().replace(/\s+/g, "_");
}

export function buildCanonicalFoodId(source: CanonicalFoodSource, sourceFoodId: string, sourceCollection: string | null): string {
  const prefix = source.toLowerCase();
  const collectionSegment = sourceCollection ? `${COLLECTION_SHORT[sourceCollection] ?? sanitizeIdSegment(sourceCollection)}:` : "";
  return `${prefix}:${collectionSegment}${sanitizeIdSegment(sourceFoodId)}`;
}

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

export function buildNutrientValueId(canonicalFoodId: string, sourceNutrientId: string, portionId: string | null): string {
  return `fnv_${shortHash(`${canonicalFoodId}|${sourceNutrientId}|${portionId ?? ""}`)}`;
}

export function buildPortionId(canonicalFoodId: string, sourcePortionId: string | null, label: string): string {
  return `cfp_${shortHash(`${canonicalFoodId}|${sourcePortionId ?? ""}|${label}`)}`;
}

export function buildNutrientStatisticsId(canonicalFoodId: string, sourceNutrientId: string): string {
  return `nst_${shortHash(`${canonicalFoodId}|${sourceNutrientId}`)}`;
}

export function buildAliasId(canonicalFoodId: string, normalizedAlias: string): string {
  return `alias_${shortHash(`${canonicalFoodId}|${normalizedAlias}`)}`;
}

export function fileSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
