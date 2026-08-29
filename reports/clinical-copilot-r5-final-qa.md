# Clinical Copilot R5.1 — Final QA / Release Closure

## Escopo entregue

Fecha os 3 blockers reais deixados pela R5: OPTIONS, COMBINATION e
revisão canônica aninhada, todos reaproveitando o domínio de refeição
flexível e o motor de nutrição JÁ existentes no Composer (nenhum tipo
paralelo, nenhuma segunda lógica de cálculo). Ver
`reports/clinical-copilot-r5-1-flex-architecture.md` para a auditoria
completa e as decisões de reuso; `-options.md`/`-combination.md`/
`-nested-review.md` para o detalhamento por seção do pedido;
`-performance.md` para batch resolution/N+1.

## Gates locais

| Gate | Resultado |
| --- | --- |
| TypeScript (`tsc --noEmit`) | PASS, 0 erros |
| ESLint (`eslint .`) | PASS, 0 erros/avisos |
| Build (`next build`) | PASS |
| Migração (`migrate:d1:check`) | PASS, 69 migrações validadas, 0 novas |
| Runtime DDL guard (`schema:runtime-check`) | PASS |
| Artifact check (`ci:artifact-check`) | PASS, 1254 arquivos rastreados |
| Full Vitest | 1987/1987 PASS (232 arquivos; 17 testes novos: 8 em `meal-plan-draft-flexible.test.ts`, 3 em `draft-nutrition.test.ts`, 6 em `meal-plan-changeset.test.ts`) |
| E2E dedicado R5.1 (`clinical-copilot-r5-1-flexible-structure.spec.ts`) | 3/3 PASS (chromium-desktop) — OPTIONS geração+aplicação, COMBINATION+revisão aninhada, SIMPLE sem regressão quando desmarcado |
| Regressão dedicada R3/R4/R5 (chromium-desktop) | 23/23 PASS, incluindo o cenário COMBINATION manual pré-existente do R3 |
| Broad E2E (chromium-desktop, single worker) | 214/214 PASS |
| Broad E2E (chromium-desktop + mobile-chrome, paralelo) | 422/428 PASS, 1 flaky (recuperado no retry, padrão já documentado), 1 skipped, 4 falhas classificadas |
| Migrations novas | 0 |
| Escritas em produção | 0 (shim SQLite local do E2E) |

## Classificação das 4 falhas em paralelo (seção 86 — reproduzir, nunca aceitar "flaky" automaticamente)

Todas as 4 ocorreram só no projeto `mobile-chrome`, sob paralelismo
default. Reproduzidas isoladamente (`--workers=1`):

- `meal-plan-reuse-r4-library.spec.ts` ("refeição salva...") e
  `meal-plan-substitution-r3-equivalent-quantity.spec.ts` ("medida
  caseira...") **passaram** quando isoladas — padrão de flake já
  documentado em `playwright.config.ts` (throughput do shim SQLite local
  sob paralelismo), não uma regressão.
- `ai-chat-widget-navigation-interference.spec.ts` e
  `clinical-copilot-r5-performance.spec.ts` **falharam mesmo isoladas**
  (violação de strict-mode do Playwright: dois botões "Fechar"
  ambíguos no viewport mobile). Para confirmar que NÃO foi introduzido
  por esta fase, os dois testes foram rodados isoladamente contra um
  worktree git limpo no commit-base exato da R5
  (`6155de6fd80524e072702c49d9df8d24c0e9b9e7`, ANTES de qualquer mudança
  de R5.1) — **falharam de forma idêntica**, confirmando que é um bug
  pré-existente, não relacionado a nenhum arquivo tocado nesta fase
  (nenhum dos dois specs, nem seus componentes de navegação/dialog, foram
  modificados por R5.1). Registrado aqui como dívida pré-existente
  conhecida, não escondida — fora do escopo desta fase corrigir.

## Cobertura por seção do pedido

- OPTIONS (seções 5-7, 55, 64-66): ver `-options.md`.
- COMBINATION (seções 8-10, 56, 67-69): ver `-combination.md`.
- Revisão aninhada / path / substituição isolada (seções 14-18, 30-31,
  57-58, 66, 69-70): ver `-nested-review.md`.
- IA nunca autoridade também aninhada (seções 12, 33, 59-60): testes
  explícitos em `tests/meal-plan-draft-flexible.test.ts` injetando
  `food_ref_id`/`kcal` falsos dentro de COMBINATION — descartados pelo
  schema estrito antes de qualquer outra lógica rodar.
- Changeset com estrutura flexível (seções 22-29, 61-63, 71-73): KEEP
  preserva estrutura inteira (generics do `mergeChangesetIntoMeals` já
  passam por qualquer shape de `TDraft`/`TExisting`, incluindo
  `options`/`choice_groups`, sem exigir mudança); MODIFY detecta
  corretamente quando uma refeição OPTIONS muda de conteúdo; ADD continua
  suportando qualquer estrutura por já não fazer suposição de shape;
  locked-item passa a olhar dentro de `options`/`choice_groups` também.
  Testado em `tests/meal-plan-changeset.test.ts`.
- No auto-save / no auto-publish (seções 40-41): reafirmado por
  construção — `applyAiDraft`/`applyAiChangeset` continuam só alterando
  estado LOCAL do Composer.
- Idempotência/concorrência (seções 45-47): herdadas intactas da R5
  (`generationRequestRef`/`generationInFlightRef` não foram tocados).
- Privacidade/auth/IDOR (seções 81-83): nenhuma rota nova, nenhum novo
  campo sensível — só `allowFlexibleStructure: boolean` numa rota já
  autenticada/rate-limited.
- Batch resolution / N+1 (seções 48-49, 51): ver `-performance.md`.
- Migração (seção 91): 0 novas, confirmado.

## Escopo conscientemente fora desta fase (documentado, não escondido)

- Progresso granular de 5 estágios visíveis — já documentado como fora de
  alcance na R5 (`clinical-copilot-r5-performance.md`), continua
  inalterado nesta fase.
- Fixture E2E de "draft grande" (6 refeições/30-50 itens) não construída
  — ver `-performance.md`, seção "Draft grande / N+1".
- Optimizer V2 (`draft-optimizer-v2.ts`) continua operando só sobre itens
  fixos (`meal.items`) — nunca foi pedido para ajustar quantidades dentro
  de `options`/`choice_groups` nesta fase; documentado em
  `lib/nutrition/draft-nutrition.ts` como limite de escopo consciente.
- `regenerateMealInDraft`/refinamento por linguagem natural continuam
  operando sobre a refeição como um todo (SIMPLE-first); regenerar uma
  única `option`/`choice_group` isoladamente não foi pedido nesta fase.
- Acessibilidade da revisão aninhada (seção 80) não recebeu uma auditoria
  dedicada de teclado/leitor de tela além do que a estrutura HTML nativa
  (botões/labels reais, sem custom widgets) já garante por herança do
  padrão usado no resto do wizard.
- Bug pré-existente de dois botões "Fechar" ambíguos no mobile (ver
  classificação de falhas acima) — não corrigido nesta fase (fora do
  escopo de R5.1, é uma questão de navegação/layout global, não do
  Clinical Copilot).

## Regra de conclusão

Todos os 3 blockers que impediam `CLINICAL_COPILOT_R5_COMPLETE: sim` na
R5 (OPTIONS, COMBINATION, revisão aninhada) estão implementados, testados
(unit + E2E reais, não fixtures triviais) e verificados sem regressão na
suíte completa. Os pontos "fora de escopo" acima são deliberados e
documentados — nenhum deles bloqueia os gates listados na seção 105 do
pedido original.
