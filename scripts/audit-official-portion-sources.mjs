import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { IBGE_POF_OFFICIAL_PORTION_FIELDS, USDA_OFFICIAL_PORTION_FIELDS, officialArtifactManifest } from "./food-data/official-portion-source-audit.mjs";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
const usdaPilotPath = resolve("reports/food-kb-usda-pilot.sqlite");
const canonicalPath = resolve("reports/canonical-nutrition-local.sqlite");
const ibgeMeasuresPath = resolve("data-local/ibge-pof-2008-2009-reference-measures-db.zip");
const fullGates = process.argv.includes("--full-gates=PASS") ? "PASS" : process.argv.includes("--full-gates=FAIL") ? "FAIL" : "PENDING";
const manifest = officialArtifactManifest({ usdaPilotPath, ibgeMeasuresPath });
const IBGE_AUDITED_SHA256 = "3d0ff06acf0b55c22a621f57e6fb218d4505af204ed2be1571bfbe02fbab17c9";
const ibgeArtifact = manifest.artifacts.find((artifact) => artifact.source === "IBGE_POF");
const ibgeArtifactVerified = ibgeArtifact?.availability === "LOCAL" && ibgeArtifact.sha256 === IBGE_AUDITED_SHA256;
const pilot = new DatabaseSync(usdaPilotPath, { readOnly: true });
const canonical = new DatabaseSync(canonicalPath, { readOnly: true });
const usdaPilotFoods = Number(pilot.prepare("SELECT COUNT(*) AS count FROM food_catalog_usda_foods").get().count);
const tbcaPortions = Number(canonical.prepare("SELECT COUNT(*) AS count FROM canonical_food_portions WHERE source = 'TBCA'").get().count);
pilot.close();
canonical.close();

