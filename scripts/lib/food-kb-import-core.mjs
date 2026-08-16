export const SUPPORTED_SOURCES = ["TACO", "TBCA", "USDA"];

export const RECONCILIATION_CATEGORIES = [
  "EXACT_MATCH",
  "V3_ENRICHES_EXISTING",
  "EXISTING_ENRICHES_V3",
  "VALUE_CONFLICT",
  "V3_ONLY",
  "PROJECT_ONLY",
];

export const NUTRIENT_KEYS = [
  "energyKcal",
  "energyKj",
  "proteinG",
  "carbohydrateG",
  "sugarsG",
  "fatG",
  "saturatedFatG",
  "monounsaturatedFatG",
  "polyunsaturatedFatG",
  "transFatG",
  "fiberG",
  "sodiumMg",
  "calciumMg",
  "ironMg",
  "magnesiumMg",
  "phosphorusMg",
  "potassiumMg",
  "zincMg",
  "copperMg",
  "manganeseMg",
  "seleniumMcg",
  "vitaminAMcg",
  "vitaminCMg",
  "vitaminDMcg",
  "vitaminEMg",
  "thiaminMg",
  "riboflavinMg",
  "niacinMg",
  "vitaminB6Mg",
  "vitaminB12Mcg",
  "folateMcg",
  "cholesterolMg",
];

export const USDA_REQUIRED_MACROS = ["energyKcal", "proteinG", "carbohydrateG", "fatG"];

const ACTION_BY_CATEGORY = {
  EXACT_MATCH: "NOOP",
  V3_ENRICHES_EXISTING: "ENRICH",
  EXISTING_ENRICHES_V3: "NOOP",
  VALUE_CONFLICT: "CONFLICT",
  V3_ONLY: "CREATE",
  PROJECT_ONLY: "NOOP",
};

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeSourceId(source, sourceId) {
  const raw = String(sourceId ?? "").trim();
  if (source === "TACO") {
    return raw.replace(/^TACO\d*:/i, "").replace(/\.0$/, "");
  }
  if (source === "USDA") return raw;
  return raw;
}

export function coerceNutritionNumber(value, { missingAsNull = true } = {}) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined) return missingAsNull ? null : 0;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === "na") return missingAsNull ? null : 0;
  if (normalized === "tr") return 0;
  const parsed = Number(normalized.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : missingAsNull ? null : 0;
}

export function projectTacoRowsToCatalog(rows, { source = "TACO" } = {}) {
  return rows.map((row) => ({
    source,
    sourceId: normalizeSourceId(source, row.tbca_codigo ?? row.numero),
    originalSourceId: String(row.tbca_codigo ?? row.numero),
    name: row.descricao,
    normalizedName: normalizeText(row.descricao),
    group: row.grupo ?? null,
    nutrients: {
      energyKcal: coerceNutritionNumber(row.energia_kcal, { missingAsNull: false }),
      proteinG: coerceNutritionNumber(row.proteina_g, { missingAsNull: false }),
      carbohydrateG: coerceNutritionNumber(row.carboidrato_g, { missingAsNull: false }),
      fatG: coerceNutritionNumber(row.lipidios_g, { missingAsNull: false }),
      fiberG: coerceNutritionNumber(row.fibra_g),
      sodiumMg: coerceNutritionNumber(row.sodio_mg),
      calciumMg: coerceNutritionNumber(row.calcio_mg),
      ironMg: coerceNutritionNumber(row.ferro_mg),
      potassiumMg: coerceNutritionNumber(row.potassio_mg),
      vitaminCMg: coerceNutritionNumber(row.vitamina_c_mg),
    },
  }));
}

export function validateSource(source) {
  if (!SUPPORTED_SOURCES.includes(source)) {
    throw new Error(`Fonte nao suportada: ${source}. Use TACO, TBCA ou USDA.`);
  }
}

