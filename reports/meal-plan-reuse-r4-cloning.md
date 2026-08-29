# Meal Plan Reuse & Templates R4 — Duplicação / Cópia / Clonagem

## Duplicar refeição (seções 11-12)

Já existia (`duplicateMealAt`, `MealItemsEditor.tsx`), com identidade nova
garantida pelo backend (delete+insert com UUIDs novos a cada save — nunca
reaproveita IDs entre refeições). Auditoria encontrou um gap real: `options`/
`choice_groups` (OPTIONS/COMBINATION) eram copiados por REFERÊNCIA
compartilhada com a refeição original, não por valor — um bug de mutação
cruzada nunca coberto por teste antes desta fase. Corrigido: cada item
dentro de cada opção/grupo de escolha agora ganha seu próprio objeto novo.
Testes novos em `tests/meal-items-editor-helpers.test.ts` provam que editar
a cópia nunca muda o original, para OPTIONS e para COMBINATION.

## Copiar refeição de outro plano do mesmo paciente (seções 13-14)

Nova seção "Planos anteriores" na biblioteca de reuso
(`ReuseLibraryDrawer.tsx`): lista os planos do paciente ATUAL (via
`GET /api/admin/clients/[id]/meal-plans`, já existente — nenhum endpoint
novo), excluindo o plano atualmente aberto. Nunca lista planos de outro
paciente — a busca é sempre por `clientId` da rota atual, nunca por um id
arbitrário vindo do cliente. Ao escolher uma refeição, ela é inserida no
draft atual via `stripMealSnapshots` (nunca reaproveita
`nutrition_snapshot`/locks do plano de origem).

## Clonar plano anterior como novo draft (seções 16-19)

Já existia (`duplicateCurrentPlan`, rotulado "Editar"/"Editar como
rascunho"/"Duplicar este plano" conforme o status do plano de origem) — a
nutricionista já podia selecionar qualquer plano do paciente (chips de
plano no topo do Composer) e duplicá-lo como novo rascunho. Gap real
encontrado e corrigido: os itens copiados nunca tinham
`nutrition_snapshot`/`food_name_snapshot` limpos antes do primeiro save —
como esses campos nunca sobrevivem a um save (o servidor sempre os
reconstrói do zero, `cleanMealsForSave` nem os inclui no payload), a janela
de risco real era só o PREVIEW no navegador entre a duplicação e o
primeiro save, mas ainda assim violava o princípio central da fase ("nunca
confiar em nutrition_snapshot antigo"). Corrigido com
`sanitizeMealForPlanClone` (novo, `MealItemsEditor.tsx`): reconstrói cada
item por lista explícita de campos (nunca um spread do objeto de origem,
que pode carregar snapshot em runtime mesmo fora do tipo local `MealItem`),
limpando snapshot/locks e preservando identidade canônica + quantidade —
a mesma garantia dada a "duplicar refeição".

## Plano original nunca é editado (seção 17)

Confirmado: `duplicateCurrentPlan` sempre cria um `meal_plans.id` NOVO via
`POST /api/admin/clients/[id]/meal-plans` antes de qualquer modificação —
o plano de origem nunca é tocado, e permanece imutável (mesma garantia já
testada por `meal-plan-versioning.spec.ts`, CENÁRIO A).

## Alimento canônico ausente/inválido (seção 20)

Reaproveitado o comportamento já existente do Nutrition Engine: quando
`food_source`/`food_ref_id` de um item copiado/clonado não resolve mais no
catálogo (`resolveItemReference`, `lib/nutrition/nutrients.ts`), o item
aparece como "não reconhecido pelo cálculo automático" — o mesmo aviso já
usado para qualquer item sem vínculo confirmado, incluindo o banner
"Confirme este alimento antes de gerar trocas" no drawer de trocas. Nenhum
novo estado "REVIEW_REQUIRED" foi criado — o equivalente já existe e é
reaproveitado, nunca um sistema paralelo.

## Testes

- `tests/meal-items-editor-helpers.test.ts`: duplicar refeição com
  OPTIONS/COMBINATION sem referência compartilhada;
  `sanitizeMealForPlanClone` remove snapshot/locks mesmo quando o objeto de
  origem os carrega em runtime (fora do tipo TS local), preserva identidade
  canônica, limpa snapshots dentro de options/choice_groups também.
- `e2e/meal-plan-reuse-r4-library.spec.ts`: copiar refeição de outro plano
  do mesmo paciente, ponta a ponta.
- `e2e/meal-plan-ux2.spec.ts` (regressão, sem alteração): duplicar
  refeição/item/plano continuam PASS após as correções.
