# Meal Plan R6 - Estado Atual do Publish

Data: 2026-08-23

## Escopo

R6 implementada como gate funcional de publicacao para impedir que um plano alimentar seja entregue ao portal/print oficial sem revisao clinica minima. A fase nao altera resolver, ranking, IA ou listas curadas.

## Estado Atual

- O editor trabalha com rascunho ate a nutricionista abrir a revisao.
- A revisao roda em endpoint dedicado e usa o mesmo validador central aplicado pela API de publish.
- A publicacao direta por `PUT status=active` nao contorna a validacao.
- Warnings nao bloqueiam tecnicamente, mas a UI exige confirmacao explicita antes de publicar.
- A versao ativa anterior continua sendo arquivada pela transacao existente de update, preservando uma unica versao ativa por cliente.
- O portal passa a ler a nova versao ativa depois do publish.

## Arquitetura Relevante

- `lib/repositories/meal-plan-publication.ts`
  - Validador deterministico `validateMealPlanForPublication(...)`.
  - Consolida blockers, warnings, resumo nutricional e resumo por refeicao.
- `app/api/admin/clients/[id]/meal-plans/[planId]/publication-review/route.ts`
  - Endpoint `GET` de preflight/revisao.
- `app/api/admin/clients/[id]/meal-plans/[planId]/route.ts`
  - Enforca a validacao imediatamente antes de publicar.
  - Mantem optimistic concurrency via `expectedVersion`.
  - Audita publish bloqueado e publish concluido sem incluir PHI.
- `components/dashboard/MealPlanEditor.tsx`
  - Substitui ativacao direta por fluxo "Revisar" / "Revisar e publicar".
  - Exibe modal "Revisao do plano" com blockers, warnings, macros e resumo por refeicao.
- `e2e/meal-plan-r6-publication-gate.spec.ts`
  - Cobre UI, API enforcement, stale exchange, conflito de versao e portal ativo.

## Validacoes Centrais

Blockers implementados:

- alimento sem referencia confirmada;
- alimento sem dados calculaveis;
- quantidade invalida;
- unidade estimada/generica;
- item estruturado sem papel nutricional;
- troca aprovada stale apos mudanca de quantidade;
- entrega oficial invalida;
- resumo nutricional incompleto;
- conflito objetivo com alergia/restricao estruturada de alergia;
- status invalido para publicacao.

Warnings implementados:

- diferenca relevante entre meta energetica e prescrito;
- diferenca relevante entre meta de macros e prescrito;
- restricoes nao alergicas para revisao clinica.

## Evidencias Visuais

- `reports/screenshots/meal-plan-r6-review-all-good-chromium-desktop.png`
- `reports/screenshots/meal-plan-r6-review-all-good-mobile-chrome.png`
- `reports/screenshots/meal-plan-r6-review-warning-chromium-desktop.png`
- `reports/screenshots/meal-plan-r6-review-warning-mobile-chrome.png`
- `reports/screenshots/meal-plan-r6-unresolved-food-chromium-desktop.png`
- `reports/screenshots/meal-plan-r6-unresolved-food-mobile-chrome.png`
- `reports/screenshots/meal-plan-r6-stale-exchange-chromium-desktop.png`
- `reports/screenshots/meal-plan-r6-stale-exchange-mobile-chrome.png`
- `reports/screenshots/meal-plan-r6-successful-publish-chromium-desktop.png`
- `reports/screenshots/meal-plan-r6-successful-publish-mobile-chrome.png`
- `reports/screenshots/meal-plan-r6-active-after-publish-chromium-desktop.png`
- `reports/screenshots/meal-plan-r6-active-after-publish-mobile-chrome.png`
- `reports/screenshots/meal-plan-r6-version-conflict-chromium-desktop.png`
- `reports/screenshots/meal-plan-r6-version-conflict-mobile-chrome.png`

## Regressao R1-R5

R6 preserva os contratos anteriores:

- R1: quantidades continuam indo pelo contrato de quantidade prescrito.
- R2: itens de template mantem slots e papeis estruturados.
- R3: editor continua operando em modo rascunho, com versao e concorrencia explicitas.
- R4: grupos de troca aprovados sao validados contra a quantidade atual.
- R5: portal/print seguem consumindo somente a versao ativa publicada.

## Pendencias Fora da R6

- Nenhuma evolucao de R7 iniciada.
- Script historico de versoes ja existe em `scripts/audit-meal-plan-version-consistency.ts`; nao foi duplicado nesta fase.
