import { createHash, createDecipheriv } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Auditoria READ-ONLY de campos cifrados ("enc:v1:") no D1. Só SELECT.
// Nunca imprime plaintext/ciphertext/IV/tag/secret; nunca altera o banco.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREFIX = "enc:v1:";

const rawKeys = {};
function loadEnv() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return;
  let n = 0;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    n++;
    const sep = line.indexOf("=");
    if (sep <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, "");
    (rawKeys[key] ??= []).push({ line: n, value });
  }
}

const key = (s) => createHash("sha256").update(s).digest();
const isEnc = (v) => typeof v === "string" && v.startsWith(PREFIX);

function tryDecrypt(payload, keys) {
  const [iv, tag, cipher] = payload.split(".");
  if (!iv || !tag || !cipher) return "invalid_format";
  for (const k of keys) {
    try {
      const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      Buffer.concat([d.update(Buffer.from(cipher, "base64url")), d.final()]);
      return "ok";
    } catch { /* próxima chave */ }
  }
  return "decrypt_failed";
}

function buildKeys() {
  const last = (k) => (rawKeys[k]?.length ? rawKeys[k][rawKeys[k].length - 1].value : null);
  const cur = [];
  for (const v of [last("CLINICAL_DATA_ENCRYPTION_KEY"), last("MFA_ENCRYPTION_KEY"), last("AUTH_SECRET")]) {
    if (v && !cur.includes(v)) cur.push(v);
  }
  const leg = [];
  for (const k of ["CLINICAL_DATA_ENCRYPTION_KEY", "MFA_ENCRYPTION_KEY", "AUTH_SECRET"]) {
    for (const { value } of rawKeys[k] ?? []) if (!cur.includes(value) && !leg.includes(value)) leg.push(value);
  }
  return { cur: cur.map(key), leg: leg.map(key) };
}

const h = (id) => createHash("sha256").update(String(id)).digest("hex").slice(0, 12);

loadEnv();
for (const k of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_D1_API_TOKEN"]) {
  const v = rawKeys[k]?.[rawKeys[k].length - 1]?.value;
  if (v) process.env[k] = v;
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

const NUTRITION = ["chief_complaint","life_stage","biological_sex","target_group","gestational_weeks","breastfeeding_context","clinical_history","diagnoses","medications","supplements","allergies","restrictions","food_preferences","food_aversions","eating_routine","intestinal_health","sleep_routine","stress_context","physical_activity","hydration","current_weight_kg","height_cm","bmi","pre_pregnancy_weight_kg","waist_cm","pre_surgery_weight_kg","bariatric_surgery_date","anthropometry_notes","pediatric_growth_notes","target_weight_kg","target_notes","exams","assessment","goals","care_plan","risk_flags","family_context","private_notes"];

const TABLES = [
  { t: "nutrition_records", f: NUTRITION, ts: ["created_at", "updated_at"] },
  { t: "consultation_sessions", f: ["notes", "ai_brief_json", "summary_json"], ts: ["created_at", "updated_at"] },
  { t: "ai_settings", f: ["api_key"], ts: [] },
  { t: "form_submissions", f: ["answers_json"], ts: ["created_at", "updated_at"] },
  { t: "client_evolutions", f: ["encrypted_payload"], ts: ["measured_at", "created_at", "updated_at"] },
  { t: "patient_intake_sessions", f: ["state_json"], ts: ["created_at", "updated_at", "expires_at"] },
];

async function main() {
  loadEnv();
  for (const k of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_D1_API_TOKEN"]) {
    const v = rawKeys[k]?.[rawKeys[k].length - 1]?.value;
    if (v) process.env[k] = v;
  }
  if (!accountId || !databaseId || !apiToken) throw new Error("D1 creds ausentes.");

  const { cur, leg } = buildKeys();
  console.log(`[audit] chaves atuais=${cur.length} legadas=${leg.length}`);

  const grand = { ok: 0, legacy: 0, failed: 0, invalid: 0, plain: 0, empty: 0 };

  for (const { t, f, ts } of TABLES) {
    let rows;
    try {
      rows = await q(`SELECT ${["id", ...f, ...ts].join(", ")} FROM ${t}`);
    } catch (e) {
      console.log(`[audit] ${t}: ERRO ${e.message}`);
      continue;
    }
    const stat = {};
    for (const field of f) stat[field] = { total: 0, ok: 0, legacy: 0, failed: 0, invalid: 0, plain: 0, empty: 0, samples: [] };
    for (const row of rows) {
      for (const field of f) {
        const v = row[field];
        const b = stat[field];
        b.total++;
        if (v === null || v === undefined || v === "") { b.empty++; continue; }
        if (!isEnc(v)) { b.plain++; continue; }
        const s = tryDecrypt(v.slice(PREFIX.length), cur);
        if (s === "ok") { b.ok++; continue; }
        if (s === "invalid_format") { b.invalid++; continue; }
        if (tryDecrypt(v.slice(PREFIX.length), leg) === "ok") { b.legacy++; continue; }
        b.failed++;
        if (b.samples.length < 5) {
          const smp = { id: h(row.id) };
          for (const tsc of ts) if (row[tsc]) smp[tsc] = row[tsc];
          b.samples.push(smp);
        }
      }
    }
    for (const [field, b] of Object.entries(stat)) {
      for (const k of ["ok", "legacy", "failed", "invalid", "plain", "empty"]) grand[k] += b[k];
      if (b.failed || b.legacy || b.invalid || b.plain) {
        console.log(`${t}.${field} | total=${b.total} ok=${b.ok} legacy=${b.legacy} failed=${b.failed} invalid=${b.invalid} plain=${b.plain} empty=${b.empty}`);
        for (const s of b.samples) console.log(`    failed: ${Object.entries(s).map(([k, v]) => `${k}=${v}`).join(" ")}`);
      }
    }
  }

  console.log("\n===== Totais =====");
  console.log(`cifrados(não-vazios)=${grand.ok + grand.legacy + grand.failed + grand.invalid + grand.plain}`);
  console.log(`ok=${grand.ok} legacy=${grand.legacy} failed=${grand.failed} invalid=${grand.invalid} plain=${grand.plain} empty=${grand.empty}`);
}

main().catch((e) => { console.error("[audit] Falha:", e.message); process.exit(1); });
