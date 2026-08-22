# Current Resolver Hardening — Fase 4.5

Gerado em: 2026-08-22

## Bug

`LIKE or GLOB pattern too complex: SQLITE_ERROR` (D1, code 7500).

## Causa raiz

O D1 (SQLite hospedado via HTTP pela Cloudflare) rejeita qualquer padrão
LIKE/GLOB cujo comprimento total (incluindo os `%`) ultrapasse ~50
caracteres. É um limite de plataforma **não documentado**, medido
empiricamente por busca binária contra o D1 real (40/42/44/46/48 chars de
conteúdo = OK; 50/52/54/56/58/60/62 = FALHA). O `node:sqlite` local **não**
reproduz isso nem em 10.000 chars — é específico do D1, não do SQLite em
geral.

Nomes TBCA normalizados frequentemente passam de 90-150+ caracteres, então
qualquer caminho que monte um padrão LIKE direto do texto livre da busca
ficava exposto.

## Pontos de código atingidos (4, não 3 como avaliado inicialmente)

| Arquivo | Função | Papel |
|---|---|---|
| `lib/repositories/custom-foods.ts` | `listCustomFoods` | **Causa primária** — roda em toda busca (CUSTOM/MANUFACTURER sempre no filtro padrão) |
| `lib/repositories/usda-foods.ts` | `searchUsdaFoods` | Secundária — só no fallback USDA |
| `lib/nutrition/canonical-food-search.ts` | `fetchCandidatesByLike` | Latente — nunca disparado no shadow real, corrigido preventivamente |
| `lib/repositories/recipes.ts` | `getRecipes` | **Achado na segunda rodada** — causa real dos 115/519 erros residuais após as 3 primeiras correções |

O quarto ponto (`recipes.ts`) só foi descoberto ao isolar a diferença entre
`searchFoods()` sozinho (0 erros após as 3 primeiras correções) e o
`resolveFoodCandidate()` completo (115 erros) — a diferença é o caminho
`resolveFoodCandidateInner` → `findRecipeCandidatesForPreparation` →
`getRecipes({ q: query })`, disparado sempre que a busca no catálogo
retorna zero resultados E a query parece um preparo composto
(`PREPARATION_NEEDS_REVIEW`). Nomes TBCA longos que não existem no
catálogo do resolver atual caem nesse caminho com frequência (~22% do
dataset de 520 queries).

## Correção

Módulo compartilhado `lib/d1/like-safety.ts`:
- `MAX_LIKE_PATTERN_CONTENT_LENGTH = 40` (margem segura abaixo do limite
  real de 50 chars totais do padrão)
- `capForLikePattern(text)` — corta só o conteúdo do padrão fuzzy

Aplicado **somente** aos ramos fuzzy/contains de LIKE nos 4 pontos acima.
Os ramos de match exato (`=`) e FTS (`MATCH`) em `usda-foods.ts` e
`canonical-food-search.ts` continuam com o texto **completo**,
sem corte — nunca trunca silenciosamente um termo semanticamente crítico
nos caminhos que de fato decidem identidade.

`listCustomFoods` e `getRecipes` não escapam `%`/`_` literais do usuário
(trade-off documentado e aceito: o pior caso é um match um pouco mais
permissivo, nunca um crash ou vazamento). `searchUsdaFoods` normaliza a
entrada para `[a-z0-9 ]` antes de montar qualquer padrão, então não tem
caractere de wildcard literal para se preocupar.

## Erros antes/depois

| Etapa | Erros | Total de queries |
|---|---:|---:|
| Antes de qualquer correção (Fase 4) | 203 | 520 |
| Após corrigir custom-foods/usda-foods/canonical-food-search | 115 | 520 |
| Após corrigir recipes.ts (causa real restante) | **0** | 519* |

\* o dataset é regenerado com `ORDER BY RANDOM() LIMIT 400` a cada
execução — 519 vs 520 é ruído esperado da amostragem aleatória, não uma
query "sumindo".

## Testes de regressão

`tests/like-pattern-hardening.test.ts` — 14 testes cobrindo:
`capForLikePattern` (casos curtos/longos/muitos tokens), escaping/não
escaping de `%`/`_`, os 4 pontos de código (custom-foods, usda-foods,
recipes, canonical-food-search) com o nome TBCA real de 94 caracteres que
reproduziu o bug original, e a garantia de que os ramos exato/FTS nunca
são cortados.
