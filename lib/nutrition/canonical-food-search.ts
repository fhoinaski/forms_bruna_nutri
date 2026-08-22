import { d1Query } from "@/lib/d1/client";
import { capForLikePattern } from "@/lib/d1/like-safety";
import { normalizeFoodText, tokenizeFoodQuery } from "@/lib/nutrition/food-terminology";
import { extractPreparation, type PreparationCode } from "@/lib/nutrition/food-preparation";
import type { CanonicalFoodSource } from "@/lib/nutrition-import/types";

/**
 * FASE 3 (Canonical Food Search & Resolver Bridge) — serviço de busca
 * ISOLADO sobre as tabelas canônicas (canonical_foods/food_aliases/
 * canonical_food_portions/canonical_foods_fts) criadas na Fase 1.
 *
 * NUNCA chamado por nenhuma rota de produção nesta rodada — ver
 * lib/nutrition/food-catalog.ts (o catálogo ATIVO, intocado) e
 * lib/nutrition/food-resolver.ts (o resolver ATIVO, intocado).
 * canonicalFoodSearch()/resolveCanonicalFood() abaixo são só a ponte nova,
 * usada por scripts/canonical-nutrition-import/shadow-compare.ts e pelos
 * testes desta fase.
 *
 * Nunca lê tbca_completa.json em runtime — só consulta as tabelas já
 * importadas (D1 em produção futura, SQLite local nesta fase, via o mesmo
 * contrato de executor).
 */

