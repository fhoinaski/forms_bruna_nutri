import { createHash } from "node:crypto";
import { normalizeMeasure, normalizeText, searchKey } from "./nutrium-normalizer.mjs";
import { preparationKey } from "./canonical-food-matcher.mjs";

const MEASURE_KINDS = [["colher de sopa", "TABLESPOON"], ["colher sopa", "TABLESPOON"], ["colher de cha", "TEASPOON"], ["xicara", "CUP"], ["fatia", "SLICE"], ["copo", "GLASS"], ["concha", "LADLE"], ["embalagem", "PACKAGE"], ["pote", "PACKAGE"], ["unidade", "UNIT"], ["porcao", "PORTION"]];

export function classifyMeasure(raw) {
  const measure = normalizeMeasure(raw);
  const key = measure.normalizedMeasure;
  const kind = MEASURE_KINDS.find(([token]) => key.includes(token.replace(/ de /g, " ")) || key.includes(searchKey(token)))?.[1] ?? "OTHER";
  const qualifiers = ["pequena", "medio", "media", "grande", "fina", "grosso", "grossa"].filter((item) => key.includes(item));
  return { ...measure, measureKind: kind, qualifiers };
}

export function proposalId({ canonicalFoodId, captureId, type, proposedValue }) {
  return `f3_${createHash("sha256").update([canonicalFoodId, captureId, type, JSON.stringify(proposedValue)].join("|"), "utf8").digest("hex").slice(0, 16)}`;
}

export function portionProposal({ canonicalFoodId, captureId, source, raw, existingPortions, suspicious = false }) {
  const measure = classifyMeasure(raw);
  const sameName = existingPortions.filter((portion) => searchKey(portion.label) === measure.normalizedMeasure);
  let status = "PORTION_REVIEW_REQUIRED";
  let evidence = ["IDENTITY_CONFIRMED", "CAPTURED_VIA_NUTRIUM_CAPTURE", "CAPTURED_SOURCE_UNVERIFIED"];
  if (measure.grams === null || !Number.isFinite(measure.grams) || measure.grams <= 0 || !measure.normalizedMeasure) {
    status = "PORTION_REJECTED"; evidence = ["INVALID_OR_MISSING_GRAMS"];
  } else if (suspicious) {
    status = "PORTION_REVIEW_REQUIRED"; evidence.push("F1_MEASURE_SUSPICIOUS");
  } else if (sameName.some((portion) => Number.isFinite(portion.gramWeight) && Math.abs(portion.gramWeight - measure.grams) <= 0.000001)) {
    status = "PORTION_EXISTING_EXACT"; evidence = ["CANONICAL_PORTION_EXACT"];
  } else if (sameName.length) {
    status = "PORTION_CONFLICT"; evidence = ["CANONICAL_SAME_MEASURE_DIFFERENT_GRAMS"];
  }
  return { canonicalFoodId, captureId, type: "PORTION", currentValue: sameName, proposedValue: { ...measure, sourceFamily: source.sourceFamily, sourceProvenance: "CAPTURED_SOURCE_UNVERIFIED", capturedVia: "NUTRIUM_CAPTURE" }, source: source.rawSourceLabel, capturedVia: "NUTRIUM_CAPTURE", evidence, status };
}

export function aliasProposal({ canonicalFoodId, captureId, captureName, canonicalName, source, preparationMatches, existingAliases }) {
  const normalizedCapture = searchKey(captureName);
  const existing = new Set([searchKey(canonicalName), ...existingAliases.map((item) => searchKey(item.alias))]);
  if (source.sourceClassification === "BRAND") return { canonicalFoodId, captureId, type: "ALIAS", currentValue: null, proposedValue: captureName, source: source.rawSourceLabel, capturedVia: "NUTRIUM_CAPTURE", evidence: ["BRAND_ISOLATION"], status: "REJECTED" };
  if (!preparationMatches) return { canonicalFoodId, captureId, type: "ALIAS", currentValue: null, proposedValue: captureName, source: source.rawSourceLabel, capturedVia: "NUTRIUM_CAPTURE", evidence: ["PREPARATION_MISMATCH"], status: "REVIEW_REQUIRED" };
  if (existing.has(normalizedCapture)) return { canonicalFoodId, captureId, type: "ALIAS", currentValue: null, proposedValue: captureName, source: source.rawSourceLabel, capturedVia: "NUTRIUM_CAPTURE", evidence: ["SEARCH_NORMALIZATION_ALREADY_COVERS_VALUE"], status: "NO_CHANGE" };
  return { canonicalFoodId, captureId, type: "ALIAS", currentValue: null, proposedValue: captureName, source: source.rawSourceLabel, capturedVia: "NUTRIUM_CAPTURE", evidence: ["IDENTITY_CONFIRMED", "PREPARATION_MATCH", "SOURCE_NAME_ADDS_DISCOVERABILITY"], status: "SAFE_CANDIDATE" };
}

export function preparationCandidate(captureName, canonicalPreparation) {
  const candidate = preparationKey(captureName);
  if (!candidate) return { value: null, status: "NO_CHANGE" };
  if (canonicalPreparation && preparationKey(canonicalPreparation) === candidate) return { value: candidate, status: "NO_CHANGE" };
  return { value: candidate, status: "REVIEW_REQUIRED" };
}

export function safeDisplayName(name) {
  const cleaned = normalizeText(name).replace(/,\s*/g, ", ");
  return { value: cleaned, changed: cleaned !== name };
}
