import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type PatientEducationSeedCard = {
  id: string;
  slug: string;
  title: string;
  category: "geral" | "patologia";
  summary: string;
  sections: Record<string, unknown>;
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const seedPath = join(root, "lib", "education", "patient-education-seed.json");
const cards = JSON.parse(readFileSync(seedPath, "utf8")) as PatientEducationSeedCard[];

async function main() {
  const { upsertPatientEducationCard } = await import("../lib/repositories/patient-education-cards");

  for (const card of cards) {
    await upsertPatientEducationCard(card.id, {
      slug: card.slug,
      title: card.title,
      category: card.category,
      summary: card.summary,
      sections: card.sections,
      is_active: true,
    });
  }

  console.log(`${cards.length} ficha(s) educativa(s) inserida(s)/atualizada(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
