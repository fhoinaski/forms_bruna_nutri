# Fase 6.5 — Food Source Model Expansion

Gerado em: 2026-08-22

Escopo respeitado: Nutrition Engine **intocado** no que consome
nutrientes (TBCA/IBGE_POF continuam "não reconhecido pelo cálculo" —
item 8), snapshots antigos preservados sem reescrita (item 9),
substitutions/meal_plan_ai continuam recusando explicitamente identidade
TBCA/IBGE_POF (item 13 da fase anterior).

## 1. Contratos impactados (auditoria completa)

Auditoria prévia (agente Explore) encontrou: **17 declarações Zod**
distintas com o enum de 4 valores em 11 arquivos, **~24 uniões de tipo**
TypeScript, **7 CHECK constraints** SQL, e dezenas de comparações `===`
em runtime. Achado importante: várias já estavam **inconsistentes antes**
desta fase (`PersistedMealFoodSource`, `FoodPortionSource`, alguns Zod
schemas já omitiam USDA, apesar do schema de `meal_plan_items` já aceitar
USDA desde a Fase 6) — corrigido incidentalmente onde eu já estava
tocando a mesma linha, documentado abaixo.

**Decisão de escopo**: só os pontos que realmente formam "o pipeline de
identidade" foram expandidos — `meal_plan_items` (onde o item é salvo) e
os tipos/Zod que o alimentam. `meal_plan_substitutions`,
`food_portions`, `food_clinical_traits`/`food_clinical_trait_events`
continuam com o vocabulário de 4 valores, **de propósito** (substitutions
continua fora de escopo por decisão da Fase 6; portões/traços clínicos
não têm dado TBCA/POF equivalente ainda — expandir o CHECK deles sem ter
dado pra popular seria um schema mentiroso).

## 2. Modelagem: source antiga vs nova

| Antes | Depois |
|---|---|
| `food_source: "TACO" \| "CUSTOM" \| "MANUFACTURER" \| "USDA"` | `+ "TBCA" \| "IBGE_POF"` (só em `meal_plan_items`/`FoodCatalogSource`/`PersistedMealFoodSource`) |
| `food_ref_id` (sourceFoodId) | inalterado |
| — (não existia) | `canonical_food_id` — identidade canônica COMPLETA (ex.: `"tbca:medidas_caseiras:BRC0001C"`), separada de `food_ref_id` (item 3) |

`FoodReference.canonicalId` já existia no tipo (reservado, nunca
populado) — reaproveitado em vez de criar um campo novo paralelo.

## 3. Migration

`db/20260822_0058_meal_plan_items_canonical_source.sql` — reconstrói
`meal_plan_items` (mesmo padrão de rebuild já usado 2x antes nesta
tabela, SQLite/D1 não altera CHECK in-place): CHECK ampliado pra 6
valores + coluna nova `canonical_food_id TEXT NULL`. Zero linha
reescrita — `INSERT OR IGNORE ... SELECT * FROM meal_plan_items` copia
tudo, a coluna nova fica `NULL` em toda linha histórica. Aplicada ao D1
real (58 migrações validadas).

## 4. Tipos atualizados

`lib/nutrition/food-catalog.ts`: `FoodCatalogSource` (+TBCA/IBGE_POF),
`PersistedMealFoodSource` (+TBCA/IBGE_POF/USDA — USDA era lacuna
pré-existente), `toPersistedMealFoodSource()`. `lib/repositories/meal-plans.ts`:
`MealPlanItemPayload.food_source`/`.canonical_food_id`.
`components/dashboard/MealItemsEditor.tsx`: `MealItem`, `toMealPlanFoodSource()`.

**Guardas explícitas adicionadas** (não apenas "deixar passar"): 3 pontos
onde o tipo mais amplo, se propagado sem controle, alcançaria fluxos que
devem continuar legado-only —
`lib/ai/nutrition/substitution-command-router.ts` (substituição via IA),
`lib/ai/agents/nutrition/meal-plan-change-agent.ts` (idem),
`app/api/admin/clients/[id]/meal-plans/[planId]/optimize/route.ts` (o
Optimizer ainda não recalcula TBCA/POF) — cada um agora rejeita/neutraliza
`TBCA`/`IBGE_POF` explicitamente em vez de deixar o TypeScript aceitar
por acidente. `components/dashboard/ItemSubstitutionsPanel.tsx` recebe
`null` no lugar de `TBCA`/`IBGE_POF` pela mesma razão.

## 5. APIs (Zod)

`app/api/admin/clients/[id]/meal-plans/[planId]/route.ts` — `itemSchema.food_source`
(+2 valores) e `canonical_food_id` (novo, opcional). `substitutionSchema`
**intocado** (item 13). `app/api/admin/foods/canonical-feedback/route.ts` —
`chosenSource` ampliado (o piloto agora pode sugerir TBCA/POF, o feedback
precisa poder registrar).

## 6. Compatibilidade