export function validateCandidate(candidate) {
  const reasons = [];
  if (!SUPPORTED_SOURCES.includes(candidate.source)) reasons.push("UNSUPPORTED_SOURCE");
  if (!candidate.sourceId || !candidate.normalizedSourceId) reasons.push("MISSING_SOURCE_ID");
  if (!candidate.name || !candidate.normalizedName) reasons.push("MISSING_NAME");
  if (!candidate.nutrients) {
    reasons.push("NUTRIENTS_NOT_FOUND");
  } else {
    for (const key of NUTRIENT_KEYS) {
      const value = candidate.nutrients[key];
      if (typeof value === "number" && value < 0) reasons.push(`NEGATIVE_${key}`);
    }
    if (candidate.source === "USDA") {
      for (const key of USDA_REQUIRED_MACROS) {
        if (candidate.nutrients[key] === null || candidate.nutrients[key] === undefined) reasons.push(`MISSING_REQUIRED_${key}`);
      }
    }
  }
  if (candidate.source === "USDA") {
    if (candidate.upstreamSource !== "USDA_FOUNDATION" && candidate.upstreamSource !== "USDA_SR_LEGACY") reasons.push("UNSUPPORTED_USDA_UPSTREAM_SOURCE");
    if (candidate.basis !== "100_g") reasons.push("UNSUPPORTED_BASIS");
    if (candidate.isBranded) reasons.push("BRANDED_FOOD");
    if (candidate.isRecipe) reasons.push("RECIPE_RECORD");
    if (candidate.canonicalAudit && candidate.canonicalAudit.audit_status !== "REVIEWED" && (candidate.canonicalAudit.risk_level === "HIGH" || candidate.canonicalAudit.risk_level === "MEDIUM")) {
      reasons.push(`CANONICAL_${candidate.canonicalAudit.risk_level}_REVIEW_REQUIRED`);
    }
  }
  return reasons;
}

export function classifyCandidate(candidate, existing, { tolerance = 0.01 } = {}) {
  if (!existing) return { category: "V3_ONLY", action: "CREATE", conflicts: [], enriches: [], existingOnly: [] };

  const conflicts = [];
  const enriches = [];
  const existingOnly = [];

  for (const key of NUTRIENT_KEYS) {
    const v3Value = candidate.nutrients?.[key] ?? null;
    const projectValue = existing.nutrients?.[key] ?? null;
    if (v3Value === null && projectValue === null) continue;
    if (v3Value !== null && projectValue === null) {
      enriches.push({ key, v3Value, projectValue });
      continue;
    }
    if (v3Value === null && projectValue !== null) {
      existingOnly.push({ key, v3Value, projectValue });
      continue;
    }
    if (Math.abs(v3Value - projectValue) > tolerance) {
      conflicts.push({ key, v3Value, projectValue, delta: v3Value - projectValue });
    }
  }

  if (conflicts.length > 0) return { category: "VALUE_CONFLICT", action: "CONFLICT", conflicts, enriches, existingOnly };
  if (enriches.length > 0) return { category: "V3_ENRICHES_EXISTING", action: "ENRICH", conflicts, enriches, existingOnly };
  if (existingOnly.length > 0) return { category: "EXISTING_ENRICHES_V3", action: "NOOP", conflicts, enriches, existingOnly };
  return { category: "EXACT_MATCH", action: "NOOP", conflicts, enriches, existingOnly };
}

