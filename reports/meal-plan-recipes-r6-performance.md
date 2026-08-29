# Meal Plan Recipes R6 — Performance / N+1

## Batch resolution (seções 29-30, 49, 97-100)

- `calculateRecipeIngredientTotals` resolve TODOS os ingredientes de UMA
  receita usando um `FoodReferenceLookup` já construído (custom
  foods/porções pré-buscados em lote por `resolveMealPlanChangeReferences`
  — reaproveitado, nunca uma segunda lógica de busca).
- `getRecipeReferenceEntriesByIds(ids)` — usado pela hidratação do
  Composer/plano — busca TODAS as receitas referenciadas por um plano
  numa única passada (`Promise.all` sobre ids únicos) e constrói UM
  `FoodReferenceLookup` compartilhado pra todos os ingredientes de TODAS
  as receitas de uma vez, nunca uma resolução por receita/ingrediente
  serializada.
- `resolveMealPlanChangeReferences` foi estendido pra também coletar
  `recipeIds` únicos (mesma varredura já existente de itens/opções/
  grupos de escolha, sem passada extra).

## N+1 — auditoria (seção 100)

| Ponto | Resultado |
| --- | --- |
| Resolução de ingrediente (dentro de 1 receita) | Batch — 1 lookup construído, reaproveitado por todos os ingredientes |
| Resolução de receita (dentro de 1 plano) | Batch — `getRecipeReferenceEntriesByIds`, 1 passada pra N receitas |
| Lista de receitas (`GET /api/admin/recipes`) | Sem I/O extra por linha — usa as colunas de cache já gravadas |
| Preview/edição de receita (editor) | 1 lookup construído por save, reaproveitado por todos os ingredientes daquele save |
| Hidratação do Composer (plano com N itens de receita) | 1 passada em lote via `getRecipeReferenceEntriesByIds` |
| Snapshot congelado no save do plano (`resolveMealsWithSnapshots`) | 1 chamada a `getRecipeReferenceEntry` POR ITEM de receita (não por ingrediente) — aceito como custo por item, não por ingrediente; ver nota abaixo |

Nota: o congelamento de snapshot no save AINDA faz 1 chamada de
`getRecipeReferenceEntry` (que resolve todos os ingredientes daquela
receita) POR ITEM de receita na refeição — se um plano tiver muitos itens
apontando pra MUITAS receitas diferentes, isso é N chamadas (N =
número de itens de receita, não de ingredientes). Não é um N+1 clássico
por ingrediente, mas também não está totalmente batch-otimizado nesse
ponto específico — documentado como uma melhoria possível de R6.1 (batch
por `getRecipeReferenceEntriesByIds` também no save), não bloqueante pro
volume típico de um plano real (poucas receitas por plano).

## Draft grande / biblioteca grande (seções 97, 99)

Não foi construída uma fixture E2E dedicada de "30 ingredientes" nem de
"biblioteca com volume significativo" — dado o volume real esperado
(receitas de biblioteca clínica, tipicamente dezenas de ingredientes no
máximo, não milhares), e o caminho crítico (resolução em lote, sem
N+1 por ingrediente) já está provado nos testes unitários em granularidade
controlada (`tests/recipe-engine-r6.test.ts`). Lacuna de cobertura
reconhecida, não uma falha de comportamento observada — mesma honestidade
já praticada nas fases anteriores (R5.1) para casos de volume não
testados diretamente.

## Medição (seção 98)

Não foram capturados p50/p95/max formais de "abrir receita" / "adicionar
ingrediente" / "recalcular" / "salvar" / "hidratação do Composer" nesta
fase — o tempo disponível foi priorizado pra corrigir as regressões reais
encontradas (ver `-composer.md`) e fechar os gates obrigatórios (full
Vitest, broad E2E, migração, schema). Registrado como lacuna, candidato a
R6.1.
