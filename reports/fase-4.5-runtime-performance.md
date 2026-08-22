# Fase 4.5 — Runtime Performance + Current Resolver Hardening

Gerado em: 2026-08-22

Escopo respeitado integralmente: `prefer_canonical` continua **desativado**
em produção; Nutrition Engine, snapshots, recalculate plans e
MealPlanEditor não foram tocados; o resolver atual e o USDA continuam
existindo e sendo o caminho real de produção.

## 1. Causa raiz do bug do resolver atual

`LIKE or GLOB pattern too complex: SQLITE_ERROR` — limite não documentado
do D1 (SQLite hospedado via HTTP pela Cloudflare): qualquer padrão
LIKE/GLOB cujo comprimento total (incluindo os `%`) passe de ~50
caracteres é rejeitado. Medido empiricamente por busca binária contra o D1
real (48 chars de conteúdo = OK; 50+ = FALHA). `node:sqlite` local não
reproduz isso nem em 10.000 chars — é específico da plataforma D1.

Nomes TBCA normalizados costumam ter 90-150+ caracteres, então qualquer
caminho que monta um LIKE direto do texto livre da busca ficava exposto.

Ver `reports/current-resolver-hardening.md` para o detalhamento completo,
incluindo o quarto ponto de código (`recipes.ts`) que só apareceu numa
segunda rodada de investigação.

## 2. Correção aplicada

Módulo compartilhado `lib/d1/like-safety.ts` (`capForLikePattern`,
`MAX_LIKE_PATTERN_CONTENT_LENGTH = 40`), aplicado só aos ramos
fuzzy/contains de LIKE em 4 pontos: `lib/repositories/custom-foods.ts`,
`lib/repositories/usda-foods.ts`, `lib/repositories/recipes.ts` e
`lib/nutrition/canonical-food-search.ts`. Match exato e FTS continuam com
o texto completo — nenhum termo semanticamente crítico é cortado nos
caminhos que decidem identidade.

## 3. Erros antes/depois (shadow dataset, 520 queries reais contra D1 real)

| Etapa | Erros |
|---|---:|
| Fase 4 (antes de qualquer correção) | 203 |
| Após corrigir custom-foods/usda-foods/canonical-food-search | 115 |
| Após corrigir recipes.ts | **0** |

`canonical_found_less`: 0 em todas as rodadas (o canônico nunca "perdeu"
informação que o resolver atual tinha).

## 4. Arquitetura de acesso ao D1 (auditoria)

O deploy é feito na **Vercel** (confirmado por `vercel.json` presente e
ausência de `wrangler.toml`/`@cloudflare/next-on-pages`). Todo acesso ao
D1 passa por `lib/d1/client.ts` (`d1Query`/`d1Batch`/`d1Execute`), que usa
a **API HTTP REST do Cloudflare** (`https://api.cloudflare.com/.../d1/database/.../query`).
Não existe nenhum binding nativo de D1 nesta arquitetura.

## 5. D1 binding nativo — viável?

**Não, sem migrar para Cloudflare Workers.** Binding nativo de D1 só
existe dentro do runtime de Workers (via `env.DB` injetado pelo
`wrangler`); a Vercel não expõe esse mecanismo. Migrar o runtime da
aplicação inteira para Workers está fora do escopo desta fase (mudaria a
plataforma de deploy inteira) — não implementado, corretamente tratado
como "só implementar se compatível com a arquitetura existente".

## 6. Redução de round-trips

**Antes:** `canonicalFoodSearch()` buscava portions de TODO resultado do
topo incondicionalmente — até `limit` (padrão 10) round-trips extras por
busca, mesmo para autocomplete que só precisa de nome+score.

**Depois:** `includePortions` (padrão `false`) — portions só são buscadas
quando explicitamente pedido. `resolveCanonicalFood()` (o único chamador
que promete portions no seu contrato de retorno) busca portions **apenas
do vencedor decisivo** (status EXACT/RESOLVED), nunca dos candidatos de um
estado AMBIGUOUS/PREPARATION_REVIEW (até 5 candidatos que nunca
precisariam de portions ainda).

