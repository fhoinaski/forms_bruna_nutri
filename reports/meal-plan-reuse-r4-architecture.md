# Meal Plan Reuse & Templates R4 — Arquitetura

## Objetivo

Reduzir o tempo de montar/revisar planos alimentares, reaproveitando SEMPRE
estrutura + identidade canônica — nunca nutrição congelada como autoridade.

## Branch e base

- Branch: `feat/meal-plan-reuse-r4`
- Base: `feat/meal-plan-substitution-r3` @ `a601312464b9d8e57f6030e089d51f3f62c5c0dc` (R3, CI verde, fechado)

## Auditoria feita ANTES de qualquer código (seção 1 do pedido)

Um agente de pesquisa dedicado auditou o que já existia para: recentes,
favoritos, duplicar, copiar, templates, clonagem de plano, histórico. Achados
que mudaram o escopo real da fase:

1. **Recentes/favoritos (alimentos/refeições): nenhuma persistência existia.**
   `professional_food_preferences` é só um alias de desambiguação
   (query→alimento), sem `usage_count`/`last_used_at`. Não existe nenhum
   conceito de "favorito" em lugar nenhum do schema.
2. **Templates de plano já existem, completos, admin-autoráveis.**
   `protocol_templates` + `diet_template_meals/items/substitutions/supplements`
   + `diet_template_slots/slot_foods` (Fases 4/8/8.5) já é um sistema real de
   CRUD (`lib/repositories/protocol-templates.ts`), com um caminho de
   PROMOÇÃO plano→template já pronto (`POST .../[planId]/save-as-template`,
   botão "Salvar como modelo" já na UI) e uma via de instanciação por
   `targetGroup` (`createMealPlanFromTemplates`). O que faltava era só a
   direção inversa granular: "navegar os templates existentes e aplicar UM
   específico como novas refeições no draft atual" — sem exigir passar pelo
   fluxo de "criar por targetGroup".
3. **"Duplicar refeição"/"Duplicar plano atual" já existem e funcionam.**
   `duplicateMealAt` (`MealItemsEditor.tsx`) e `duplicateCurrentPlan`
   (`MealPlanEditor.tsx`) já são reais, testados por E2E anteriores
   (`meal-plan-ux2.spec.ts`). O backend sempre gera IDs novos a cada save
   (delete+insert), então nenhuma dessas duplicações corre risco de colisão.
4. **Gap real nº 1**: `duplicateMealAt` copiava `items` com segurança, mas
   `options`/`choice_groups` (OPTIONS/COMBINATION) eram copiados por
   REFERÊNCIA compartilhada com o original — um bug de mutação-cruzada
   pré-existente, nunca coberto por teste antes desta fase.
5. **Gap real nº 2**: `duplicateCurrentPlan` nunca limpava
   `nutrition_snapshot`/`food_name_snapshot` ao copiar itens — esses campos
   nunca sobrevivem a um SAVE (o servidor sempre recalcula, ver
   `cleanMealsForSave`), mas sobrevivem no estado LOCAL antes do primeiro
   save, criando uma janela real onde o preview de nutrição no navegador
   podia mostrar valores congelados do plano de origem em vez de recalcular
   pela identidade canônica atual — exatamente o que o princípio central da
   R4 proíbe.
6. **Gap real nº 3**: não existe nenhum jeito de copiar UMA refeição
   específica de outro plano do mesmo paciente para o draft atual, nem de
   salvar uma refeição isolada como reutilizável independente de um plano
   inteiro (MEAL_TEMPLATE distinto de PLAN_TEMPLATE).

## Decisão de arquitetura (seção 2 do pedido — "PARAR antes de criar migration")

Apresentada ao usuário ANTES de qualquer escrita de schema: proposta de 3
tabelas aditivas mínimas (`admin_food_usage`, `admin_food_favorites`,
`admin_saved_meals`), com escopo por profissional (`admin_id`), sem alterar
nenhuma tabela existente, rollback = `DROP TABLE`. Aprovada explicitamente
antes da migration ser escrita (`db/20260827_0070_meal_plan_reuse_favorites.sql`).

## O que foi construído

1. **3 tabelas novas** (ver `reports/meal-plan-reuse-r4-templates.md` para o
   detalhe completo do schema).
2. **Repositórios**: `lib/repositories/admin-food-usage.ts`,
   `lib/repositories/admin-food-favorites.ts`,
   `lib/repositories/admin-saved-meals.ts` — mais um export novo em
   `lib/repositories/meal-plans.ts` (`getTemplateFlatMeals`, reaproveitando
   `getRelationalDietTemplates` já existente, nunca uma segunda leitura de
   `diet_template_meals/items`).
3. **API**: `POST/GET /api/admin/foods/recent`, `GET/POST/DELETE
   /api/admin/foods/favorites`, `GET/POST /api/admin/saved-meals`,
   `GET/POST/DELETE /api/admin/saved-meals/[id]`, `GET
   /api/admin/protocol-templates/[id]/meals` (preview/aplicação de um
   modelo de plano específico).
4. **UI**: um único componente novo, `ReuseLibraryDrawer.tsx`, com 5 seções
   (Recentes/Favoritos/Minhas refeições/Planos anteriores/Modelos de
   planos) atrás de um botão discreto "Usar modelo" no Composer — nenhum
   segundo editor, nenhuma duplicação do drawer de trocas já existente
   (`ExchangeGroupPanel`).
5. **Correções nos dois gaps reais encontrados na auditoria**:
   `duplicateMealAt` agora copia `options`/`choice_groups` profundamente;
   `duplicateCurrentPlan` agora passa cada refeição por
   `sanitizeMealForPlanClone` (limpa snapshot/locks, nunca reaproveita
   nutrição congelada, mesmo antes do primeiro save).

## Por que não um domínio paralelo

`MEAL_TEMPLATE` (tabela nova, `admin_saved_meals`) e `PLAN_TEMPLATE`
(`protocol_templates`, já existente) foram mantidos como tipos DISTINTOS —
nunca um blob genérico único misturando os dois. `admin_saved_meals.content`
usa o MESMO formato de `meal_plans.meals` (items/options/choice_groups),
nunca um schema paralelo pra representar refeição.
