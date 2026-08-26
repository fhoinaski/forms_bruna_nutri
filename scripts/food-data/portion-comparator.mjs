import { normalizeMeasure } from "./nutrium-normalizer.mjs";

const TOLERANCE = 0.000001;
export function comparePortions(captureMeasures, canonicalPortions) {
  const canonicalByName = new Map();
  for (const portion of canonicalPortions) {
    const key = normalizeMeasure({ singular: portion.label }).normalizedMeasure;
    if (!canonicalByName.has(key)) canonicalByName.set(key, []);
    canonicalByName.get(key).push(portion);
  }
  return captureMeasures.map((raw) => {
    const capture = normalizeMeasure(raw);
    const candidates = canonicalByName.get(capture.normalizedMeasure) ?? [];
    if (!canonicalPortions.length) return { capture, status: "PORTION_UNSUPPORTED", canonical: null };
    if (!candidates.length) return { capture, status: "PORTION_NEW_CANDIDATE", canonical: null };
    if (candidates.length > 1) return { capture, status: "PORTION_AMBIGUOUS", canonical: null };
    const canonical = candidates[0];
    if (Number.isFinite(capture.grams) && Number.isFinite(canonical.gramWeight) && Math.abs(capture.grams - canonical.gramWeight) <= TOLERANCE) return { capture, canonical, status: "PORTION_EXACT" };
    return { capture, canonical, status: "PORTION_SAME_NAME_DIFFERENT_GRAMS" };
  });
}
