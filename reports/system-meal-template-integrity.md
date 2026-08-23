# System Meal Template Integrity Audit

Data: 2026-08-23

Escopo R2: templates `SYSTEM` ativos do tipo `DIETA`, usados por `createMealPlanFromTemplates`.

## Status

`TEMPLATE_INTEGRITY_ISSUES: 6`

As 6 classes de problemas foram reproduzidas a partir do relatório anterior e corrigidas no contrato R2.

## Inventário SYSTEM

Após R2, o único template SYSTEM DIETA ativo/READY é:

| Template | Grupo | Versão | Active | Meals | Slots | Foods | Final |
|---|---|---:|---:|---:|---:|---:|---|
| `tpl-adulto_saudavel-dieta-base` | ADULTO_SAUDAVEL | 1 | sim | 3 | 10 | 10 | PASS |

Templates SYSTEM DIETA especializados permanecem preservados, mas inativos, até auditoria clínica e identidade calculável completa: EMAGRECIMENTO, HIPERTROFIA, IDOSO, GESTANTE, CRIANCA, TEA, SOP, VEGETARIANO_ESTRITO, ENDURANCE, RESISTENCIA_INSULINA.

Templates SYSTEM de `SUPLEMENTACAO` e `SUBSTITUICAO` continuam como biblioteca auxiliar; não são meal templates e não entram no gate de criação de plano.

## Six Issues

| ISSUE_ID | TEMPLATE_ID | TEMPLATE_NAME | MEAL | SLOT | FOOD | ISSUE_TYPE | ROOT_CAUSE | SEVERITY | FIX_STRATEGY | STATUS |
|---|---|---|---|---|---|---|---|---|---|---|
| R2-001 | SYSTEM DIETA | Todos | Todas | Todos | Todos | UNRESOLVED_FOOD | Seed gravava nome livre sem `food_source`/`food_ref_id`. | ERROR | Adicionar identidade no template e backfill SYSTEM adulto. | PASS |
| R2-002 | SYSTEM DIETA | Todos | Todas | Todos | Todos | MISSING_SLOT_ROLE | Slot usava classificação alimentar/macro como papel clínico. | ERROR | Persistir role clínico explícito (`MAIN_STARCH`, `LEGUME`, etc.). | PASS |
| R2-003 | SYSTEM DIETA | Todos | Todas | Todos | Todos | QUANTITY_SOURCE_AMBIGUOUS | Quantidade duplicada entre item e slot_food sem contrato. | WARN | R2 preserva item e slot_food iguais e valida paridade/quantidade positiva; R1 define exibição por item. | PASS |
| R2-004 | `tpl-adulto_saudavel-dieta-base` | Dieta base | Almoço | Leguminosa | Feijao carioca cozido | WRONG_ROLE | Feijão caía em `PROTEIN` por composição/subgrupo. | ERROR | Role clínico do slot é `LEGUME` e tem prioridade sobre classificador. | PASS |
| R2-005 | SYSTEM DIETA | Todos | Todas | Elegíveis | Todos | INVALID_EXCHANGE_LIST | Lista era derivada por inferência do alimento. | ERROR | Lista curada explícita por role/contexto no slot. | PASS |
| R2-006 | SYSTEM DIETA | Criação por modelo | Todas | Todos | Alternativas | AUTO_APPROVAL | Criação do plano aprovava alternativas geradas automaticamente. | ERROR | `createMealPlanFromTemplates` gera sugestões sem `approveGenerated`. | PASS |

## Golden Adulto Saudável

Template real R2:

| Refeição | Contexto | Role | Alimento | Quantidade | Identidade | Lista |
|---|---|---|---|---|---|---|
| Cafe da manha | BREAKFAST | BREAKFAST_CARB | Pao de forma integral | 50 g | TACO:52 | BREAKFAST_CARBS |
| Cafe da manha | BREAKFAST | MAIN_PROTEIN | Ovo de galinha inteiro cozido | 100 g | TACO:488 | NO_EXCHANGE_LIST |
| Cafe da manha | BREAKFAST | FRUIT | Banana prata | 80 g | TACO:182 | FRUIT_PORTIONS |
| Almoco | LUNCH | MAIN_STARCH | Arroz integral cozido | 120 g | TACO:1 | MAIN_MEAL_STARCHES |
| Almoco | LUNCH | LEGUME | Feijao carioca cozido | 100 g | TACO:561 | LEGUME_OPTIONS |
| Almoco | LUNCH | MAIN_PROTEIN | Peito de frango grelhado | 120 g | TACO:410 | LEAN_MAIN_PROTEINS |
| Almoco | LUNCH | VEGETABLE | Brocolis cozido | 100 g | TACO:100 | VEGETABLE_SIDES |
| Jantar | DINNER | MAIN_STARCH | Batata doce cozida | 150 g | TACO:88 | MAIN_MEAL_STARCHES |
| Jantar | DINNER | MAIN_PROTEIN | Pintado grelhado | 130 g | TACO:313 | LEAN_MAIN_PROTEINS |
| Jantar | DINNER | VEGETABLE | Abobrinha cozida | 120 g | TACO:70 | VEGETABLE_SIDES |

Diferença documentada: a fixture conceitual citava tilápia, mas a TACO local não possui tilápia explícita. O template real usa `Pintado grelhado` para manter identidade calculável sem falsificar fonte alimentar.

## Gate

O validador central é `validateMealTemplateIntegrity(templateId)` em `lib/repositories/meal-template-integrity.ts`.

Issue codes implementados:

`MISSING_MEAL_CONTEXT`, `MISSING_SLOT_ROLE`, `UNRESOLVED_FOOD`, `UNCALCULABLE_FOOD`, `INVALID_QUANTITY`, `INVALID_UNIT`, `ORPHAN_SLOT`, `ORPHAN_SLOT_FOOD`, `DUPLICATE_SLOT`, `DUPLICATE_FOOD`, `INVALID_EXCHANGE_LIST`, `AMBIGUOUS_TEMPLATE_VERSION`, `EMPTY_TEMPLATE`.

Resultado machine-readable: `reports/system-meal-template-integrity.json`.
