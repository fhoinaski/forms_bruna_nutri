// Shim HTTP local do Cloudflare D1 para os testes E2E.
//
// ACHADO CRITICO da auditoria (FASE 1 do prompt mestre): nao existe hoje
// nenhum isolamento de banco entre dev/test/CI/producao — lib/d1/client.ts
// sempre chama a API REST real da Cloudflare, diferenciado so pelas env
// vars presentes no processo. Em CI, essas env vars sao valores falsos
// (accountId="ci-account" etc.), entao qualquer escrita real falharia; mas
// nao existe NENHUMA garantia de que rodar `npm run test:e2e` localmente
// nao acabe escrevendo no banco clinico de producao, dependendo do que
// estiver em .env.local no momento.
//
// Este shim resolve isso reproduzindo o MESMO contrato HTTP que
// lib/d1/client.ts espera (POST .../query, aceita {sql,params} ou
// {batch:[...]}, responde {success, result:[{results,success,meta}]}),
// mas atras dele ha um banco SQLite real e local (node:sqlite, nativo do
// Node 22 — zero dependencia nova) inicializado rodando as MESMAS
// migrations de db/*.sql que rodam em producao. D1 e Cloudflare-managed
// SQLite, entao a compatibilidade e real, nao aproximada (validado: as 34
// migrations do projeto rodam sem erro contra node:sqlite).
//
// lib/d1/client.ts aceita uma URL base configuravel via
// CLOUDFLARE_D1_API_BASE_URL — quando ausente, comportamento identico ao
// de hoje (Cloudflare real). O Playwright globalSetup aponta essa env var
// para este shim antes de subir o servidor Next.js de teste.

import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { readdirSync, readFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const migrationsDir = join(root, "db");

function runMigrations(db) {
  const files = readdirSync(migrationsDir)
    .filter((file) => /^\d{8}_\d{4}_.+\.sql$/.test(file))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    db.exec(sql);
  }
  return files.length;
}

function sanitizeParam(value) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

// Cloudflare D1 real preenche meta.changes/last_row_id em INSERT/UPDATE/DELETE
// (usado por codigo que depende de "quantas linhas essa escrita afetou de
// fato", ex.: dedupe via INSERT OR IGNORE). node:sqlite's `.all()` nao expoe
// isso (so retorna linhas, util para SELECT); `.run()` retorna
// { changes, lastInsertRowid } mas nao linhas. Escolhe o metodo certo pelo
// tipo de statement para reproduzir o contrato real do D1 com fidelidade.
function runStatement(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const boundParams = params.map(sanitizeParam);
  const trimmed = sql.trim().toUpperCase();
  const isReadStatement = trimmed.startsWith("SELECT") || trimmed.startsWith("WITH") || trimmed.startsWith("PRAGMA");
  if (isReadStatement) {
    const results = stmt.all(...boundParams);
    return { results, success: true, meta: {} };
  }
  const info = stmt.run(...boundParams);
  return { results: [], success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
}

/**
 * Sobe o shim: cria um banco SQLite novo em `dbPath` (apaga qualquer
 * arquivo anterior), roda as migrations reais e abre um servidor HTTP
 * local numa porta efemera implementando o contrato REST do D1.
 */
export function startD1Shim({ dbPath } = {}) {
  const resolvedPath = dbPath ?? join(root, "e2e", ".tmp", `e2e-d1-${process.pid}.sqlite`);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  if (existsSync(resolvedPath)) unlinkSync(resolvedPath);

  const db = new DatabaseSync(resolvedPath);
  db.exec("PRAGMA foreign_keys = ON");
  const migrationCount = runMigrations(db);

  const server = createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}");
        let result;
        if (Array.isArray(parsed.batch)) {
          db.exec("BEGIN");
          try {
            result = parsed.batch.map((statement) => runStatement(db, statement.sql, statement.params ?? []));
            db.exec("COMMIT");
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
        } else {
          result = [runStatement(db, parsed.sql, parsed.params ?? [])];
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, result }));
      } catch (error) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, errors: [{ message: error instanceof Error ? error.message : String(error) }] }));
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        dbPath: resolvedPath,
        migrationCount,
        db,
        close: () =>
          new Promise((resolveClose) => {
            server.close(() => {
              db.close();
              if (existsSync(resolvedPath)) unlinkSync(resolvedPath);
              resolveClose();
            });
          }),
      });
    });
  });
}
