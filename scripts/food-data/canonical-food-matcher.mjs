import { normalizeText, parseFoodName, searchKey } from "./nutrium-normalizer.mjs";

export const SOURCE_TO_CANONICAL = { TACO: "TACO", TCNA_IBGE: "IBGE_POF", IBGE: "IBGE_POF", USDA: "USDA" };

export function preparationKey(value) {
  return searchKey(value ?? "").replace(/cozida|cozido/g, "cozido").replace(/frita|frito/g, "frito").replace(/mexida|mexido/g, "mexido").replace(/crua|cru/g, "cru").trim();
}

export function buildCanonicalIndexes(foods) {
  const bySourceId = new Map();
  const bySourceName = new Map();
  const bySourceNormalized = new Map();
  const put = (map, key, food) => { if (!map.has(key)) map.set(key, []); map.get(key).push(food); };
  for (const food of foods) {
    put(bySourceId, `${food.source}|${food.sourceFoodId}`, food);
    put(bySourceName, `${food.source}|${normalizeText(food.name)}`, food);
    put(bySourceNormalized, `${food.source}|${searchKey(food.name)}`, food);
  }
  return { bySourceId, bySourceName, bySourceNormalized };
}

function evidence(type, candidate) {
  return { type, canonicalFoodId: candidate.id, canonicalName: candidate.name, canonicalSource: candidate.source };
}

export function matchCaptureFood(capture, indexes) {
  const family = capture.source.sourceFamily;
  const source = SOURCE_TO_CANONICAL[family] ?? null;
  if (!source) return { matchType: "MATCH_REVIEW_REQUIRED", candidate: null, candidates: [], evidence: ["SOURCE_DATASET_UNAVAILABLE_OR_UNKNOWN"], identityStatus: "UNRESOLVED" };
  const idMatches = indexes.bySourceId.get(`${source}|${capture.externalId}`) ?? [];
  if (idMatches.length === 1) return { matchType: "MATCH_EXACT_SOURCE_ID", candidate: idMatches[0], candidates: idMatches, evidence: [evidence("SOURCE_ID_MATCH", idMatches[0])], identityStatus: "CONFIRMED" };
  const exactName = indexes.bySourceName.get(`${source}|${normalizeText(capture.name.originalName)}`) ?? [];
  if (exactName.length === 1) return { matchType: "MATCH_EXACT_SOURCE_NAME", candidate: exactName[0], candidates: exactName, evidence: [evidence("EXACT_NAME", exactName[0])], identityStatus: "CONFIRMED" };
  const normalized = indexes.bySourceNormalized.get(`${source}|${capture.name.searchKey}`) ?? [];
  if (normalized.length === 1) {
    const candidatePreparation = preparationKey(normalized[0].preparationMethod ?? normalized[0].preparationName);
    const capturePreparation = preparationKey(capture.name.preparation);
    if (capturePreparation && candidatePreparation && capturePreparation !== candidatePreparation) return { matchType: "MATCH_REVIEW_REQUIRED", candidate: normalized[0], candidates: normalized, evidence: [evidence("NORMALIZED_NAME", normalized[0]), "PREPARATION_MISMATCH"], identityStatus: "UNRESOLVED" };
    return { matchType: "MATCH_EXACT_NORMALIZED_NAME", candidate: normalized[0], candidates: normalized, evidence: [evidence("NORMALIZED_NAME", normalized[0])], identityStatus: "CONFIRMED" };
  }
  if (normalized.length > 1) {
    const capturePreparation = preparationKey(capture.name.preparation);
    const prepared = capturePreparation ? normalized.filter((candidate) => preparationKey(candidate.preparationMethod ?? candidate.preparationName) === capturePreparation) : [];
    if (prepared.length === 1) return { matchType: "MATCH_NAME_PREPARATION", candidate: prepared[0], candidates: prepared, evidence: [evidence("NORMALIZED_NAME", prepared[0]), evidence("PREPARATION_MATCH", prepared[0])], identityStatus: "CONFIRMED" };
    return { matchType: "MATCH_AMBIGUOUS", candidate: null, candidates: normalized, evidence: ["MULTIPLE_CANONICAL_CANDIDATES"], identityStatus: "AMBIGUOUS" };
  }
  return { matchType: "MATCH_NOT_FOUND", candidate: null, candidates: [], evidence: ["NO_SOURCE_SCOPED_CANDIDATE"], identityStatus: "NOT_FOUND" };
}

export function captureModel(food, source) {
  return { externalId: food?.externalId == null ? null : String(food.externalId), source, name: parseFoodName(food?.name) };
}
