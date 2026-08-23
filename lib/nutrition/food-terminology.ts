import { normalize } from "@/lib/nutrition/normalize";

/**
 * Camada canônica de terminologia de alimentos (Food Terminology & Catalog
 * Coverage V1) — ÚNICO lugar onde vivem aliases, sinônimos, abreviações,
 * variantes regionais, tradução PT→EN controlada e classificação de
 * modificadores usados pela busca/resolução de alimentos
 * (lib/nutrition/food-catalog.ts#scoreText e lib/nutrition/food-resolver.ts).
 * Consolida o que antes estava espalhado em food-query-normalize.ts,
 * food-query-aliases.ts e usda-fallback-terms.ts (Food Resolver V2) — essas
 * responsabilidades continuam as MESMAS, só passam a viver num módulo só,
 * como pedido explicitamente nesta rodada ("não espalhar regras em vários
 * arquivos").
 *
 * Continua valendo o mesmo princípio de todas as rodadas anteriores: ALIAS
 * significa "mesmo alimento, nome diferente" — nunca "alimento parecido que
 * poderia substituir" (isso é domínio da Substitution Engine, não deste
 * arquivo). Cada entrada aqui foi auditada manualmente contra o catálogo
 * real (TACO/TACO-complementar/USDA) antes de entrar; nunca um alias
 * "genérico" que abriria a porta pra confundir espécies, preparo ou
 * variantes nutricionalmente diferentes (integral/desnatado, cru/assado,
 * tomate cereja/tomate comum, etc. — ver testes negativos em
 * tests/food-resolver-v2.test.ts e tests/food-terminology-negative.test.ts).
 */

// ---------------------------------------------------------------------------
// 1) Normalização lexical (abreviações + stopwords) — usada só pelo scoring
// de busca, nunca por outros callers de normalize() (recibos, unidades etc.
// continuam com normalize() puro).
// ---------------------------------------------------------------------------

/**
 * Expansão de abreviações reais do TACO ("s/ pele" = "sem pele", "c/ óleo" =
 * "com óleo") — sem isso, "peito de frango grelhado" nunca batia com
 * "Frango, peito, cozido, s/ pele, s/ sal" mesmo quando a query cobria
 * exatamente o mesmo alimento.
 */
const ABBREVIATION_EXPANSIONS: [RegExp, string][] = [
  [/\bs\/\s*/gi, "sem "],
  [/\bc\/\s*/gi, "com "],
];

export function normalizeFoodText(text: string): string {
  let expanded = text;
  for (const [pattern, replacement] of ABBREVIATION_EXPANSIONS) expanded = expanded.replace(pattern, replacement);
  return normalize(expanded);
}

/**
 * Preposições/artigos puros — LINGUÍSTICOS, nunca um MODIFICADOR ESSENCIAL
 * (seção 4 do pedido). Modificadores essenciais ("sem", "integral", "light",
 * "zero", "cru", "cozido", "assado", "grelhado"...) NUNCA entram aqui — eles
 * mudam a composição nutricional do alimento e descartá-los da lista de
 * tokens abriria a porta pra "assado" casar com "cru" só porque os dois
 * ficaram de fora da comparação.
 */
const FOOD_QUERY_STOPWORDS = new Set(["de", "da", "do", "das", "dos"]);

export function tokenizeFoodQuery(text: string): string[] {
  return normalizeFoodText(text)
    .split(" ")
    .filter((token) => token && !FOOD_QUERY_STOPWORDS.has(token));
}

// ---------------------------------------------------------------------------
// 2) Alias seguro — reescrita de FRASE (nunca aponta source+refId fixo,
// deixa o resolver real resolver de novo, com toda checagem de segurança
// clínica).
// ---------------------------------------------------------------------------

