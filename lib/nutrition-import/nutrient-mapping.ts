import { NUTRIENT_DEFINITIONS, type NutrientCode } from "@/lib/nutrition/nutrient-vocabulary";
import type { CanonicalFoodSource } from "@/lib/nutrition-import/types";

/**
 * Mapeamento explicito por nutrient_id/tagname da FONTE -> NutrientCode do
 * projeto (FASE 3). NUNCA mapeado por `name` — a propria TACO tem nomes
 * truncados na origem (ver TACO_NAME_TRUNCATION_WARNING abaixo), entao
 * `name` e tratado como dado de exibicao, nunca como chave.
 *
 * Cada entrada aqui foi confirmada por leitura direta dos arquivos reais
 * (taco.json nutrient_definitions, ibge_pof_2008_2009.json
 * nutrient_definitions, e uma amostra real de tbca_completa.json via
 * streaming/grep pontual — nunca full-load). Nutrientes da fonte que existem
 * mas nao tem NutrientCode equivalente ficam DE FORA destes mapas de
 * proposito — o importador trata "chave ausente no mapa" como unmapped, e
 * gera relatorio (buildUnmappedReport), nunca inventa um mapping.
 */

export const ALL_NUTRIENT_CODES: readonly NutrientCode[] = NUTRIENT_DEFINITIONS.map((d) => d.code);

// ---------------------------------------------------------------------------
// TACO — mapeado por `id` (ex.: "taco:proteina"), nunca por `name`.
//
// Achado da FASE 3: os nomes em taco.json/nutrient_definitions estao
// truncados na propria fonte (bug do conversor original, fora deste repo) —
// "idrato" no lugar de "Carboidrato", "alimentar" no lugar de "Fibra
// Alimentar", "turados"/"insaturados" no lugar de "Saturados"/
// "Mono|Poliinsaturados". Os dois ultimos colidem no mesmo texto truncado
// ("insaturados" e o resto tanto de "Monoinsaturados" quanto de
// "Poliinsaturados") — como o id nao permite distinguir qual dos dois
// realmente sobrou no dataset, taco:insaturados e taco:turados ficam
// DELIBERADAMENTE FORA do mapa (unmapped), em vez de arriscar rotular
// gordura monoinsaturada como saturada ou vice-versa.
// ---------------------------------------------------------------------------
export const TACO_NUTRIENT_MAP: Record<string, NutrientCode> = {
  "taco:energia": "ENERGY_KCAL",
  "taco:proteina": "PROTEIN",
  "taco:lipideos": "TOTAL_FAT",
  "taco:idrato": "CARBOHYDRATE", // truncado de "Carboidrato" na fonte — nao renomear aqui, o id e a chave
  "taco:alimentar": "FIBER", // truncado de "Fibra Alimentar" na fonte
  "taco:colesterol": "CHOLESTEROL",
  "taco:calcio": "CALCIUM",
  "taco:magnesio": "MAGNESIUM",
  "taco:manganes": "MANGANESE",
  "taco:fosforo": "PHOSPHORUS",
  "taco:ferro": "IRON",
  "taco:sodio": "SODIUM",
  "taco:potassio": "POTASSIUM",
  "taco:cobre": "COPPER",
  "taco:zinco": "ZINC",
  "taco:rae": "VITAMIN_A", // RAE e a medida padrao de vitamina A do vocabulario; taco:retinol e taco:re ficam unmapped (metricas distintas)
  "taco:tiamina": "THIAMIN",
  "taco:riboflavina": "RIBOFLAVIN",
  "taco:piridoxina": "VITAMIN_B6", // piridoxina = vitamina B6
  "taco:niacina": "NIACIN",
  "taco:c": "VITAMIN_C", // nome truncado de "Vitamina C" — confirmado por unidade (mg) e posicao (ultimo item de "proximate_and_minerals")
  // Fase 2 — perfil de acidos graxos (sheet AGtaco3), confirmado por
  // occurrence real (423/597 alimentos tem a secao de perfil de gorduras).
  // Os demais acidos graxos individuais (12:0...24:0, 14:1...20:1, 20:4,
  // 22:5, 18:1t, 18:2t) ficam FORA de proposito — RESEARCH_DETAIL, sem
  // NutrientCode clinico, preservados so como source_nutrient_id/raw_value.
  "taco:18_2_n_6": "LINOLEIC_ACID", // omega-6
  "taco:18_3_n_3": "ALPHA_LINOLENIC_ACID", // omega-3
  "taco:20_5": "EPA",
  "taco:22_6": "DHA",
};