Todo consumidor que só conhece os 4 valores legados continua funcionando
sem mudança — nenhum valor removido, nenhuma coluna removida, nenhum
snapshot reescrito. `getFoodByReference()` já tinha um `return null`
final pra fonte não reconhecida (nenhuma mudança de código necessária) —
o fallback "correto" pra TBCA/POF nessa função já existia antes desta
fase, só nunca tinha sido exercitado.

## 7. Fallback — pontos exatos documentados

- **Nutrition Engine** (`lib/nutrition/nutrients.ts#resolveItemReference`):
  branch explícito adicionado — item TBCA/IBGE_POF com `food_ref_id`
  devolve `null` (nunca cai no `fuzzyMatch` por texto, que arriscaria
  casar com um alimento TACO errado por semelhança de nome).
- **Household measure** (`meal-plans/[planId]/route.ts`): validação de
  `household_measure_id` só roda `if (item.household_measure_id)` — como
  o piloto nunca seta essa medida pra TBCA/POF (tabela `food_portions`
  legada não tem essas fontes), o caminho simplesmente nunca é
  exercitado, sem necessidade de guarda extra.
- **Optimizer**: item TBCA/POF vira "sem fonte estruturada" (`food_source:
  null`) só pra esse cálculo, preservando o tipo compartilhado com o
  gerador de IA intocado.
- **Substituições (manual e IA)**: bloqueadas explicitamente com mensagem
  clara ao usuário, nunca uma falha silenciosa.

## 8. Piloto antes/depois — aproveitamento TBCA/POF (653 queries reais, D1 real)

| Métrica | Fase 6 (TACO-only) | Fase 6.5 (TACO+TBCA+IBGE_POF) |
|---|---:|---:|
| auto_accept_v2 (preselecionados) | 57 (8,7%) | **283 (43,3%)** |
| — dos quais TBCA | — | 186 (65,7% das preseleções) |
| — dos quais TACO | 57 | 61 |
| — dos quais IBGE_POF | — | 36 (12,7%) |
| wrong_auto_accept | 0 | **0** |
| latência cold p50 | 374ms | 456ms |
| latência cold p95 | 515ms | 733ms |

**Meta do item 6 atingida**: o aproveitamento saltou de 8,7% pra 43,3%
(quase o mesmo valor de `v2AutoAccept` medido em shadow puro — 283/653 —
ou seja, o piloto agora captura praticamente TODA decisão que a V2
aprovaria, não mais só a fatia TACO). **wrong_auto_accept continua 0** —
a expansão do modelo de fonte não custou precisão.

**Trade-off honesto**: latência subiu (~80-220ms) porque preselecionar
TBCA/IBGE_POF exige um round-trip extra (`getNutrients`, pra montar o
preview de macro no dropdown) que TACO não precisava (já vinha do
catálogo legado local). `getNutrients` já é cacheado (`lib/d1/query-cache.ts`,
Fase 4.5) — a maior parte do aumento medido aqui é custo de cache FRIO
(o dataset de validação cobre muitos alimentos distintos, poucas
repetições reais). Ainda dentro de um tempo de resposta aceitável pra
busca interativa.

## 9. Testes

`tests/food-source-model-expansion.test.ts` — 15 testes: TACO/CUSTOM/
MANUFACTURER/USDA inalterados, TBCA/IBGE_POF aceitos, serialização
retrocompatível, Zod atualizado, substitution schema continua rejeitando
de propósito, piloto transporta identidade, fallback do Nutrition Engine
nunca cai em fuzzy match errado, snapshot antigo continua parseando.

## 10. Gates

tsc/eslint limpos, **1687/1687 testes** (191 arquivos), `migrate:d1:check`
(58 migrações), `npm run build` exit 0.

## 12. Riscos

- Cobertura de nutrientes clínicos (sódio, cálcio etc.) pra TBCA/IBGE_POF
  continua zero no cálculo oficial — é o comportamento CORRETO desta
  fase (item 8), mas significa que um item TBCA no plano aparece como
  "não reconhecido" nos totais até uma fase futura decidir consumir
  nutrientes canônicos de verdade.
- `canonical_food_id` só é populado por itens NOVOS selecionados via o
  piloto — nunca inferido retroativamente pra itens antigos.

## 13. Próximo passo

Antes de qualquer Fase 7 (grupos de troca), decidir explicitamente se
substitutions/meal_plan_ai devem ganhar suporte a TBCA/IBGE_POF (hoje
bloqueados de propósito) e se o Nutrition Engine deve passar a consumir
`food_nutrient_values` real pra esses itens — ambos fora do escopo desta
fase, mas agora tecnicamente desbloqueados pelo modelo de fonte expandido.

## Declaração

**CANONICAL_SOURCE_MODEL_READY: sim** — TBCA e IBGE_POF atravessam o
pipeline de identidade (busca → seleção → persistência → leitura) sem
quebrar nenhum consumidor existente, com fallback explícito e testado em
todo ponto onde o cálculo ainda não pode consumi-los.
