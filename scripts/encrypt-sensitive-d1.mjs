import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
const ENCRYPTED_PREFIX = "enc:v1:";

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function encryptionKey() {
  const secret = process.env.MFA_ENCRYPTION_KEY ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("MFA_ENCRYPTION_KEY or AUTH_SECRET is required.");
  return createHash("sha256").update(secret).digest();
}

function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

function encryptValue(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${ENCRYPTED_PREFIX}${[iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".")}`;
}

function encryptJson(value) {
  return encryptValue(JSON.stringify(value));
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;
if (!accountId || !databaseId || !apiToken) {
  throw new Error("Configure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID e CLOUDFLARE_D1_API_TOKEN.");
}

async function request(body) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json();
  const failed = data.result?.find((item) => !item.success);
  if (!response.ok || !data.success || failed) {
    throw new Error(data.errors?.map((item) => item.message).join("; ") || "Falha ao consultar o D1.");
  }
  return data.result ?? [];
}

async function query(sql, params = []) {
  const results = await request(params.length ? { sql, params } : { sql });
  return results[0]?.results ?? [];
}

async function execute(sql, params = []) {
  await query(sql, params);
}

const nutritionFields = [
  "chief_complaint", "life_stage", "biological_sex", "gestational_weeks",
  "breastfeeding_context", "clinical_history", "diagnoses", "medications",
  "supplements", "allergies", "restrictions", "food_preferences",
  "food_aversions", "eating_routine", "intestinal_health", "sleep_routine",
  "stress_context", "physical_activity", "hydration", "current_weight_kg",
  "height_cm", "bmi", "waist_cm", "anthropometry_notes",
  "pediatric_growth_notes", "target_weight_kg", "target_notes", "exams",
  "assessment", "goals", "care_plan", "risk_flags", "family_context",
  "private_notes",
];

const evolutionPayloadFields = [
  "weight", "height", "bmi", "waist_cm", "hip_cm", "arm_cm",
  "body_fat_percentage", "blood_pressure", "energy_level", "appetite",
  "bowel_pattern", "sleep_quality", "symptoms", "adherence_notes",
  "adherence_score", "progress_notes", "conduct_notes", "clinical_impression",
  "next_steps",
];

let changed = 0;

for (const row of await query("SELECT id, api_key FROM ai_settings WHERE api_key IS NOT NULL")) {
  if (row.api_key && !isEncrypted(row.api_key)) {
    await execute("UPDATE ai_settings SET api_key = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2", [encryptValue(String(row.api_key)), row.id]);
    changed++;
  }
}

for (const row of await query("SELECT id, answers_json FROM form_submissions WHERE answers_json IS NOT NULL")) {
  if (row.answers_json && !isEncrypted(row.answers_json)) {
    let parsed = {};
    try { parsed = JSON.parse(row.answers_json); } catch {}
    await execute("UPDATE form_submissions SET answers_json = ?1, updated_at = ?2 WHERE id = ?3", [encryptJson(parsed), new Date().toISOString(), row.id]);
    changed++;
  }
}

for (const row of await query(`SELECT id, ${nutritionFields.join(", ")} FROM nutrition_records`)) {
  const updates = [];
  const params = [];
  let index = 1;
  for (const field of nutritionFields) {
    const value = row[field];
    if (typeof value === "string" && value && !isEncrypted(value)) {
      updates.push(`${field} = ?${index++}`);
      params.push(encryptValue(value));
    }
  }
  if (updates.length) {
    params.push(new Date().toISOString(), row.id);
    await execute(`UPDATE nutrition_records SET ${updates.join(", ")}, updated_at = ?${index++} WHERE id = ?${index}`, params);
    changed++;
  }
}

for (const row of await query(`SELECT id, encrypted_payload, ${evolutionPayloadFields.join(", ")} FROM client_evolutions`)) {
  if (row.encrypted_payload && isEncrypted(row.encrypted_payload)) continue;
  const payload = {};
  for (const field of evolutionPayloadFields) payload[field] = row[field] ?? null;
  await execute(
    `UPDATE client_evolutions
     SET weight = NULL, height = NULL, bmi = NULL, waist_cm = NULL, hip_cm = NULL,
         arm_cm = NULL, body_fat_percentage = NULL, blood_pressure = NULL,
         energy_level = NULL, appetite = NULL, bowel_pattern = NULL,
         sleep_quality = NULL, symptoms = NULL, adherence_notes = NULL,
         adherence_score = NULL, progress_notes = NULL, conduct_notes = NULL,
         clinical_impression = NULL, next_steps = NULL,
         encrypted_payload = ?1, updated_at = ?2
     WHERE id = ?3`,
    [encryptJson(payload), new Date().toISOString(), row.id],
  );
  changed++;
}

console.log(`${changed} registro(s) sensivel(is) criptografado(s) ou atualizado(s).`);