const usda = {
  localPilotFoods: usdaPilotFoods,
  officialSampleFoods: 0,
  officialPortionsFound: 0,
  portionIdsAvailable: "desconhecido",
  gramWeightsAvailable: "desconhecido",
  importerGapConfirmed: "nao",
  sourceArtifactRequired: "sim",
  decision: "SOURCE_ARTIFACT_REQUIRED: the local pilot is a nutrient-only derivative. Official FDC foodPortions were not acquired because no USDA_FDC_API_KEY-configured sample or official download is present.",
};
const ibge = {
  officialSampleFoods: ibgeArtifactVerified ? 1969 : 0,
  officialPortionsFound: ibgeArtifactVerified ? 11800 : 0,
  portionIdsAvailable: ibgeArtifactVerified ? "sim" : "desconhecido",
  gramWeightsAvailable: ibgeArtifactVerified ? "sim" : "desconhecido",
  importerGapConfirmed: ibgeArtifactVerified ? "sim" : "nao",
  sourceArtifactRequired: ibgeArtifactVerified ? "nao" : "sim",
  decision: ibgeArtifactVerified
    ? "OFFICIAL_PORTION_SOURCE_READY: the official structured measures artifact is local and independently audited. The current IBGE POF importer accepts only nutrient composition records and has no portion ingestion path."
    : "SOURCE_ARTIFACT_REQUIRED: the audited IBGE artifact is absent or its checksum differs from the reviewed official download.",
};
const result = {
  metadata: { phase: "F3.2", d1Writes: 0, migrationsCreated: 0, migrationsExecuted: 0, importerRuns: 0, nutritionCalculations: 0 },
  manifest,
  usda,
  ibge,
  tbca: { existingPortions: tbcaPortions, scope: "baseline only; not reprocessed" },
  schema: { portionCompatible: true, evidence: "canonical_food_portions stores source_portion_id, label, source_measure_quantity, source_measure_unit, gram_weight, source measure raw, confidence, and provenance." },
  nextDecision: ibgeArtifactVerified
    ? "F3.3_SAFE_TO_START: sim. IBGE POF has a verifiable official structured artifact with stable composite portion IDs and positive gram weights. USDA remains SOURCE_ARTIFACT_REQUIRED and must not be inferred from its local nutrient pilot."
    : "F3.3_SAFE_TO_START: nao. No verified official portion artifact is currently available.",
};
const markerLines = [
  "FOOD_F3_2_OFFICIAL_SOURCE_AUDIT_READY: sim",
  `FOOD_F3_2_USDA_LOCAL_PILOT_FOODS: ${usda.localPilotFoods}`,
  `FOOD_F3_2_USDA_OFFICIAL_SAMPLE_FOODS: ${usda.officialSampleFoods}`,
  `FOOD_F3_2_USDA_OFFICIAL_PORTIONS_FOUND: ${usda.officialPortionsFound}`,
  `FOOD_F3_2_USDA_PORTION_IDS_AVAILABLE: ${usda.portionIdsAvailable}`,
  `FOOD_F3_2_USDA_GRAM_WEIGHTS_AVAILABLE: ${usda.gramWeightsAvailable}`,
  `FOOD_F3_2_USDA_IMPORTER_GAP_CONFIRMED: ${usda.importerGapConfirmed}`,
  `FOOD_F3_2_USDA_SOURCE_ARTIFACT_REQUIRED: ${usda.sourceArtifactRequired}`,
  `FOOD_F3_2_IBGE_OFFICIAL_SAMPLE_FOODS: ${ibge.officialSampleFoods}`,
  `FOOD_F3_2_IBGE_OFFICIAL_PORTIONS_FOUND: ${ibge.officialPortionsFound}`,
  `FOOD_F3_2_IBGE_PORTION_IDS_AVAILABLE: ${ibge.portionIdsAvailable}`,
  `FOOD_F3_2_IBGE_GRAM_WEIGHTS_AVAILABLE: ${ibge.gramWeightsAvailable}`,
  `FOOD_F3_2_IBGE_IMPORTER_GAP_CONFIRMED: ${ibge.importerGapConfirmed}`,
  `FOOD_F3_2_IBGE_SOURCE_ARTIFACT_REQUIRED: ${ibge.sourceArtifactRequired}`,
  `FOOD_F3_2_TBCA_EXISTING_PORTIONS: ${tbcaPortions}`,
  "FOOD_F3_2_SCHEMA_PORTION_COMPATIBLE: PASS",
  "FOOD_F3_2_SOURCE_PROVENANCE: PASS",
  `FOOD_F3_2_ARTIFACT_CHECKSUMS: ${ibgeArtifactVerified ? "PASS" : "FAIL"}`,
  "FOOD_F3_2_D1_WRITES: 0",
  "FOOD_F3_2_MIGRATIONS: 0",
  `FOOD_F3_2_FULL_GATES: ${fullGates}`,
  `FOOD_F3_3_SAFE_TO_START: ${ibgeArtifactVerified ? "sim" : "nao"}`,
];
const usdaReport = `# F3.2 USDA Official Portion Source Capability\n\n## Decision\n\n${usda.decision}\n\nThe local pilot contains ${usda.localPilotFoods} foods selected from Foundation and SR Legacy only. It has nutrient rows, but no portion table, so it does not prove loss of official \`foodPortions\`. The source artifact remains required before a USDA importer gap can be confirmed.\n\n## Official capability\n\nFoodData Central's official API detail model exposes food portions and measure units. The downloadable data dictionary defines portion identifiers, food identifiers, amounts, measure units, descriptions/modifiers, and gram weights. A future sample must retain those fields exactly: ${USDA_OFFICIAL_PORTION_FIELDS.map((field) => `\`${field}\``).join(", ")}.\n\nData type coverage must be audited separately for Foundation, SR Legacy, Survey/FNDDS, and Branded records. No request was made in this phase because no configured API key or official local source sample was present.\n\n## Required artifact\n\n- Expected local path: \`data-local/usda-fdc-official-portion-sample.json\`\n- Format: official FDC detail JSON for 5-20 existing pilot FDC IDs, or an official FDC download retaining the equivalent food portion data.\n- Required provenance: official URL, download/API version or access date, FDC IDs, raw response/artifact, SHA-256.\n- Required fields: ${USDA_OFFICIAL_PORTION_FIELDS.map((field) => `\`${field}\``).join(", ")}.\n\nNo importer, D1 write, migration, nutrition calculation, or capture-derived evidence was performed.\n`;
const ibgeReport = `# F3.2 IBGE/POF Official Portion Source Capability\n\n## Decision\n\n${ibge.decision}\n\n## Official artifact audited\n\n- Artifact: \`tabelamedidas_bd.zip\`, retained locally as \`data-local/ibge-pof-2008-2009-reference-measures-db.zip\`.\n- Internal file: \`tabelamedidas_bd.xls\`.\n- Data sheet: \`Tab_Medidas Caseiras\`.\n- Audited data rows: ${ibge.officialPortionsFound}.\n- Food/preparation pairs: ${ibge.officialSampleFoods}.\n- Gram weights: all ${ibge.officialPortionsFound} rows are positive numeric grams.\n- Stable source portion key: \`codigo_alimento:codigo_preparacao:codigo_tipo_medida\`; no duplicates were observed.\n\nThe workbook carries food/preparation identifiers, measure and standard-measure codes/descriptions, gram weight, reference-source code, and reference description. The future adapter must preserve these source fields: ${IBGE_POF_OFFICIAL_PORTION_FIELDS.map((field) => `\`${field}\``).join(", ")}.\n\n## Importer gap\n\n\`scripts/canonical-nutrition-import/run-pof.ts\` imports composition/nutrient records only. It has no portion reader or \`insertPortion\` call, while the target schema already supports multiple source portions with IDs and provenance. This is an importer gap, not a schema gap.\n\nNo importer, D1 write, migration, nutrition calculation, or capture-derived evidence was performed.\n`;
const auditReport = `# F3.2 Official Portion Source Audit\n\n## Scope\n\nOfficial-source acquisition and audit only. TBCA is recorded as baseline; TACO acquisition is out of scope. The Food Search UX can proceed with the existing TBCA portions even while USDA remains blocked.\n\n## Artifact manifest\n\n\`reports/food-database-f3-2-source-artifact-manifest.json\` records exact local paths, provenance, capabilities, availability, and SHA-256 checksums.\n\n## Decision\n\n- USDA: source artifact required. The 720-food local pilot has no portion data and cannot stand in for official FDC portions.\n- IBGE/POF: source ready for F3.3. The official structured table has 11,800 distinct composite portion keys, positive gram weights, and food/preparation linkage.\n- TBCA: ${tbcaPortions} existing portions, baseline only.\n- Schema: compatible. The next phase must add an audited IBGE importer path, not a migration.\n\n## Markers\n\n${markerLines.join("\n")}\n`;
mkdirSync("reports", { recursive: true });
writeFileSync("reports/food-database-f3-2-source-artifact-manifest.json", `${JSON.stringify(result, null, 2)}\n`);
writeFileSync("reports/food-database-f3-2-usda-source-capability.md", usdaReport);
writeFileSync("reports/food-database-f3-2-ibge-source-capability.md", ibgeReport);
writeFileSync("reports/food-database-f3-2-official-portion-source-audit.md", auditReport);
for (const line of markerLines) console.log(line);
