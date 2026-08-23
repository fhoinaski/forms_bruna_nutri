# Meal Plan R7 - Final QA e Go/No-Go

Data: 2026-08-23

## Decisao

MEAL_PLAN_FINAL_GO_LIVE: NO-GO

O fluxo critico do Plano Alimentar passou em R1-R7, incluindo template, rascunho, editor, identidade de alimento, quantidades, trocas, save/reload, review, publish, active, portal e print. Mesmo assim, a release final fica bloqueada porque a suite E2E completa `chromium-desktop` falhou.

## Escopo R7

Validado:

- template para rascunho;
- integridade de alimentos e quantidades;
- editor ativo versus rascunho;
- trocas aprovadas/rejeitadas/stale;
- gate de publicacao;
- active delivery;
- portal;
- print;
- seguranca de ownership em rotas de grupos de troca;
- gates completos de codigo, schema, build, unit e E2E.

Nao foram criadas features. As alteracoes de codigo em R7 ficaram restritas a correcao P0/P1 e testes/documentacao.

## Correcoes feitas em R7

P0 corrigido:

- Rotas de exchange groups agora validam que `mealPlanId` e `groupId` pertencem ao `clientId` da URL antes de GET/POST/PATCH/DELETE.

P1 corrigido:

- Editor compacto em plano ativo nao expoe mais input oculto de quantidade em modo read-only.

Cobertura adicionada:

- `tests/meal-plan-r7-final-qa.test.ts`
- `e2e/meal-plan-r7-final-qa.spec.ts`

## Plano golden

Plano validado:

- Cafe da manha: pao 50 g, ovo 100 g, banana 80 g.
- Almoco ativo inicial: arroz 120 g, feijao 100 g, frango 120 g, brocolis 100 g.
- Rascunho publicado depois: arroz 150 g, feijao 100 g, frango 120 g, brocolis 100 g.
- Jantar: batata 150 g, peixe 130 g, vegetal 120 g.

Resultado: PASS.

## Template integrity

Seed de templates rodou duas vezes com upsert/update e sem sinal de duplicacao. Migrations validadas: 67. Ultima migration: `20260823_0067_meal_template_integrity_contract.sql`.

Resultado: PASS.

## Quantidades

As quantidades prescritas foram mantidas no editor, no save/reload, no active delivery, no portal e no print. O portal manteve 120 g enquanto havia rascunho com 150 g; apos publish, portal e print passaram para 150 g.

Resultado: PASS.

## Active/draft isolation

Validado:

- Rascunho nao aparece no portal antes da publicacao.
- Preview administrativo de rascunho permanece separado por `planId`.
- Novo active arquiva o active anterior.
- Delivery falha fechado se houver multiplos active.

Resultado: PASS.

## Food identity

Validado que nomes, refs e roles clinicos permanecem coerentes no plano golden. O teste tambem bloqueia publicacao com alimento nao resolvido.

Resultado: PASS.

## Editor UX

Validado:

- Plano ativo compacto e read-only.
- Rascunho editavel.
- Save/reload preserva quantidade.
- Estado de blocker retorna o profissional para edicao.

Resultado: PASS.

## Exchange UX

Validado:

- Drawer de trocas abre com candidatos relevantes.
- Alternativas podem ser aprovadas, rejeitadas e adicionadas manualmente.
- Plano ativo mostra trocas como leitura.
- Alteracao de quantidade primaria torna troca aprovada stale e bloqueia publish.

Resultado: PASS.

## Exchange clinical quality

Para arroz em refeicao principal, a lista validada nao trouxe candidatos ruins como farinha, mingau, cereal infantil, bolo ou biscoito. Candidatos exibidos ficaram no grupo clinico de amidos principais, com quantidades equivalentes calculadas.

Resultado: PASS.

## Publication gate

Validado:

- Review all-good permite publicar.
- Alimento nao resolvido bloqueia.
- Troca stale bloqueia.
- Publicacao direta pela API revalida o plano.
- Conflito de versao exige nova revisao.

Resultado: PASS.

## Portal

Portal validado em desktop/mobile. Nao exibe controles administrativos, scores, debug ou termos internos. Mostra somente plano ativo aprovado.

Resultado: PASS.

## Print

Print oficial validado com plano ativo, resumo nutricional, refeicoes e quantidades. A pagina usa a mesma fonte de delivery do portal.

Observacao visual P2: o screenshot de navegador mostra o botao "Imprimir / Salvar PDF" fora da area do documento. Confirmar em validacao manual de impressao real que `@media print` remove controles de tela.

Resultado: PASS.

## Portal/print parity

Portal e print mostram a mesma versao publicada e as mesmas quantidades do cenario final. Alternativas rejeitadas e pendentes nao aparecem na entrega ao paciente.

Resultado: PASS.

## Seguranca

Validado:

- `GET /clients/A/meal-plans/exchange-groups?mealPlanId=planB`: 404.
- `POST /clients/A/meal-plans/exchange-groups` com `mealPlanId=planB`: 404.
- `PATCH /clients/A/meal-plans/exchange-groups/groupB`: 404.
- Multiple active no delivery: falha fechado.

