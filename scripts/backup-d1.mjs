import { mkdir, writeFile } from "node:fs/promises";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import path from "node:path";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;
const backupSecret = process.env.BACKUP_ENCRYPTION_KEY;
if (!accountId || !databaseId || !apiToken || !backupSecret || backupSecret.length < 32) {
  throw new Error("Configure Cloudflare D1 e BACKUP_ENCRYPTION_KEY com pelo menos 32 caracteres.");
}

async function query(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, { method: "POST", headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ sql, params }) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.errors?.map((item) => item.message).join("; ") || "Falha ao consultar D1.");
  return data.result?.[0]?.results ?? [];
}

const schema = await query("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY type DESC, name");
const tables = schema.filter((item) => item.type === "table").map((item) => item.name).filter((name) => /^[A-Za-z0-9_]+$/.test(name));
const data = {};
for (const table of tables) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await query(`SELECT * FROM "${table}" LIMIT 500 OFFSET ?1`, [offset]);
    rows.push(...page);
    if (page.length < 500) break;
  }
  data[table] = rows;
}

const payload = Buffer.from(JSON.stringify({ format: 1, createdAt: new Date().toISOString(), schema, data }), "utf8");
const iv = randomBytes(12);
const key = createHash("sha256").update(backupSecret).digest();
const cipher = createCipheriv("aes-256-gcm", key, iv);
const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
const output = Buffer.concat([Buffer.from("BFN1"), iv, cipher.getAuthTag(), encrypted]);
const checksum = createHash("sha256").update(output).digest("hex");
const directory = path.resolve(process.cwd(), "backups");
await mkdir(directory, { recursive: true });
const filename = `bruna-nutri-${new Date().toISOString().replace(/[:.]/g, "-")}.enc`;
await writeFile(path.join(directory, filename), output, { mode: 0o600 });
await query("INSERT INTO backup_audit_logs (id, action, filename, checksum, status, details, created_at) VALUES (?1, 'backup', ?2, ?3, 'success', ?4, ?5)", [crypto.randomUUID(), filename, checksum, JSON.stringify({ tables: tables.length }), new Date().toISOString()]);
console.log(`Backup criptografado criado: backups/${filename}`);
console.log(`SHA-256: ${checksum}`);
