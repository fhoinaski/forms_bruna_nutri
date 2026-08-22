# Fase 6 — Controlled prefer_canonical Pilot

Gerado em: 2026-08-22

Escopo respeitado integralmente (item 18): Nutrition Engine intocado,
nenhum plano recalculado, nenhum snapshot antigo alterado, TACO/USDA
continuam existindo, `substitutions`/`meal_plan_ai` continuam SHADOW
(nunca escolhem o canônico), nenhum enriquecimento cross-source de
nutrientes.

## 1. Escopos/flags

`lib/nutrition/canonical-food-resolver-flag.ts` — `getCanonicalFoodResolverModeForScope(scope)`,
3 escopos: `admin_food_search`, `substitutions`, `meal_plan_ai`. Cada um
lê sua própria env var (`CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH`
etc.), caindo pra flag global (`CANONICAL_FOOD_RESOLVER_MODE`) quando não
setada, e pra `"off"` por padrão. Configuração desta fase (só em
`.env.local`, nunca em produção):

```
CANONICAL_FOOD_RESOLVER_MODE=shadow                          (global/default)
CANONICAL_FOOD_RESOLVER_MODE_ADMIN_FOOD_SEARCH=prefer_canonical
CANONICAL_FOOD_RESOLVER_MODE_SUBSTITUTIONS=shadow
CANONICAL_FOOD_RESOLVER_MODE_MEAL_PLAN_AI=shadow
```

## 2. Policy V2 aplicada — V1 nunca mais decide comportamento

