import { normalizeText, searchKey } from "./nutrium-normalizer.mjs";

const TRANSLATIONS = { tablespoon: "colher de sopa", teaspoon: "colher de cha", cup: "xicara", slice: "fatia", glass: "copo", ladle: "concha", package: "embalagem", small: "pequena", medium: "media", large: "grande" };

export function normalizeCanonicalPortion(portion) {
  const rawDescription = normalizeText(portion.label ?? portion.rawDescription);
  const key = searchKey(rawDescription);
  const translations = Object.entries(TRANSLATIONS).filter(([english]) => key.includes(english)).map(([, portuguese]) => portuguese);
  const qualifiers = ["small", "medium", "large", "thin", "thick", "heaped", "level", "packed", "pequena", "media", "grande", "fina", "grossa", "cheia", "rasa"].filter((item) => key.includes(item));
  return { sourceFamily: portion.source, sourceFoodId: String(portion.sourceFoodId), canonicalFoodId: portion.canonicalFoodId, sourcePortionId: portion.sourcePortionId ?? null, amount: portion.amount ?? null, measure: rawDescription, displayMeasurePtBr: translations.join(" ") || null, qualifier: qualifiers, grams: portion.grams ?? null, ediblePercent: portion.ediblePercent ?? null, rawDescription, provenance: "CANONICAL_SOURCE_CONFIRMED" };
}

export function compareCaptureToCanonical(capture, canonical) {
  if (!canonical) return { status: "CAPTURE_PORTION_NOT_VERIFIED", evidence: ["SOURCE_REFERENCE_UNAVAILABLE"] };
  const captureName = searchKey(capture.singular || capture.plural);
  const canonicalName = searchKey(canonical.measure);
  if (captureName === canonicalName && Number.isFinite(capture.grams) && Number.isFinite(canonical.grams) && Math.abs(capture.grams - canonical.grams) <= 0.000001) return { status: "CAPTURE_MATCHES_CANONICAL_PORTION", evidence: ["MEASURE_AND_GRAMS_EXACT"] };
  if (captureName === canonicalName) return { status: "CAPTURE_DIFFERS_FROM_CANONICAL", evidence: ["SAME_MEASURE_DIFFERENT_GRAMS"] };
  return { status: "CAPTURE_PORTION_NOT_FOUND_IN_SOURCE", evidence: ["NO_SEMANTIC_MEASURE_MATCH"] };
}

export function sourceReferenceState({ source, hasLocalSourceArtifact, hasImportedPortions, isPartial }) {
  if (isPartial) return "SOURCE_REFERENCE_PARTIAL";
  if (hasImportedPortions) return "SOURCE_REFERENCE_AVAILABLE";
  if (hasLocalSourceArtifact) return "SOURCE_DATASET_DOES_NOT_EXPOSE_PORTIONS";
  return "SOURCE_REFERENCE_UNAVAILABLE";
}
