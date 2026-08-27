# Clinical Copilot R5 — Final QA / Release Closure

## Escopo entregue

Contrato de prontidão explícito (NOT_READY/READY_WITH_REVIEW/READY), modo
"Usar plano anterior como base" com changeset KEEP/MODIFY/ADD/REMOVE
respeitando itens/refeições bloqueados, novo ponto de entrada "Criar com
IA" para pacientes que já têm plano (gap real descoberto durante a
implementação), idempotência/segurança contra resposta obsoleta na
geração, e testes explícitos adicionais provando que a IA nunca é
autoridade sobre identidade canônica. OPTIONS/COMBINATION na geração por
IA foi deliberadamente deixado para uma fase R5.1 (aprovado
explicitamente) — ver `reports/clinical-copilot-r5-architecture.md`.

## Gates locais

| Gate | Resultado |
| --- | --- |
| TypeScript (`tsc --noEmit`) | PASS, 0 erros |
| ESLint (`eslint .`) | PASS, 0 erros/avisos |
| Build (`next build`) | PASS |
| Migração (`migrate:d1:check`) | PASS, 0 novas |
| Runtime DDL guard (`schema:runtime-check`) | PASS |
| Artifact check | PASS |
| Full Vitest | 1970/1970 PASS (231 arquivos) |
| E2E dedicado R5 (`clinical-copilot-r5-readiness-changeset.spec.ts`) | 4/4 PASS |
| E2E performance R5 | PASS, métricas registradas |
| Regressão dos specs de IA/wizard pré-existentes (17 testes) | 17/17 PASS |
| Regressão ampla (suíte completa) | 209/210 PASS (1 flaky recuperado no retry, arquivo não relacionado — `clients.spec.ts`, isolamento de paciente, throughput do shim de E2E sob paralelismo, padrão já documentado em `playwright.config.ts`) |
| Migrations novas | 0 |
| Escritas em produção | 0 (shim SQLite local do E2E) |

## Cobertura por seção do pedido

- Readiness (NOT_READY/READY_WITH_REVIEW/READY): `tests/meal-plan-readiness.test.ts`
  (8) + E2E dedicado.
- Changeset (KEEP/MODIFY/ADD/REMOVE, locks, casamento por nome, merge):
  `tests/meal-plan-changeset.test.ts` (13) + E2E dedicado.
- IA nunca autoridade (nutrientes/ids/alimento inventado): já coberto
  extensivamente por `tests/ai-meal-plan-draft-agent.test.ts` (pré-existente,
  regressão confirmada) + 2 casos novos em `tests/clinical-copilot-r5-authority.test.ts`.
- SIMPLE, resolução canônica (AUTO_MATCH/REVIEW_REQUIRED/NOT_FOUND),
  preservação de preparo, publish gate: auditado e confirmado já correto,
  sem necessidade de mudança — regressão via `e2e/meal-plan-wizard-*.spec.ts`
  (12 testes, todos PASS).
- Compatibilidade com R3 (equivalência/substituição): nenhuma alteração
  tocou `ExchangeGroupPanel`/`equivalent-quantity.ts` — a suíte
  `meal-plan-substitution-r3-equivalent-quantity.spec.ts` rodou como parte
  da regressão ampla e continua 100% PASS, confirmando que um item aplicado
  pelo Copilot (via draft ou via changeset) continua funcionando
  normalmente com o motor de equivalência.
- Compatibilidade com R4 (reuso/templates): idem — nenhuma alteração tocou
  `ReuseLibraryDrawer`/repositórios de favoritos/refeições salvas; a suíte
  `meal-plan-reuse-r4-library.spec.ts` rodou como parte da regressão ampla
  e continua 100% PASS.
- Auth/IDOR: nenhuma rota nova criada (só um campo opcional adicional numa
  rota já autenticada) — nenhuma superfície nova de risco.
- Sem auto-save/auto-publish: reafirmado por construção — tanto o modo
  "criar novo" quanto o modo "plano anterior" só alteram o estado LOCAL do
  Composer (`applyAiDraft`/`applyAiChangeset`); persistência e publicação
  continuam exigindo os cliques explícitos já existentes.

## Escopo conscientemente fora desta fase

- OPTIONS/COMBINATION na geração por IA (com revisão aninhada) — R5.1.
- Progresso em múltiplos estágios visíveis (só 2 dos 5 estágios pedidos
  são hoje observáveis sem reformular o backend para streaming) — ver
  `reports/clinical-copilot-r5-performance.md`.
- Recipes, analytics avançado, ajuste clínico automático, ranking clínico
  por IA, auto-publish — todos explicitamente fora do escopo pedido, não
  iniciados.

## Regra de conclusão

Como OPTIONS/COMBINATION na geração por IA (seções 65/66/67) NÃO foi
implementado nesta fase (decisão explícita, aprovada), a regra de
conclusão original do pedido não pode ser satisfeita integralmente. Os
marcadores finais refletem isso honestamente: `CLINICAL_COPILOT_R5_OPTIONS`
e `CLINICAL_COPILOT_R5_COMBINATION` são `FAIL` (não implementado, não uma
falha de qualidade), e `CLINICAL_COPILOT_R5_COMPLETE: nao` — sem esconder
nada. Todo o restante do escopo aprovado está PASS.
