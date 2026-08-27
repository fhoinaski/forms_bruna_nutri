# Patient Record P5/P6 — E2E Stabilization (follow-up de task_d6b637dd)

## Origem

CI autoritativo do PR #3 (Meal Plan Composer R2, [forms_bruna_nutri#3](https://github.com/fhoinaski/forms_bruna_nutri/pull/3)) reportou 3 falhas de E2E, todas em `patient-record-p5-anthropometry.spec.ts`/`patient-record-p6-integrations.spec.ts` — área nunca tocada pelo diff do Composer R2. Classificado como **PRE-EXISTING MAIN BUG**, isolado deste follow-up.

## As 3 falhas originais (reproduzidas na mesma `main`)

| # | Spec / teste | Erro | Esperado | Recebido |
| --- | --- | --- | --- | --- |
| 1 | `patient-record-p5-anthropometry.spec.ts:87` — "first comparison shows current versus first golden deltas" | `strict mode violation: getByRole("button", { name: "Primeira" })` resolveu 2 elementos | 1 elemento (botão "Primeira" do painel de progresso) | 2 elementos: o botão do painel **e** "Iniciar primeira consulta" do cabeçalho (bate por substring) |
| 2 | `patient-record-p6-integrations.spec.ts:17` — "overview keeps clinical quick actions compact..." | `element(s) not found` | Botão "Iniciar consulta" dentro de `patient-record-overview` | Nenhum — essas ações não existem mais ali |
| 3 | `patient-record-p6-integrations.spec.ts:49` — "protocol and supplementation summaries use real empty states" | `element(s) not found` | Texto "Nenhum plano ativo" | Nenhum — o texto real hoje é "Nenhum plano" |

## Root cause (classificado por item)

1. **SELECTOR_BUG** — `page.getByRole("button", { name: "Primeira" })` sem escopo. Por padrão o Playwright casa por substring no nome acessível; "Iniciar primeira consulta" (cabeçalho) contém "primeira" e também casou. Nunca foi um bug de produto.
2. **SELECTOR_BUG (staleness)** — `lib/patient-record/workspace-state.ts` centraliza as ações rápidas (`nextBestAction`/`secondaryActions`) no **cabeçalho** do paciente, deliberadamente (comentário no código: *"Keeping this decision here prevents competing CTAs from reappearing in each card"*). O teste ainda procurava por "Iniciar consulta"/"Nova avaliação"/"Abrir plano" **dentro** de `patient-record-overview`, onde essas ações não existem — e usava nomes que nem correspondem ao estado real de um paciente novo (que mostra "Iniciar primeira consulta" e "Criar plano", não "Iniciar consulta"/"Abrir plano", que só aparecem quando já há consulta anterior/plano ativo).
3. **SELECTOR_BUG (staleness)** — o card "Plano alimentar" (`SummaryCard`, seção "Resumo do prontuário") mostra o valor `"Nenhum plano"` quando não há rascunho nem plano ativo (`app/dashboard/clients/[id]/ClientWorkspace.tsx`, `value={summary.activeMealPlan ? ... : summary.draftMealPlan ? ... : "Nenhum plano"}`). "Nenhum plano ativo" nunca foi o texto real desse estado nesta versão do produto.

Nenhuma das 3 é um bug de produto. Nenhum contrato/semântica de Patient Record foi alterado — só os testes foram atualizados para refletir o comportamento real e já intencional da UI atual.

## Minimal fix

- `e2e/patient-record-p5-anthropometry.spec.ts`: escopar o clique ao `getByTestId("anthropometry-progress-panel")` antes de `getByRole("button", { name: "Primeira" })`.
- `e2e/patient-record-p6-integrations.spec.ts`:
  - Teste 1: trocar as 3 asserções por `header.getByRole("button", { name: "Iniciar primeira consulta" | "Nova avaliação" | "Criar plano" })`, escopadas ao `<header>` real do workspace (onde as ações realmente vivem).
  - Teste 3: trocar `"Nenhum plano ativo"` por `"Nenhum plano"` (`exact: true`).

Nenhum arquivo de produto foi tocado.

## Verificação

- TypeScript: PASS
- ESLint (arquivos alterados): PASS
- Build: PASS
- Full Vitest: **1911/1911 PASS** (nenhum código compartilhado mudou; rodado mesmo assim, por completude)
- Os 2 specs corrigidos, `--repeat-each=3`: **30/30 PASS** (10 testes × 3 repetições, incluindo os 2 testes que falhavam)
- Regressão ampla de Patient Record (P1–P6) + auth/IDOR: **57/57 PASS**
- Regressão cross-domain (Food Search/Central de Alimentos): **5/5 PASS**
- Novas migrations: 0. Escritas em produção: 0 (shim SQLite local do E2E).

