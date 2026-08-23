# R4 - Meal Plan Exchange UX + Clinical Quality

Data: 2026-08-23

## 1. Current Architecture

- Auditoria detalhada: `reports/meal-plan-r4-exchange-current-state.md`.
- Caminho canônico: `meal_plan_items` -> drawer de Trocas -> `/exchange-groups` -> `exchange_groups` + `exchange_group_alternatives` -> portal/print somente com `APPROVED`.
- `meal_plan_substitutions` permanece como compatibilidade legada.

## 2. UX Before

- Drawer ainda expunha linguagem de "Alternativas", "grupo de troca", "troca direta" e "equivalência".
- Sugestões e aprovadas apareciam com menos separação clínica.
- Busca manual dependia de quantidade informada pela UI.

## 3. UX After

- Conceito único visível: Trocas.
- Drawer mostra alimento principal e prescrição no topo.
- Seções: Aprovadas primeiro, Sugestões depois.
- Sugestões iniciais limitadas a 3, com "Ver mais".
- Busca manual fica oculta até "+ Adicionar outra".
- "Pedir sugestão específica" usa fallback de busca no catálogo real, sem cálculo por IA.

## 4. Drawer States

- Normal: alimento principal, aprovadas, sugestões e ações secundárias.
- Empty: "Nenhuma troca cadastrada" com gerar sugestões.
- Error: mensagem clínica "Não foi possível gerar sugestões adequadas".
- Needs confirmation: "Confirme este alimento antes de gerar trocas".
- Non-calculable: "Este alimento ainda não possui dados suficientes para calcular trocas".
- Stale: "Trocas precisam ser atualizadas" com ação Atualizar.

## 5. Clinical Selection

- Review manual golden: `reports/meal-plan-r4-clinical-exchange-review.md`.
- Casos críticos cobertos: arroz, pão, feijão, frango, banana, brócolis e laticínios.
- Nenhum candidato `BAD` foi aceito no golden crítico.

## 6. Curated Integration

- `CURATED_EXCHANGE_LISTS_MODE` preservado.
- Nenhuma ativação global ON feita nesta fase.
- Curated lists continuam como elegibilidade/contexto, não aprovação.

## 7. Quantity Equivalence

- Geração automática continua usando motor existente.
- Adição manual agora calcula a quantidade equivalente no backend usando o alimento principal congelado no grupo e o alimento escolhido.
- Fallback determinístico por energia é usado quando o modo nutricional não resolve candidato manual isolado.

## 8. Restrictions

- Geração automática mantém `checkFoodAgainstPatientRestrictions`.
- Candidatos conflitantes continuam fora das sugestões.
- R4 não alterou o motor de restrições.

## 9. Stale/Recalculation

- Linha compacta mostra "Atualizar trocas" quando a gramatura do item diverge da gramatura congelada no grupo.
- Drawer mostra estado stale com botão Atualizar.
- Portal/print ignoram grupos aprovados stale quando há snapshot atual de gramas no plano.
- Mudança do alimento principal não herda grupos antigos porque o vínculo é por identidade fonte/ref.

## 10. Golden Cases

- Arroz no almoço: assert UI impede termos críticos nas sugestões principais.
- Pão no café: screenshot e fluxo visual gerados.
- Feijão: role Leguminosa preservado por R2 e drawer fotografado.
- Frango: drawer fotografado.
- Dataset de 30 casos registrado no review clínico.

## 11. Manual Review

- `clinicalPlausibilityRate`: 100%
- `contextAppropriateRate`: 100%
- `absurdCandidateRate`: 0%
- `duplicateRate`: 0%
- `familyDiversityRate`: 83%
- `nutritionToleranceRate`: 93%

## 12. E2E

- R4 drawer/golden/stale/manual approval: PASS.
- Aprovar 3, rejeitar 1, adicionar manual, reload e persistência: PASS.
- Mudança Arroz 120 g -> 150 g marca stale: PASS.

## 13. R1-R3 Regressions

- R1 quantidade/versionamento/portal-print: PASS.
- R2 roles/templates/listas: PASS.
- R3 editor compacto/drawer/read-only: PASS.

## 14. Screenshots

- `reports/screenshots/meal-plan-r4-arroz-drawer-chromium-desktop.png`
- `reports/screenshots/meal-plan-r4-arroz-drawer-mobile-chrome.png`
- `reports/screenshots/meal-plan-r4-pao-drawer-chromium-desktop.png`
- `reports/screenshots/meal-plan-r4-pao-drawer-mobile-chrome.png`
- `reports/screenshots/meal-plan-r4-feijao-drawer-chromium-desktop.png`
- `reports/screenshots/meal-plan-r4-feijao-drawer-mobile-chrome.png`
- `reports/screenshots/meal-plan-r4-frango-drawer-chromium-desktop.png`
- `reports/screenshots/meal-plan-r4-frango-drawer-mobile-chrome.png`
- `reports/screenshots/meal-plan-r4-approved-suggested-chromium-desktop.png`
- `reports/screenshots/meal-plan-r4-approved-suggested-mobile-chrome.png`
- `reports/screenshots/meal-plan-r4-empty-drawer-chromium-desktop.png`
- `reports/screenshots/meal-plan-r4-empty-drawer-mobile-chrome.png`
- `reports/screenshots/meal-plan-r4-stale-chromium-desktop.png`
- `reports/screenshots/meal-plan-r4-stale-mobile-chrome.png`

## 15. Gates

- `npm run ci:artifact-check`: PASS
- `npm run migrate:d1:check`: PASS - 67 migrações validadas
- `npm run schema:runtime-check`: PASS
- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- `npm test`: PASS - 201 arquivos, 1774 testes
- `npm run build`: PASS
- `npx playwright test e2e/meal-plan-r4-exchange-ux-quality.spec.ts`: PASS - 6 testes
- `npx playwright test e2e/meal-plan-r1-data-consistency.spec.ts e2e/meal-plan-r2-template-integrity.spec.ts e2e/meal-plan-r3-editor-ux.spec.ts`: PASS - 8 testes

## 16. Remaining Issues

- Screenshot dedicado de erro de geração não foi produzido como arquivo separado; o estado de erro foi implementado e coberto no componente, mas o artefato visual explícito fica recomendado para revisão manual posterior.
- IA interpretativa específica segue como fallback de busca no catálogo nesta fase; não há cálculo por IA nem aprovação automática.

## 17. R5 Readiness

- Portal/print permanecem compatíveis e prontos para revisão visual/paridade na R5.
- Dados aprovados já chegam filtrados por `APPROVED` e sem grupos stale quando há snapshot atual.

## Marcadores

R4_SINGLE_EXCHANGE_UX: PASS
R4_DRAWER_APPROVAL_FLOW: PASS
R4_MANUAL_SEARCH_FLOW: PASS
R4_CLINICAL_GOLDEN_CASES: PASS
R4_NO_BAD_GOLDEN_CANDIDATES: PASS
R4_QUANTITY_EQUIVALENCE: PASS
R4_STALE_RECALCULATION: PASS
R4_ACTIVE_DRAFT_ISOLATION: PASS
R4_PORTAL_PRINT_COMPATIBILITY: PASS
R4_R1_REGRESSION: PASS
R4_R2_REGRESSION: PASS
R4_R3_REGRESSION: PASS
R4_VISUAL_REVIEW_READY: sim
R4_FULL_GATES: PASS
MEAL_PLAN_R4_READY: sim
