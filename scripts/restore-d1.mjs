import { readFile } from "node:fs/promises";
import { createDecipheriv, createHash } from "node:crypto";

const [, , filename] = process.argv;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;
const backupSecret = process.env.BACKUP_ENCRYPTION_KEY;
if (!filename || process.env.RESTORE_CONFIRM !== "BRUNA_NUTRI_RESTORE") throw new Error("Informe o arquivo e defina RESTORE_CONFIRM=BRUNA_NUTRI_RESTORE.");
if (!accountId || !databaseId || !apiToken || !backupSecret || backupSecret.length < 32) throw new Error("Configuração D1 ou chave de backup ausente.");

async function query(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, { method: "POST", headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ sql, params }) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.errors?.map((item) => item.message).join("; ") || "Falha ao restaurar D1.");
  return data.result?.[0]?.results ?? [];
}

const input = await readFile(filename);
if (input.subarray(0, 4).toString() !== "BFN1") throw new Error("Formato de backup inválido.");
const key = createHash("sha256").update(backupSecret).digest();
const decipher = createDecipheriv("aes-256-gcm", key, input.subarray(4, 16));
decipher.setAuthTag(input.subarray(16, 32));
const payload = JSON.parse(Buffer.concat([decipher.update(input.subarray(32)), decipher.final()]).toString("utf8"));

for (const entry of payload.schema.filter((item) => item.type === "table")) await query(entry.sql);
for (const [table, rows] of Object.entries(payload.data)) {
  if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error(`Tabela inválida no backup: ${table}`);
  for (const row of rows) {
    const columns = Object.keys(row);
    if (columns.length === 0) continue;
    const names = columns.map((name) => `"${name.replaceAll('"', '""')}"`).join(", ");
    const placeholders = columns.map((_, index) => `?${index + 1}`).join(", ");
    await query(`INSERT OR REPLACE INTO "${table}" (${names}) VALUES (${placeholders})`, columns.map((name) => row[name]));
  }
}
for (const entry of payload.schema.filter((item) => item.type === "index")) await query(entry.sql);
await query("INSERT INTO backup_audit_logs (id, action, filename, checksum, status, details, created_at) VALUES (?1, 'restore', ?2, ?3, 'success', ?4, ?5)", [crypto.randomUUID(), filename, createHash("sha256").update(input).digest("hex"), JSON.stringify({ sourceCreatedAt: payload.createdAt }), new Date().toISOString()]);
console.log(`Restauração concluída a partir de ${filename}.`);
