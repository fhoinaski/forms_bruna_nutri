import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const USDA_OFFICIAL_PORTION_FIELDS = ["id", "fdc_id", "amount", "measure_unit_id", "portion_description", "modifier", "gram_weight"];
export const IBGE_POF_OFFICIAL_PORTION_FIELDS = ["codigo_alimento", "codigo_preparacao", "codigo_tipo_medida", "descricao_tipo_medida", "quantidade_em_gramas", "codigo_fonte_referencia"];

function text(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function number(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Keeps official USDA foodPortion semantics intact. This is an audit adapter,
 * not an importer and it never fills absent IDs, amounts, or gram weights.
 */
/** @param {string | null | undefined} sourceFoodId */
export function normalizeUsdaPortion(raw, sourceFoodId = null) {
  const measureUnit = raw?.measureUnit ?? raw?.measure_unit ?? null;
  const rawDescription = text(raw?.portionDescription ?? raw?.portion_description);
  return {
    source: "USDA",
    sourceFoodId: text(raw?.fdcId ?? raw?.fdc_id ?? sourceFoodId),
    sourcePortionId: text(raw?.id),
    amount: number(raw?.amount),
    measure: text(measureUnit?.name ?? measureUnit?.abbreviation ?? raw?.measureUnitName ?? raw?.measure_unit_name),
    qualifier: text(raw?.modifier),
    grams: number(raw?.gramWeight ?? raw?.gram_weight),
    rawDescription,
    raw: raw ?? null,
  };
}

export function normalizeIbgePofPortion(raw) {
  const sourceFoodId = text(raw?.foodCode ?? raw?.codigo_alimento);
  const preparationCode = text(raw?.preparationCode ?? raw?.codigo_preparacao);
  const measureCode = text(raw?.measureCode ?? raw?.codigo_tipo_medida);
  return {
    source: "IBGE_POF",
    sourceFoodId: sourceFoodId && preparationCode ? `${sourceFoodId}:${preparationCode}` : sourceFoodId,
    sourcePortionId: sourceFoodId && preparationCode && measureCode ? `${sourceFoodId}:${preparationCode}:${measureCode}` : null,
    amount: 1,
    measure: text(raw?.measureDescription ?? raw?.descricao_tipo_medida),
    qualifier: null,
    grams: number(raw?.grams ?? raw?.quantidade_em_gramas),
    rawDescription: text(raw?.referenceDescription ?? raw?.descricao_alimento_referencia),
    raw: raw ?? null,
  };
}

export function sha256File(path) {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function localArtifact(path) {
  const absolutePath = resolve(path);
  if (!existsSync(absolutePath)) return { localPath: absolutePath, availability: "NOT_PRESENT", sha256: null, bytes: null };
  return { localPath: absolutePath, availability: "LOCAL", sha256: sha256File(absolutePath), bytes: statSync(absolutePath).size };
}

export function officialArtifactManifest({ usdaPilotPath, ibgeMeasuresPath }) {
  return {
    generatedBy: "F3.2 official portion source audit",
    policy: "Audit and source acquisition only. No import, D1 write, migration, capture provenance, or nutrition calculation.",
    artifacts: [
      {
        source: "USDA",
        artifactName: "Local USDA nutrient pilot",
        version: "USDA_PILOT_20260816",
        type: "SQLite pilot cache",
        ...localArtifact(usdaPilotPath),
        officialOrigin: "Derived local pilot; it is not an official FDC foodPortions artifact.",
        containsNutrients: true,
        containsPortions: false,
        containsMeasures: false,
        containsGramWeights: false,
        stablePortionIds: false,
        notes: "720 USDA Foundation/SR Legacy foods only. Existing pilot schema persists nutrient rows, not portions.",
      },
      {
        source: "USDA",
        artifactName: "USDA FoodData Central official detail/download sample",
        version: null,
        type: "FDC API food detail JSON or official Foundation/SR Legacy/Survey/FNDDS download",
        localPath: resolve("data-local/usda-fdc-official-portion-sample.json"),
        officialOrigin: "https://fdc.nal.usda.gov/api-spec/fdc_api.html and https://fdc.nal.usda.gov/download-datasets/",
        containsNutrients: true,
        containsPortions: true,
        containsMeasures: true,
        containsGramWeights: true,
        stablePortionIds: true,
        availability: "SOURCE_ARTIFACT_REQUIRED",
        sha256: null,
        bytes: null,
        notes: "Acquire at most 5-20 existing pilot FDC IDs using configured USDA_FDC_API_KEY, or retain the official downloaded artifact and its version metadata. Audit data types separately: Foundation, SR Legacy, Survey/FNDDS, and Branded may differ in coverage.",
      },
      {
        source: "IBGE_POF",
        artifactName: "tabelamedidas_bd.zip / tabelamedidas_bd.xls",
        version: "POF 2008-2009, official download dated 2016-08-17",
        type: "ZIP containing structured XLS reference-measures table",
        ...localArtifact(ibgeMeasuresPath),
        officialOrigin: "https://ftp.ibge.gov.br/Orcamentos_Familiares/Pesquisa_de_Orcamentos_Familiares_2008_2009/Tabela_de_Medidas_Referidas_para_os_Alimentos_Consumidos_no_Brasil/tabelamedidas_bd.zip",
        containsNutrients: false,
        containsPortions: true,
        containsMeasures: true,
        containsGramWeights: true,
        stablePortionIds: true,
        notes: "Verified from the official XLS: 11,800 measure rows; the composite food code, preparation code, and measure code is unique; every audited row has a positive gram weight.",
      },
    ],
  };
}
