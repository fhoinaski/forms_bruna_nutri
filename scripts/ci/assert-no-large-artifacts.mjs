#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";

const maxBytes = Number(process.env.MAX_REPO_ARTIFACT_BYTES ?? 10 * 1024 * 1024);
const blockedExtensions = /\.(sqlite|sqlite3|db)$/i;
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const violations = [];
for (const file of files) {
  const size = statSync(file).size;
  if (blockedExtensions.test(file)) violations.push(`${file}: SQLite artifact tracked`);
  if (size > maxBytes) violations.push(`${file}: ${size} bytes exceeds ${maxBytes}`);
}

if (violations.length) {
  throw new Error(`Large or blocked artifacts found:\n${violations.join("\n")}`);
}

console.log(`Repository artifact check passed for ${files.length} tracked files.`);
