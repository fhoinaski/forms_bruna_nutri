# R6.5.6 — Biblioteca de Reuso: detalhe do componente

## Estrutura (`components/dashboard/ReuseLibraryDrawer.tsx`)

4 abas via `role="tablist"`/`role="tab"`: **Itens**, **Refeições**,
**Planos**, **Modelos**. Dentro de "Itens", um filtro secundário
(`aria-pressed`) alterna entre **Recentes** e **Favoritos** — não é mais
uma aba própria, reduzindo a lista de abas de 5 (design pré-R6.5.6) para 4.

- **Itens**: busca `/api/admin/foods/recent` ou `/api/admin/foods/favorites`
  conforme o filtro; cada linha é um `<li>` com um `<button>` nomeado pelo
  nome do alimento (aplica ao clicar), um botão de favoritar
  (`aria-label` dinâmico) e um botão "Usar" redundante.
- **Refeições**: busca `/api/admin/saved-meals` (lista global, não
  escopada por paciente); cada linha mostra nome, contagem de itens,
  estrutura (Simples/OPTIONS/COMBINATION) e último uso; botão "Usar"
  agora com `aria-label={`Usar ${meal.name}`}` (Bug 2, corrigido).
- **Planos**: busca `/api/admin/clients/{clientId}/meal-plans`, filtrando
  o plano atual (`currentPlanId`); cada plano é expansível
  (`ChevronRight` rotaciona), revelando as refeições internas com botão
  "Adicionar" agora com `aria-label={`Adicionar ${meal.name}`}` (Bug 2).
- **Modelos**: busca `/api/admin/protocol-templates?type=DIETA`; aplica
  todas as refeições do modelo de uma vez via `applyTemplate`.

## Contrato de limpeza de snapshot (preservado)

`clean`/`cleanMeal` zeram `food_name_snapshot`, `nutrition_snapshot`,
`resolved_grams_snapshot`, `quantity_resolution_snapshot` e resetam
`quantity_locked`/`substitutions_locked` — idêntico à lógica
`stripSnapshot`/`stripMealSnapshots` de fases anteriores. Isso força o
motor de nutrição a recalcular a partir da identidade canônica atual, nunca
confiando em um snapshot congelado de uma refeição reutilizada/clonada.
Verificado por leitura de código; nenhuma mudança de comportamento.

## Teclado/acessibilidade (preservado + corrigido)

- `useDialogKeyboard` (hook compartilhado de R6.5.3) cuida de
  Escape-fecha e do focus-trap Tab/Shift+Tab — reutilizado sem modificação.
- Foco inicial no botão de fechar via `requestAnimationFrame`.
- Navegação por seta esquerda/direita entre as 4 abas, com wraparound.
- **Corrigido nesta fase**: nomes acessíveis ausentes nos botões de ação
  das abas Refeições/Planos (Bug 2 do relatório de auditoria).

## Bugs encontrados e corrigidos nesta fase

Ver `reports/meal-plan-ui-r6-5-6-audit.md` para a lista completa (5 bugs).
Resumo específico deste componente: Bug 1 (lint), Bug 2 (aria-label), Bug 3
(texto do estado vazio) tocam diretamente `ReuseLibraryDrawer.tsx`. Bugs 4
e 5 tocam os specs de E2E que testam este componente.

## Extração de design system

`Empty` e `Skeleton` são componentes locais de arquivo único, usados
apenas dentro deste componente. `DrawerShell`/`CompactEmptyState`/etc.
mencionados no pedido original **permanecem DEFERRED** — ainda há apenas 1
consumidor real de cada padrão candidato a extração, o que não justifica
uma abstração compartilhada (consistente com a decisão já tomada em
R6.5.1–R6.5.5).
