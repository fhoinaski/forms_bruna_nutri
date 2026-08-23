# R5 - Auditoria do Fluxo de Entrega do Plano Alimentar

## Escopo

Auditoria do caminho de entrega do plano alimentar ao paciente:

MealPlanViewModel -> plano active -> portal -> print.

## Fluxo Antes da R5

### ViewModel

- `lib/repositories/meal-plan-view-model.ts`
- Montava a leitura canônica de itens, quantidades prescritas, identidade alimentar e trocas aprovadas.
- Já usava `getApprovedMealPlanAlternatives`, que filtra trocas `APPROVED` e ignora grupos stale quando a quantidade atual do item diverge da quantidade do grupo.

### Portal

- `lib/repositories/client-portal.ts`
- Consumidor usava `getActiveMealPlanVersion(clientId)`.
- Enriquecia receitas e montava `exchangeGroups` fora do ViewModel.
- Já era active-only na consulta, mas ainda reconstruía parte do payload de entrega.

### Print

- `app/dashboard/clients/[id]/print/page.tsx`
- Print oficial sem `planId` usava active.
- Preview com `planId` podia mostrar draft explicitamente.
- Calculava resumo nutricional com o mesmo motor do editor.
- Recriava lookup de trocas aprovadas localmente para renderização.

## Transformações Encontradas

### Food Name

- Portal aplicava `friendlyFoodName` apenas para apresentação.
- Print aplicava `friendlyFoodName` apenas para apresentação.
- Nenhum dos dois usava esse nome para resolver identidade alimentar.

### Quantity / Unit

- Portal exibia `quantity` + `unit` via `formatPrescribedQuantity`.
- Print exibia `quantity` + `unit` via `formatPrescribedQuantity`.
- Não foi encontrada conversão nova de `gramEquivalent`/medida caseira na entrega.

### Approved Alternatives

- Portal e print já evitavam `SUGGESTED`/`REJECTED`.
- R5 consolidou a fonte em delivery canônico para `APPROVED` e stale-safe.

### Meal Order / Item Order

- `hydrateMealPlans` preserva `meal_plan_meals.sort_order` e `meal_plan_items.sort_order`.
- Portal e print iteram na ordem recebida.

### Instructions

- `meal.notes`, `item.notes` e `plan.notes` continuam preservados.
- Print possui filtro de notas operacionais internas conhecidas.
- Portal preserva notas do plano ativo e refeições; não imprime notas clínicas privadas do prontuário.

## Classificação

- `MealPlanViewModel`: KEEP, base canônica.
- `getActiveMealPlanVersion`: COMPATIBILITY, ainda útil internamente, mas não deve ser a camada final de entrega.
- `client-portal mealPlan assembly`: REPLACED_BY_DELIVERY.
- `print active fetch`: REPLACED_BY_DELIVERY para impressão oficial.
- `legacy substitutions`: COMPATIBILITY, não usadas quando há delivery canônico de trocas.
- `exchange_groups` / `exchange_group_alternatives`: KEEP, snapshot aprovado.

## Riscos Endereçados na R5

- Portal e print deixam de reconstruir estruturas clínicas independentemente.
- `versionId` e `activeVersionId` ficam explícitos no payload/render.
- Múltiplos active plans não são escolhidos aleatoriamente pela camada de delivery.
- Active com troca aprovada stale é tratado como inválido na camada de delivery.
- Portal/print continuam leitura: não geram trocas, não buscam food resolver e não chamam IA.
