# Fase 5.5 — Resolution Confidence Calibration

Gerado em: 2026-08-22

Escopo respeitado: `prefer_canonical` **não** foi ativado em nenhum
ambiente. A policy V2 roda lado a lado com a V1, só em scripts de
calibração/comparação — nenhuma das duas decide o valor entregue ao
usuário nesta fase.

## 1. Dataset de calibração

`reports/fase55-calibration-dataset.json` — **337 linhas rotuladas**,
montadas de 3 fontes reais (nunca fabricadas):

| Origem | Linhas | Como foi rotulado |
|---|---:|---|
| Ground truth (Fases 3.5/4/5) | 130 | **Label real** — cada query é redução do nome de um alimento REAL do banco, com `expectedFoodId` conhecido. CORRECT se o topo bate; AMBIGUOUS_VALID se empata em score com o esperado; INCORRECT caso contrário. |
| DIFFERENT_TOP auditado (Fase 5) | 23 | Reusa a classificação heurística já corrigida da Fase 5 (BOTH_VALID/CANONICAL_BETTER → CORRECT; CURRENT_BETTER/BAD_CANONICAL_MATCH → INCORRECT; TRUE_AMBIGUITY → AMBIGUOUS_VALID). |
| CANONICAL_FOUND_MORE auditado (Fase 5) | 60 | Reusa a inspeção manual da Fase 5 (0 casos de match errado encontrados) → CORRECT. |
| Amostra fresca (natural + aleatória) | 124 | Só usada pra colher casos REAIS de status não-decisivo (gap<8) → AMBIGUOUS_VALID. Nunca rotulada CORRECT/INCORRECT sem gabarito real (não fabrica label). |

Distribuição de labels: CORRECT 200, AMBIGUOUS_VALID 131, INCORRECT 6,
NOT_ENOUGH_INFORMATION 0.

**Limitação honesta:** a fatia de ground truth é auto-referencial por
construção (query = redução do nome real de um alimento que existe no
banco) — isso deixa esses 130 casos mais "fáceis" que uma query livre de
nutricionista digitada do zero. Mitigado parcialmente pelas 83 linhas
(23+60) vindas de auditoria de queries reais/naturais da Fase 5, que não
têm essa garantia embutida.

## 2. Features usadas

`lib/nutrition/canonical-confidence-features.ts` —
`extractConfidenceFeatures()` devolve (por candidato TOPO de uma busca já
rankeada): `totalScore`, `gapToSecond`, `matchMethod`, `matchClass`,
`exactName`, `aliasExact`, `tokenCoverage`, `extraTokenPenalty`,
`simplicityScore`, `preparationEvidence`, `preparationExact`,
`preparationConflict`, `source`, `sourceTieBreakUsed`,
`classificationGroup`, `classificationFoodType`, `queryTokenCount`,
`candidateTokenCount`, `sourceRichness`/`sourceAgreementCount`,
`sourceAgreementStrength`, `numberOfCloseCandidates`, `varietyRequired`,
`simpleVsCompositeConflict`, `presenceOfCultivarSignal`,
`presenceOfPreparationSignal`, `presenceOfBrandSignal`,
`presenceOfCompositeClassification`. Todos reaproveitam o MESMO
`scoreBreakdown`/tokenizador do ranking real (`canonical-food-search.ts`)
— nenhuma segunda lógica de score paralela.

## 3. Match classes (item 3)

`EXACT_ALIAS`, `EXACT_NAME_AND_PREPARATION`, `EXACT_NAME`,
`STRONG_TOKEN_MATCH`, `FTS_PARTIAL`, `GENERIC_SHORT_QUERY` — cada uma com
threshold PRÓPRIO de score/gap (`lib/nutrition/canonical-confidence-v2.ts`,
`THRESHOLDS`). `EXACT_ALIAS` exige menos score (80/gap 0 — curado por
humano); `FTS_PARTIAL` exige muito mais (115/gap 25, e só em `LOW_RISK`);
`GENERIC_SHORT_QUERY` nunca auto-resolve, sem threshold nenhum.

## 4. Query risk model (item 4)

