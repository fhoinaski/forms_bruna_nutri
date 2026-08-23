# Meal Plan Restructure - Current State Audit

Data da auditoria: 2026-08-23
Commit base registrado: `8eb5d45c6b7a7fd0d6165e6dc01bd69293d08cfb`

## Escopo

Auditoria funcional do fluxo atual sem implementação de redesign:

`Template -> createMealPlanFromTemplate -> meal_plan -> meals -> items -> identity -> nutrition hydration -> MealPlanEditor -> save -> version -> active -> print -> portal`

## Baseline executado

- `npx vitest run tests/meal-plan-go-live-p0.test.ts tests/meal-items-editor-helpers.test.ts tests/template-slots-migration.test.ts tests/curated-exchange-pilot.test.ts tests/curated-exchange-lists.test.ts tests/food-exchange-groups.test.ts tests/meal-plan-change-substitutions.test.ts`
  - Resultado: PASS, 7 arquivos, 87 testes.
- `npm run migrate:d1:check`
  - Resultado: PASS, 66 migrações locais validadas.

Observação: o check local de migrações valida os arquivos, mas não prova que o D1 remoto executou a migração 0066. O erro real relatado (`exchange_groups has no column named exchange_list_id`) continua compatível com D1 remoto defasado.

## Mapa do fluxo atual

### 1. Template

- Seeds do sistema: `db/seed-templates.ts`.
- Templates DIETA/SUPLEMENTACAO/SUBSTITUICAO são criados por grupo alvo.
- O template `ADULTO_SAUDAVEL` contém o fixture esperado:
  - `Pao de forma integral` 50 g
  - `Ovo de galinha inteiro cozido` 100 g
  - `Banana prata` 80 g
  - `Arroz integral cozido` 120 g
- A seed grava a quantidade duas vezes:
  - `diet_template_items.quantity/unit`
  - `diet_template_slot_foods.quantity/unit`
- O slot é inferido por `classifyFoodExchangeGroup({ descricao: item.food, grupo: "", proteina_g: 0, carboidrato_g: 0, lipidios_g: 0 })`, ou seja, por nome e macros zerados, não por papel clínico autorado.

### 2. Importação para plano

- API de criação: `app/api/admin/clients/[id]/meal-plans/route.ts`.
- Repositório: `lib/repositories/meal-plans.ts`.
- `createMealPlanFromTemplates` cria plano em `draft`.
- A importação resolve identidade por texto quando `food_source/food_ref_id` não existem.
- Slots são carimbados nos itens do plano (`slot_food_group`, `slot_food_subgroup`, `slot_nutritional_role`, `template_slot_id`, `slot_exchange_eligible`) quando existe mapeamento de `source_item_id`.
- O fluxo atual também gera grupos de equivalentes no momento da criação do plano a partir do template, com aprovação automática quando `approveGenerated: true`. Isso é funcional, mas contradiz a meta de "paciente recebe apenas plano aprovado pela nutricionista" para alternativas.

### 3. Persistência do plano

- Tabelas centrais:
  - `meal_plans`
  - `meal_plan_meals`
  - `meal_plan_items`
  - `meal_plan_versions`
  - `meal_plan_substitutions`
  - `exchange_groups`
  - `exchange_group_alternatives`
- `buildMealPlanDetailStatements` apaga refeições/itens/substituições e reinsere o payload recebido.
- Para itens em gramas, `quantity` é persistido como string sem multiplicação.
- `resolved_grams_snapshot` é derivado por `resolveQuantity`; para `unit = g`, o valor em gramas é o próprio `quantity`.

### 4. Editor

- Componente: `components/dashboard/MealPlanEditor.tsx`.
- Carregamento: `GET /api/admin/clients/{id}/meal-plans` via `getClientMealPlans`.
- Ordenação da lista: ativo primeiro, depois rascunhos.
- Ao criar por modelo, `loadPlans(data.id)` seleciona explicitamente o novo rascunho.
- A tela, portanto, pode exibir um rascunho com 50/100/120 g mesmo que ainda exista um plano ativo antigo com 100/200/240 g.
- O link de impressão no prontuário é fixo: `/dashboard/clients/{id}/print?secao=plano-alimentar`, sem `planId` ou `version`.

### 5. Save/version/active

- API de atualização: `app/api/admin/clients/[id]/meal-plans/[planId]/route.ts`.
- `expectedVersion` é enviado pelo editor e validado no backend.
- Quando `status = active`, outros planos ativos do cliente são arquivados.
- Não há um contrato explícito de "visualizar/imprimir o rascunho selecionado". Impressão e portal só usam ativo.

### 6. Print

- Página: `app/dashboard/clients/[id]/print/page.tsx`.
- Fonte do plano: `getActiveMealPlan(id)`.
- Não há seleção por `planId`.
- Quantidade exibida: `fmtQuantity(item.quantity, item.unit)`.
- Nutrientes: `calculatePlanNutrients(activeMealPlan, foodLookup)`.
- Badge "Informação incompleta" aparece quando a refeição tem itens, mas o total energético da refeição fica nulo por falta de referência/quantidade resolvida.