// ---------------------------------------------------------------------------
// IBGE/POF — mapeado por `id` (ex.: "ibge_pof_2008_2009:protein_g").
// ---------------------------------------------------------------------------
export const POF_NUTRIENT_MAP: Record<string, NutrientCode> = {
  "ibge_pof_2008_2009:energy_kcal": "ENERGY_KCAL",
  "ibge_pof_2008_2009:protein_g": "PROTEIN",
  "ibge_pof_2008_2009:fat_g": "TOTAL_FAT",
  "ibge_pof_2008_2009:carbohydrate_g": "CARBOHYDRATE",
  "ibge_pof_2008_2009:fiber_g": "FIBER",
  "ibge_pof_2008_2009:cholesterol_mg": "CHOLESTEROL",
  "ibge_pof_2008_2009:saturated_fat_g": "SATURATED_FAT",
  "ibge_pof_2008_2009:monounsaturated_fat_g": "MONOUNSATURATED_FAT",
  "ibge_pof_2008_2009:polyunsaturated_fat_g": "POLYUNSATURATED_FAT",
  "ibge_pof_2008_2009:trans_fat_g": "TRANS_FAT",
  "ibge_pof_2008_2009:total_sugar_g": "SUGARS",
  "ibge_pof_2008_2009:calcium_mg": "CALCIUM",
  "ibge_pof_2008_2009:magnesium_mg": "MAGNESIUM",
  "ibge_pof_2008_2009:manganese_mg": "MANGANESE",
  "ibge_pof_2008_2009:phosphorus_mg": "PHOSPHORUS",
  "ibge_pof_2008_2009:iron_mg": "IRON",
  "ibge_pof_2008_2009:sodium_mg": "SODIUM",
  "ibge_pof_2008_2009:potassium_mg": "POTASSIUM",
  "ibge_pof_2008_2009:copper_mg": "COPPER",
  "ibge_pof_2008_2009:zinc_mg": "ZINC",
  "ibge_pof_2008_2009:selenium_ug": "SELENIUM",
  "ibge_pof_2008_2009:retinol_rae_ug": "VITAMIN_A",
  "ibge_pof_2008_2009:thiamin_mg": "THIAMIN",
  "ibge_pof_2008_2009:riboflavin_mg": "RIBOFLAVIN",
  // niacin_ne_mg (niacin equivalents) fica FORA do mapa de proposito: e uma
  // metrica derivada distinta de niacin_mg (medida direta), e o dataset tem
  // os dois campos — mapear os dois pro mesmo NutrientCode duplicaria a
  // linha por alimento sem base para escolher qual "e" o niacina.
  "ibge_pof_2008_2009:niacin_mg": "NIACIN",
  "ibge_pof_2008_2009:pyridoxine_mg": "VITAMIN_B6",
  "ibge_pof_2008_2009:folate_dfe_ug": "FOLATE",
  "ibge_pof_2008_2009:vitamin_d_ug": "VITAMIN_D",
  "ibge_pof_2008_2009:vitamin_e_mg": "VITAMIN_E",
  "ibge_pof_2008_2009:vitamin_c_mg": "VITAMIN_C",
  "ibge_pof_2008_2009:cobalamin_ug": "VITAMIN_B12", // cobalamina = vitamina B12
  // Fase 2 — confirmado por leitura real do arquivo: linoleic_g/linolenic_g
  // estao presentes em 874/1944 alimentos (mesma secao de "fats_sugars" que
  // os outros perfis de gordura), cobertura cruzada real com a TACO.
  "ibge_pof_2008_2009:linoleic_g": "LINOLEIC_ACID",
  "ibge_pof_2008_2009:linolenic_g": "ALPHA_LINOLENIC_ACID",
  "ibge_pof_2008_2009:added_sugar_g": "ADDED_SUGAR", // 874 presentes, 255 com valor nao-nulo
  // added_sodium_mg fica FORA de proposito: declarado em nutrient_definitions
  // mas com 0 ocorrencias reais em qualquer alimento (confirmado por
  // varredura completa do arquivo) — mapear um campo sem nenhum dado real
  // seria especulativo. Tambem NAO e o mesmo conceito de ADDED_SALT (TBCA
  // mede sal em g, este seria sodio em mg) — nunca fundir os dois mesmo se
  // no futuro o dado aparecer.
};