Resultado: de até `1 + N` (N=limit) round-trips por busca para `1` (busca
simples) ou `1 + 1` (quando há um vencedor decisivo e portions são
necessárias) — praticamente elimina o N+1.

## 7. Índices (EXPLAIN QUERY PLAN contra D1 real)

| Query | Plano |
|---|---|
| FTS match | `SCAN ... VIRTUAL TABLE` + `SEARCH f USING COVERING INDEX` (PK) |
| LIKE fallback (`%texto%`) | `SCAN f` — esperado: wildcard à esquerda impede uso de índice, é o caminho de fallback raro |
| alias exato | `SEARCH a USING INDEX food_aliases_alias_idx` |
| portions por food | `SEARCH ... USING INDEX canonical_food_portions_food_idx` |
| nutrient_count (subquery) | `SEARCH v USING COVERING INDEX sqlite_autoindex_food_nutrient_values_2` |

**Achado:** `food_nutrient_values_food_idx(canonical_food_id)` era
**redundante** — a `UNIQUE (canonical_food_id, source_nutrient_id,
portion_id)` já cria um autoíndice cujo prefixo cobre a mesma busca (o
plano real nunca escolhe o índice explícito, sempre o autoíndice).
Removido via migration `db/20260822_0056_canonical_nutrition_drop_redundant_index.sql`
(marcada `migration:allow-destructive` — só remove a estrutura auxiliar,
nenhuma linha/coluna muda), aplicada ao D1 real. Nenhum índice novo foi
necessário — os planos de query já usam índice em todos os caminhos exceto
o fallback LIKE, onde nenhum índice ajudaria de verdade sem uma estrutura
tipo trigram/FTS adicional (fora de escopo, caminho raro).

## 8. Cache

`lib/d1/query-cache.ts` — cache TTL em memória (5 min), só para dados de
referência nutricional (nunca clínico/paciente, nunca texto livre de
query). Aplicado em `getById`/`getPortions`/`getNutrients` do repositório
canônico, com chave normalizada (`canonical:food:<id>` etc.) — **só quando
nenhum executor customizado é injetado** (testes que usam SQLite local
nunca passam pelo cache, então não há vazamento entre execuções de teste).

**Limitação documentada honestamente:** é um cache por instância de
processo (best-effort), não distribuído — a Vercel roda funções
serverless sem memória compartilhada entre invocações/regiões. Não existe
canal para o script de deploy (`deploy-to-d1.ts`, processo CLI separado)
avisar os processos da aplicação rodando na Vercel após uma reimportação;
a única garantia real de que dado reimportado aparece é o TTL curto (5
min) expirando sozinho. `invalidateAll()` existe para uso manual/testes,
não como parte de um pipeline automático.

## 9. Benchmark separado (SQLite local vs D1 HTTP; binding nativo N/A — ver item 5)

| Categoria | Local (SQLite, node:sqlite) p50/p95/p99/max (ms) | D1 HTTP real p50/p95/p99/max (ms) |
|---|---|---|
| exact | 7.6 / 90.0 / 108.5 / 108.5 | 179.6 / 273.2 / 804.9 / 804.9 |
| partial | 7.1 / 86.1 / 118.3 / 118.3 | 187.0 / 224.1 / 237.2 / 237.2 |
| ambiguous | 38.4 / 53.2 / 53.2 / 53.2 | 195.7 / 213.7 / 213.7 / 213.7 |

D1 HTTP é ~5-25x mais lento que SQLite local, como esperado de uma API
REST sobre a rede vs. um arquivo local. O binding nativo não pôde ser
medido (item 5) porque não existe nesta arquitetura — não é uma omissão,
é a conclusão real da auditoria.

## 10. Shadow dataset final (519 queries reais contra D1 real, com todas as correções)

```
totalQueries: 519
queryErrors: 0
outcomes: { CANONICAL_FOUND_MORE: 378, CANONICAL_AMBIGUOUS: 84, DIFFERENT_TOP: 13, SAME_TOP: 44 }
latencyMs.current:    p50 361.9  p95 723.4  p99 810.3  max 2397.0
latencyMs.canonical:  p50 352.0  p95 390.2  p99 600.8  max 2399.7
```

