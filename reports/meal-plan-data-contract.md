# Meal Plan Data Contract - Proposed Canonical Contract

Data: 2026-08-23

## Objetivo

Contrato conceitual e implementação R1 para eliminar divergência de quantidade, identidade e publicação sem redesign do editor.

## Implementado na R1

- Fonte canônica de quantidade prescrita: `meal_plan_items.quantity` + `meal_plan_items.unit`.
- Helper central: `lib/nutrition/prescribed-quantity.ts`.
  - `getPrescribedQuantity(item)`
  - `formatPrescribedQuantity(item)`
  - `toNutritionGrams(input)`
- Read model compartilhado: `lib/repositories/meal-plan-view-model.ts`.
- `versionId` no modelo atual: `${planId}:v${version}`.
- Portal usa lookup único de ACTIVE: `getActiveMealPlanVersion(clientId)`.
- Print oficial sem `planId`: ACTIVE.
- Print com `planId`: prévia explícita daquele plano; sem fallback silencioso.
- Editor mostra impressão ativa ou prévia explícita do rascunho conforme plano selecionado.

## Fonte canônica de quantidade

O plano deve separar três conceitos:

1. Quantidade prescrita
   - O que a nutricionista escreveu para o alimento principal.
   - Deve ser exibida no editor, print e portal sem transformação visual.

2. Quantidade resolvida em gramas
   - Valor determinístico usado por cálculo nutricional/equivalência.
   - Pode vir de gramas explícitas, medida caseira específica ou snapshot.

3. Quantidade equivalente
   - Resultado calculado para uma alternativa.
   - Nunca deve substituir a quantidade prescrita do alimento principal.

## Tabela de campos de quantidade

| FIELD | SOURCE | MEANING | USED_BY_EDITOR | USED_BY_ENGINE | USED_BY_PRINT | USED_BY_PORTAL |
|---|---|---|---|---|---|---|
| `diet_template_items.quantity` | template relacional | quantidade sugerida do item principal no modelo | indiretamente via criação do plano | não diretamente | não | não |
| `diet_template_items.unit` | template relacional | unidade sugerida do item principal no modelo | indiretamente via criação do plano | não diretamente | não | não |
| `diet_template_slot_foods.quantity` | slot food do template | quantidade do alimento sugerido para ocupar o slot | hoje duplicada da tabela de itens | futuramente deve alimentar biblioteca de opções do slot | não | não |
| `diet_template_slot_foods.unit` | slot food do template | unidade do alimento sugerido para ocupar o slot | hoje duplicada da tabela de itens | futuramente deve alimentar biblioteca de opções do slot | não | não |
| `meal_plan_items.quantity` | payload do editor/importação | quantidade prescrita exibível do alimento principal | sim, editável | sim, entrada para resolver gramas | sim, via `formatPrescribedQuantity` | sim, via `formatPrescribedQuantity` |
| `meal_plan_items.unit` | payload do editor/importação | unidade prescrita exibível | sim, editável | sim, define resolução | sim, via `formatPrescribedQuantity` | sim, via `formatPrescribedQuantity` |
| `meal_plan_items.household_measure_id` | seleção estruturada no editor | medida caseira específica associada ao alimento | sim | sim, se válida para o alimento | não exibida hoje como descrição principal | não exibida hoje como descrição principal |
| `meal_plan_items.resolved_grams_snapshot` | backend em `resolveMealsWithSnapshots` | gramas congeladas para cálculo estável | mostra aproximação quando disponível | sim, precedência alta | não exibida como quantidade prescrita | não exibida |
| `meal_plan_items.quantity_resolution_snapshot` | backend em `resolveMealsWithSnapshots` | método/confiança da resolução | indireto por badges | sim | indireto por qualidade nutricional | não |
| `meal_plan_substitutions.quantity` | substituição legada/manual | quantidade exibida da alternativa legada | sim | não deve recalcular o item principal | sim, alternativa aprovada | sim, alternativa aprovada |
| `meal_plan_substitutions.unit` | substituição legada/manual | unidade exibida da alternativa legada | sim | não | sim | sim |
| `exchange_groups.primary_quantity_grams` | substitution engine | gramas resolvidas do alimento principal no grupo | indireto no painel | sim, base de equivalência | não como prescrição | não |
| `exchange_group_alternatives.quantity_grams` | substitution engine | gramas equivalentes calculadas da alternativa | sim no painel | sim | sim quando aprovada | sim quando aprovada |
| `meal_plan_versions.encrypted_snapshot` | backend versionador | snapshot histórico do payload/version | não editável | referência/auditoria | não usado hoje como fonte do print | não usado hoje como fonte do portal |

## Contrato alvo de publicação

Publicar deve criar uma fonte imutável de entrega:

- `draft`: edição clínica, nunca mostrado ao paciente.
- `active`: plano aprovado para portal.
- `print_snapshot`: snapshot do plano aprovado no momento da impressão/publicação.
- `version`: incremento auditável para qualquer save.

Regra alvo:

- Editor pode abrir qualquer plano por `planId`.
- Print de rascunho deve exigir `planId` explícito e mostrar marca de "prévia".
- Print para paciente deve usar apenas plano publicado/ativo.
- Portal deve usar apenas plano publicado/ativo.
- Ativação deve ser o único ponto que troca o material do paciente.

Na arquitetura atual, plano ativo e rascunho são linhas de `meal_plans`; a versão corrente de uma linha é `meal_plans.version`, e snapshots históricos ficam em `meal_plan_versions`. Não foi criada migration R1 para entidade separada de versão ativa.

Semântica R1:

- `getActiveMealPlanVersion(clientId)` retorna somente `status = active`.
- `getMealPlanVersionById(planId)` retorna somente o plano explicitamente pedido.
- Print oficial usa ACTIVE.
- Preview de rascunho exige `planId`.
- Se `planId` não existe ou não pertence à paciente, a rota não faz fallback para ACTIVE.

## Contrato alvo de identidade

Estados de identidade no ViewModel R1:

- `RESOLVED`: tem `food_source`, `food_ref_id` e `getFoodByReference()` retorna alimento calculável.
- `NEEDS_CONFIRMATION`: tem identidade persistida, mas a fonte/registro ainda não é calculável no catálogo atual.
- `UNRESOLVED`: não tem identidade persistida.

Regras alvo:

- Templates de sistema devem carregar identidade autorada, não depender só de fuzzy match.
- Print/portal não devem mostrar erro técnico; devem mostrar estado profissional claro se houver pendência antes da publicação.
- Publicação deve bloquear ou exigir confirmação explícita para itens sem cálculo/identidade quando isso afetar o material do paciente.

## Contrato alvo de papel clínico

Separar:

- `food_group`: categoria técnica ampla.
- `food_subgroup`: família alimentar.
- `nutritional_role`: papel nutricional.
- `culinary_role`: função na refeição.
- `display_role`: rótulo de UX para nutricionista.

Exemplo para feijão no almoço:

- `food_group`: `PROTEIN`
- `food_subgroup`: `LEGUME`
- `nutritional_role`: `PLANT_PROTEIN`
- `culinary_role`: `LEGUME_SIDE`
- `display_role`: `Leguminosa`

## Riscos atuais que o contrato precisa resolver

1. Print/portal usam ativo, editor pode estar em rascunho.
2. Quantidade prescrita e gramas resolvidas ainda aparecem misturadas conceitualmente.
3. Templates têm quantidade duplicada em item e slot food.
4. Templates não têm identidade autorada.
5. Alternativas podem ser geradas/aprovadas automaticamente na criação.
6. Rótulo visual usa grupo técnico, não papel clínico.