const FOOD_QUERY_ALIASES: { pattern: RegExp; replacement: string; audit: string }[] = [
  {
    // "arroz branco" é como a grande maioria das pessoas chama o arroz
    // polido comum — na TACO isso é catalogado como "tipo 1", nunca como
    // "branco". Nunca reescreve "arroz integral" (token diferente, não bate
    // no pattern). Validado desde o Food Resolver V2.
    pattern: /\barroz\s+branco\b/gi,
    replacement: "arroz tipo 1",
    audit: "TACO só tem 'Arroz, tipo 1, ...' — nunca 'Arroz, branco, ...'. Mesmo alimento, nome popular != nome técnico.",
  },
  {
    // Auditado nesta rodada (Food Terminology V1, seção 1): TACO só tem
    // "Castanha-do-Brasil, crua" — "castanha-do-pará" é o mesmo alimento
    // (Bertholletia excelsa), nome regional/popular amplamente usado no
    // Brasil. Cobre variação com hífen ou espaço, com ou sem acento.
    pattern: /\bcastanha[\s-]+do[\s-]+par[aá](?=\W|$)/gi,
    replacement: "castanha do brasil",
    audit: "Mesma espécie (Bertholletia excelsa); TACO só cataloga como 'Castanha-do-Brasil'. Nunca confundido com castanha-de-caju (espécie diferente, entrada própria).",
  },
  {
    // Auditado nesta rodada (seção 1, item "café coado sem açúcar"): TACO
    // não tem entrada "café coado" nem distingue "com/sem açúcar" para café
    // (a bebida em si, sem preparo adoçado, é "Café, infusão 10%" — coar é
    // literalmente o método de preparo por infusão). Como não existe
    // NENHUMA variante "com açúcar" no catálogo pra confundir, dobrar o
    // modificador redundante "sem açúcar" nesta frase específica é seguro —
    // nunca generaliza pra outros alimentos com variantes reais de açúcar
    // (granola, iogurte etc. continuam token "sem"/"acucar" intactos).
    pattern: /\bcaf[eé]\s+coado(?:\s+sem\s+a[çc][uú]car)?\b/gi,
    replacement: "café infusão",
    audit: "'Coado' é o método de preparo por infusão — TACO só tem 'Café, infusão 10%', sem distinção de açúcar (não há variante adoçada para confundir).",
  },
  {
    // Template Adulto Saudável usa o nome popular "pão de forma integral".
    // No catálogo calculável, a entrada genérica correspondente é
    // "Pão, trigo, forma, integral"; a entrada complementar "com fibras"
    // é mais específica e só deve vencer quando a query trouxer esse
    // modificador explicitamente.
    pattern: /\bp[aã]o\s+de\s+forma\s+integral\b/gi,
    replacement: "Pão, trigo, forma, integral",
    audit: "Mesmo alimento genérico do TACO ('Pão, trigo, forma, integral'); não reescreve 'com fibras', 'light' ou outra variante específica.",
  },
];

export function applyFoodQueryAliases(query: string): string {
  let rewritten = query;
  for (const { pattern, replacement } of FOOD_QUERY_ALIASES) {
    rewritten = rewritten.replace(pattern, replacement);
  }
  return rewritten;
}

// ---------------------------------------------------------------------------
// 3) Tradução PT→EN controlada para o fallback USDA — mapa FECHADO e
// testável, nunca tradução livre por LLM. Só usado quando a busca real (na
// língua original) não encontrou nada nas fontes locais suficientes — nunca
// substitui TACO/COMPLEMENTARY/CUSTOM, só soma candidatos ao USDA, que
// passam pelo MESMO scoreText/classifyMatches (ainda pode virar AMBIGUOUS).
// ---------------------------------------------------------------------------

const USDA_NOUN_FALLBACK_TERMS: { pattern: RegExp; term: string; audit: string }[] = [
  // Verificado: USDA tem exatamente "Fish, tilapia, raw" e "Fish, tilapia,
  // cooked, dry heat" — nenhum outro peixe com esse nome, nunca confundível
  // com merluza/outro peixe (auditoria de cobertura de catálogo, rodada
  // anterior).
  { pattern: /\btil[aá]pia\b/i, term: "tilapia", audit: "USDA: 'Fish, tilapia, raw'/'...cooked, dry heat' — único peixe com esse nome." },
  // Auditado nesta rodada (seção 1, "tomate cereja"): não existe em
  // TACO/complementar (só variedade genérica de tomate). USDA tem
  // "Tomatoes, cherry, raw" — mesma identidade (variedade cereja), nunca
  // vira "tomate comum" (isso seria alias proibido).
  { pattern: /\btomate\s+cereja\b/i, term: "cherry tomato", audit: "USDA: 'Tomatoes, cherry, raw' — mesma variedade, nunca confundida com tomate comum." },
  // Rede de segurança pro exemplo do próprio pedido (seção 5) — TACO já
  // resolve "peito de frango" localmente na maioria dos casos; isso só
  // ajuda se a fonte local falhar por algum motivo (fraseado incomum).
  { pattern: /\bpeito\s+de\s+frango\b/i, term: "chicken breast", audit: "USDA: 'Chicken, broilers or fryers, breast, ...' — mesmo corte." },
];

export function usdaFallbackTermFor(query: string): string | null {
  const normalizedQuery = normalize(query);
  for (const { pattern, term } of USDA_NOUN_FALLBACK_TERMS) {
    if (pattern.test(normalizedQuery)) return term;
  }
  return null;
}