export function buildImportPlan({ source, candidates, existingFoods = [], limit = null, batchSize = 20 }) {
  validateSource(source);
  const existingByKey = new Map(existingFoods.map((food) => [`${food.source}:${food.sourceId}`, food]));
  const candidateByKey = new Map();
  const selected = [];

  for (const candidate of candidates.filter((item) => item.source === source)) {
    const key = `${candidate.source}:${candidate.normalizedSourceId}`;
    if (candidateByKey.has(key)) continue;
    candidateByKey.set(key, candidate);
    selected.push(candidate);
    if (limit !== null && selected.length >= limit) break;
  }

  const reconciliation = Object.fromEntries(RECONCILIATION_CATEGORIES.map((category) => [category, []]));
  const actions = { CREATE: [], NOOP: [], ENRICH: [], CONFLICT: [], REJECT: [] };
  const rejectedReasons = {};
  const nulls = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, 0]));
  const zeros = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, 0]));
  const nutrientAvailability = Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, 0]));
  const duplicateNames = new Set();
  const seenNames = new Set();
  let aliasRows = 0;
  let portionRows = 0;
  let plannedAliasRows = 0;
  let plannedPortionRows = 0;

  for (const candidate of selected) {
    const validationReasons = validateCandidate(candidate);
    if (candidate.source === "USDA") {
      if (seenNames.has(candidate.normalizedName)) {
        validationReasons.push("DUPLICATE_NORMALIZED_NAME");
        duplicateNames.add(candidate.normalizedName);
      }
      seenNames.add(candidate.normalizedName);
    }
    for (const key of NUTRIENT_KEYS) {
      const value = candidate.nutrients?.[key] ?? null;
      if (value === null) nulls[key] += 1;
      if (value === 0) zeros[key] += 1;
      if (value !== null) nutrientAvailability[key] += 1;
    }
    aliasRows += candidate.aliases?.length ?? 0;
    portionRows += candidate.portions?.length ?? 0;

    if (validationReasons.length > 0) {
      for (const reason of validationReasons) rejectedReasons[reason] = (rejectedReasons[reason] ?? 0) + 1;
      actions.REJECT.push({ source: candidate.source, sourceId: candidate.sourceId, name: candidate.name, reasons: validationReasons });
      continue;
    }

    const key = `${candidate.source}:${candidate.normalizedSourceId}`;
    const existing = existingByKey.get(key) ?? null;
    const classification = classifyCandidate(candidate, existing);
    const item = {
      source: candidate.source,
      sourceId: candidate.sourceId,
      normalizedSourceId: candidate.normalizedSourceId,
      name: candidate.name,
      projectName: existing?.name ?? null,
      action: classification.action,
      conflicts: classification.conflicts,
      enriches: classification.enriches,
      existingOnly: classification.existingOnly,
    };
    reconciliation[classification.category].push(item);
    actions[classification.action].push(item);
    if (classification.action === "CREATE") {
      plannedAliasRows += candidate.aliases?.length ?? 0;
      plannedPortionRows += candidate.portions?.length ?? 0;
    }
  }

  for (const existing of existingFoods.filter((item) => item.source === source)) {
    const key = `${existing.source}:${existing.sourceId}`;
    if (!candidateByKey.has(key)) {
      reconciliation.PROJECT_ONLY.push({
        source: existing.source,
        sourceId: existing.originalSourceId ?? existing.sourceId,
        normalizedSourceId: existing.sourceId,
        name: existing.name,
        action: ACTION_BY_CATEGORY.PROJECT_ONLY,
      });
    }
  }

  const eligible = selected.length - actions.REJECT.length;
  const batchParamBudget = 100;
  const plannedRows = {
    foods: actions.CREATE.length,
    nutrients: actions.CREATE.reduce((sum, item) => {
      const candidate = selected.find((entry) => entry.source === item.source && entry.normalizedSourceId === item.normalizedSourceId);
      return sum + NUTRIENT_KEYS.filter((key) => candidate?.nutrients?.[key] !== null && candidate?.nutrients?.[key] !== undefined).length;
    }, 0) + actions.ENRICH.length,
    aliases: plannedAliasRows,
    portions: plannedPortionRows,
    provenance: actions.CREATE.length + actions.ENRICH.length,
  };
  const storageEstimateBytes = plannedRows.foods * 640 + plannedRows.nutrients * 128 + plannedRows.aliases * 160 + plannedRows.portions * 192 + plannedRows.provenance * 256;

  return {
    dryRun: true,
    policy: {
      identity: "source + normalized source_id",
      supportedSources: SUPPORTED_SOURCES,
      usdaSelection: {
        enabled: source === "USDA",
        upstreamSources: ["USDA_FOUNDATION", "USDA_SR_LEGACY"],
        requiredMacros: USDA_REQUIRED_MACROS,
        rejects: ["missing required macros", "negative nutrients", "branded foods", "recipe records", "unsupported basis", "duplicate normalized name", "pending HIGH/MEDIUM canonical audits"],
      },
      actions: {
        CREATE: "cria apenas quando a identidade fonte+id nao existe",
        NOOP: "nao altera quando o projeto ja cobre o dado ou o match e exato",
        ENRICH: "planeja preencher somente campos nulos no destino",
        CONFLICT: "nao sobrescreve divergencia nutricional",
        REJECT: "exclui candidatos invalidos do plano",
      },
      batchParamLimit: batchParamBudget,
      requestedBatchSize: batchSize,
      effectiveBatchSize: Math.max(1, Math.min(batchSize, Math.floor(batchParamBudget / 5))),
    },
    summary: {
      source,
      found: selected.length,
      eligible,
      existing: actions.NOOP.length + actions.ENRICH.length + actions.CONFLICT.length,
      new: actions.CREATE.length,
      enrich: actions.ENRICH.length,
      conflicts: actions.CONFLICT.length,
      rejected: actions.REJECT.length,
      aliases: aliasRows,
      portions: portionRows,
      plannedRows,
      storageEstimateBytes,
      storageEstimateMb: Math.round((storageEstimateBytes / 1024 / 1024) * 100) / 100,
      duplicateNormalizedNames: duplicateNames.size,
    },
    nulls,
    zeros,
    nutrientAvailability,
    rejectedReasons,
    actions,
    reconciliation: {
      counts: Object.fromEntries(RECONCILIATION_CATEGORIES.map((category) => [category, reconciliation[category].length])),
      items: reconciliation,
    },
  };
}
