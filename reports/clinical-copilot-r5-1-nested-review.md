# Clinical Copilot R5.1 — Revisão Aninhada (path estável, substituição isolada)

## Path (seção 16)

Todo `DraftMealNeedsReview` ganhou um campo `path?: string` opcional
(retrocompatível — ausente em pendências antigas de `refine`/`add_item`/
`replace_item`, que continuam funcionando com um path shallow
`items[N]`). O path é montado na hora da resolução, não depois:

- SIMPLE/itens fixos de COMBINATION: `items[N]`
- OPTIONS: `options[I].items[N]`
- COMBINATION, grupo de escolha: `choice_groups[I].items[N]`

`N` é a posição do candidato na lista ORIGINAL proposta pela IA para
aquele escopo (não o índice esparso do array final `items`, que teria
buracos onde um candidato virou pendência) — documentado no próprio tipo
(`draft-types.ts`).

## Substituição isolada (seções 18, 58)

Resolver um item de revisão (escolher um candidato ou remover) SÓ toca a
entrada exata: no wizard, `pickCandidateNested`/`removeNeedsReviewNested`
recebem `(mealIndex, scope, scopeIndex, reviewIndex, ...)` e substituem
apenas `meal.options[scopeIndex]` ou `meal.choice_groups[scopeIndex]` —
via `replaceNestedScope`, que reconstrói só aquele option/group,
preservando os demais por referência. Nenhuma refeição é reconstruída do
zero. Prova unit (nível de agente): "item ambíguo dentro de uma opção vira
REVIEW_REQUIRED... sem afetar a outra opção" (a Opção B nunca perde seu
item calculado quando a Opção A tem uma pendência).

## Fila de revisão / contexto (seção 17)

A UI (`AiMealPlanWizard.tsx`) mostra um bloco de revisão POR
option/choice_group, com o título "Precisa de revisão — {nome da
refeição} → {label da opção/grupo}" — a nutricionista sempre sabe
exatamente onde está o item pendente, sem depender só do texto do
alimento.

## Contadores (seção 30)

`totalNeedsReview` (wizard) soma `meal.needsReview.length` +
`options[].needsReview.length` + `choice_groups[].needsReview.length` de
TODAS as refeições — itens aninhados contam no aviso "N item(ns) ainda
precisam de revisão", igual aos itens de nível de refeição.

## Completude da resolução (seção 31)

Não foi implementado um estado "fully resolved" explícito separado — o
critério existente ("nenhum item novo entra no plano aplicado enquanto
estiver em `needsReview`, em qualquer nível") já é suficiente e
verificado pelos testes de aplicação (nested review nunca vira item
aplicado sem passar por `pickCandidateNested`/remoção manual). Um
indicador agregado explícito ("X/Y resolvidos") é uma melhoria de UX
razoável para uma fase R5.2, não um requisito de correção.
