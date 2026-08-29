# R6.5.6 — Reuse Library Final QA + Release Closure — Auditoria

## Modo desta fase

Conforme instruído: **VERIFY / FIX ONLY IF PROVEN / RELEASE CLOSURE.** Nenhum
redesign novo foi feito. O redesign da Biblioteca de Reuso (4 abas: Itens/
Refeições/Planos/Modelos) já existia neste worktree como diff não commitado
(`components/dashboard/ReuseLibraryDrawer.tsx`, 424 linhas alteradas: 45
inserções / 379 remoções, reduzindo o componente antigo de 386 linhas para
uma versão densa de ~52 linhas) sobre a base `8ab4e55` (HEAD de R6.5.5,
mesclado). Este relatório documenta a verificação independente desse
trabalho e os bugs reais encontrados e corrigidos — nunca um redesign.

## Reivindicações originais vs. verificação independente

| Reivindicação original | Verificação independente | Resultado |
| --- | --- | --- |
| 4 abas compactas (Itens/Refeições/Planos/Modelos) | Leitura completa do diff + E2E | CONFIRMADO real |
| Recentes/Favoritos como filtro dentro de Itens (não aba) | Leitura do diff + E2E | CONFIRMADO real |
| Metadados reais, loading skeleton, empty/error+retry | Leitura do diff + E2E (estados) | CONFIRMADO real |
| Busca limitada às coleções já carregadas/buscáveis | Leitura do diff | CONFIRMADO (client-side filter sobre dados já buscados) |
| Foco inicial, Escape, focus-trap, navegação por seta entre abas | Leitura do diff (reutiliza `useDialogKeyboard` de R6.5.3) + E2E | CONFIRMADO real |
| Limpeza de snapshot preservada | Leitura do diff (`clean`/`cleanMeal`) | CONFIRMADO idêntico à lógica anterior |
| SIMPLE/OPTIONS/COMBINATION preservados | E2E (nenhuma mudança na lógica do Composer) | CONFIRMADO |
| Zero mudanças de DB/API/persistência/semântica de clone | `git status` em `db/`, leitura do componente | CONFIRMADO (0 migrations novas) |
| `tests/meal-plan-reuse-r4-routes.test.ts`: 13/13 PASS | `npx vitest run` no arquivo | CONFIRMADO |
| TypeScript: PASS | `npx tsc --noEmit` (após `npm install`, ausente inicialmente) | CONFIRMADO |
| **Lint: PASS** | `npx eslint` | **FALSO — 4 erros reais encontrados e corrigidos** (ver Bug 1) |

## Bugs reais encontrados e corrigidos (5)

### Bug 1 — Lint: falso positivo de `react-hooks/rules-of-hooks`
Três funções auxiliares comuns (não hooks) nomeadas com prefixo `use`
(`useFood`, `useSaved`, `useTemplate`) eram chamadas dentro de callbacks
`onClick`, disparando a heurística de nome do ESLint. Corrigido via
renomeação simples: `applyFood`, `applySavedMeal`, `applyTemplate`. Isso
**contradiz diretamente** a reivindicação original de "Lint: PASS".

### Bug 2 — Acessibilidade: botões "Usar"/"Adicionar" sem nome acessível ligado à refeição
Nas abas "Refeições" e "Planos", o nome da refeição está em um `<p>`/`<span>`
de texto puro, e o botão de ação real (`Usar`/`Adicionar`) não carregava
nenhum nome acessível que o identificasse — ao contrário da aba "Itens",
onde a linha inteira é um `<button>` nomeado. Isso quebra tanto os
seletores de teste baseados em nome acessível quanto a acessibilidade real
(um usuário de leitor de tela não conseguia saber a qual refeição um botão
"Usar" isolado se referia). Corrigido com
`aria-label={`Usar ${meal.name}`}` e `aria-label={`Adicionar ${meal.name}`}`.

### Bug 3 — Deriva de texto no estado vazio da aba "Planos"
O texto pós-redesign era `"Nenhum plano anterior."`, mas o contrato de
teste estabelecido (e o texto pré-redesign) era
`"Nenhum outro plano deste paciente ainda."` (regex `/nenhum outro plano/i`).
Restaurado ao texto original.

### Bug 4 — Seletores obsoletos em `e2e/meal-plan-reuse-r4-performance.spec.ts`
Este arquivo não foi atualizado quando o redesign renomeou a aba "Modelos
de planos" → "Modelos" e o `aria-label` do campo de busca de "Buscar na
biblioteca de reuso" → "Buscar na biblioteca" (ao contrário de
`meal-plan-reuse-r4-library.spec.ts`, que FOI atualizado corretamente).
Corrigido para usar os rótulos atuais.