// ---------------------------------------------------------------------------
// TBCA — colecao principal (composicao_alimentos_medidas_caseiras) e
// biodiversidade, que usam o MESMO formato de nutrient_id
// ("tbca:<slug>:<unidade>"). Mapeado pelo slug entre "tbca:" e ":unidade".
//
// Lista confirmada por leitura direta de um alimento real completo
// (Abacate, polpa, in natura — 41 nutrientes, a media exata do dataset por
// alimento segundo a auditoria). Slugs de outros alimentos que NAO
// aparecerem aqui ficam unmapped e entram no relatorio — nao sao
// extrapolados a partir desta amostra.
// ---------------------------------------------------------------------------
export const TBCA_MAIN_NUTRIENT_SLUG_MAP: Record<string, NutrientCode> = {
  // "energia" NAO entra aqui de proposito — kj e kcal sao codigos DIFERENTES
  // (ENERGY_KJ vs ENERGY_KCAL) e o slug sozinho nao diferencia; a decisao
  // fica inteira em resolveTbcaMainNutrientCode, que olha a unidade.
  carboidrato_total: "CARBOHYDRATE", // existe tambem carboidrato_disponivel (net carb) — deixado unmapped, metrica distinta
  proteina: "PROTEIN",
  lipidios: "TOTAL_FAT",
  fibra_alimentar: "FIBER",
  colesterol: "CHOLESTEROL",
  acidos_graxos_saturados: "SATURATED_FAT",
  acidos_graxos_monoinsaturados: "MONOUNSATURATED_FAT",
  acidos_graxos_poliinsaturados: "POLYUNSATURATED_FAT",
  acidos_graxos_trans: "TRANS_FAT",
  calcio: "CALCIUM",
  ferro: "IRON",
  sodio: "SODIUM",
  magnesio: "MAGNESIUM",
  fosforo: "PHOSPHORUS",
  potassio: "POTASSIUM",
  manganes: "MANGANESE",
  zinco: "ZINC",
  cobre: "COPPER",
  selenio: "SELENIUM",
  vitamina_a_rae: "VITAMIN_A", // RAE e a medida padrao; vitamina_a_re fica unmapped (metrica distinta)
  vitamina_d: "VITAMIN_D",
  alfa_tocoferol_vitamina_e: "VITAMIN_E",
  tiamina: "THIAMIN",
  riboflavina: "RIBOFLAVIN",
  niacina: "NIACIN",
  vitamina_b6: "VITAMIN_B6",
  vitamina_b12: "VITAMIN_B12",
  vitamina_c: "VITAMIN_C",
  equivalente_de_folato: "FOLATE",
  // Fase 2 — confirmados por leitura real: presentes em ~5874-5878/5875
  // alimentos (quase universal na colecao principal).
  acucar_de_adicao: "ADDED_SUGAR",
  sal_de_adicao: "ADDED_SALT", // medido em g de SAL, nao mg de sodio — nunca confundir com "sodio"
  gordura_de_adicao: "ADDED_FAT",
  proteina_vegetal: "PLANT_PROTEIN",
  proteina_animal: "ANIMAL_PROTEIN",
};

/**
 * energia:kj / energia:kcal compartilham o mesmo slug mas viram codigos
 * diferentes — a unica excecao no dataset onde a unidade decide o
 * NutrientCode em vez do slug sozinho.
 */
export function resolveTbcaMainNutrientCode(slug: string, unit: string): NutrientCode | null {
  if (slug === "energia") {
    const normalizedUnit = unit.trim().toLowerCase();
    if (normalizedUnit === "kj") return "ENERGY_KJ";
    if (normalizedUnit === "kcal") return "ENERGY_KCAL";
    return null;
  }
  return TBCA_MAIN_NUTRIENT_SLUG_MAP[slug] ?? null;
}

/**
 * Extrai o slug de um nutrient_id da colecao principal/biodiversidade da
 * TBCA: "tbca:vitamina_a_rae:mcg" -> "vitamina_a_rae". Formato confirmado
 * por leitura direta do arquivo real.
 */
export function parseTbcaMainNutrientId(nutrientId: string): { slug: string; unit: string } | null {
  const match = /^tbca:([a-z0-9_]+):([a-z]+)$/i.exec(nutrientId);
  if (!match) return null;
  return { slug: match[1], unit: match[2] };
}

/**
 * TBCA — colecoes de estatistica (composicao_informacao_estatistica e
 * composicao_informacao_estatistica_produtos), que usam `tagname` no
 * padrao INFOODS/FAO em vez do slug em portugues da colecao principal.
 *
 * FASE 2 (item 4): auditoria real via streaming de todo o arquivo
 * (scripts/canonical-nutrition-import/audit-tbca-tagnames.ts, ver
 * reports/tbca-tagname-audit.json) confirmou os 36 tagnames REAIS que
 * existem no dado — 34 nomeados + "—" (sem tagname, o caso degenerado ja
 * tratado por disambiguateSourceNutrientId) + "VITA" (RE, nao RAE).
 * Corrigiu dois erros da 1a versao deste mapa, que tinha assumido o padrao
 * INFOODS publicado sem confirmar cada tagname:
 *   - a chave real da vitamina A RAE e "VITA RAE" (COM ESPACO), nao
 *     "VITA_RAE" — a chave errada nunca batia com nada, entao toda vitamina
 *     A RAE das colecoes de estatistica ficava unmapped silenciosamente.
 *   - a chave real do folato e "FOLDFE" (folate DFE), nao "FOL" — a TBCA
 *     so publica a variante DFE (nao ha um "FOL" simples nesta base), entao
 *     mapear FOLDFE para FOLATE aqui e consistente com a mesma decisao ja
 *     tomada para "equivalente_de_folato" na colecao principal (idem: so
 *     existe a variante equivalente, nao ha "folato simples" para comparar).
 *
 * `TBCA_STATS_TAGNAME_CONFIRMED` = todos os 36 tagnames reais (a lista
 * inteira agora vem da auditoria, nao de uma amostra parcial).
 */