/**
 * Tradução de MODIFICADOR de preparo/corte PT→EN — mapa fechado, auditado
 * (seção 5 do pedido: "assado/grelhado → cooked, dry heat SOMENTE se isso
 * for semanticamente auditado"). Usado SÓ para decidir se um token da query
 * original (em português) "bate" contra um nome de candidato USDA (em
 * inglês) no ranking por tokens (rank 4) — nunca reescreve a query, nunca
 * troca a identidade do alimento em si, nunca é usado para TACO/
 * COMPLEMENTARY/CUSTOM (que já estão em português). Sem isso, uma frase
 * composta como "filé de tilápia assado" nunca batia mesmo quando o
 * candidato certo já tinha sido buscado via usdaFallbackTermFor — o
 * re-scoring final continuava exigindo "assado" como substring literal de
 * "Fish, tilapia, cooked, dry heat", o que nunca acontece.
 *
 * Cada modificador aqui é INEQUÍVOCO (não muda dependendo de contexto) —
 * nunca um par arriscado tipo "cru"→"fresh" (fresh não significa cru).
 */
const USDA_MODIFIER_TRANSLATIONS: Record<string, string[]> = {
  cru: ["raw"],
  assado: ["roasted", "baked", "cooked, dry heat", "dry heat"],
  grelhado: ["grilled", "broiled"],
  cozido: ["cooked", "boiled"],
  frito: ["fried"],
  congelado: ["frozen"],
};

/**
 * Alternativas em inglês para um token da query em português — vazio se o
 * token não é um modificador de preparo conhecido (nesse caso o candidato
 * precisa conter o próprio token, como sempre).
 */
export function usdaModifierAlternatives(token: string): string[] {
  return USDA_MODIFIER_TRANSLATIONS[token] ?? [];
}

/**
 * Tokens que descrevem só o CORTE de forma textual redundante ("filé"),
 * sem mudar a identidade nutricional — auditado (seção 4: "filé, quando
 * apenas forma textual e não muda identidade"). Para TACO/COMPLEMENTARY/
 * CUSTOM o token continua exigido normalmente (ajuda a desambiguar cortes
 * reais, ex. "Filé mignon"); só para candidatos USDA ele é tratado como
 * sempre-presente, porque entradas genéricas de espécie no USDA (ex. "Fish,
 * tilapia, cooked, dry heat") não usam a palavra "fillet" — exigir isso
 * bloquearia SEMPRE o match, mesmo quando o preparo/espécie batem
 * perfeitamente. Nunca aplicado a TACO (tokenMatchesCandidateText só
 * consulta esta lista quando isUsdaCandidate é true).
 */
const USDA_NON_BINDING_TOKENS = new Set(["file"]);

/**
 * Verifica se um token da query bate contra o texto normalizado de um
 * candidato — para candidatos USDA (texto em inglês), também aceita a
 * tradução auditada do modificador de preparo/corte. Nunca usado para
 * TACO/COMPLEMENTARY/CUSTOM (já estão em português, comparação direta).
 */
export function tokenMatchesCandidateText(token: string, text: string, isUsdaCandidate: boolean): boolean {
  if (text.includes(token)) return true;
  if (!isUsdaCandidate) return false;
  if (USDA_NON_BINDING_TOKENS.has(token)) return true;
  return usdaModifierAlternatives(token).some((alt) => text.includes(alt));
}

// ---------------------------------------------------------------------------
// 4) Classificação de modificadores (seção 4 do pedido) — só documentação/
// referência viva (usada por auditorias e pelos testes), a lista real que
// afeta o comportamento é FOOD_QUERY_STOPWORDS + FOOD_QUERY_LINGUISTIC_TOKENS
// acima. Nunca remover um ESSENCIAL da tokenização para "melhorar" um match.
// ---------------------------------------------------------------------------

export const ESSENTIAL_FOOD_MODIFIERS = [
  "integral", "desnatado", "semidesnatado", "sem", "light", "zero",
  "cru", "cozido", "assado", "grelhado", "frito", "congelado",
] as const;

/**
 * Puramente linguísticos, removidos da tokenização (FOOD_QUERY_STOPWORDS
 * acima). "Filé"/"tipo" foram auditados (seção 4 do pedido) e
 * DELIBERADAMENTE MANTIDOS como tokens normais (não estão na lista de
 * stopwords) — remover "filé" tornaria queries tipo "filé de frango" MENOS
 * específicas (mais candidatos ambíguos, não menos), o oposto do objetivo.
 */
export const LINGUISTIC_FOOD_MODIFIERS = ["de", "da", "do", "das", "dos"] as const;

/**
 * Nome amigável para exibição — reordena o formato típico da TACO
 * ("Alimento, atributo1, atributo2" → "Alimento atributo1 atributo2"),
 * nunca um replace ingênuo de vírgula. NUNCA usado para resolver
 * identidade — source/refId/nutrientes continuam vindo do nome técnico
 * original, só a apresentação muda. Mora aqui (modulo de base, sem
 * dependência de food-resolver.ts/food-catalog.ts) pra os dois poderem
 * usar sem criar import circular — reexportado por
 * lib/nutrition/food-resolver.ts pra compatibilidade.
 */
export function toDisplayFoodName(technicalName: string): string {
  const parts = technicalName.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return technicalName.trim();
  return parts.join(" ");
}
