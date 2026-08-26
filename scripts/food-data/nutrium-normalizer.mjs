const ICON_PREFIXES = [
  "local_fire_department",
  "scatter_plot",
  "radio_button_unchecked",
  "thermostat_carbon",
];

const PREPARATION_TERMS = new Set(["cozido", "cozida", "cru", "crua", "assado", "assada", "grelhado", "grelhada", "frito", "frita", "mexido", "mexida"]);
// Curated from the capture's distinct sourceInfo.label values during F3.
// Unknown labels remain UNKNOWN; this does not infer a brand from food text.
const CAPTURE_BRAND_LABELS = new Set(["Liv Up", "Mundo Verde Seleção", "Atilatte", "Eat Clean", "Elixir", "Dux Nutrition", "Vitafor"]);

export function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function searchKey(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeNutrientLabel(rawLabel) {
  const raw = String(rawLabel ?? "");
  const prefix = ICON_PREFIXES.find((candidate) => raw.startsWith(candidate));
  return {
    rawLabel: raw,
    normalizedLabel: normalizeText(prefix ? raw.slice(prefix.length) : raw),
    removedIconPrefix: prefix ?? null,
  };
}

export function normalizeSource(rawSourceLabel) {
  const raw = normalizeText(rawSourceLabel) || "UNKNOWN";
  const parts = raw.split(",").map(normalizeText).filter(Boolean);
  const upper = raw.toUpperCase();
  const sourceYear = Number(parts.find((part) => /^(?:19|20)\d{2}$/.test(part)) ?? NaN);
  let sourceFamily = "UNKNOWN";
  if (/\bUSDA\b/.test(upper)) sourceFamily = "USDA";
  else if (/\bTACO\b/.test(upper)) sourceFamily = "TACO";
  else if (/\bTCNA\b/.test(upper) && /\bIBGE\b/.test(upper)) sourceFamily = "TCNA_IBGE";
  else if (/\bIBGE\b/.test(upper)) sourceFamily = "IBGE";

  const sourceClassification = ["USDA", "TACO", "TCNA_IBGE", "IBGE"].includes(sourceFamily)
    ? "PUBLIC_DATABASE"
    : CAPTURE_BRAND_LABELS.has(raw) ? "BRAND" : "UNKNOWN";
  if (sourceClassification === "BRAND") sourceFamily = "BRAND";
  return {
    rawSourceLabel: raw,
    sourceFamily,
    sourceYear: Number.isFinite(sourceYear) ? sourceYear : null,
    sourceSecondary: parts.filter((part) => part !== String(sourceYear) && !["USDA", "TACO", "TCNA", "IBGE"].includes(part.toUpperCase())).join(", ") || null,
    sourceClassification,
  };
}

export function parseFoodName(originalName) {
  const normalizedName = normalizeText(originalName);
  const terms = normalizedName.split(",").map(normalizeText).filter(Boolean);
  const preparations = terms.filter((term) => term.split(" ").some((word) => PREPARATION_TERMS.has(searchKey(word))));
  return {
    originalName: String(originalName ?? ""),
    normalizedName,
    searchKey: searchKey(normalizedName),
    baseName: terms[0] ?? normalizedName,
    preparation: preparations.join(", ") || null,
    qualifiers: terms.slice(1).filter((term) => !preparations.includes(term)),
    brandCandidate: null,
  };
}

export function normalizeMeasure(measure) {
  const singular = normalizeText(measure?.singular);
  const plural = normalizeText(measure?.plural);
  return {
    raw: measure ?? null,
    id: measure?.id == null ? null : String(measure.id),
    singular,
    plural,
    normalizedMeasure: searchKey(singular || plural),
    quantity: measure?.quantity ?? null,
    grams: measure?.grams ?? null,
    ediblePortionPercentage: measure?.ediblePortionPercentage ?? null,
  };
}
