// @ts-nocheck
// Migração SEGURA de dados cifrados legados ("enc:v1:") do D1.
//
// Modos:
//   --dry-run  (default)  só lê e classifica; NUNCA escreve.
//   --apply               cria backup, verifica, e aplica UPDATE condicional.
//
// Nunca loga plaintext/ciphertext/secret/IV/tag/dados clínicos.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveKey, classifyValue, validateKeyConfig, verifyBackupManifest } from "./lib/migrate-encrypted-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP_DIR = join(root, ".backups");

const NUTRITION = ["chief_complaint","life_stage","biological_sex","target_group","gestational_weeks","breastfeeding_context","clinical_history","diagnoses","medications","supplements","allergies","restrictions","food_preferences","food_aversions","eating_routine","intestinal_health","sleep_routine","stress_context","physical_activity","hydration","current_weight_kg","height_cm","bmi","pre_pregnancy_weight_kg","waist_cm","pre_surgery_weight_kg","bariatric_surgery_date","anthropometry_notes","pediatric_growth_notes","target_weight_kg","target_notes","exams","assessment","goals","care_plan","risk_flags","family_context","private_notes"];

// Escopo = TODOS os campos cifrados com a finalidade "clinical"
// (lib/security/encrypted-fields.ts), espelhando a auditoria: prontuários,
// sessões de consulta (notas/resumo), formulário, evoluções, intake e a
// credencial ai_settings.api_key (que ainda usa a cadeia "clinical").
const TABLES = [
  { t: "nutrition_records", f: NUTRITION },
  { t: "consultation_sessions", f: ["notes", "ai_brief_json", "summary_json"] },
  { t: "ai_settings", f: ["api_key"] },
  { t: "form_submissions", f: ["answers_json"] },
  { t: "client_evolutions", f: ["encrypted_payload"] },
  { t: "patient_intake_sessions", f: ["state_json"] },
];

const rawKeys = {};
function loadEnv() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const sep = line.indexOf("=");
    if (sep <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, "");
    (rawKeys[key] ??= []).push(value);
  }
}

function resolveKeys() {
  const distinct = (k) => [...new Set(rawKeys[k] ?? [])];
  const lastOf = (k) => { const d = distinct(k); return d.length ? d[d.length - 1] : null; };
  const legacyFor = (migrationVar, targetKey) => {
    const explicit = process.env[migrationVar] ?? lastOf(migrationVar);
    if (explicit) return explicit;
    const cands = distinct(targetKey).filter((v) => v !== lastOf(targetKey));
    return cands.length === 1 ? cands[0] : null;
  };
  return {
    authSecret: lastOf("AUTH_SECRET"),
    currentClinical: lastOf("CLINICAL_DATA_ENCRYPTION_KEY"),
    currentMfa: lastOf("MFA_ENCRYPTION_KEY"),
    legacyClinical: legacyFor("MIGRATION_LEGACY_CLINICAL_KEY", "CLINICAL_DATA_ENCRYPTION_KEY"),
    legacyMfa: legacyFor("MIGRATION_LEGACY_MFA_KEY", "MFA_ENCRYPTION_KEY"),
  };
}

loadEnv();
for (const k of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_D1_API_TOKEN"]) {
  const vals = rawKeys[k] ?? [];
  if (vals.length) process.env[k] = vals[vals.length - 1];
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;

async function q(sql, params = []) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(params.length ? { sql, params } : { sql }),
  });
  const d = await r.json();
  const bad = d.result?.find((x) => !x.success);
  if (!r.ok || !d.success || bad) throw new Error(d.errors?.map((e) => e.message).join("; ") || "D1 fail");
  return d.result?.[0]?.results ?? [];
}

function buildKeys(keys) {
  const d = (s) => (s ? deriveKey(s) : null);
  return {
    currentClinical: d(keys.currentClinical),
    currentMfa: d(keys.currentMfa),
    authSecret: d(keys.authSecret),
    legacyClinical: d(keys.legacyClinical),
    legacyMfa: d(keys.legacyMfa),
  };
}

async function buildPlan(kbuf) {
  const currentChain = [kbuf.currentClinical, kbuf.currentMfa, kbuf.authSecret].filter(Boolean);
  const legacyChain = [kbuf.legacyClinical, kbuf.legacyMfa, kbuf.authSecret].filter(Boolean);
  const currentPrimary = kbuf.currentClinical;

  const plan = [];
  const summary = { already_current: 0, legacy_recoverable: 0, failed: 0, invalid_format: 0, plaintext_legacy: 0, empty: 0 };
  const perField = {};

  for (const { t, f } of TABLES) {
    let rows;
    try {
      rows = await q(`SELECT ${["id", ...f].join(", ")} FROM ${t}`);
    } catch (e) {
      console.log(`[migrate] ${t}: ERRO ${e.message}`);
      continue;
    }
    for (const field of f) perField[`${t}.${field}`] = { total: 0, already_current: 0, legacy_recoverable: 0, failed: 0, invalid_format: 0, plaintext_legacy: 0, empty: 0 };
    for (const row of rows) {
      for (const field of f) {
        const c = classifyValue(row[field], { currentChain, legacyChain, currentPrimaryKey: currentPrimary });
        summary[c.status] = (summary[c.status] ?? 0) + 1;
        const pf = perField[`${t}.${field}`];
        pf.total++;
        pf[c.status] = (pf[c.status] ?? 0) + 1;
        if (c.status === "legacy_recoverable") {
          plan.push({ table: t, field, id: row.id, oldValue: row[field], newValue: c.newValue });
        }
      }
    }
  }
  return { plan, summary, perField };
}

