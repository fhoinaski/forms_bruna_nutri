# Meal Plan Composer R2 — Release Closure

## Inventário final

Classificação do worktree antes do commit (categorias do pedido):

- **A. Composer R2 core**: `lib/nutrition/nutrients.ts`, `lib/repositories/meal-plans.ts`, `app/api/admin/foods/resolve/route.ts`, `tests/meal-flexible-structure.test.ts`, `tests/meal-plan-composer-nutrition.test.ts` — trabalho de base do Meal Flex já existente, mais as correções desta fase de fechamento.
- **B. R2.2 (alternatives drawer)**: `components/dashboard/ExchangeGroupPanel.tsx`, `e2e/meal-plan-composer-r2-2-alternatives-drawer.spec.ts`, `reports/meal-plan-composer-r2-2-alternatives-drawer.md`.
- **C. R2.3 (dynamic preview)**: `components/nutrition/MealPlanNutritionSummary.tsx`, `e2e/meal-plan-composer-r2-3-nutrition-preview.spec.ts`, `tests/exchange-group-preview-delta.test.ts`, `reports/meal-plan-composer-r2-3-nutrition-preview.md`.
- **D. Testes R2 (fechamento final)**: `e2e/meal-plan-composer-r2-final-flex.spec.ts`, `e2e/meal-plan-composer-r2-final-large-plan.spec.ts`, `e2e/helpers/meal-plan-editor.ts` (fix do helper `addMeal`), `components/dashboard/MealItemsEditor.tsx` (drawer + fix de N+1).
- **E. Reports R2**: `reports/meal-plan-composer-r2-final-qa.md`, `reports/meal-plan-composer-r2-performance.md`, mais os de B/C acima.
- **F. Clinical Copilot**: nenhum arquivo neste worktree.
- **G. F9**: nenhuma evidência no histórico nem no diff (nenhum commit ou arquivo com essa marca).
- **H. Screenshots**: 5 PNGs de `reports/screenshots/` foram regravados pelos próprios testes E2E rodando — **não incluídos no commit** (artefato binário de execução local, sem valor de revisão).
- **I. Artefatos locais/gerados**: `tsconfig.tsbuildinfo` — **não incluído**.
- **J. Não relacionado**: nenhum encontrado.

## Build e servidor isolado

- `rm -rf .next && npm run build` — PASS, `BUILD_ID=bjD6YIzlqqh86Xwg27tXA`.
- Todo E2E desta fase rodou com `E2E_PORT` dedicado (portas 3195–3212), nunca a porta 3000 (ocupada por outro worktree, nunca tocada/derrubada).
- Revision match: build feito imediatamente antes de cada rodada de E2E, a partir da mesma working tree que foi commitada depois (só `reports/screenshots/*` e `tsconfig.tsbuildinfo` diferem entre o build e o commit — nenhum dos dois afeta o bundle Next.js).

## Bugs reais encontrados e corrigidos nesta fase

1. Helper E2E `addMeal` com seletor stale (bloqueava 15 testes de regressão pré-existentes, sem relação com R2.2/R2.3).
2. Hidratação nutricional nunca disparava pra itens de texto livre dentro de OPTIONS/COMBINATION (dependência de `useEffect` incompleta em `MealPlanNutritionSummary.tsx`) — Live Nutrition mostrava um número fixo em vez da faixa correta.
3. N+1 real: até 24 requisições de busca (`/api/admin/foods/search`) disparadas por item ao montar a página, mesmo pra itens já com identidade resolvida.
4. Booleanos de itens dentro de `options`/`choice_groups` voltavam como inteiro cru do SQLite (`quantity_locked`/`substitutions_locked`), quebrando o ciclo completo carregar→editar→salvar de um plano com COMBINATION com `400 Invalid input: expected boolean, received number`.

Todos corrigidos, testados e confirmados com E2E antes/depois (traços em `reports/meal-plan-composer-r2-2-alternatives-drawer.md` e `reports/meal-plan-composer-r2-performance.md`).

## Verificação

- TypeScript: PASS
- ESLint: PASS
- Build: PASS (`BUILD_ID=bjD6YIzlqqh86Xwg27tXA`)
- Full Vitest: **1888/1888 PASS**
- E2E amplo consolidado (todas as specs de meal-plan/composer tocadas): **59/59 PASS**
- Artifact check: PASS
- Migration check: PASS (68 migrações, 0 novas)
- Runtime schema check: PASS
- Large plan (7 refeições, ~37 itens, SIMPLE+OPTIONS+COMBINATION): PASS — render 1,0–1,4s, N+1 corrigido (24→0 requisições de busca supérfluas)
- Mobile: PASS (drawer bottom sheet, editor read-only compacto, overflow, versionamento)
- Tablet: **N-A** — o drawer/editor só distingue `sm:` (mobile) de "desktop e acima"; não existe um contrato de layout específico pra tablet nesta feature, nenhuma quebra observada em nenhuma resolução testada.
- Accessibility: PASS (focus trap, Escape + devolução de foco, aria-labels, texto acessível de delta)
- Versionamento / conflito de versão / publicação imutável: PASS (`meal-plan-versioning.spec.ts`, `meal-plan-r6-publication-gate.spec.ts`, `meal-plan-r1-data-consistency.spec.ts`)
- Nutrition Engine authority / no second calculator: PASS (auditado — sidebar, delta, preview de refeição/dia, OPTIONS, COMBINATION usam exclusivamente `calculateFlexiblePlanNutrients`/`calculateItemNutrients`)
- Food Search authority / item-level exchange domain: PASS (reafirmado nesta fase — ver R2.2)
- Novas migrations: 0. Fixtures remanescentes: 0 (todo teste cria/roda contra o shim local, sem fixtures persistentes). Escritas em produção: 0.

