#!/usr/bin/env node
/**
 * FASE 12 — gera fixtures pequenas a partir dos arquivos REAIS (nunca
 * fabricadas do zero), via streaming/leitura pontual, nunca carregando
 * tbca_completa.json inteiro na memoria pra montar a fixture da TBCA
 * (usa o mesmo iterateTbcaCollectionRecords do importador real).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { iterateTbcaCollectionRecords, parseTbcaRawRecord } from "@/lib/nutrition-import/tbca-json-stream";

const FIXTURES_DIR = resolve("tests/fixtures/canonical-nutrition");

interface TacoFood {
  id: string;
  source_food_id: string;
  name: string;
  nutrients: Array<{ nutrient_id: string; status: string }>;
}
interface TacoDoc {
  foods: TacoFood[];
  [key: string]: unknown;
}

function buildTacoFixture() {
  const doc = JSON.parse(readFileSync("F:/Downloads/nutritional_bases_json_package/package/json/taco.json", "utf8")) as TacoDoc;
  const wanted = ["Arroz, integral, cozido", "Ovo, de galinha, inteiro, cozido/10minutos", "Banana, nanica, crua", "Leite, de vaca, integral"];
  const picked: TacoFood[] = [];
  for (const name of wanted) {
    const food = doc.foods.find((f) => f.name === name);
    if (food) picked.push(food);
  }
  // garante ao menos um alimento com nutriente em status trace, mesmo se nenhum dos 4 acima tiver
  if (!picked.some((f) => f.nutrients.some((n) => n.status === "trace"))) {
    const traceFood = doc.foods.find((f) => f.nutrients.some((n) => n.status === "trace"));
    if (traceFood && !picked.includes(traceFood)) picked.push(traceFood);
  }
  const fixture = { ...doc, foods: picked };
  writeFileSync(resolve(FIXTURES_DIR, "taco-fixture.json"), JSON.stringify(fixture, null, 2));
  console.log("taco-fixture.json:", picked.length, "foods");
}

interface PofFood {
  id: string;
  source_food_id: string;
  name: string;
  preparation?: { code: number | string | null; name: string | null } | null;
}
interface PofDoc {
  foods: PofFood[];
  [key: string]: unknown;
}

function buildPofFixture() {
  const doc = JSON.parse(readFileSync("F:/Downloads/nutritional_bases_json_package/package/json/ibge_pof_2008_2009.json", "utf8")) as PofDoc;
  // "milho + cru + cozido + assado + grelhado" — mesmo alimento, preparacoes distintas, precisam continuar como registros separados (Fase 8/9)
  const milho = doc.foods.filter((f) => f.source_food_id === "6300701" && [1, 2, 3, 4].includes(Number(f.preparation?.code)));
  const arroz = doc.foods.find((f) => /^Arroz \(polido/.test(f.name));
  const picked = [...milho, ...(arroz ? [arroz] : [])];
  const fixture = { ...doc, foods: picked };
  writeFileSync(resolve(FIXTURES_DIR, "pof-fixture.json"), JSON.stringify(fixture, null, 2));
  console.log("pof-fixture.json:", picked.length, "foods");
}

async function buildTbcaFixture() {
  const targets = [
    "composicao_alimentos_medidas_caseiras",
    "composicao_informacao_estatistica",
    "composicao_informacao_estatistica_produtos",
    "biodiversidade_e_alimentos_regionais",
  ] as const;
  const collected: Record<string, unknown[]> = Object.fromEntries(targets.map((t) => [t, []]));
  // BRC0001C (Abacate) tem trace de sodio + medidas caseiras reais — pegamos
  // ele explicitamente, mais alguns registros extras de cada colecao so
  // pra ter volume >1 por colecao na fixture.
  const wantedMain = new Set(["BRC0001C", "BRC0001D"]);
  let mainTaken = 0;
  let statsTaken = 0;
  let productsTaken = 0;
  let bioTaken = 0;

  for await (const rec of iterateTbcaCollectionRecords("data-local/tbca_completa.json", targets)) {
    const food = parseTbcaRawRecord<{ source_food_id: string }>(rec);
    if (rec.collection === "composicao_alimentos_medidas_caseiras") {
      if (wantedMain.has(food.source_food_id) || mainTaken < 3) {
        collected[rec.collection].push(food);
        mainTaken += 1;
      }
    } else if (rec.collection === "composicao_informacao_estatistica") {
      if (wantedMain.has(food.source_food_id) || statsTaken < 3) {
        collected[rec.collection].push(food);
        statsTaken += 1;
      }
    } else if (rec.collection === "composicao_informacao_estatistica_produtos") {
      if (productsTaken < 2) {
        collected[rec.collection].push(food);
        productsTaken += 1;
      }
    } else if (rec.collection === "biodiversidade_e_alimentos_regionais") {
      if (bioTaken < 2) {
        collected[rec.collection].push(food);
        bioTaken += 1;
      }
    }
    if (mainTaken >= 3 && statsTaken >= 3 && productsTaken >= 2 && bioTaken >= 2) break;
  }

  const fixture = {
    schema_version: "1.0.0",
    source: { id: "tbca_7_3", version: "7.3" },
    collections: collected,
  };
  writeFileSync(resolve(FIXTURES_DIR, "tbca-fixture.json"), JSON.stringify(fixture, null, 2));
  console.log(
    "tbca-fixture.json:",
    Object.fromEntries(targets.map((t) => [t, collected[t].length]))
  );
}

async function main() {
  buildTacoFixture();
  buildPofFixture();
  await buildTbcaFixture();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
