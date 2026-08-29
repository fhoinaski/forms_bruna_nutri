# Meal Plan Substitution Engine R3 — UI Wiring

## Drawer reaproveitado, não recriado

Toda a UI da R3 vive dentro de `components/dashboard/ExchangeGroupPanel.tsx`
(o mesmo drawer de trocas da R2.2/R2.3). Nenhum segundo drawer, editor ou
sistema de preview foi criado.

## Seletor de critério

`CriterionSelector` — grupo de botões nativos (`role="group"`, `aria-pressed`),
com as 4 opções do enum real (`EQUIVALENT_QUANTITY_CRITERIA`):
Energia/Proteína/Carboidratos/Gordura. `ENERGY` é o default inicial — só
operacional/visual, sem nenhum texto de recomendação clínica.

Fica visível assim que "Adicionar outra" é clicado (`manualOpen &&
hasStructuredIdentity && hasGrams`) e permanece visível tanto na lista de
busca quanto no card de preview de um candidato selecionado — trocar o
critério com um candidato já aberto recalcula a sugestão sem fechar o preview.

## Cálculo em lote

`runEquivalentBatch` dispara UMA chamada a `/api/admin/foods/equivalent-quantity`
por (busca, critério, referência) — nunca uma chamada por candidato. Um
contador de geração (`equivalentRequestRef`) garante segurança contra resposta
obsoleta: trocar o critério, a busca ou a referência antes da resposta anterior
chegar faz essa resposta ser descartada silenciosamente ao chegar.

## Resultado por candidato

- Nos resultados de busca (`EquivalentQuantitySummary`, resumo compacto):
  quantidade prática + medida caseira (se real) + "% de diferença em
  {critério}".
- No card de preview (`EquivalentQuantityDetail`, mais completo): a mesma
  informação, com a quantidade bruta disponível só via `title` (tooltip),
  nunca poluindo a interface principal.
- Status diferente de `CALCULATED`: nunca mostra quantidade fake — sempre
  "Não foi possível calcular equivalência para este critério."

## Preview / quantidade sugerida

Ao abrir o preview de um candidato (`openPreview`), a quantidade é
pré-preenchida com `practicalCandidateQuantityGrams` do lote já calculado
(quando `CALCULATED`) — nunca a quantidade do alimento principal, como era
antes da R3. Um `previewQuantityEditedRef` marca quando a nutricionista edita
manualmente: a partir daí, trocar de critério recalcula a SUGESTÃO mas nunca
sobrescreve o valor editado manualmente.

## Item / refeição / dia

O preview de impacto (`MealDayImpactPreview`, herdado 100% da R2.3) não foi
duplicado — só passou a receber a quantidade já sugerida pelo motor de
equivalência quando o candidato é trocado de critério, através do mesmo
`previewQuantity` que já alimentava esse componente.

## Aplicar / cancelar

- Cancelar (`Voltar à busca`) nunca escreve nada — mesmo fluxo já testado na
  R2.3.
- Aplicar (`Adicionar`) usa `previewQuantity` — que é a quantidade PRÁTICA
  mostrada na tela no momento do clique — nunca a quantidade bruta interna.

## OPTIONS / COMBINATION

O drawer de trocas por item só endereça itens de `meal.items` hoje (limitação
pré-existente da R2.2, não desta fase — ver relatório de arquitetura). Para o
item fixo de uma refeição COMBINATION, confirmado por E2E que: (a) o grupo de
escolha nunca é tocado pela troca; (b) o impacto no dia continua sendo
renderizado corretamente pós-troca.

## Acessibilidade

- Critério: `role="group"` com `aria-label` (via `aria-labelledby`) e
  `aria-pressed` por botão — navegável por Tab, ativável por Enter/Espaço
  (botões nativos).
- Texto de delta pra leitor de tela já herdado de `accessibleDeltaPhrase`
  (R2.2) — nunca só cor/sinal.

## Mobile / Tablet

Drawer continua bottom-sheet em mobile (herdado); o seletor de critério usa
`flex-wrap` — nunca força scroll horizontal, confirmado por E2E medindo a
largura da caixa do seletor em viewport de 390px.