### Bug 5 — Colisão de dados de teste em `meal-plan-reuse-r4-library.spec.ts`
`/api/admin/saved-meals` é uma lista global (não escopada por paciente). O
teste usava um nome literal fixo (`"Refeição modelo R4 salva"`) para a
refeição salva; uma vez que o Bug 2 foi corrigido (o botão passou a ter um
nome acessível igual ao nome da refeição), execuções concorrentes
(múltiplos projetos do Playwright rodando em paralelo, ou retries que não
limpam o estado do backend entre tentativas) passaram a criar múltiplas
refeições salvas com o nome idêntico, causando uma violação de "strict
mode" (`resolved to N elements`) ao tentar localizar o botão. Corrigido
tornando o nome único por execução: `` `Refeição modelo R4 salva ${patient.id}` ``.

## Achado adicional (fora de escopo, documentado, não corrigido)

Ao investigar a lista histórica de "flakes conhecidos" com reexecução em
isolamento (disciplina "provar antes de chamar de flake"), descobriu-se que
3 dos 4 itens da lista **não são flakes intermitentes** — são bugs reais e
**determinísticos**, específicos do viewport mobile, em código totalmente
não relacionado a esta fase:

- `ai-chat-widget-navigation-interference.spec.ts`: o botão "Abrir
  Assistente de IA" fica fora da viewport mobile (falha 100% das vezes em
  `mobile-chrome`, passa 100% em `chromium-desktop`).
- `clinical-copilot-r5-performance.spec.ts`: violação de strict-mode —
  `getByRole('button', { name: 'Fechar' })` resolve para 2 elementos
  simultâneos no mobile (`"Fechar menu"` do menu global + o botão "Fechar"
  do próprio diálogo do Copilot).
- `meal-plan-substitution-r3-equivalent-quantity.spec.ts` (caso "medida
  caseira"): colisão de dado de teste global (medida customizada para
  TACO/129) entre os dois projetos do Playwright rodando na mesma sessão —
  o MESMO padrão de causa raiz do Bug 5 acima, porém em outro subsistema
  (motor de substituição R3), fora do escopo desta fase.

Estes 3 itens foram documentados como um novo gap rastreado para uma fase
futura (ver `reports/meal-plan-ui-r6-5-final-qa.md`) — não foram corrigidos
aqui, pois nenhum toca `ReuseLibraryDrawer.tsx` ou rotas de reuso, e o
mandato desta fase é estritamente Biblioteca de Reuso.

## Cobertura de verificação executada

- TypeScript: limpo (`npx tsc --noEmit`).
- Lint: limpo após correção do Bug 1.
- Build de produção: sucesso.
- `tests/meal-plan-reuse-r4-routes.test.ts`: 13/13 PASS.
- Vitest suíte completa: 2 de 3 execuções corretamente escopadas limpas em
  2017/2017 testes (235 arquivos); 1 execução com 41 falhas em 19 arquivos
  não relacionados a `ReuseLibraryDrawer.tsx`, atribuída a limite de
  throughput do shim D1/SQLite sob contenção de workers paralelos (causa já
  documentada no histórico do projeto).
- E2E `meal-plan-reuse-r4-library.spec.ts` isolado: 8/8 PASS (após as
  correções).
- E2E `meal-plan-reuse-r4-performance.spec.ts` isolado: 2/2 PASS (após a
  correção), com números reais de performance capturados (ver relatório de
  performance).
- E2E de linhagem (17 specs cobrindo R3/R4/R5/R6/R6.5.2–R6.5.5),
  `--workers=1`: 67 passed / 1 failed na primeira rodada (o Bug 4, já
  corrigido) → limpo na rerodada.
- E2E completo single-worker (`chromium-desktop`): 248/248 PASS, zero
  regressão em todo o produto.
- E2E completo paralelo (ambos os projetos, 2 rodadas): confirmado que a
  violação de strict-mode da biblioteca de reuso desapareceu após o Bug 5
  ser corrigido; os únicos failures remanescentes são os 3 itens
  pré-existentes documentados acima (determinísticos em mobile, não
  relacionados) e 1 teste flaky transitório (`clinical-copilot-r5-
  readiness-changeset.spec.ts`, autocurado no retry, timeout sob carga —
  não relacionado à biblioteca de reuso).
- Gate de migrations: 71 arquivos em `db/`, 0 novos, `git status db/`
  limpo — PASS.

## Conclusão

`MEAL_PLAN_UI_R6_5_6_COMPLETE: sim` para o escopo desta fase (verificar +
corrigir apenas a Biblioteca de Reuso). O redesign de 4 abas está
genuinamente implementado, testado e agora livre dos 5 bugs reais
encontrados. `MEAL_PLAN_UI_R6_5_COMPLETE` (visão geral de todas as fases)
permanece `nao` — ver `reports/meal-plan-ui-r6-5-final-qa.md` para os gaps
restantes (Food Search, Substituição R3, Receitas R6, Copilot stepper,
extração de design system, e os 3 bugs mobile pré-existentes recém-
esclarecidos).