## Staging seletivo e commit

`git add` explícito (nunca `-A`/`.`) de 18 arquivos — auditoria confirmou 0 Clinical Copilot, 0 F9, 0 screenshots, 0 `tsconfig.tsbuildinfo`, 0 arquivo não relacionado.

```text
R2_BASE_SHA:   9a2319d5b26e08522435ae7126d07f4c97e5b1c5
R2_COMMIT_SHA: 14334955c0c68d023d118133ee55f43052906ef9
R2_TREE_SHA:   649ba38e7402935402723e2e277b0b562c7abbbb
```

Ancestralidade: `git log --oneline --all` não mostra nenhum commit ou marca "F9" na história deste branch — `F9_IN_ANCESTRY: nao`.

## CI autoritativo — BLOQUEADO (decisão do usuário pendente)

Este ambiente não tem uma conexão de CI autorizada (sem `gh` autenticado/confirmado para este repositório, sem remoto verificado). Publicar uma branch para acionar CI é uma ação irreversível/visível a terceiros — por regra de segurança, isso exige confirmação explícita do usuário antes de eu agir, então **não fiz push nem abri PR**. Todos os gates *locais* equivalentes ao que o CI rodaria (TypeScript, lint, build, migration, runtime schema, artifact check, unit tests completos, Playwright) já rodaram e passaram nesta sessão — a única lacuna é a confirmação autoritativa de terceiros (CI real na SHA exata).

Se o usuário confirmar, os próximos passos seriam: publicar a branch `codex/meal-plan-composer-r2` (já existente, sem merge, sem force-push) e acompanhar o CI na SHA `14334955c0c68d023d118133ee55f43052906ef9`.

## Markers

```text
MEAL_PLAN_COMPOSER_R2_FINAL_BUILD: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_BUILD_ID: bjD6YIzlqqh86Xwg27tXA
MEAL_PLAN_COMPOSER_R2_FINAL_SERVER_ISOLATED: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_REVISION_MATCH: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_E2E_CORE: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_E2E_FLEX: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_R2_2: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_R2_3: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_MOBILE: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_TABLET: N-A
MEAL_PLAN_COMPOSER_R2_FINAL_ACCESSIBILITY: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_LARGE_PLAN: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_N_PLUS_ONE: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_ADD_ITEM_P50_MS: 43
MEAL_PLAN_COMPOSER_R2_FINAL_ADD_ITEM_P95_MS: 47
MEAL_PLAN_COMPOSER_R2_FINAL_QUANTITY_P50_MS: 43
MEAL_PLAN_COMPOSER_R2_FINAL_QUANTITY_P95_MS: 47
MEAL_PLAN_COMPOSER_R2_FINAL_PREVIEW_P50_MS: 465
MEAL_PLAN_COMPOSER_R2_FINAL_PREVIEW_P95_MS: 634
MEAL_PLAN_COMPOSER_R2_FINAL_FULL_VITEST: 1888/1888
MEAL_PLAN_COMPOSER_R2_FINAL_BROAD_E2E: 59/59
MEAL_PLAN_COMPOSER_R2_FINAL_TYPESCRIPT: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_LINT: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_ARTIFACT: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_MIGRATION: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_RUNTIME_SCHEMA: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_VERSION_CONFLICT: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_PUBLISHED_IMMUTABLE: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_NUTRITION_ENGINE_AUTHORITY: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_NO_SECOND_CALCULATOR: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_ITEM_EXCHANGE_DOMAIN: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_NEW_MIGRATIONS: 0
MEAL_PLAN_COMPOSER_R2_FINAL_FIXTURES_REMAINING: 0
MEAL_PLAN_COMPOSER_R2_FINAL_PRODUCTION_WRITES: 0
MEAL_PLAN_COMPOSER_R2_FINAL_SELECTIVE_STAGING: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_COMMIT_ISOLATED: PASS
MEAL_PLAN_COMPOSER_R2_FINAL_COMMIT_SHA: 14334955c0c68d023d118133ee55f43052906ef9
MEAL_PLAN_COMPOSER_R2_FINAL_F9_IN_ANCESTRY: nao
MEAL_PLAN_COMPOSER_R2_FINAL_CI_EXACT_REVISION: BLOCKED
MEAL_PLAN_COMPOSER_R2_FINAL_CI_FULL_UNIT: BLOCKED
MEAL_PLAN_COMPOSER_R2_FINAL_CI_BUILD: BLOCKED
MEAL_PLAN_COMPOSER_R2_FINAL_CI_PLAYWRIGHT: BLOCKED
MEAL_PLAN_COMPOSER_R2_FINAL_FULL_GATES: BLOCKED
MEAL_PLAN_COMPOSER_R2_COMPLETE: nao
MEAL_PLAN_SUBSTITUTION_R3_SAFE_TO_START: nao
```

## Por que `MEAL_PLAN_COMPOSER_R2_COMPLETE` continua `nao`

Todos os gates locais passam. O único bloqueio é CI autoritativo na SHA exata (seção 44/47 do pedido exige isso explicitamente antes de "sim"), e isso depende de uma decisão do usuário: publicar a branch (ação visível/irreversível o suficiente para exigir confirmação explícita, por regra de segurança) e então rodar o CI real. Assim que isso acontecer — sem falhas — a fase pode ser fechada como `sim` e a R3 liberada.
