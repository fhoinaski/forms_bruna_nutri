import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["app", "lib"];
const violations = [];
const ddlPattern = /\b(CREATE\s+(TABLE|INDEX|VIEW|TRIGGER)|ALTER\s+TABLE|DROP\s+(TABLE|INDEX|VIEW|TRIGGER)|PRAGMA\s+WRITABLE_SCHEMA)\b/i;

function visit(path) {
  for (const name of readdirSync(path)) {
    const target = join(path, name);
    if (statSync(target).isDirectory()) visit(target);
    else if (/\.tsx?$/.test(name)) {
      const lines = readFileSync(target, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (ddlPattern.test(line)) violations.push(`${target}:${index + 1}`);
      });
    }
  }
}

roots.forEach(visit);
if (violations.length) {
  throw new Error(`DDL encontrado no runtime. Crie uma migration em db/:\n${violations.join("\n")}`);
}
console.log("Runtime sem DDL: schema alterado somente por migrations.");
