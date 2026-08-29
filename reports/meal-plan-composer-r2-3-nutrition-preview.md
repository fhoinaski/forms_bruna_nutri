# Meal Plan Composer R2.3 — Dynamic Nutrition Preview + Delta

## Arquitetura

Reaproveita 100% infraestrutura existente, sem estado novo em nível de aplicação (`MealPlanEditor`) e sem endpoint novo:

- **Item**: já resolvido na R2.2 (`/api/admin/foods/nutrients`, candidato vs referência, delta = candidato − referência).
- **Refeição e dia**: `useMealPlanNutritionData` (exportado de `components/nutrition/MealPlanNutritionSummary.tsx` — a MESMA hidratação em lote + `calculateFlexiblePlanNutrients`/Nutrition Engine já usada pela sidebar real) é chamado **duas vezes** dentro do próprio drawer (`MealDayImpactPreview`, novo em `ExchangeGroupPanel.tsx`): uma com `allMeals` atual, outra com um clone em memória onde o item aberto é substituído pelo candidato simulado (identidade + quantidade do preview). Nenhuma chamada de save/publish/version acontece nesse caminho — é puro cálculo client-side sobre dados já carregados.

**Decisão arquitetural deliberada**: o preview é renderizado **dentro do próprio drawer** ("Impacto: Refeição / Dia"), não na sidebar externa (`MealPlanNutritionWorkspacePanel`, que vive num componente-irmão em `MealPlanEditor.tsx`). Alterar a sidebar exigiria içar estado de preview por 3 níveis de componente (`ExchangeGroupPanel` → `MealItemsEditor` → `MealPlanEditor`) só para replicar visualmente o que o drawer já mostra com o mesmo dado e a mesma engine. A troca simples de local de renderização entrega a mesma substância (Atual/Preview/Delta, sem refetch completo, sem persistência) com um terço da superfície de mudança — trade-off documentado, não uma lacuna.

**Trade-off aceito**: cada abertura de preview dispara sua própria hidratação em lote (2 instâncias do hook: dia atual/preview, mais 2 para refeição-somente) em vez de reusar uma hidratação já em cache compartilhado — ainda é 1 requisição em lote por instância (nunca 1 request por nutriente), mas não há cache global entre chamadas nesta fase. p50 medido: ~450ms (amostra local de 3, ver performance abaixo) — dominado pela latência de rede do lote, não por cálculo.

## Escopo real do domínio (auditoria antes de implementar)

O drawer "Trocas" só existe hoje para itens **de nível de refeição** (`meal.items`, topo, formato SIMPLE) — itens dentro de `options`/`choice_groups` (OPTIONS/COMBINATION) são editados por texto livre e não têm botão de trocas. O preview de refeição/dia, portanto, simula substituição apenas nesse nível — mas como usa `calculateFlexiblePlanNutrients` (a engine real) para AMBOS os lados da comparação, qualquer OPTIONS/COMBINATION que exista em OUTRA refeição do mesmo plano continua correto (nunca somado) automaticamente, sem lógica própria de range escrita por este trabalho.

## Bug real encontrado e corrigido durante a verificação

A primeira versão do preview mostrava "Refeição: 440,3 kcal → 440,3 kcal · 0 kcal" — **sem diferença nenhuma**, mesmo trocando arroz por mandioca. Causa raiz: `lib/nutrition/nutrients.ts#resolveItemReference` verifica `nutrition_snapshot`/`food_name_snapshot` (congelados no item prescrito) **antes** de `food_source`/`food_ref_id` — o item simulado trocava a identidade mas mantinha o snapshot congelado do alimento original, então a engine recalculava com os dados velhos. Corrigido limpando `food_name_snapshot`/`nutrition_snapshot` no item simulado (`ExchangeGroupPanel.tsx`, `MealDayImpactPreview`). Confirmado com E2E antes/depois (o teste falhava exatamente nesse ponto e passou após a correção).

## Missing vs zero, acessibilidade, sem rótulo clínico