export const TBCA_STATS_TAGNAME_CONFIRMED = new Set([
  "—", "ENERC", "FAT", "WATER", "CHOCDF", "CHOAVLDF", "PROCNT", "FIBTG", "ALC", "ASH", "CHOLE",
  "FASAT", "FAMS", "FAPU", "FATRN", "CA", "FE", "NA", "MG", "P", "K", "MN", "ZN", "CU", "SE",
  "VITA", "VITD", "TOCPHA", "THIA", "RIBF", "NIA", "VITB6A", "VITB12", "VITC", "FOLDFE", "VITA RAE",
]);

export const TBCA_STATS_TAGNAME_MAP: Record<string, NutrientCode> = {
  ENERC: "ENERGY_KCAL", // desambiguado pela unidade em resolveTbcaStatsNutrientCode (kj -> ENERGY_KJ)
  CHOCDF: "CARBOHYDRATE", // "Carboidrato total" (confirmado) — espelha carboidrato_total da colecao principal
  // CHOAVLDF ("Carboidrato disponivel") fica FORA de proposito — mesma
  // decisao de carboidrato_disponivel na colecao principal, metrica distinta.
  PROCNT: "PROTEIN",
  FAT: "TOTAL_FAT",
  FIBTG: "FIBER",
  CHOLE: "CHOLESTEROL",
  FASAT: "SATURATED_FAT",
  FAMS: "MONOUNSATURATED_FAT",
  FAPU: "POLYUNSATURATED_FAT",
  FATRN: "TRANS_FAT",
  CA: "CALCIUM",
  FE: "IRON",
  NA: "SODIUM",
  MG: "MAGNESIUM",
  P: "PHOSPHORUS",
  K: "POTASSIUM",
  MN: "MANGANESE",
  ZN: "ZINC",
  CU: "COPPER",
  SE: "SELENIUM",
  // "VITA" ("Vitamina A (RE)") fica FORA de proposito — variante RE, nao
  // RAE; so "VITA RAE" mapeia, mesma decisao de vitamina_a_re/vitamina_a_rae
  // na colecao principal.
  "VITA RAE": "VITAMIN_A",
  VITD: "VITAMIN_D",
  TOCPHA: "VITAMIN_E", // "Alfa-tocoferol (Vitamina E)" — confirmado, mesma metrica de alfa_tocoferol_vitamina_e da colecao principal
  THIA: "THIAMIN",
  RIBF: "RIBOFLAVIN",
  NIA: "NIACIN", // "Niacina" direta (mg) — confirmada distinta de um eventual NIA_NE/equivalentes, que nao existe nesta base
  VITB6A: "VITAMIN_B6",
  VITB12: "VITAMIN_B12",
  VITC: "VITAMIN_C",
  FOLDFE: "FOLATE", // unica variante de folato publicada pela TBCA (DFE) — ver nota acima
  // ALC ("Alcool"), ASH ("Cinzas"), WATER ("Umidade") ficam FORA — sem
  // NutrientCode equivalente no vocabulario atual, mesma decisao da
  // colecao principal (alcool/cinzas/umidade tambem unmapped la).
};

export function resolveTbcaStatsNutrientCode(tagname: string, unit: string): NutrientCode | null {
  if (tagname === "ENERC") {
    const normalizedUnit = unit.trim().toLowerCase();
    if (normalizedUnit === "kj") return "ENERGY_KJ";
    if (normalizedUnit === "kcal") return "ENERGY_KCAL";
    return null;
  }
  return TBCA_STATS_TAGNAME_MAP[tagname] ?? null;
}

export function mappingSourceMapFor(source: CanonicalFoodSource): Record<string, NutrientCode> {
  if (source === "TACO") return TACO_NUTRIENT_MAP;
  if (source === "IBGE_POF") return POF_NUTRIENT_MAP;
  return TBCA_MAIN_NUTRIENT_SLUG_MAP;
}
