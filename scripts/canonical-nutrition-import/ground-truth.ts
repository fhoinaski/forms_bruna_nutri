import type { LocalDb } from "./local-db";

/**
 * FASE 3.5 (item 6/7) — conjunto de teste real (>=100 queries), derivado
 * do proprio banco canonico completo (TBCA+TACO+POF reais), nunca
 * fabricado. Cada caso e AUTO-REFERENCIAL: a query e uma reducao natural
 * do NOME REAL de um alimento que existe no banco, e o ground truth e o
 * proprio food_id daquele alimento — "se eu digitar uma forma natural
 * deste nome real, o motor acha ELE no top1/top3?".
 *
 * Categorias cobertas (item 6): cereais, feijoes, carnes, ovos, pescados,
 * frutas, verduras, laticinios, preparacoes, industrializados, regionais,
 * cultivares — usando classification_group (TBCA) e padroes reais de nome
 * (TACO/POF) pra selecionar exemplos de cada uma.
 */

export interface GroundTruthCase {
  query: string;
  expectedFoodId: string;
  expectedName: string;
  category: string;
  source: string;
}

function naturalQueryFrom(name: string): string {
  // Reducao conservadora: remove sufixos comuns de proveniencia/formatacao
  // que ninguem digita numa busca ("Brasil", nome cientifico entre
  // parenteses, espacos duplos) — nunca remove preparo/cultivar/marca.
  return name
    .replace(/\s*,?\s*Brasil\s*$/i, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sample<T>(rows: T[], n: number, seedOffset = 0): T[] {
  if (rows.length <= n) return rows;
  const step = Math.floor(rows.length / n) || 1;
  const out: T[] = [];
  for (let i = seedOffset % step; i < rows.length && out.length < n; i += step) out.push(rows[i]);
  return out;
}

interface Row {
  id: string;
  source: string;
  name: string;
  classification_group: string | null;
}

function rowsFor(db: LocalDb, sql: string, params: unknown[] = []): Row[] {
  return db.prepare(sql).all(...params) as unknown as Row[];
}

export function buildGroundTruth(db: LocalDb): GroundTruthCase[] {
  const cases: GroundTruthCase[] = [];
  const seen = new Set<string>();

  function add(rows: Row[], category: string, count: number) {
    for (const row of sample(rows, count)) {
      const query = naturalQueryFrom(row.name);
      if (query.length < 3 || seen.has(query.toLowerCase())) continue;
      seen.add(query.toLowerCase());
      cases.push({ query, expectedFoodId: row.id, expectedName: row.name, category, source: row.source });
    }
  }

  // TBCA por classification_group (letras oficiais da colecao principal, so
  // A-U — exclui os "grupos" que na verdade sao nome cientifico da
  // biodiversidade, tratados a parte abaixo).
  const tbcaGroupLetterCases: Array<[string, string]> = [
    ["A - Cereais e derivados", "cereais"],
    ["T - Leguminosas e derivados", "feijoes"],
    ["F - Carnes e derivados", "carnes"],
    ["J - Ovos e derivados", "ovos"],
    ["E - Pescados e frutos do mar", "pescados"],
    ["C - Frutas e derivados", "frutas"],
    ["B - Vegetais e derivados", "verduras"],
    ["G - Leite e derivados", "laticinios"],
    ["R - Alimentos industrializados", "industrializados"],
  ];
  for (const [group, category] of tbcaGroupLetterCases) {
    const rows = rowsFor(
      db,
      `SELECT id, source, name, classification_group FROM canonical_foods
        WHERE source = 'TBCA' AND classification_group = ? AND source_collection = 'composicao_alimentos_medidas_caseiras'
        ORDER BY name`,
      [group]
    );
    add(rows, category, 8);
  }

  // Preparacoes (D - Preparacao / prato composto) — item 6 "preparacoes".
  add(
    rowsFor(db, `SELECT id, source, name, classification_group FROM canonical_foods WHERE source = 'TBCA' AND classification_food_type = 'D - Preparação' ORDER BY name`),
    "preparacoes",
    6
  );

  // Regionais/biodiversidade — classification_group aqui e o nome
  // cientifico/cultivar da propria fonte, nao uma categoria.
  add(
    rowsFor(db, `SELECT id, source, name, classification_group FROM canonical_foods WHERE source_collection = 'biodiversidade_e_alimentos_regionais' ORDER BY name`),
    "regionais",
    8
  );

  // Produtos industrializados (colecao dedicada).
  add(
    rowsFor(db, `SELECT id, source, name, classification_group FROM canonical_foods WHERE source_collection = 'composicao_informacao_estatistica_produtos' ORDER BY name`),
    "industrializados",
    6
  );

  // Cultivares — nomes com "var." explicito (TBCA biodiversidade) ja cobertos acima; aqui pega variantes TACO com atributo de cultivar/variedade no nome.
  add(
    rowsFor(db, `SELECT id, source, name, classification_group FROM canonical_foods WHERE source = 'TACO' AND (name LIKE '%prata%' OR name LIKE '%nanica%' OR name LIKE '%maçã%' OR name LIKE '%tipo 1%' OR name LIKE '%tipo 2%') ORDER BY name`),
    "cultivares",
    8
  );

  // TACO geral (varias categorias, nomes curtos e longos).
  add(rowsFor(db, `SELECT id, source, name, classification_group FROM canonical_foods WHERE source = 'TACO' ORDER BY id`), "taco_geral", 15);

  // POF geral, incluindo variantes de preparo explicitas (queries curtas: "Abacate", longas: "Milho, curau...").
  add(rowsFor(db, `SELECT id, source, name, classification_group FROM canonical_foods WHERE source = 'IBGE_POF' ORDER BY id`), "pof_geral", 15);

  return cases;
}
