import { DatabaseSync } from "node:sqlite";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const dbPath = resolve(process.argv[2] ?? "");
if (!dbPath || !existsSync(dbPath)) {
  console.error("Uso: node scripts/audit-food-kb-v3.mjs <food_knowledge_base_v3.sqlite>");
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: true });

function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function scalar(sql, params = []) {
  const row = get(sql, params);
  return row ? Object.values(row)[0] : null;
}

function tableExists(name) {
  return Boolean(get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1", [name]));
}

function countTable(name) {
  return Number(scalar(`SELECT COUNT(*) FROM "${name}"`) ?? 0);
}

function timedSearch(query) {
  const normalized = query
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const started = performance.now();
  const rows = all(
    `SELECT source, source_id, canonical_name, display_name_pt, normalized_name, data_quality, curation_status
       FROM foods
      WHERE normalized_name LIKE ?1
      ORDER BY
        CASE source
          WHEN 'TACO' THEN 0
          WHEN 'TBCA' THEN 1
          WHEN 'USDA_FOUNDATION' THEN 2
          WHEN 'USDA_SR_LEGACY' THEN 3
          WHEN 'OPEN_FOOD_FACTS' THEN 4
          ELSE 9
        END,
        CASE WHEN normalized_name = ?2 THEN 0 WHEN normalized_name LIKE ?3 THEN 1 ELSE 2 END,
        LENGTH(normalized_name)
      LIMIT 10`,
    [`%${normalized}%`, normalized, `${normalized}%`]
  );
  return { query, ms: Math.round((performance.now() - started) * 100) / 100, rows };
}

const objects = all(
  "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
);
const tables = objects.filter((item) => item.type === "table").map((item) => item.name);

const report = {
  file: {
    path: dbPath,
    bytes: statSync(dbPath).size,
    pageCount: scalar("PRAGMA page_count"),
    pageSize: scalar("PRAGMA page_size"),
  },
  integrityCheck: scalar("PRAGMA integrity_check"),
  foreignKeyCheck: all("PRAGMA foreign_key_check"),
  objects,
  tableCounts: Object.fromEntries(tables.map((table) => [table, countTable(table)])),
  columns: Object.fromEntries(tables.map((table) => [table, all(`PRAGMA table_info("${table}")`)])),
  indexes: Object.fromEntries(tables.map((table) => [table, all(`PRAGMA index_list("${table}")`)])),
  sourceCounts: {},
  quality: {},
  canonical: {},
  clinical: {},
  validation: {},
  searchSamples: [],
};

if (tableExists("foods")) {
  report.sourceCounts.foods = all("SELECT source, COUNT(*) AS count FROM foods GROUP BY source ORDER BY count DESC");
  report.quality.foods = all(
    "SELECT source, data_quality, curation_status, COUNT(*) AS count FROM foods GROUP BY source, data_quality, curation_status ORDER BY source, count DESC"
  );
  report.sourceCounts.barcodes = all(
    "SELECT source, COUNT(*) AS total, SUM(CASE WHEN barcode IS NOT NULL AND TRIM(barcode) != '' THEN 1 ELSE 0 END) AS with_barcode FROM foods GROUP BY source ORDER BY total DESC"
  );
}

if (tableExists("food_nutrients")) {
  report.sourceCounts.nutrients = all("SELECT source, COUNT(*) AS count FROM food_nutrients GROUP BY source ORDER BY count DESC");
  report.quality.nutrientsNulls = all(
    `SELECT source, basis, COUNT(*) AS count,
            SUM(CASE WHEN energy_kcal IS NULL THEN 1 ELSE 0 END) AS energy_null,
            SUM(CASE WHEN protein_g IS NULL THEN 1 ELSE 0 END) AS protein_null,
            SUM(CASE WHEN carbohydrate_g IS NULL THEN 1 ELSE 0 END) AS carbohydrate_null,
            SUM(CASE WHEN fat_g IS NULL THEN 1 ELSE 0 END) AS fat_null
       FROM food_nutrients GROUP BY source, basis ORDER BY source`
  );
}

if (tableExists("food_portions")) {
  report.sourceCounts.portions = all("SELECT source, confidence, COUNT(*) AS count FROM food_portions GROUP BY source, confidence ORDER BY count DESC");
}

if (tableExists("provenance")) {
  report.sourceCounts.provenance = all("SELECT source, COUNT(*) AS count FROM provenance GROUP BY source ORDER BY count DESC");
}

if (tableExists("clinical_trait_candidates")) {
  report.clinical.traitCandidates = all(
    "SELECT source, trait_code, relation, confidence, human_verified, status, COUNT(*) AS count FROM clinical_trait_candidates GROUP BY source, trait_code, relation, confidence, human_verified, status ORDER BY count DESC"
  );
}

if (tableExists("food_clinical_traits")) {
  report.clinical.confirmedTraitCount = countTable("food_clinical_traits");
}

if (tableExists("canonical_group_audits")) {
  report.canonical.auditCounts = all(
    "SELECT risk_level, audit_status, COUNT(*) AS count FROM canonical_group_audits GROUP BY risk_level, audit_status ORDER BY count DESC"
  );
  report.canonical.topAuditedGroups = all(
    `SELECT a.source_record_count, a.risk_level, a.audit_status,
            c.id, c.canonical_name, c.normalized_name, c.preferred_source, c.quality_class
       FROM canonical_group_audits a
       JOIN canonical_foods c ON c.id = a.canonical_food_id
      ORDER BY a.source_record_count DESC
      LIMIT 30`
  );
}

if (tableExists("canonical_foods")) {
  report.canonical.duplicateNormalizedNames = all(
    "SELECT normalized_name, COUNT(*) AS count FROM canonical_foods GROUP BY normalized_name HAVING count > 1 ORDER BY count DESC LIMIT 50"
  );
}

if (tableExists("validation_issues")) {
  report.validation.issues = all("SELECT severity, issue_code, COUNT(*) AS count FROM validation_issues GROUP BY severity, issue_code ORDER BY count DESC");
}

if (tableExists("v3_rejected_records")) {
  report.validation.rejected = all("SELECT entity_type, reason, COUNT(*) AS count FROM v3_rejected_records GROUP BY entity_type, reason ORDER BY count DESC");
}

if (tableExists("foods")) {
  report.searchSamples = ["arroz", "feijao", "banana", "ovo", "leite", "leite sem lactose", "frango", "pao", "aveia"].map(timedSearch);
}

console.log(JSON.stringify(report, null, 2));
db.close();