function printSummary(summary, perField) {
  console.log("\n===== Resumo =====");
  console.log(`already_current: ${summary.already_current}`);
  console.log(`legacy_recoverable: ${summary.legacy_recoverable}`);
  console.log(`failed: ${summary.failed}`);
  console.log(`invalid_format: ${summary.invalid_format}`);
  console.log(`plaintext_legacy: ${summary.plaintext_legacy}`);
  console.log(`empty: ${summary.empty}`);
  console.log("\n===== Por tabela.campo =====");
  for (const [k, v] of Object.entries(perField)) {
    if (v.legacy_recoverable || v.failed || v.invalid_format || v.plaintext_legacy) {
      console.log(`${k} | total=${v.total} already=${v.already_current} legacy=${v.legacy_recoverable} failed=${v.failed} invalid=${v.invalid_format} plain=${v.plaintext_legacy} empty=${v.empty}`);
    }
  }
}

function writeBackup(plan) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(BACKUP_DIR, `encrypted-migration-${ts}.json`);
  const payload = {
    createdAt: new Date().toISOString(),
    count: plan.length,
    entries: plan.map((e) => ({ table: e.table, field: e.field, id: e.id, oldValue: e.oldValue, newValue: e.newValue })),
  };
  writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  return file;
}

function verifyBackup(file, expectedCount) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const r = verifyBackupManifest(data, expectedCount);
  if (!r.ok) throw new Error(`backup inválido: ${r.reason}`);
  return true;
}

async function applyUpdates(plan) {
  let migrated = 0;
  let conflicts = 0;
  for (const e of plan) {
    const results = await q(
      `UPDATE ${e.table} SET ${e.field} = ?1 WHERE id = ?2 AND ${e.field} = ?3 RETURNING id`,
      [e.newValue, e.id, e.oldValue]
    );
    if (results.length === 1) migrated++;
    else conflicts++;
  }
  return { migrated, conflicts };
}

async function main() {
  loadEnv();
  for (const k of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_D1_API_TOKEN"]) {
    const vals = rawKeys[k] ?? [];
    if (vals.length) process.env[k] = vals[vals.length - 1];
  }
  if (!accountId || !databaseId || !apiToken) throw new Error("D1 creds ausentes.");

  const mode = process.argv.includes("--apply") ? "apply" : "dry-run";
  const keys = resolveKeys();

  const errs = validateKeyConfig({
    currentClinical: keys.currentClinical,
    currentMfa: keys.currentMfa,
    authSecret: keys.authSecret,
    legacyClinical: keys.legacyClinical,
    legacyMfa: keys.legacyMfa,
  });
  if (errs.length) {
    console.error("[migrate] configuração de chaves inválida:");
    for (const e of errs) console.error(`  - ${e}`);
    process.exit(1);
  }

  const kbuf = buildKeys(keys);
  console.log(`[migrate] modo=${mode} | currentClinical=${keys.currentClinical ? "set" : "missing"} currentMfa=${keys.currentMfa ? "set" : "missing"} legacyClinical=${keys.legacyClinical ? "set" : "missing"} legacyMfa=${keys.legacyMfa ? "set" : "missing"}`);

  const { plan, summary, perField } = await buildPlan(kbuf);
  printSummary(summary, perField);

  if (mode === "dry-run") {
    console.log("\n[migrate] DRY-RUN: nenhuma escrita realizada.");
    return;
  }

  if (plan.length === 0) {
    console.log("[migrate] nada a migrar.");
    return;
  }
  const backupFile = writeBackup(plan);
  verifyBackup(backupFile, plan.length);
  console.log(`[migrate] backup criado e verificado: ${backupFile} (${plan.length} entradas)`);

  const { migrated, conflicts } = await applyUpdates(plan);
  console.log(`[migrate] aplicado: ${migrated} migrados, ${conflicts} conflitos (não alterados)`);

  const after = await buildPlan(kbuf);
  console.log(`[migrate] pós-verificação: already_current=${after.summary.already_current} legacy_recoverable=${after.summary.legacy_recoverable} failed=${after.summary.failed}`);
  if (after.summary.legacy_recoverable !== 0) {
    console.error("[migrate] ATENÇÃO: ainda há campos legacy_recoverable após o apply. Verifique conflitos.");
    process.exit(1);
  }
  console.log("[migrate] sucesso. Rode novamente em --dry-run para confirmar.");
}

main().catch((e) => { console.error("[migrate] Falha:", e.message); process.exit(1); });