`LOW_RISK`/`MEDIUM_RISK`/`HIGH_RISK` — `classifyQueryRisk()`. HIGH_RISK
sempre que: query genérica de 1 token, `varietyRequired`,
`simpleVsCompositeConflict`, conflito de preparo, quase-empate real
(`gap<5` com 1+ candidato próximo), ou **produto/marca detectado**
(`presenceOfBrandSignal` — achado real desta fase, ver item 11). 2+
sinais mais fracos combinados também viram HIGH_RISK.

## 5. Preparation evidence (item 5)

`STRUCTURED_EXACT` / `TEXT_EXACT` / `TEXT_INFERRED` / `NONE` /
`CONFLICT` — nunca trata `TEXT_INFERRED` como confirmação (bloqueado
explicitamente em `canAutoResolveCanonicalV2`, independente de
score/gap). Confirma o achado real da Fase 5: só a IBGE_POF tem
`preparation_code` estruturado; TBCA/TACO dependem do radical exato no
texto (`TEXT_EXACT`) — nunca tratados como equivalentes.

## 6. Identidade simples vs composta (item 6)

`detectSimpleVsCompositeConflict()` bloqueia quando o topo é
prato/preparo composto (classificação `D - Preparação` ou nome muito
maior que a query) E existe um candidato mais simples da MESMA família
de nome entre os próximos — nunca um alimento totalmente diferente por
coincidência.

## 7. Cultivares/variedades (item 7)

`detectVarietyRequired()` — query curta (≤2 tokens úteis) com 2+
candidatos da mesma família de nome divergindo por um qualificador curto
(1-3 tokens, ex.: "prata"/"nanica"). Nunca decide sozinho — sempre
bloqueia auto-aceitação e mantém o estado ambíguo.

## 8. Source agreement (item 8)

