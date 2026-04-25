/**
 * Script para criar ou atualizar o admin inicial no Cloudflare D1.
 *
 * USO:
 *   CLOUDFLARE_ACCOUNT_ID=xxx \
 *   CLOUDFLARE_D1_DATABASE_ID=xxx \
 *   CLOUDFLARE_D1_API_TOKEN=xxx \
 *   ADMIN_EMAIL=admin@example.com \
 *   ADMIN_INITIAL_PASSWORD=Trocar@123 \
 *   ADMIN_NAME="Bruna Flores Nutri" \
 *   node scripts/create-admin.mjs
 */

import { createHash, randomUUID } from "crypto";
import bcrypt from "bcryptjs";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
const adminName = process.env.ADMIN_NAME || "Admin";

if (!accountId || !databaseId || !apiToken) {
  console.error(
    "Erro: defina CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID e CLOUDFLARE_D1_API_TOKEN"
  );
  process.exit(1);
}

if (!adminEmail || !adminPassword) {
  console.error("Erro: defina ADMIN_EMAIL e ADMIN_INITIAL_PASSWORD");
  process.exit(1);
}

async function d1Query(sql, params = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    }
  );
  const data = await res.json();
  if (!res.ok || !data.success) {
    const msg = data.errors?.map((e) => e.message).join("; ") || "D1 error";
    throw new Error(msg);
  }
  return data.result?.[0]?.results ?? [];
}

console.log(`\nCriando/atualizando admin no D1...`);
console.log(`  E-mail: ${adminEmail}`);
console.log(`  Nome:   ${adminName}`);

const passwordHash = await bcrypt.hash(adminPassword, 12);
const id = crypto.randomUUID();
const now = new Date().toISOString();

await d1Query(
  `INSERT INTO admin_users (id, name, email, password_hash, must_change_password, created_at, updated_at)
   VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)
   ON CONFLICT(email) DO UPDATE SET
     name = excluded.name,
     password_hash = excluded.password_hash,
     must_change_password = 1,
     updated_at = excluded.updated_at`,
  [id, adminName, adminEmail, passwordHash, now, now]
);

console.log(`\n✓ Admin criado/atualizado com sucesso!`);
console.log(`  ⚠  No primeiro acesso, a troca de senha será obrigatória.`);
console.log(`  ⚠  Nunca compartilhe a senha inicial.`);
console.log(`\nAcesse /login com o e-mail e a senha inicial configurados.\n`);