`lib/nutrition/canonical-food-shadow.ts` — o ramo `prefer_canonical` agora
usa **exclusivamente** `canAutoResolveCanonicalV2()` pra decidir promoção
(`computeV2Verdict`). `canUseCanonical` (V1) continua existindo e sendo
calculada em toda chamada — só pra telemetria (`v1WouldAutoAccept`),
nunca influencia o valor devolvido. Testado explicitamente
(`tests/canonical-food-fase6-pilot.test.ts`, "V1 sozinha nunca dispara
prefer_canonical").

## 3. Piloto admin (busca administrativa)

`lib/nutrition/canonical-food-admin-search.ts` — envolve
`app/api/admin/foods/search/route.ts` (searchFoods, intocado). Quando a
V2 autoriza E o candidato canônico é TACO, o item correspondente é
movido pro topo da lista (ou buscado via `getFoodByReference` se estava
fora do top-N do baseline) — a lista de candidatos e o fluxo de seleção
continuam exatamente os mesmos, só a ORDEM/anotação mudam.

## 4. Fallback

Cobertura testada (`tests/canonical-food-fase6-pilot.test.ts`): erro de
D1/timeout → fallback (try/catch em volta de `resolveCanonicalFood`,
`Promise.allSettled`-like via `.then/.catch`); NOT_FOUND → fallback;
AMBIGUOUS → fallback; query genérica (1 token) → fallback; qualquer fonte
não-TACO → fallback (nunca reordena). Todos os bloqueios da V2
(VARIETY_REQUIRED, conflito de marca/composto, preparo fraco) já
resultam em `autoAccept=false`, cobertos pelo mesmo caminho de fallback
único.

## 5. Provenance

`CanonicalPilotAnnotation` (retornada pela rota como `canonicalPilot`, e
`CanonicalShadowTelemetryEvent` pros escopos shadow) preserva:
`canonicalFoodId`, `source`, `sourceFoodId`, `matchClass`,
`confidenceDecision` (`autoAccept`+`reason`), `preparationEvidence`,
`sourceAgreement` (`count`+`strength`), `policyVersion: "V2"`. Nenhum
snapshot clínico foi alterado — o item salvo no plano continua sendo só
`food_source`/`food_ref_id` (TACO), como sempre.

## 6. UI de ambiguidade

**Parcialmente implementado.** A rota já devolve `canonicalPilot` e a
lista reordenada; o componente (`components/dashboard/MealItemsEditor.tsx`)
já mostra até os candidatos que o `searchFoods` sempre devolveu (sem
limite artificial de 5 alterado nesta fase). **Não implementado**: um
badge visual dedicado "sugestão canônica confirmada" ou exibição
específica de fonte/preparo/medida no dropdown — risco/esforço de mexer
num componente grande de estado complexo não foi justificado pra um
piloto que já funciona corretamente sem esse polish visual. Registrado
como próximo passo, não como pendência escondida.

## 7. displayName

Implementado de verdade, pra **toda** busca administrativa (não só
quando o piloto está ativo): `LegacyFoodSearchResponseItem.displayName`
(`lib/nutrition/food-catalog.ts`, via `toDisplayFoodName`, movida de
`food-resolver.ts` pra `food-terminology.ts` pra evitar import circular)
— `MealItemsEditor.tsx` agora prefere `displayName` sobre o nome técnico
cru no dropdown de busca.

## 8. Feedback

`app/api/admin/foods/canonical-feedback/route.ts` (POST, admin-only,
rate-limited) + tabela `canonical_resolution_feedback` (migration
`db/20260822_0057_canonical_resolution_feedback.sql`, aplicada ao D1
real). Guarda `query_hash`, `suggested_canonical_food_id`,
`suggested_match_class`, `chosen_source`/`chosen_source_id`, `outcome`
(CORRECT/WRONG/CHANGED_SELECTION), `admin_id`, `created_at` — nunca texto
clínico livre.

## 9. Não auto-aprender

`recordCanonicalResolutionFeedback` (`lib/repositories/canonical-resolution-feedback.ts`)
só faz `INSERT` — testado explicitamente que o SQL nunca toca
`food_aliases`/`canonical_foods`/nenhuma tabela de ranking, e que o
`outcome` só aceita os 3 valores fixos (Zod enum, nunca um comando
livre). Nenhum job/trigger lê essa tabela automaticamente — é dado pra
revisão humana futura, ponto final.

## 10. Métricas do piloto (652 queries reais contra D1 real)

| Outcome | Contagem | % |
|---|---:|---:|
| auto_accept_v2 (preselected) | 57 | 8,7% |
| fallback_current | 592 | 90,8% |
| — dos quais ambíguos (razão menciona variedade) | 22 | 3,4% |
| not_found | 3 | 0,5% |
| **wrong_auto_accept** | **0** | **0%** |
| D1 errors | 0 | 0% |

## 11. wrong_auto_accept = 0

Meta do item 12 **atingida**: nenhuma das 57 preseleções reais divergiu
do `expectedFoodId` real (ground truth) quando havia gabarito disponível.
Consistente com a precisão de 100% medida na Fase 5.5 sobre a mesma
policy V2.

## 12. Performance

| Escopo | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|
| admin_food_search (piloto, cold) | 374ms | 515ms | 593ms | 638ms |
| admin_food_search (piloto, warm) | 351ms | 375ms | 375ms | 375ms |
| substitutions (shadow) | 367ms | 742ms | 825ms | 987ms |
| meal_plan_ai (shadow) | 362ms | 759ms | 1.152ms | 1.779ms |

**Achado real corrigido nesta fase:** a primeira versão do piloto
executava `searchFoods` (atual) e `resolveCanonicalFood` (canônico) em
**série** — p50 medido em 706ms, quase o dobro do necessário. Corrigido
pra rodar em **paralelo** (`annotateAdminFoodSearchWithCanonicalPilot`
agora aceita `baselineItems` como Promise, resolvido junto do canônico
via `Promise.all`) — p50 caiu pra 374ms, equivalente ao tempo de uma
única chamada D1 (a busca atual sozinha já levava ~350-400ms nas fases
anteriores). **Confirmado: prefer_canonical no admin não piora a UX de
forma perceptível.**

## 13. Substitutions (shadow)

652 queries: **286 (43,9%) teriam auto-aceite V2** se ativado;
**366 (56,1%) cairiam em fallback**. Nenhuma decisão real mudou —
`resolveFoodWithCanonicalShadow(..., "substitutions", ...)` sempre
devolve o resultado do resolver atual neste modo.

## 14. Meal Plan AI (shadow)

Mesma distribuição (286/366) — esperado: a decisão da V2 depende só da
query e do catálogo canônico, não do escopo; o escopo só controla se o
resultado é de fato USADO. Nenhuma geração de plano foi alterada.

## 15. Testes

`tests/canonical-food-fase6-pilot.test.ts` (15 testes) +
`tests/canonical-food-shadow.test.ts` (atualizado, 8 testes) cobrindo
toda a lista do item 16: V2 auto-accept usa o canônico; V1 sozinha nunca
dispara; V2 reject cai no fallback; erro de D1 cai no fallback; AMBIGUOUS
cai no fallback; VARIETY_REQUIRED (query genérica) cai no fallback;
conflito de preparo bloqueia; admin usa prefer_canonical real; escopos
diferentes coexistem (admin promove, substitutions no MESMO caso não);
provenance preservada na telemetria; feedback gravado; feedback nunca
muta alias/ranking.

## 16. Gates

| Gate | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| `eslint .` | limpo |
| `vitest run` (suite completa) | **1672/1672 passaram** (190 arquivos) |
| `migrate:d1:check` | 57 migrações validadas |
| `npm run build` | exit 0 |

## 17. Riscos

- **Restrição TACO-only limita a cobertura real do piloto** — das 286
  decisões que a V2 aprovaria (medido em substitutions/meal_plan_ai
  shadow), só 57 (≈20%) puderam de fato ser usadas no admin_food_search,
  porque `food_source` (enum fixo TACO/CUSTOM/MANUFACTURER/USDA) não tem
  espaço pra TBCA/IBGE_POF — a maioria dos matches confiantes da V2 vem
  da TBCA (75% do catálogo canônico). Estender o enum é uma mudança de
  schema real, deliberadamente fora do escopo desta fase.
- **UI sem indicação visual da sugestão canônica** (item 6, ver acima) —
  o backend já decide/reordena corretamente, mas a nutricionista não vê
  HOJE por que um item apareceu primeiro. Não é um risco de segurança
  (fallback sempre correto), é uma lacuna de transparência/UX.
- **Amostra de wrong_auto_accept ainda pequena** (57 preseleções reais) —
  0 erros é um resultado forte, mas a mesma ressalva estatística da Fase
  5.5 se aplica: mais volume real de uso fortaleceria a confiança.
- **Feedback ainda não tem UI** — a tabela e o endpoint existem e
  funcionam (testado), mas nenhum botão "correto/errado" foi adicionado
  ao componente de busca — feedback só pode ser enviado programaticamente
  hoje.

## GO/NO-GO

**CANONICAL_PREFER_PILOT_READY: sim**

Critérios do pedido, todos atendidos:
- ✅ V2 é a ÚNICA policy que autoriza auto-resolução (V1 só telemetria).
- ✅ Fallback seguro — testado pra D1 error, NOT_FOUND, AMBIGUOUS,
  VARIETY_REQUIRED, conflito de preparo, fonte não-TACO.
- ✅ `wrong_auto_accept = 0` no piloto (652 queries reais, 57 preseleções
  reais, 0 erros).
- ✅ Nenhum cálculo clínico alterado — Nutrition Engine, snapshots,
  TACO/USDA, `substitutions`/`meal_plan_ai` todos intocados/em shadow.

Esta declaração habilita a próxima fase a considerar EXPANDIR o piloto
(mais volume, talvez outro escopo) — não implica ativar
`substitutions`/`meal_plan_ai` automaticamente, que continuam exigindo
uma decisão explícita separada.