Resultado: PASS.

## Gates executados

- `npm run ci:artifact-check`: PASS.
- `npm run migrate:d1:check`: PASS.
- `npm run schema:runtime-check`: PASS.
- `npm run lint`: PASS.
- `npx tsc --noEmit`: PASS.
- `npm test`: PASS, 204 arquivos / 1785 testes.
- `npm run build`: PASS.
- `npm run migrate:d1`: PASS, banco ja atualizado.
- `npm run seed:templates`: PASS, duas execucoes idempotentes.
- `git diff --check`: PASS, somente avisos de LF/CRLF.

## E2E critico R1-R7

Comando:

`npx playwright test e2e/meal-plan-r1-data-consistency.spec.ts e2e/meal-plan-r2-template-integrity.spec.ts e2e/meal-plan-r3-editor-ux.spec.ts e2e/meal-plan-r4-exchange-ux-quality.spec.ts e2e/meal-plan-r5-active-delivery.spec.ts e2e/meal-plan-r6-publication-gate.spec.ts e2e/meal-plan-r7-final-qa.spec.ts`

Resultado: PASS, 32 testes em 1.8 min.

## Full E2E

Comando:

`npm run test:e2e -- --project=chromium-desktop`

Resultado: FAIL, 92 passou / 28 falhou em 6.5 min.

Classificacao inicial:

- A maioria das falhas esta em specs antigas de Meal Plan com seletores/atalhos anteriores ao gate de publicacao e ao editor compacto.
- Exemplos: `meal-plan-ai-wizard-complete`, `meal-plan-full-cycle`, `meal-plan-recipe-portion-print`, `meal-plan-substitutions`, `meal-plan-ux2`, `meal-plan-wizard-*`, `meal-plan.spec`.
- A falha permanece bloqueadora de release ate atualizacao dos testes ou confirmacao objetiva de que nao representam regressao real.

## D1 e dados

Sanity D1:

- Planos active: 4.
- Planos draft: 13.
- Clientes com multiplos active: 0.
- Templates SYSTEM active: 23.
- Templates SYSTEM inactive: 10.
- Templates USER active: 1.
- Templates USER inactive: 11.

Resultado: PASS.

## Saude operacional

`/api/health` retornou 200 com `ok=true`. Caveat: o endpoint checa ambiente, nao prova conectividade D1 completa.

Resultado: PASS com observacao.

## Backup e rollback

`scripts/backup-d1.mjs` existe e exporta D1 criptografado com `BACKUP_ENCRYPTION_KEY`. Backup real nao foi executado nesta auditoria para evitar gerar arquivo clinico fora de uma janela operacional aprovada.

Rollback documentado em `docs/MEAL-PLAN-RUNBOOK.md`.

## Screenshots

Evidencias R7 geradas em `reports/screenshots`:

- active desktop/mobile;
- draft desktop/mobile;
- edit item desktop/mobile;
- exchange drawer desktop/mobile;
- review all-good desktop/mobile;
- review blocker desktop/mobile;
- portal mobile 375/390/430;
- portal desktop;
- print A4;
- multipage print.

## Aceitacao visual

Revisao visual manual:

- Active desktop: PASS.
- Exchange drawer: PASS.
- Portal mobile 390: PASS.
- Print A4: PASS com observacao P2 sobre controle visual no screenshot.
- Review blocker: PASS.

Resultado: PASS.

## Simulacao clinica manual

Simulacao validou criacao, adaptacao, revisao, publicacao e entrega ao paciente com controle do nutricionista. IA nao foi usada para calcular nutrientes ou publicar.

Resultado: PASS.

## Pendencias

P0 remaining: 0.

P1 remaining: 1.

- Full E2E desktop falha e bloqueia confianca de release. Corrigir ou reclassificar as 28 falhas com evidencia.

P2 remaining: 2.

- Confirmar remocao de controles de tela em impressao real/PDF.
- Considerar ampliar `/api/health` para checar D1 em smoke operacional.

## Marcadores finais

R7_GOLDEN_PLAN: PASS
R7_TEMPLATE_INTEGRITY: PASS
R7_QUANTITY_PARITY: PASS
R7_ACTIVE_DRAFT_ISOLATION: PASS
R7_FOOD_IDENTITY: PASS
R7_EDITOR_UX: PASS
R7_EXCHANGE_UX: PASS
R7_EXCHANGE_CLINICAL_QUALITY: PASS
R7_PUBLICATION_GATE: PASS
R7_PORTAL: PASS
R7_PRINT: PASS
R7_PORTAL_PRINT_PARITY: PASS
R7_SECURITY: PASS
R7_FULL_UNIT_SUITE: PASS
R7_FULL_E2E_SUITE: FAIL
R7_VISUAL_ACCEPTANCE: PASS
R7_MANUAL_CLINICAL_SIMULATION: PASS
R7_P0_REMAINING: 0
R7_P1_REMAINING: 1
R7_P2_REMAINING: 2
MEAL_PLAN_FINAL_GO_LIVE: NO-GO
MEAL_PLAN_RESTRUCTURE_READY: nao