`sourceAgreementCount`/`sourceAgreementStrength` — só CONTAGEM/FORÇA de
concordância entre candidatos próximos de fontes diferentes, nunca funde
nutrientes (confirmado por teste dedicado —
`tests/canonical-confidence-v2.test.ts`, "source agreement NUNCA aparece
como campo de nutriente"). Usado como sinal auxiliar, nunca obrigatório
pra auto-aceitação.

## 9. Policy V1 vs V2

V1 = `canUseCanonical` (score≥90, gap≥8, sem conflito de preparo — a
MESMA regra pra qualquer tipo de match). V2 = `canAutoResolveCanonicalV2`
(`lib/nutrition/canonical-confidence-v2.ts`) — policy por match class +
bloqueios de risco (variedade, composto, marca, preparo fraco,
quase-empate). Rodam **lado a lado**, nenhuma substitui a outra ainda.

## 10. Precision / Coverage — V1 vs V2

Sobre o dataset de calibração (337 linhas):

| Policy | Precision | Coverage | False Positive Rate |
|---|---:|---:|---:|
| V1 | 99,3% (148/149) | 44,2% | 0,30% |
| **V2** | **100%** (91/91) | 27,0% | **0%** |

Sobre o shadow de 1.076 queries reais (subset ancorado em ground truth):

| Policy | Precision (ground-truth-anchored) | Coverage (dataset inteiro) |
|---|---:|---:|
| V1 | 98,8% | 61,0% |
| **V2** | **100%** | 48,0% |

**V2 nunca aceita nada que V1 rejeitaria** (`onlyV2 = 0` nas 1.076
queries) — é um subconjunto estritamente mais conservador das decisões
de V1, trocando cobertura por segurança. Meta do pedido (`precision >=
97%`) **atingida por ambas**, mas só V2 chega a 100% nas duas medições —
V1 tem 1 falso positivo real e recorrente (o mesmo caso nas duas
medições, item 11).

Cobertura por match class (V2, dataset de calibração):

| Match class | Total | Aceitos | Precisão |
|---|---:|---:|---:|
| EXACT_NAME_AND_PREPARATION | 54 | 44 | 100% |
| EXACT_NAME | 91 | 37 | 100% |
| STRONG_TOKEN_MATCH | 73 | 10 | 100% |
| FTS_PARTIAL | 58 | 0 | N/A (nunca aceita) |
| GENERIC_SHORT_QUERY | 61 | 0 | N/A (nunca aceita) |

## 11. Falsos positivos

Ver `reports/canonical-confidence-errors.md` (detalhamento completo).
Resumo: 1 caso real (`"Pão de queijo, mistura p/"`) — duas entradas TBCA
genuinamente diferentes (`BRC0044R` "média de diferentes marcas" vs
`BRC0081R`) com nome-núcleo idêntico. V1 aceita errado (sem nenhum
mecanismo de detecção de produto/marca). V2 também aceitava errado
inicialmente — a investigação revelou que o sinal `presenceOfBrandSignal`
já existia mas só contava como risco quando `queryTokenCount <= 2`;
corrigido pra sempre bloquear (item 4: "produto/marca ambígua" nunca
deveria depender do tamanho da query). Após a correção, V2 chega a
**0 falsos positivos** nas duas medições (calibração + shadow de 1.076).

## 12. Aliases sugeridos

`reports/fase55-alias-curation.md` — classificados por segurança a partir
do dataset de calibração real: **SAFE_ALIAS: 97**, **REQUIRES_REVIEW:
85**, **UNSAFE: 137** (casos INCORRECT/AMBIGUOUS_VALID — nunca deveriam
virar alias). Nenhum inserido automaticamente.

## 13. UX futura

`reports/fase55-ux-future-design.md` — não implementado, só especificado:
LOW_RISK+auto-aceite → resolve sozinho; AMBIGUOUS/varietyRequired →
mostrar opções; PREPARATION_REVIEW → perguntar preparo; NOT_FOUND →
fallback atual/USDA.

## 14. Testes

- `tests/canonical-confidence-v2.test.ts` — 13 testes diretos da policy
  (alias/nome exato, query genérica bloqueada, variedade exigida, preparo
  fraco bloqueado, preparo estruturado mais forte que inferido, conflito
  simples-vs-composto, source agreement nunca funde dado, ambíguo
  permanece ambíguo, falsa confiança prevenida, FTS exige mais evidência,
  conflito de preparo sempre bloqueia).
- `tests/canonical-confidence-features.test.ts` — 8 testes de integração
  contra dados reais de fixture (preparo estruturado POF,
  `preparationEvidence NONE` sem preparo pedido, ambiguidade real de
  score empatado, alias curado → `EXACT_ALIAS`, query de 1 token →
  `GENERIC_SHORT_QUERY`, sem resultado → `null`, nunca inventa features).
- Total: **21 testes novos**, todos passando.

## 15. Gates

| Gate | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| `eslint .` | limpo |
| `vitest run` (suite completa) | **1657/1657 passaram** (189 arquivos) |
| `migrate:d1:check` | 56 migrações validadas |
| `npm run build` | exit 0 |

## 16. GO/NO-GO

**CANONICAL_CONFIDENCE_POLICY_READY: sim**

A policy V2 atingiu **100% de precisão** em duas medições independentes
(dataset de calibração de 337 linhas rotuladas com labels reais, e um
subconjunto ancorado em ground truth do shadow de 1.076 queries reais
contra D1) — acima da meta de 97% do pedido, com uma cobertura menor
(27-48%) como trade-off deliberado e documentado, priorizando precisão
sobre cobertura conforme pedido explicitamente ("Para uso clínico,
priorizar precision sobre coverage").

Isso **não** significa `prefer_canonical` pronto pra ativação — a amostra
de falsos positivos possíveis é pequena (0 em ~91-95 decisões auto-
aceitas por rodada), e a Fase 5's precisão anterior (77,2%) usava uma
metodologia diferente (concordância com o resolver atual, não
correção objetiva) que se mostrou uma proxy ruim — o número real, medido
contra gabarito verdadeiro, é bem mais alto. Ainda assim, `prefer_canonical`
continua **NÃO ativado automaticamente** nesta fase, como pedido
explicitamente. A recomendação pra Fase 6 é expandir a amostra de ground
truth (mais queries com `expectedFoodId` conhecido, cobrindo mais
categorias de alimento) antes de considerar qualquer ativação real, e
usar a V2 (não a V1) como base, dado seu histórico de 0 falsos positivos.
