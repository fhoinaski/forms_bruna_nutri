# R5 - Active Plan Delivery

## 1. Current State

Auditoria inicial registrada em `reports/meal-plan-r5-delivery-current-state.md`.

## 2. Canonical Delivery Model

Criado `lib/repositories/meal-plan-delivery.ts` com:

- `getActiveMealPlanDelivery(clientId)`
- `getMealPlanDeliveryPreview(planId)`
- `buildMealPlanDelivery(plan)`
- `normalizeMealPlanDelivery(delivery)`

O delivery usa o `MealPlanViewModel` canônico e expõe uma estrutura clínica normalizada para portal, print e testes.

## 3. Active Resolution

- Portal usa somente `getActiveMealPlanDelivery`.
- Print oficial, sem `planId`, usa somente `getActiveMealPlanDelivery`.
- Preview com `planId` continua separado e identificado como rascunho quando aplicável.
- Se houver múltiplos plans `active`, a camada de delivery retorna inválido em vez de escolher por `updated_at`.

## 4. Portal

- Portal recebe `versionId` e `activeVersionId`.
- Estado sem plano ativo: "Seu plano alimentar ainda não foi publicado."
- Erro/active inválido: "Não foi possível carregar seu plano agora."
- Interface não mostra controles administrativos, debug, scores ou termos internos.

## 5. Print

- Print oficial usa o mesmo delivery active-only.
- Print bloqueia plano active inválido com mensagem administrativa.
- CSS print preserva A4 portrait, margens e `break-inside: avoid` para refeições/itens.
- Preview de draft permanece explícito por query `planId`.

## 6. Approved Exchanges

- Portal/print entregam somente trocas aprovadas.
- `SUGGESTED`, `REJECTED`, stale e detalhes internos não entram no payload de entrega.
- Linguagem do paciente usa "Trocas disponíveis" e "Escolha 1 opção".

## 7. Version Isolation

Validação E2E:

- Active v2 com arroz 120 g.
- Draft v3 com arroz 150 g.
- Antes de publicar, portal mantém active v2.
- Preview com `planId` mostra draft separadamente.
- Depois de publicar, `/api/portal/me` passa a retornar a versão publicada.

## 8. Clinical Parity

`normalizeMealPlanDelivery` compara:

- `versionId`
- refeições
- horários
- itens
- food refs
- nomes
- quantidades
- unidades
- trocas aprovadas

A comparação é estrutural, não HTML.

## 9. Responsive UX

Screenshots gerados para portal desktop e mobile com plano ativo, trocas e estado sem plano ativo.

## 10. Print Pagination

Print mantém estrutura A4, sem botões no media print e com blocos de refeição evitando quebra interna. Screenshot de página de print foi gerado para revisão humana.

## 11. Accessibility

- Portal mantém hierarquia de headings.
- Botões e campos de login existentes preservados.
- Print usa estrutura HTML semântica com títulos de seção.

## 12. Error Handling

- Portal sem active não mostra draft.
- Portal com delivery inválido não expõe stack.
- Print oficial inválido mostra mensagem curta: "Este plano precisa de revisão antes de ser impresso."

## 13. Screenshots

- `reports/screenshots/meal-plan-r5-portal-chromium-desktop.png`
- `reports/screenshots/meal-plan-r5-portal-mobile-chrome.png`
- `reports/screenshots/meal-plan-r5-print-page1-chromium-desktop.png`
- `reports/screenshots/meal-plan-r5-print-page1-mobile-chrome.png`
- `reports/screenshots/meal-plan-r5-draft-vs-active-chromium-desktop.png`
- `reports/screenshots/meal-plan-r5-draft-vs-active-mobile-chrome.png`
- `reports/screenshots/meal-plan-r5-no-active-chromium-desktop.png`
- `reports/screenshots/meal-plan-r5-no-active-mobile-chrome.png`

## 14. E2E

- Portal active-only: PASS
- Print active-only: PASS
- Quantidades golden exatas: PASS
- Trocas aprovadas only: PASS
- Suggested/rejected ausentes: PASS
- Draft isolation e publish: PASS
- No active state: PASS

## 15. R1-R4 Regressions

- R1 data consistency: PASS
- R2 template integrity: PASS
- R3 editor UX: PASS
- R4 exchange UX and clinical quality: PASS

## 16. Remaining Issues

- Não foi gerado PDF binário real; a validação desta fase cobre a página de print/preview A4 no navegador. A geração/arquivo PDF pode ser endurecida em fase própria se houver endpoint dedicado.
- Screenshot multi-page dedicado não foi separado; a página de print usa regras de paginação e o screenshot full page fica disponível para revisão visual.

## 17. R6 Readiness

R6 pode reforçar gates preventivos antes da publicação:

- impedir publicação de active com item crítico unresolved;
- impedir publicação de active com troca stale;
- validar múltiplos active antes da escrita.

## Marcadores

R5_ACTIVE_PLAN_SOURCE: PASS
R5_PORTAL_ACTIVE_ONLY: PASS
R5_PRINT_ACTIVE_ONLY: PASS
R5_QUANTITY_PARITY: PASS
R5_APPROVED_EXCHANGES_ONLY: PASS
R5_PORTAL_PRINT_STRUCTURAL_PARITY: PASS
R5_DRAFT_ISOLATION: PASS
R5_PORTAL_MOBILE_UX: PASS
R5_PRINT_A4_UX: PASS
R5_ERROR_HANDLING: PASS
R5_R1_REGRESSION: PASS
R5_R2_REGRESSION: PASS
R5_R3_REGRESSION: PASS
R5_R4_REGRESSION: PASS
R5_VISUAL_REVIEW_READY: sim
R5_FULL_GATES: PASS
MEAL_PLAN_R5_READY: sim