### 7. Portal

- API: `app/api/portal/me/route.ts`.
- Repositório: `lib/repositories/client-portal.ts`.
- Fonte do plano: `getActiveMealPlan(clientId)`.
- Quantidade exibida: `item.quantity + item.unit`.
- Portal e print são coerentes entre si por usarem o ativo, mas podem divergir do editor se o editor estiver em rascunho.

## Diagnóstico da divergência 50 -> 100 / 120 -> 240

Achado principal: não foi encontrado caminho de cálculo que dobre `quantity` em gramas ao salvar, hidratar, imprimir ou calcular nutrientes.

Evidências:

- Seed `ADULTO_SAUDAVEL` define `Pao 50 g`, `Ovo 100 g`, `Banana 80 g`, `Arroz 120 g`.
- `MealPlanEditor` seleciona o rascunho recém-criado por `loadPlans(data.id)`.
- `print` ignora o plano selecionado e chama `getActiveMealPlan(id)`.
- `portal` também chama `getActiveMealPlan(clientId)`.
- `buildMealPlanDetailStatements` grava `quantity: item.quantity ?? null`.
- `resolveQuantity` para `g` retorna a própria quantidade como gramas.

Causa raiz suficientemente entendida: divergência de fonte entre rascunho selecionado no editor e plano ativo usado no print/portal. Se havia plano ativo antigo com porções dobradas, o editor mostra o rascunho novo correto, mas o print/portal continuam exibindo o ativo antigo até a ativação/publicação do novo plano.

## Food identity

O pipeline ainda não é consistente:

- Templates de sistema não têm identidade autorada (`food_source/food_ref_id`) na seed.
- A importação tenta resolver por texto.
- Itens legados ou digitados livremente caem em fuzzy match no cálculo nutricional.
- TBCA/IBGE_POF podem ser transportados como identidade, mas o motor nutricional retorna `null` para essas fontes na fase atual, gerando aviso honesto de incompletude.
- Print/portal usam o plano ativo; se o ativo for legado/free-text, podem mostrar "Informação incompleta" mesmo quando o rascunho novo tem identidades melhores.

## Classificação clínica/visual

Feijão cai em:

- `foodGroup = PROTEIN`
- `foodSubgroup = LEGUME`
- `nutritionalRole = PLANT_PROTEIN`

Isso é defensável internamente para equivalência proteica vegetal, mas ruim visualmente: o rótulo exibido no editor usa apenas o grupo amplo `PROTEIN`, então o usuário vê "Proteína" em vez de "Leguminosa" ou "Feijão/leguminosa".

## UX atual

Problemas confirmados por código:

- Editor concentra criação, metas, refeições, busca, medidas, locks, IA, receitas, alternativas, substituições legadas, semana, suplementos, salvar como modelo e ativação na mesma superfície.
- Alternativas aparecem por item, com estados e controles técnicos.
- Há dois sistemas de substituição coexistindo: `meal_plan_substitutions` legado e `exchange_groups` novo.
- Mensagens técnicas podem vazar quando erro de D1/migração sobe pelo stack.
- O fluxo de publicação não explicita "este rascunho ainda não é o que o paciente/print verá".

## Fontes públicas consultadas para benchmark

- Nutrium - meal plan templates: https://nutrium.com/blog/new-meal-plan-templates-in-nutrium-for-your-nutrition-appointments/
- Nutrium Help - weekly meal plan/templates/equivalents: https://help.nutrium.com/en/articles/2015765-how-to-create-a-weekly-meal-plan
- Nutrium Help - foods with equivalent quantities: https://help.nutrium.com/en/articles/7068252-how-can-i-suggest-foods-with-equivalent-quantities
- Nutrium Professionals page: https://nutrium.com/en/professionals
- Dietbox public site: https://dietbox.me/pt-BR
- Dietbox public training content found via YouTube search for meal plan/equivalent foods, used only as product benchmark pointers, not as proprietary behavior source.

## Markers

- `MEAL_PLAN_AUDIT_COMPLETE: sim`
- `QUANTITY_DIVERGENCE_ROOT_CAUSE: divergência entre rascunho selecionado no editor e plano ativo usado por print/portal; não há evidência de multiplicação de quantity em g no save/cálculo`
- `PRINT_EDITOR_DATA_SOURCE_DIVERGENCE: sim`
- `FOOD_IDENTITY_PIPELINE_CONSISTENT: nao`
- `ACTIVE_DRAFT_VERSION_PIPELINE_CONSISTENT: nao`
- `TEMPLATE_INTEGRITY_ISSUES: 6`
- `UX_RESTRUCTURE_NEEDED: sim`
