# Meal Plan Substitution Engine R3 — Arquitetura

## Objetivo

Expor um critério de equivalência explícito (energia/proteína/carboidrato/gordura) na
troca de alimentos do Composer, calculando a quantidade prática do candidato para
preservar aquele nutriente na referência — sem duplicar nenhum motor nutricional
existente e sem redesenhar o drawer já entregue nas fases R2.2/R2.3.

## Branch e base

- Branch: `feat/meal-plan-substitution-r3`
- Base: `codex/meal-plan-composer-r2` @ `d215d19c562c9aa7f6c02cc4df3ec76e61442dee` (R2, CI verde, fechado)
- R2/Patient Record pré-condições confirmadas antes de iniciar: `MEAL_PLAN_COMPOSER_R2_COMPLETE: sim`

## Auditoria do que já existia (nunca duplicado)

Dois módulos de equivalência já existiam em produção antes da R3:

- `lib/nutrition/equivalence.ts#findEquivalentFoods` — resolve algebricamente a
  gramatura de um candidato pra igualar um nutriente-alvo, com arredondamento
  prático de 5g e filtro por tolerância.
- `lib/nutrition/substitution-engine.ts#findFoodSubstitutes` — camada de
  ranking/qualidade sobre o motor acima (`EXCELLENT/GOOD/REVIEW/UNSUITABLE`),
  já usada em produção pelo `add_manual` da rota
  `app/api/admin/clients/[id]/meal-plans/exchange-groups/[groupId]/route.ts`.

Nenhum dos dois expunha PROTEIN/CARBOHYDRATE/FAT como escolha explícita da
nutricionista (só ENERGY hardcoded, ou um "papel nutricional" auto-detectado).
Essa foi a lacuna real que a R3 preencheu — não uma reimplementação.

## Camadas adicionadas

1. **Domínio puro** — `lib/nutrition/equivalent-quantity.ts`
   - `EquivalentQuantityCriterion`, `EquivalentQuantityRequest`, `EquivalentQuantityResult`
     (contrato do pedido, com o enum de status `CALCULATED/NOT_CALCULABLE/
     MISSING_TARGET_NUTRIENT/ZERO_TARGET_NUTRIENT/INVALID_QUANTITY`).
   - `roundToPracticalQuantity` — política de arredondamento consolidada (ver
     relatório de ranking/equivalência para a justificativa).
   - `rankEquivalentCandidates` — ranking determinístico reaproveitado pela API.
   - `matchHouseholdPortion` — aproximação de medida caseira (ver relatório dedicado).
   - Construído inteiramente sobre `calculateItemNutrients` (Nutrition Engine
     real) — nunca uma segunda fórmula de kcal/macros.

2. **Consolidação** — `equivalence.ts` e `substitution-engine.ts` tinham cada
   um sua própria cópia privada da função de arredondamento de 5g. Ambos agora
   importam `roundToPracticalQuantity` de `equivalent-quantity.ts` — a duplicação
   foi removida, não mantida como "compatibilidade".

3. **API em lote** — `POST /api/admin/foods/equivalent-quantity`
   - Recebe `{referenceFood, referenceGrams, criterion, candidates[]}` (até 30
     candidatos) e devolve, numa única resposta, o resultado de cada um
     (`result`, `householdPortion`, `rank`).
   - Candidato que não resolve no catálogo real volta com `result: null` —
     nunca um `MacroReferenceFood` fabricado só pra caber no contrato.
   - Medida caseira é resolvida no servidor via `getFoodPortions` (mesmo
     repositório unificado usado por `/api/admin/foods/detail` e pelo editor
     de medidas) — nunca uma segunda fonte de porções.

4. **UI** — `components/dashboard/ExchangeGroupPanel.tsx` (o MESMO drawer da
   R2.2/R2.3, nenhum componente novo de nível superior):
   - `CriterionSelector` — seletor de critério (ENERGY default, nunca rótulo
     clínico).
   - Um lote único (`runEquivalentBatch`) recalcula todos os candidatos da
     busca atual sempre que a busca, o critério ou a referência mudam.
   - `EquivalentQuantitySummary` (linha compacta nos resultados de busca) e
     `EquivalentQuantityDetail` (card de preview) reaproveitam o MESMO dado do
     lote — nenhum segundo cálculo no cliente.
   - O preview/impacto refeição-dia (R2.3, `MealDayImpactPreview`) foi
     reaproveitado sem alteração de lógica — só a quantidade inicial sugerida
     no campo passou a vir do motor de equivalência quando disponível.

## Por que não um novo drawer/editor

O pedido explicitamente proibia um segundo drawer ou editor. A auditoria
confirmou que `ExchangeGroupPanel` já tinha exatamente os pontos de extensão
necessários (estado de busca, preview, e o hook de impacto refeição/dia) —
a R3 inseriu 3 componentes auxiliares dentro do MESMO arquivo/fluxo, sem tocar
a estrutura de dados do plano (`meal.items`/`options`/`choice_groups`) nem o
contrato de persistência (`add_manual` continua o único caminho de escrita).

## Escopo não coberto por esta fase (decisão deliberada)

Item-level exchange groups (e, por extensão, o motor de equivalência R3) só
endereçam itens de `meal.items` (SIMPLE e o item fixo de COMBINATION) — itens
dentro de `options`/`choice_groups` não têm um botão de "Revisar trocas"
próprio. Essa é uma limitação pré-existente da R2.2 (confirmada por auditoria
de `MealItemsEditor.tsx#exchangeDrawerContext`, que só indexa `meal.items`),
não uma regressão introduzida pela R3. A R3 verificou (seção "OPTIONS/COMBINATION
safety" do relatório de QA) que trocar o item fixo de uma refeição COMBINATION
nunca toca o grupo de escolha e que o range do dia continua correto.
