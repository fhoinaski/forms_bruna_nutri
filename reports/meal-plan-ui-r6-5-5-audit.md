# Meal Plan Composer UX/UI R6.5.5 — Auditoria

## Objetivo do pedido

Redesenhar a experiência de Food Search pra parecer um produto
profissional de nutrição: leitura visual rápida, resultados
compactos, metadata clara de preparo/fonte, integração recentes/
favoritos, estados limpos de carregamento/vazio/erro, acessibilidade
de teclado, comportamento mobile forte — sem tocar lógica de domínio,
resolução canônica, ou Nutrition Engine.

## Auditoria (agente de pesquisa dedicado, antes de qualquer edição)

Mapeamento exaustivo do combobox de busca (`MealItemsEditor.tsx`,
linhas ~1435-1560), incluindo JSX exato de input/listbox/opção/
loading/vazio, a lógica de debounce (300ms) + proteção contra resposta
obsoleta (AbortController), teclado (Arrow/Enter/Escape,
`aria-activedescendant`), responsividade mobile, e o inventário
completo de seletores E2E (`food-search-multi-source.spec.ts` é a
suíte de maior risco de regressão).

## Achados críticos que definiram o escopo desta fase

1. **Só `meal.items` (SIMPLE + itens fixos de COMBINATION) tem busca
   de verdade.** OPTIONS (`option.items`) e grupos de escolha de
   COMBINATION (`group.items`) usam `<input>` de texto puro, SEM
   nenhuma busca/combobox/teclado — são blocos completamente
   separados, não uma função parametrizada reaproveitada. Construir
   busca ali do zero seria lógica NOVA (violando a restrição
   explícita desta fase de não tocar lógica de busca), não um
   redesign visual — **não implementado**.
2. **Recentes/Favoritos NÃO existem dentro deste combobox hoje** —
   só existem na `ReuseLibraryDrawer` (R4), um componente
   estruturalmente separado. Integrar recentes/favoritos DENTRO do
   combobox de busca seria uma feature nova real (nova UI + novo
   fluxo de dados), não um redesign visual do que já existe — **não
   implementado**.
3. **A linha de resultado já mostrava kcal/P/C/G** — indo direto
   contra a seção 12 do pedido ("Food Search é pra escolher
   identidade, não fazer análise nutricional"). Essa é a mudança
   real, segura e de maior valor: remover a linha de macros,
   mantendo nome + preparo/fonte + porção.
4. **O estado de carregamento era só texto** ("Buscando...") e o
   vazio era 1 linha só — ambos com espaço real de melhoria sem
   nenhum risco (são apenas os 2 boxes condicionais, sem lógica).
5. **Um 4º combobox quase-duplicado** existe em `IngredientRow`
   (editor de receitas) — sem roles ARIA nenhum, shape de dados
   diferente (`FoodSuggestion` legado, não `FoodSearchResultViewModel`).
   Unificar visualmente com ele exigiria adicionar roles ARIA que não
   existem hoje ali — uma mudança de comportamento, não só visual, e
   fora do escopo desta fase (que é sobre o Composer, não o editor de
   receitas) — **não tocado**.

## Decisão de escopo

Implementadas 3 mudanças reais, seguras, alinhadas com seções
explícitas do pedido: (a) linha de resultado sem macros + afordance
"Adicionar" (seção 12/14), (b) skeleton de carregamento (seção 22),
(c) mensagem de vazio em 2 linhas (seção 24). Zero mudança em
debounce/AbortController/ranking/resolução canônica/Nutrition Engine/
telemetria F9. Recentes/favoritos dentro do combobox, busca real em
OPTIONS/COMBINATION-choice-groups, e unificação com `IngredientRow`
ficam documentados como gaps reais, não implementados.