/** Mesmo contrato de lib/d1/client.ts#d1Query — permite injetar o SQLite local nos testes/benchmarks sem duplicar a camada de acesso. */
export type CanonicalDbExecutor = (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

async function defaultExecutor(sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
  return d1Query<Record<string, unknown>>(sql, params);
}

export type CanonicalMatchMethod = "EXACT_NAME" | "ALIAS_EXACT" | "PREFIX" | "CONTAINS" | "ALL_TOKENS" | "FTS";

export interface CanonicalFoodSearchQuery {
  query: string;
  preparation?: string | null;
  limit?: number;
  sourcePreference?: CanonicalFoodSource[];
  db?: CanonicalDbExecutor;
  /**
   * FASE 4.5 (item 7) — false por padrao. Buscar portions pra CADA
   * resultado do topo custava 1 round-trip D1 extra POR resultado (ate
   * `limit`, default 10) so pra uma busca inicial/autocomplete que
   * normalmente so precisa de nome+score pra exibir a lista. Chame
   * getPortions(foodId) (lib/repositories/canonical-foods.ts) depois que o
   * usuario SELECIONAR um alimento — no fluxo real, a maioria das buscas
   * nunca chega a precisar de porcoes de todos os 10 candidatos.
   */
  includePortions?: boolean;
}

export interface CanonicalPortionSummary {
  id: string;
  label: string;
  gramWeight: number | null;
  mlWeight: number | null;
  parsedLabelGrams: number | null;
  weightSource: "structured_quantity" | "parsed_from_label" | "unknown";
  confidence: "high" | "medium" | "low";
}

export interface CanonicalScoreBreakdown {
  nameScore: number;
  preparationScore: number;
  classificationScore: number;
  simplicityScore: number;
  extraTokenPenalty: number;
  richnessScore: number;
  sourceTiebreak: number;
  ftsScore: number;
}

export interface CanonicalFoodSearchResult {
  foodId: string;
  source: CanonicalFoodSource;
  sourceFoodId: string;
  name: string;
  normalizedName: string;
  scientificName: string | null;
  preparation: { method: string | null; code: string | null; name: string | null } | null;
  classification: { group: string | null; foodType: string | null } | null;
  score: number;
  matchMethod: CanonicalMatchMethod;
  scoreBreakdown: CanonicalScoreBreakdown;
  portions?: CanonicalPortionSummary[];
}

/**
 * Normalização determinística de nome de alimento (item 6). Reaproveita
 * normalizeFoodText (lib/nutrition/food-terminology.ts, já usado pelo
 * catálogo ativo) em vez de criar uma segunda implementação — o mesmo
 * normalizador que já popula canonical_foods.normalized_name na
 * importação. Nunca remove termos semanticamente importantes (cru/cozido/
 * assado/grelhado/integral/desnatado/sem açúcar/light/diet/etc.) — só
 * lowercase, remove acentos e normaliza espaços/pontuação.
 */
export function normalizeFoodName(name: string): string {
  // normalizeFoodText cobre acento/caixa/abreviacao; aqui completamos com
  // pontuacao (item 6: "normalizar pontuacao") — sem isso "Arroz, integral,
  // cozido" (nome tecnico real da TACO, com virgulas) nunca bateria como
  // EXACT_NAME contra a query "arroz integral cozido" (sem virgulas), que e
  // exatamente como usuarios/IA digitam.
  return normalizeFoodText(name)
    .replace(/[.,;:()/\\_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * PreparationCode (food-preparation.ts) e um enum em INGLES (RAW/COOKED/
 * GRILLED/...) — nunca comparado direto contra texto em portugues dos
 * candidatos (POF preparation_name / TBCA preparation_method). Mapeia pro
 * radical PT-BR real usado nas fontes, sem inventar sinonimo novo.
 */
const PREPARATION_CODE_TO_PT_STEM: Record<PreparationCode, string> = {
  RAW: "cru",
  COOKED: "cozid",
  GRILLED: "grelhad",
  ROASTED: "assad",
  FRIED: "frit",
  SCRAMBLED: "mexid",
  STEAMED: "vapor",
  PUREED: "pure",
};

function escapeFtsQuery(tokens: string[]): string {
  // FTS5 com tokenize=unicode61: cada token vira um termo de prefixo
  // (token*) unido por AND implicito (espaco) — nunca interpola aspas do
  // usuario cruas (evita quebrar a sintaxe MATCH).
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(" ");
}

interface CandidateRow {
  id: string;
  source: CanonicalFoodSource;
  source_food_id: string;
  name: string;
  normalized_name: string;
  scientific_name: string | null;
  preparation_method: string | null;
  preparation_code: string | null;
  preparation_name: string | null;
  classification_group: string | null;
  classification_food_type: string | null;
  nutrient_count: number;
  fts_rank?: number;
}

async function fetchCandidatesByFts(db: CanonicalDbExecutor, tokens: string[], limit: number): Promise<CandidateRow[]> {
  if (!tokens.length) return [];
  const matchQuery = escapeFtsQuery(tokens);
  const rows = await db(
    `SELECT f.id, f.source, f.source_food_id, f.name, f.normalized_name, f.scientific_name,
            f.preparation_method, f.preparation_code, f.preparation_name,
            f.classification_group, f.classification_food_type,
            (SELECT COUNT(*) FROM food_nutrient_values v WHERE v.canonical_food_id = f.id AND v.portion_id IS NULL) AS nutrient_count,
            bm25(canonical_foods_fts) AS fts_rank
       FROM canonical_foods_fts
       JOIN canonical_foods f ON f.id = canonical_foods_fts.food_id
      WHERE canonical_foods_fts MATCH ?
      ORDER BY fts_rank
      LIMIT ?`,
    [matchQuery, Math.max(limit * 4, 40)]
  );
  return rows as unknown as CandidateRow[];
}

async function fetchCandidatesByLike(db: CanonicalDbExecutor, normalizedQuery: string, limit: number): Promise<CandidateRow[]> {
  const rows = await db(
    `SELECT f.id, f.source, f.source_food_id, f.name, f.normalized_name, f.scientific_name,
            f.preparation_method, f.preparation_code, f.preparation_name,
            f.classification_group, f.classification_food_type,
            (SELECT COUNT(*) FROM food_nutrient_values v WHERE v.canonical_food_id = f.id AND v.portion_id IS NULL) AS nutrient_count
       FROM canonical_foods f
      WHERE f.normalized_name LIKE ?
      LIMIT ?`,
    [`%${capForLikePattern(normalizedQuery)}%`, Math.max(limit * 4, 40)]
  );
  return rows as unknown as CandidateRow[];
}

async function fetchAliasMatches(db: CanonicalDbExecutor, normalizedQuery: string, limit: number): Promise<CandidateRow[]> {
  const rows = await db(
    `SELECT f.id, f.source, f.source_food_id, f.name, f.normalized_name, f.scientific_name,
            f.preparation_method, f.preparation_code, f.preparation_name,
            f.classification_group, f.classification_food_type,
            (SELECT COUNT(*) FROM food_nutrient_values v WHERE v.canonical_food_id = f.id AND v.portion_id IS NULL) AS nutrient_count
       FROM food_aliases a
       JOIN canonical_foods f ON f.id = a.canonical_food_id
      WHERE a.normalized_alias = ?
      LIMIT ?`,
    [normalizedQuery, limit]
  );
  return (rows as unknown as CandidateRow[]).map((row) => ({ ...row, __alias: true }) as CandidateRow & { __alias: true });
}

async function fetchPortions(db: CanonicalDbExecutor, canonicalFoodId: string): Promise<CanonicalPortionSummary[]> {
  const rows = await db(
    `SELECT id, label, gram_weight, ml_weight, parsed_label_grams, weight_source, confidence
       FROM canonical_food_portions WHERE canonical_food_id = ? ORDER BY label`,
    [canonicalFoodId]
  );
  return rows.map((row) => ({
    id: String(row.id),
    label: String(row.label),
    gramWeight: row.gram_weight === null ? null : Number(row.gram_weight),
    mlWeight: row.ml_weight === null ? null : Number(row.ml_weight),
    parsedLabelGrams: row.parsed_label_grams === null ? null : Number(row.parsed_label_grams),
    weightSource: row.weight_source as CanonicalPortionSummary["weightSource"],
    confidence: row.confidence as CanonicalPortionSummary["confidence"],
  }));
}

/**
 * TBCA anota pratos compostos com uma lista de ingredientes entre
 * parenteses depois do nome real (ex.: "Banana flambada (sorvete, banana,
 * suco de laranja, conhaque)", "Bobó de peixe, c/ sal (mandioca, peixe...)").
 * Essa lista NAO e o nome do prato — e uma anotacao gerada pela propria
 * fonte. Comparar contra ela pra EXACT/PREFIX inflaria o match de pratos
 * so porque um ingrediente aparece la dentro (achado real: "arroz branco"
 * batia como CONTAINS num prato de carne moida so porque "arroz branco"
 * era um dos ingredientes listados). O nome NUCLEO (antes do primeiro "(")
 * e o que decide EXACT/PREFIX; o texto completo (com a lista) so entra pra
 * CONTAINS/ALL_TOKENS, um nivel de confianca abaixo.
 */
function coreNameOf(name: string): string {
  const idx = name.indexOf("(");
  return normalizeFoodName(idx === -1 ? name : name.slice(0, idx));
}

/**
 * Score de nome — maior peso do ranking (item 8). Nunca decide sozinho:
 * so o valor bruto, combinado com preparo/classificacao/riqueza/penalidade
 * de tokens extras depois.
 */
function nameScoreFor(normalizedQuery: string, queryTokens: string[], row: CandidateRow, isAlias: boolean): { score: number; method: CanonicalMatchMethod } {
  if (isAlias) return { score: 95, method: "ALIAS_EXACT" };
  const core = coreNameOf(row.name);
  if (core === normalizedQuery) return { score: 100, method: "EXACT_NAME" };
  if (core.startsWith(normalizedQuery)) return { score: 70, method: "PREFIX" };

  // Recalculado com normalizeFoodName (pontuacao incluida) em vez de
  // confiar em row.normalized_name cru — a coluna do banco foi gravada so
  // com normalizeFoodText na importacao (Fase 1), sem stripping de
  // pontuacao; comparar direto contra ela perderia exact matches legitimos
  // como "Arroz, integral, cozido" (nome tecnico) vs "arroz integral cozido"
  // (query sem virgulas).
  const fullName = normalizeFoodName(row.name);
  if (fullName.includes(normalizedQuery)) return { score: 50, method: "CONTAINS" };
  const nameTokens = tokenizeFoodQuery(row.name);
  const covered = queryTokens.filter((token) => nameTokens.some((nameToken) => nameToken.includes(token) || token.includes(nameToken)));
  const coverage = queryTokens.length ? covered.length / queryTokens.length : 0;
  return { score: Math.round(coverage * 40), method: "ALL_TOKENS" };
}

/**
 * FASE 3.5 (itens 2/3) — penalidade por tokens do candidato que NAO
 * aparecem na query ("extra token penalty" / "query/food length ratio").
 * Calculada sobre o nome COMPLETO (inclusive a lista de ingredientes entre
 * parenteses da TBCA) — e exatamente essa lista que faz um prato composto
 * ter dezenas de tokens a mais que uma query generica como "arroz branco"
 * ou "banana", e e isso que deve puxar o score dele pra baixo em relacao a
 * um alimento simples com o mesmo nucleo de nome.
 *
 * `allowedSlack` tolera 2 tokens extras sem penalidade (marca/variedade/
 * "Brasil" no fim do nome, comuns em TBCA/TACO) — so penaliza volume real
 * de texto além disso. Nunca penaliza alem do teto (-15), pra nao apagar
 * um match de nome forte (EXACT/PREFIX) so por causa do texto extra.
 */
function extraTokenPenaltyFor(queryTokens: string[], row: CandidateRow): number {
  if (!queryTokens.length) return 0;
  const nameTokens = tokenizeFoodQuery(row.name);
  const extra = nameTokens.filter((nameToken) => !queryTokens.some((token) => nameToken.includes(token) || token.includes(nameToken)));
  const allowedSlack = 2;
  const penalizable = Math.max(0, extra.length - allowedSlack);
  return penalizable === 0 ? 0 : -Math.min(15, penalizable * 1.5);
}

/**
 * FASE 3.5 (item 2) — preferencia moderada por alimento in natura/preparo
 * simples sobre preparacao/prato composto, usando classification_food_type
 * ja importado da TBCA (Fase 1). So um NUDGE pequeno (nunca decide
 * sozinho) — e so existe pra ~4.234/10.063 alimentos (TBCA classificada;
 * TACO/POF nao tem esse campo, ficam neutros em 0).
 */
function simplicityScoreFor(row: CandidateRow): number {
  const foodType = row.classification_food_type;
  if (!foodType) return 0;
  if (foodType.startsWith("A") || foodType.startsWith("F")) return 6; // in natura / preparo simples
  if (foodType.startsWith("D")) return -4; // preparacao composta
  return 0; // B/C (processado ingrediente/pronto pra consumo) e O (dietas hospitalares) — neutro
}

/**
 * Score de preparo (item 7). Query e candidato sao comparados pelo MESMO
 * extractPreparation ja usado pelo resolver ativo — nunca reimplementado.
 * TBCA/TACO tem preparation_method inferido do nome; POF tem
 * preparation_name estruturado da propria fonte (nunca inferido).
 */
/**
 * TBCA/TACO gravam preparation_method como o proprio codigo em INGLES do
 * PreparationCode (derivePreparationMethod chama extractPreparation() e
 * guarda o `.preparation`, ex.: "COOKED") — nunca o radical em portugues.
 * POF grava preparation_name estruturado da fonte, em portugues (ex.:
 * "Cozido(a)"). As duas formas precisam bater contra a MESMA query.
 */
function preparationMatches(queryCode: PreparationCode, candidateRaw: string): boolean {
  if (candidateRaw.toUpperCase() === queryCode) return true;
  return normalizeFoodText(candidateRaw).includes(PREPARATION_CODE_TO_PT_STEM[queryCode]);
}

/**
 * Achado real (POF): algumas "comidas prontas" (ex.: "Milho cozido") tem
 * preparation_code=99/preparation_name="Não se aplica" mesmo com o preparo
 * escrito no proprio nome — porque para ESSE registro o eixo de preparo
 * estruturado da POF nao se aplica (o prato ja e uma unidade fechada), nao
 * porque o preparo seja desconhecido ou diferente do pedido. Tratar "não se
 * aplica" como se fosse um preparo real diferente penalizaria injustamente
 * um match de nome perfeito — cai pro texto do nome nesse caso, igual ao
 * que TBCA/TACO (sem preparo estruturado nenhum) ja fazem.
 */
function preparationScoreFor(queryPreparation: PreparationCode | null, row: CandidateRow): number {
  if (!queryPreparation) return 0;
  const rawPrep = row.preparation_method ?? row.preparation_name ?? null;
  const isNotApplicable = rawPrep !== null && normalizeFoodText(rawPrep).includes("nao se aplica");
  const structuredPrep = rawPrep && !isNotApplicable ? rawPrep : null;

  if (structuredPrep) {
    return preparationMatches(queryPreparation, structuredPrep) ? 20 : -15;
  }
  const nameStem = normalizeFoodText(row.name);
  if (nameStem.includes(PREPARATION_CODE_TO_PT_STEM[queryPreparation])) return 15;
  return -3; // sem preparo estruturado utilizavel e nome tambem nao menciona — ambiguo, penalidade leve
}

function classificationScoreFor(queryTokens: string[], row: CandidateRow): number {
  const classificationText = normalizeFoodText([row.classification_group, row.classification_food_type].filter(Boolean).join(" "));
  if (!classificationText) return 0;
  const hit = queryTokens.some((token) => classificationText.includes(token));
  return hit ? 5 : 0;
}

function richnessScoreFor(row: CandidateRow): number {
  // Ate 5 pontos, escalado por completude de nutrientes — so desempate
  // entre candidatos ja proximos, nunca decide sozinho (ver pesos acima).
  return Math.min(5, Math.round((row.nutrient_count / 40) * 5));
}

function sourceTiebreakFor(row: CandidateRow, sourcePreference: CanonicalFoodSource[] | undefined): number {
  if (!sourcePreference?.length) return 0;
  const index = sourcePreference.indexOf(row.source);
  if (index === -1) return 0;
  // Peso MINIMO de proposito (no maximo 2 pontos) — nunca o suficiente pra
  // vencer uma diferenca real de nome/preparo (item 8: "nao usar prioridade
  // absoluta TBCA > TACO > POF").
  return Math.max(0, 2 - index);
}

function ftsScoreFor(row: CandidateRow): number {
  if (row.fts_rank === undefined || row.fts_rank === null) return 0;
  // bm25 do SQLite e negativo e menor=melhor; normaliza pra um bonus
  // pequeno e sempre nao-negativo, so pra desempate fino entre candidatos
  // de rank textual identico.
  return Math.max(0, Math.min(10, -row.fts_rank));
}

function toResult(
  row: CandidateRow,
  normalizedQuery: string,
  queryTokens: string[],
  queryPreparation: PreparationCode | null,
  sourcePreference: CanonicalFoodSource[] | undefined,
  isAlias: boolean
): CanonicalFoodSearchResult {
  const { score: nameScore, method } = nameScoreFor(normalizedQuery, queryTokens, row, isAlias);
  const preparationScore = preparationScoreFor(queryPreparation, row);
  const classificationScore = classificationScoreFor(queryTokens, row);
  const simplicityScore = isAlias ? 0 : simplicityScoreFor(row);
  const extraTokenPenalty = isAlias ? 0 : extraTokenPenaltyFor(queryTokens, row);
  const richnessScore = richnessScoreFor(row);
  const sourceTiebreak = sourceTiebreakFor(row, sourcePreference);
  const ftsScore = ftsScoreFor(row);
  const breakdown: CanonicalScoreBreakdown = { nameScore, preparationScore, classificationScore, simplicityScore, extraTokenPenalty, richnessScore, sourceTiebreak, ftsScore };
  const score = nameScore + preparationScore + classificationScore + simplicityScore + extraTokenPenalty + richnessScore + sourceTiebreak + ftsScore;

  return {
    foodId: row.id,
    source: row.source,
    sourceFoodId: row.source_food_id,
    name: row.name,
    normalizedName: row.normalized_name,
    scientificName: row.scientific_name,
    preparation: row.preparation_method || row.preparation_code || row.preparation_name
      ? { method: row.preparation_method, code: row.preparation_code, name: row.preparation_name }
      : null,
    classification: row.classification_group || row.classification_food_type
      ? { group: row.classification_group, foodType: row.classification_food_type }
      : null,
    score,
    matchMethod: method === "EXACT_NAME" && preparationScore < 0 ? "CONTAINS" : method, // nome exato mas preparo errado nunca se anuncia como EXACT_NAME puro
    scoreBreakdown: breakdown,
  };
}

/**
 * Resolve o preparo pedido para PreparationCode (item 7). `input.preparation`
 * explicito tem prioridade (ex.: UI com um seletor de preparo separado da
 * query de texto); senao, detecta via extractPreparation() na propria
 * query — MESMA funcao ja usada pelo resolver ativo, nunca reimplementada.
 */
export function resolveQueryPreparation(input: { query: string; preparation?: string | null }): PreparationCode | null {
  if (input.preparation) {
    const upper = input.preparation.trim().toUpperCase();
    if (upper in PREPARATION_CODE_TO_PT_STEM) return upper as PreparationCode;
    return extractPreparation(input.preparation).preparation;
  }
  return extractPreparation(input.query).preparation;
}

/**
 * Busca no catalogo canonico (item 4/5). NUNCA consulta o JSON bruto —
 * so as tabelas ja importadas (canonical_foods/food_aliases/FTS). Ordena
 * por score determinístico (item 8) e devolve o topo (item 4 formato de
 * saida), com scoreBreakdown sempre presente para depuracao/testes.
 */
export async function canonicalFoodSearch(input: CanonicalFoodSearchQuery): Promise<CanonicalFoodSearchResult[]> {
  const db = input.db ?? defaultExecutor;
  const normalizedQuery = normalizeFoodName(input.query);
  if (!normalizedQuery || normalizedQuery.length < 2) return [];
  const queryTokens = tokenizeFoodQuery(input.query);
  const limit = Math.max(1, Math.min(50, input.limit ?? 10));
  const queryPreparation = resolveQueryPreparation(input);
  // Busca (candidate-gathering) usa so os tokens do ALIMENTO BASE — o
  // preparo nunca filtra candidatos, so pontua depois (item 8: "preparação
  // deve participar do ranking", nunca um pre-filtro rigido). Sem isso,
  // "tilapia assada" (preparo que a TBCA nao tem pra tilapia — so
  // "grelhado"/"cru") voltaria vazio mesmo com "tilapia grelhada" disponivel
  // como candidato relevante pra AMBIGUOUS/PREPARATION_REVIEW escolher.
  const ftsTokens = queryPreparation && !input.preparation ? tokenizeFoodQuery(extractPreparation(input.query).baseFoodQuery) : queryTokens;

  const [ftsRows, aliasRows] = await Promise.all([
    fetchCandidatesByFts(db, ftsTokens, limit).catch(() => [] as CandidateRow[]),
    fetchAliasMatches(db, normalizedQuery, limit),
  ]);
  let rows = [...aliasRows, ...ftsRows];
  if (rows.length === 0) {
    // Fallback determinístico quando FTS nao acha nada (ex.: tokenizacao
    // muito curta) — nunca o unico caminho, so um seguro (item 17: "FTS
    // fallback"). Tenta o texto completo primeiro, depois so o alimento
    // base (mesmo raciocinio do ftsTokens acima).
    rows = await fetchCandidatesByLike(db, normalizedQuery, limit);
    if (rows.length === 0 && ftsTokens !== queryTokens) {
      rows = await fetchCandidatesByLike(db, normalizeFoodName(ftsTokens.join(" ")), limit);
    }
  }

  const seen = new Map<string, CandidateRow & { __alias?: boolean }>();
  for (const row of rows) {
    const existing = seen.get(row.id);
    if (!existing || (row as { __alias?: boolean }).__alias) seen.set(row.id, row);
  }

  const results = Array.from(seen.values())
    .map((row) => toResult(row, normalizedQuery, queryTokens, queryPreparation, input.sourcePreference, Boolean((row as { __alias?: boolean }).__alias)))
    .sort((a, b) => b.score - a.score || a.source.localeCompare(b.source) || a.name.localeCompare(b.name, "pt-BR"));

  const top = results.slice(0, limit);
  if (input.includePortions) {
    await Promise.all(
      top.map(async (result) => {
        result.portions = await fetchPortions(db, result.foodId);
      })
    );
  }
  return top;
}
