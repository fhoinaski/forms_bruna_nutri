import { writeFileSync } from "node:fs";
import { validateAllActiveSystemMealTemplates } from "../lib/repositories/meal-template-integrity";

async function main() {
  const results = await validateAllActiveSystemMealTemplates();
  const payload = {
    generatedAt: new Date().toISOString(),
    scope: "active SYSTEM DIETA templates",
    summary: {
      templates: results.length,
      valid: results.filter((result) => result.valid).length,
      invalid: results.filter((result) => !result.valid).length,
      issueCount: results.reduce((total, result) => total + result.issues.length, 0),
    },
    templates: results,
  };
  writeFileSync("reports/system-meal-template-integrity.json", `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload.summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
