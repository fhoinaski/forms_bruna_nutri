import { describe, expect, it } from "vitest";
import {
  isDestructiveStatement,
  isTransactionStatement,
  splitSqlStatements,
} from "../scripts/migration-utils.mjs";

describe("D1 migration utilities", () => {
  it("splits SQL without breaking semicolons inside strings", () => {
    const statements = splitSqlStatements(`
      BEGIN TRANSACTION;
      CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT DEFAULT 'manha; tarde');
      INSERT INTO notes (id, body) VALUES ('1', 'agua; fruta');
      COMMIT;
    `);

    expect(statements).toHaveLength(4);
    expect(statements[1]).toContain("'manha; tarde'");
    expect(statements[2]).toContain("'agua; fruta'");
  });

  it("detects transaction control statements even with comments", () => {
    expect(isTransactionStatement("-- created by wrangler\nBEGIN TRANSACTION")).toBe(true);
    expect(isTransactionStatement("COMMIT")).toBe(true);
    expect(isTransactionStatement("CREATE TABLE clients (id TEXT)")).toBe(false);
  });

  it("blocks destructive DDL from ordinary migrations", () => {
    expect(isDestructiveStatement("DROP TABLE clients")).toBe(true);
    expect(isDestructiveStatement("ALTER TABLE clients DROP COLUMN email")).toBe(true);
    expect(isDestructiveStatement("CREATE INDEX idx_clients_name ON clients(name)")).toBe(false);
  });
});
