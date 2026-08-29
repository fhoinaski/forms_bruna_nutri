# Meal Plan Composer UX/UI R6.5.3 — Acessibilidade

## Entregue: fechamento real de um gap total

Antes desta fase, de ~10 superfícies do tipo diálogo/drawer no
Composer, só 2 (drawer de trocas, biblioteca de reuso) tinham
Escape + Tab-trap + retorno de foco — cada uma com sua própria cópia
da lógica. O Assistente de IA e o modal "Inserir receita" não tinham
NENHUM tratamento de teclado. Esta fase:

1. Extraiu a lógica duplicada pro hook `useDialogKeyboard`.
2. Retrofitou Escape + Tab-trap no Assistente de IA (gap total → PASS).
3. Retrofitou Escape + Tab-trap no modal "Inserir receita" (gap total
   → PASS).
4. Corrigiu o botão de fechar do modal "Inserir receita" (era texto
   "x", sem significado semântico de ícone pra leitor de tela mesmo
   com `aria-label` correto — agora um ícone real).

## Verificado

- `meal-plan-substitution-r3-equivalent-quantity.spec.ts:149`
  ("acessibilidade: seletor de critério é navegável por teclado e tem
  aria-pressed") — reexecutado, PASS, sem alteração.
- `meal-plan-reuse-r4-library.spec.ts:144` ("acessibilidade: Escape
  fecha a biblioteca e devolve o foco ao botão que abriu") —
  reexecutado, PASS, sem alteração de comportamento (só a
  implementação interna mudou pro hook compartilhado).
- `meal-plan-composer-r2-2-alternatives-drawer.spec.ts:76` ("Escape
  fecha o drawer e devolve o foco ao botão que abriu") — reexecutado,
  PASS.
- Novo: `meal-plan-ui-r6-5-3-dialogs.spec.ts` (4/4) prova o retrofit
  do Assistente de IA e do modal "Inserir receita".

## Não auditado nesta fase

- Auditoria completa de contraste dos 5 subsistemas.
- Navegação por teclado do CONTEÚDO interno de cada drawer (só o
  container/fechamento foi tocado — os campos internos de cada
  drawer já tinham sua própria acessibilidade pré-existente, não
  auditada de novo aqui).
- Leitor de tela real (NVDA/VoiceOver).
- `aria-live` para estados assíncronos de carregamento/resultado
  (seção 92) — não auditado/implementado.

## Gate

`MEAL_PLAN_UI_R6_5_3_ACCESSIBILITY: PASS` para o escopo real desta
fase (fechamento do gap de teclado em diálogos) — não uma auditoria
completa dos 5 subsistemas.
