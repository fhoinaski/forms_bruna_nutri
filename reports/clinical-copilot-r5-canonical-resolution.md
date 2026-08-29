# Clinical Copilot R5 — Resolução Canônica

## Estado confirmado (não alterado nesta fase)

`lib/nutrition/food-resolver.ts#resolveFoodCandidate(s)` já classifica cada
alimento proposto pela IA em `RESOLVED | AMBIGUOUS | NOT_FOUND |
CLINICAL_CONFLICT | CLINICAL_UNKNOWN | PREPARATION_NEEDS_REVIEW` — a mesma
resolução rigorosa usada em qualquer outro fluxo do app (nunca "primeiro
resultado" cego). `AUTO_MATCH` (seção 17 do pedido) corresponde a `RESOLVED`
(e `CLINICAL_UNKNOWN`, que ainda entra no cálculo mas fica sinalizado pra
revisão de segurança) — os demais status viram `needsReview`, nunca
entram silenciosamente no cálculo.

**Nomenclatura**: o pedido sugeria "REVIEW_REQUIRED" como rótulo — a base já
usa o status real (`AMBIGUOUS`/`NOT_FOUND`/`CLINICAL_CONFLICT`/
`PREPARATION_NEEDS_REVIEW`) tanto no código quanto na UI ("Precisa de
revisão" como cabeçalho da seção, cada item com seu motivo específico).
Renomear o status internamente por um rótulo genérico só pra bater com o
texto do pedido substituiria uma distinção real por uma genérica — decisão
deliberada de manter a nomenclatura existente, mais informativa.

## REVIEW_REQUIRED / NOT_FOUND (seções 18-19)

Já implementado e testado antes desta fase: candidatos mostrados com nome/
motivo, opções de escolha manual (`AMBIGUOUS`), busca de receita real para
preparo composto (`PREPARATION_NEEDS_REVIEW`), e remoção manual sempre
disponível. `NOT_FOUND` nunca inventa um alimento — a nutricionista busca
manualmente ou remove a sugestão (fluxo já existente do editor, reaproveitado
sem alteração).

## Identidade canônica nunca inventada (seções 15/16/51/52)

Provado nesta fase com dois testes NOVOS (`tests/clinical-copilot-r5-authority.test.ts`,
ver `reports/clinical-copilot-r5-structured-draft.md`): um `canonicalFoodId`/
`food_ref_id` que a IA tente "colar" no payload é descartado pelo schema
estrito antes mesmo de chegar no resolver; um alimento que não existe no
catálogo vira `NOT_FOUND`, nunca um alimento fabricado com dados
inventados.

## Preservação de preparo (seção 20)

Já implementado (Food Preparation Engine V1, fase anterior): `extractPreparation`
detecta cru/cozido/assado/grelhado/frito quando informado na query, e um
preparo composto sem referência direta (ex.: "ovo mexido") vira
`PREPARATION_NEEDS_REVIEW` — nunca resolvido silenciosamente para o
alimento base errado. Coberto por `e2e/meal-plan-wizard-preparation-review.spec.ts`
(regressão confirmada nesta fase).

## Publish gate para alimento não resolvido (seção 35)

Auditado: `lib/repositories/meal-plan-publication.ts#validateMealPlanForPublication`
JÁ bloqueia publicação para qualquer item sem `food_source`/`food_ref_id`
(`UNRESOLVED_FOOD`, severidade ERROR por padrão) e para item cuja
identidade existe mas não tem dado nutricional calculável
(`UNCALCULABLE_FOOD`). Ou seja: um item que ficou em `needsReview` no
draft do Copilot e nunca foi resolvido manualmente pela nutricionista JÁ
bloqueia a publicação do plano — nenhuma regra nova precisou ser criada
nesta fase, o comportamento existente já satisfaz a seção 35 do pedido.
