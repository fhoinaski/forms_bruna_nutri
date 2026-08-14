// Backfill do histórico de prontuário: cria a versão inicial (v1) para cada
// nutrition_record EXISTENTE, cifrando o snapshot com a chave clínica atual.
//
// Modos:
//   --dry-run  (default)  só conta; NUNCA escreve.
//   --apply               insere as versões v1 que ainda não existem (idempotente).
//
// Idempotente por (nutrition_record_id, version). Nunca loga plaintext/secret.
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveKey, decryptPayload, encryptFieldValue, PREFIX } from "./lib/migrate-encrypted-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const NUTRITION = ["chief_complaint","life_stage","biological_sex","target_group","gestational_weeks","breastfeeding_context","clinical_history","diagnoses","medications","supplements","allergies","restrictions","food_preferences","food_aversions","eating_routine","intestinal_health","sleep_routine","stress_context","physical_activity","hydration","current_weight_kg","height_cm","bmi","pre_pregnancy_weight_kg","waist_cm","pre_surgery_weight_kg","bariatric_surgery_date","anthropometry_notes","pediatric_growth_notes","target_weight_kg","target_notes","exams","assessment","goals","care_plan","risk_flags","family_context","private_notes"];

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

const lastOf = (k) => { const d = [...new Set(rawKeys[k] ?? [])]; return d.length ? d[d.length - 1] : null; };

async function main() {
  if (!accountId || !databaseId || !apiToken) throw new Error("D1 creds ausentes.");

  const clinical = lastOf("CLINICAL_DATA_ENCRYPTION_KEY");
  const mfa = lastOf("MFA_ENCRYPTION_KEY");
  const auth = lastOf("AUTH_SECRET");
  if (!clinical) throw new Error("CLINICAL_DATA_ENCRYPTION_KEY ausente.");

  const chain = [clinical, mfa, auth].filter(Boolean).map(deriveKey);
  const currentPrimary = deriveKey(clinical);

  const rows = await q(`SELECT ${["id", "client_id", "version", ...NUTRITION].join(", ")} FROM nutrition_records`);

  let toCreate = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    const existing = await q("SELECT 1 FROM nutrition_record_versions WHERE nutrition_record_id = ?1 AND version = 1", [row.id]);
    if (existing.length) { skipped++; continue; }

    const snapshot = {};
    for (const field of NUTRITION) {
      const value = row[field];
      if (value === null || value === undefined || value === "") { snapshot[field] = null; continue; }
      if (typeof value !== "string" || !value.startsWith(PREFIX)) { snapshot[field] = null; continue; }
      const dec = decryptPayload(value.slice(PREFIX.length), chain);
      snapshot[field] = dec.ok ? dec.plaintext : null;
    }

    if (process.argv.includes("--apply")) {
      const encrypted = encryptFieldValue(JSON.stringify(snapshot), currentPrimary);
      await q(
        `INSERT OR IGNORE INTO nutrition_record_versions (id, nutrition_record_id, client_id, version, encrypted_snapshot, changed_by_admin_id, source, created_at) VALUES (?1, ?2, ?3, 1, ?4, NULL, 'system', ?5)`,
        [crypto.randomUUID(), row.id, row.client_id, encrypted, new Date().toISOString()]
      );
    }
    toCreate++;
  }

  console.log(`[backfill] modo=${process.argv.includes("--apply") ? "apply" : "dry-run"} | criar=${toCreate} ja-existem=${skipped} falhou=${failed}`);
  if (!process.argv.includes("--apply")) console.log("[backfill] DRY-RUN: nenhuma escrita realizada.");
}

main().catch((e) => { console.error("[backfill] Falha:", e.message); process.exit(1); });
