# Meal Plan Composer UX/UI R6.5.5 — Food Search

## Entregue

**Linha de resultado compactada** (`MealItemsEditor.tsx`, dentro do
`role="listbox"` de `meal.items`):
- Linha 1: nome do alimento (`displayName`, truncado se muito longo)
  + afordance "Adicionar" alinhada à direita, na MESMA linha/botão
  clicável (não um botão aninhado — a linha inteira já era e continua
  sendo o alvo do clique/seleção, seção 15 do pedido: "se clique na
  linha inteira já seleciona, preservar").
- Linha 2 (inalterada): preparo/grupo · nome da fonte (TACO/TBCA/
  IBGE_POF/USDA/CUSTOM/MANUFACTURER).
- Linha 3 (simplificada): porção padrão + peso em gramas — **removida
  a parte de kcal/P/C/G** (seção 12: "não mostrar macros completos
  dentro de cada resultado de busca — Food Search é pra escolher
  identidade, não fazer análise nutricional").

Nenhum dado foi removido do objeto `result` em si
(`result.nutrientsPreview` continua existindo e sendo calculado do
mesmo jeito) — só não é mais renderizado nessa linha.

## Não implementado

- Recentes/Favoritos dentro do combobox (não existiam antes; ver
  `-recents-favorites.md`).
- Busca real em OPTIONS/COMBINATION-choice-groups (hoje são `<input>`
  de texto puro, sem nenhum combobox — construir isso seria lógica
  nova, fora do escopo desta fase).
- Header contextual dinâmico ("Adicionar alimento à opção"/"Adicionar
  item fixo"/etc., seção 4) — o combobox não tem um header dedicado
  hoje (é um campo inline dentro da linha do item, não um drawer com
  título); adicionar isso exigiria uma mudança estrutural maior do
  que cabia nesta fase.
- Unificação com o combobox de `IngredientRow` (editor de receitas).

## Prova (E2E dedicado)

`e2e/meal-plan-ui-r6-5-5-food-search.spec.ts` (3/3 PASS):
1. Linha de resultado mostra nome + "Adicionar" + fonte, SEM texto
   "kcal" em lugar nenhum da opção.
2. Estado de carregamento é uma região `role="status"` com skeleton
   (não mais o texto "Buscando...").
3. Estado vazio mostra as 2 linhas de mensagem.

Reexecutado sem regressão: `food-search-multi-source.spec.ts` (4/4 —
a suíte mais crítica, incluindo o teste que verifica
`toContainText(/TACO|IBGE|TBCA|USDA/i)` dentro da opção, teclado,
persistência após save/reload, e ausência de overflow horizontal
mobile) + 52 specs adicionais de toda a lineage (SIMPLE/OPTIONS/
COMBINATION, R3/R4/R5/R6.5.2C/R6.5.3).
