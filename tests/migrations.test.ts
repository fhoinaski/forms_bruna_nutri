import { describe, expect, it } from "vitest";
import {
  isAlterAddColumnStatement,
  isDuplicateColumnError,
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

  it("identifies duplicate-column recovery cases", () => {
    expect(isAlterAddColumnStatement("ALTER TABLE clients ADD COLUMN status TEXT")).toBe(true);
    expect(isDuplicateColumnError(new Error("duplicate column name: status"))).toBe(true);
    expect(isAlterAddColumnStatement("CREATE INDEX idx_clients_status ON clients(status)")).toBe(false);
  });
});