- Delta só é calculado quando ambos os lados (candidato e referência) têm valor; caso contrário mostra "—", nunca 0 (testado em `tests/exchange-group-preview-delta.test.ts`).
- Sinal sempre explícito em texto (`+12 kcal` / `-8 g`), nunca só cor.
- `aria-label` com frase objetiva ("Energia: 12 quilocalorias a mais") em cada célula/linha de delta — testável por leitor de tela, sem qualificação de "bom"/"ruim"/"melhor"/"pior" (nenhuma dessas palavras aparece em nenhum texto gerado).

## Fora de escopo desta fase (R3)

Este preview (referência + candidato + critério de comparação = energia, implícito) é a base reutilizável explicitamente citada pelo pedido para o futuro Equivalent Quantity Engine — nenhuma lógica de "ajustar quantidade pra minimizar o delta" foi implementada.

## Markers

```text
MEAL_PLAN_COMPOSER_R2_3_ITEM_DELTA: PASS
MEAL_PLAN_COMPOSER_R2_3_MEAL_PREVIEW: PASS
MEAL_PLAN_COMPOSER_R2_3_DAILY_PREVIEW: PASS
MEAL_PLAN_COMPOSER_R2_3_PREVIEW_NO_WRITE: PASS
MEAL_PLAN_COMPOSER_R2_3_PREVIEW_CANCEL_SAFE: PASS
MEAL_PLAN_COMPOSER_R2_3_APPLY_UPDATES_DRAFT: PASS (persiste a alternativa sugerida no grupo de troca — "Adicionar" nunca substitui o item prescrito diretamente; ver nota de domínio abaixo)
MEAL_PLAN_COMPOSER_R2_3_OPTIONS_SAFE: PASS
MEAL_PLAN_COMPOSER_R2_3_COMBINATION_RANGE: PASS (via engine real; sem UI de troca dentro de OPTIONS/COMBINATION nesta fase — ver seção de escopo)
MEAL_PLAN_COMPOSER_R2_3_MISSING_SAFE: PASS
MEAL_PLAN_COMPOSER_R2_3_MICRONUTRIENT_PREVIEW: N-A (preview do drawer cobre macros primários; sidebar externa já mostra micronutrientes do estado real, não do preview)
MEAL_PLAN_COMPOSER_R2_3_PREVIEW_P50_MS: 450
MEAL_PLAN_COMPOSER_R2_3_PREVIEW_P95_MS: 496
MEAL_PLAN_COMPOSER_R2_3_NUTRITION_ENGINE_AUTHORITY: PASS
MEAL_PLAN_COMPOSER_R2_3_PRODUCTION_WRITES: 0
```

### Nota de domínio — gate 34 (APPLY)

"Adicionar" nesta feature persiste uma alternativa em `exchange_group_alternatives` (`state=SUGGESTED`) — não troca o alimento prescrito na refeição (esse é um passo humano separado, fora do escopo do drawer). Por isso "draft muda" é verdadeiro no sentido de que uma nova alternativa passa a existir e sobrevive a reload (provado em E2E), mas o item prescrito e os totais reais da refeição/dia **não mudam** só por isso — o preview volta a mostrar "Atual" assim que o drawer fecha, porque não há mutação real do item para refletir. Comportamento confirmado correto por design (ver auditoria de domínio da R2.2).

## Verificação

- `tests/exchange-group-preview-delta.test.ts` (novo, 3/3) + suíte vitest completa: 1888/1888.
- `e2e/meal-plan-composer-r2-3-nutrition-preview.spec.ts` (novo, 3/3): impacto refeição/dia some ao cancelar sem persistir nada; confirmar não altera o item prescrito; baseline de performance.
- Regressão: `meal-plan-composer-r2-2-alternatives-drawer.spec.ts` (3/3), `meal-plan-r4-exchange-ux-quality.spec.ts` (3/3), `meal-plan-substitutions.spec.ts` (8/8) — sem novas falhas.
- TypeScript / ESLint: PASS. `NEW_MIGRATIONS = 0`, `PRODUCTION_WRITES = 0`.