## Isolamento do commit

Branch própria a partir de `main` (`fix/patient-record-p5-p6-e2e`), sem incluir nenhuma mudança de Meal Plan Composer R2, F9 ou Clinical Copilot (que estavam presentes, não commitadas, no mesmo worktree) — `git add` explícito de exatamente 2 arquivos, ambos specs de E2E.

```text
PATIENT_RECORD_P5_P6_COMMIT_SHA: c877b532d723c90faf8ea0f8f6866f3ddc2f9030
```

## CI autoritativo (PR #4)

Branch publicada sem force-push; PR aberta ([`forms_bruna_nutri#4`](https://github.com/fhoinaski/forms_bruna_nutri/pull/4)) pra acionar o workflow (só roda em `push` pra `main` ou `pull_request`). CI rodou **exatamente na SHA `c877b532d723c90faf8ea0f8f6866f3ddc2f9030`** — [run 33033828311](https://github.com/fhoinaski/forms_bruna_nutri/actions/runs/33033828311):

| Etapa | Resultado |
| --- | --- |
| Guard against large database artifacts | PASS |
| Validate migrations | PASS |
| Block runtime DDL | PASS |
| Lint | PASS |
| Unit and API tests | PASS |
| Typecheck | PASS |
| Build | PASS |
| E2E tests (Playwright) | **PASS** |

**CI 100% verde** — nenhuma falha remanescente.

## Impacto no Meal Plan Composer R2

Zero. Nenhum arquivo do Composer R2 foi tocado por este fix; a branch/commit é totalmente independente da branch `codex/meal-plan-composer-r2`.

## Markers

```text
PATIENT_RECORD_P5_P6_ORIGINAL_FAILURES: 3
PATIENT_RECORD_P5_P6_ROOT_CAUSE_1: SELECTOR_BUG
PATIENT_RECORD_P5_P6_ROOT_CAUSE_2: SELECTOR_BUG
PATIENT_RECORD_P5_P6_ROOT_CAUSE_3: SELECTOR_BUG
PATIENT_RECORD_P5_P6_FIX_SCOPE_ISOLATED: PASS
PATIENT_RECORD_P5_P6_FAILING_TESTS_AFTER_FIX: 0
PATIENT_RECORD_P5_P6_REPEAT_RUNS: 30/30
PATIENT_RECORD_P5_P6_REGRESSION: PASS
PATIENT_RECORD_P5_P6_TYPESCRIPT: PASS
PATIENT_RECORD_P5_P6_LINT: PASS
PATIENT_RECORD_P5_P6_UNIT: PASS
PATIENT_RECORD_P5_P6_BUILD: PASS
PATIENT_RECORD_P5_P6_NEW_MIGRATIONS: 0
PATIENT_RECORD_P5_P6_PRODUCTION_WRITES: 0
PATIENT_RECORD_P5_P6_COMMIT_SHA: c877b532d723c90faf8ea0f8f6866f3ddc2f9030
PATIENT_RECORD_P5_P6_CI_EXACT_REVISION: PASS
PATIENT_RECORD_P5_P6_CI_E2E: PASS
PATIENT_RECORD_P5_P6_READY_FOR_MAIN: sim
R2_PR3_POST_FIX_CI: BLOCKED
R2_PR3_PLAYWRIGHT: BLOCKED
MEAL_PLAN_COMPOSER_R2_COMPLETE: nao
MEAL_PLAN_SUBSTITUTION_R3_SAFE_TO_START: nao
```

## Por que `R2_PR3_POST_FIX_CI`/`R2_PR3_PLAYWRIGHT` continuam `BLOCKED`

Este fix (PR #4) está pronto e verde, mas ainda não está em `main` — mergear é uma ação visível/compartilhada que exige confirmação explícita do usuário antes que eu (ou qualquer automação) a execute. Depois que PR #4 for mergeado em `main`, o PR #3 (Composer R2) precisa de uma nova rodada de CI contra o `main` atualizado (rebase/merge de `main` no branch da R2, ou reabrir a base do PR) pra provar que os 3 failures desapareceram — só então `MEAL_PLAN_COMPOSER_R2_COMPLETE` pode virar `sim`.