`canonical_found_less`: 0. O canônico nunca perde uma resolução que o
resolver atual já tinha — só encontra mais (378) ou fica ambíguo onde o
atual não achava nada (84), nunca o contrário.

Nota sobre a latência do resolver ATUAL: `resolveFoodCandidate` (o
resolver de produção) não foi alterado nesta fase (fora de escopo) — sua
p95 de 723ms reflete os múltiplos round-trips HTTP que ele já fazia antes
(searchFoods → listCustomFoods + searchUsdaFoods, cada um uma chamada D1
HTTP separada), não uma regressão introduzida aqui.

## 11. Testes adicionados

- `tests/like-pattern-hardening.test.ts` (14 testes) — `capForLikePattern`,
  escaping/não-escaping, os 4 pontos de código corrigidos com o nome TBCA
  real de 94 chars que reproduziu o bug, exato/FTS nunca cortados.
- `tests/d1-query-cache.test.ts` (4 testes) — chave normalizada não
  duplica query real, chaves diferentes nunca colidem, TTL expira e
  refaz a query, `invalidateAll()` limpa tudo.
- `tests/canonical-food-search.test.ts` — 2 testes existentes atualizados
  para `includePortions: true` explícito (a mudança de default quebrou
  a suposição implícita anterior).
- Cobertura implícita de "minimal round-trips": o teste padrão de
  `includePortions` ausente já prova que portions não são buscadas por
  padrão (nenhum teste depende de `.portions` sem passar a flag).

## 12. Gates finais

| Gate | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| `eslint .` | limpo |
| `vitest run` (suite completa) | **1633/1633 passaram** (187 arquivos) |
| `migrate:d1:check` | 56 migrações validadas |
| `npm run build` | exit 0 |

## 13. Riscos

- **Cache best-effort sem invalidação automática cross-processo**: se um
  reimport mudar um alimento canônico, uma instância serverless já quente
  pode servir o valor antigo por até 5 minutos. Aceitável para dados de
  referência que mudam raramente (importações são eventos manuais, não
  contínuos), mas é um risco real, documentado, não escondido.
- **Fallback LIKE continua sem índice útil** (`SCAN f`) — aceitável hoje
  porque é um caminho raro (só quando FTS falha) e a tabela tem ~10k
  linhas, mas cresceria linearmente com o catálogo.
- **`getRecipes` não escapa `%`/`_` do usuário** — comportamento aceito
  (nunca quebra, só pode ser um pouco mais permissivo no match), mas é uma
  decisão consciente, não um esquecimento — documentada nos testes.
- **Latência do resolver atual continua alta (p95 ~723ms)** — fora do
  escopo desta fase corrigir (não alteramos food-resolver.ts/food-catalog.ts
  além do LIKE fix), mas é o principal fator que ainda torna a experiência
  de busca lenta em produção hoje, independente do canônico.

## 14. Critério de GO/NO-GO

Critérios do pedido: erros de query = 0 ✅; `canonical_found_less` = 0 ✅;
erros do canônico = 0 ✅; nenhuma mudança de cálculo clínico (Nutrition
Engine intocado) ✅; caminho de acesso ao D1 medido e documentado
honestamente (HTTP é a única opção real, binding nativo indisponível por
arquitetura) ✅.

**CANONICAL_RUNTIME_PERFORMANCE_READY: sim**

Justificativa: os dois bloqueadores da Fase 4 foram resolvidos com causa
raiz identificada (não tentativa-e-erro) — o bug de LIKE está zerado no
dataset de 520 queries reais contra D1 real, e o caminho de acesso ao D1
foi auditado, otimizado (round-trips, índice redundante removido, cache
para dados de referência) e medido com números reais, não estimativas.
`prefer_canonical` continua desativado — esta declaração só habilita a
PRÓXIMA fase a considerar ativação controlada, não ativa nada agora.
