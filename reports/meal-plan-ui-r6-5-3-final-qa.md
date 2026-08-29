# Meal Plan Composer UX/UI R6.5.3 — Final QA / Release Closure

## Escopo entregue

1. **Hook de teclado compartilhado** (`hooks/use-dialog-keyboard.ts`),
   extraído de 2 implementações duplicadas (drawer de trocas,
   biblioteca de reuso — refatoração, comportamento preservado).
2. **Retrofit real de acessibilidade** em 2 diálogos que não tinham
   NENHUM tratamento de teclado antes: Assistente de IA (Copilot) e
   modal "Inserir receita" — agora Escape fecha e Tab não escapa em
   ambos.
3. **Bug real corrigido**: botão de fechar do modal "Inserir receita"
   renderizava o texto literal `"x"` — agora um ícone real, igual ao
   resto do app.
4. **Normalização de token**: opacidade de backdrop unificada em
   `/30` (era `/25`, `/30`, `/35` em 3 lugares diferentes).

## Por que o escopo é muito menor que as 147 seções do pedido

A auditoria (agente dedicado, antes de qualquer edição) encontrou que
as 5 áreas (Food Search, Substituição, Reuso, Receitas, Copilot) JÁ
compartilham design system real no nível de token (mesmas classes
`brand-*`, mesma paleta). O redesign visual completo pedido —
estrutura de header/tabs/cards por área, stepper do Copilot, chips de
resumo de revisão, badges de prontidão, extração de componentes
compartilhados (`DrawerShell`/`CompactEmptyState`/etc.) — **não foi
implementado**. O valor real e mais seguro encontrado foi o gap de
acessibilidade de teclado (2 de ~10 diálogos tinham cobertura antes;
agora 4), entregue com testes reais.

## Gates finais

| Gate | Resultado |
| --- | --- |
| TypeScript (`tsc --noEmit`) | PASS, 0 erros |
| ESLint (arquivos alterados) | PASS, 0 erros/avisos |
| Build (`next build`) | PASS |
| Migração (`migrate:d1:check`) | PASS, 71 migrações validadas, 0 novas |
| Runtime DDL guard (`schema:runtime-check`) | PASS |
| Artifact check | PASS, 1324 arquivos rastreados |
| Full Vitest | 2017/2017 PASS (235 arquivos — sem testes unitários novos; projeto não tem infra de React Testing Library pra testar hooks isoladamente) |
| E2E dedicado R6.5.3 (`meal-plan-ui-r6-5-3-dialogs.spec.ts`) | 4/4 PASS |
| Specs R2/R3/R4/R5/R6 que tocam as 5 áreas, reexecutados | 48/48 PASS |
| Broad E2E (chromium-desktop, single worker) | 241/241 PASS |
| Broad E2E (default parallelism, ambos os projetos) | ver marcador `MEAL_PLAN_UI_R6_5_3_BROAD_E2E_PARALLEL` |
| Migrations novas | 0 |
| Escritas em produção | 0 (shim SQLite local do E2E) |

## Escopo conscientemente fora desta fase

Ver relatórios individuais (`-food-search.md`, `-substitution.md`,
`-reuse-recipes.md`, `-copilot.md`, `-design-system.md`) para o
detalhamento completo por área. Resumo:
- Redesign visual de Food Search (header, estados de carregamento/
  vazio/erro).
- Redesign de conteúdo do drawer de substituição (header contextual,
  cards de candidato, comparação Atual→Novo, seções colapsáveis de
  impacto).
- Redesign de conteúdo da biblioteca de reuso (cards) e da biblioteca/
  editor de receitas completos.
- Stepper visual, chips de resumo de revisão ("X resolvidos/Y
  revisar/Z não encontrado" — confirmado que NÃO existe hoje), e
  badges de prontidão com texto+ícone no Copilot.
- Extração de componentes de design system compartilhados
  (`DrawerShell`, `CompactEmptyState`, `InlineErrorState`,
  `DrawerSearchField`).
- Polish dedicado de tablet/mobile pras 5 áreas (além da reverificação
  de não-regressão).

## Regra de conclusão

`MEAL_PLAN_UI_R6_5_3_COMPLETE: nao` — o gap de acessibilidade de
teclado foi fechado de forma real e testada, mas a grande maioria do
pedido de 147 seções (redesign visual das 5 áreas, Copilot, design
system) não foi implementada.
