# Meal Plan Substitution Engine R3 — Ranking e Política de Arredondamento

## Política de arredondamento (auditoria, não adoção cega)

O pedido pedia para **auditar os padrões já existentes no projeto e justificar**
a política, em vez de adotar cegamente as faixas de exemplo dadas na
especificação. Auditoria feita (`grep` em `lib/nutrition/*.ts` por
`Math.round|roundTo|practicalQuantity`):

- `lib/nutrition/equivalence.ts#findEquivalentFoods` (motor já em produção,
  Fase de exchange-groups) usa incremento **uniforme de 5g**:
  `Math.max(5, Math.round(grams / 5) * 5)`.
- `lib/nutrition/substitution-engine.ts#findFoodSubstitutes` tinha uma cópia
  **idêntica** dessa mesma fórmula, com o mesmo racional documentado no
  código: *"uma nutricionista prescreve '30g', não '27.43g'"*.

Ou seja: a política de 5g uniforme **já é o padrão real do projeto**, testada
e em produção há mais de uma fase. A R3 manteve exatamente essa política —
`PRACTICAL_QUANTITY_INCREMENT_GRAMS = 5`, piso de 5g — em vez de introduzir a
tabela de faixas de exemplo do pedido, que não tinha nenhum precedente na
base de código e teria criado DUAS políticas de arredondamento divergentes
para o mesmo tipo de operação (algébrica → prática). A consolidação (ambos os
módulos antigos agora importam de `equivalent-quantity.ts`) elimina a
duplicação sem mudar o comportamento observável de nenhum caller existente.

## Ranking (`rankEquivalentCandidates`)

Requisitos do pedido: determinístico, nunca dirigido por IA, nunca rótulo
clínico "bom/ruim", desempate determinístico.

Implementação:

1. Filtra candidatos com `result.status !== "CALCULATED"` — nunca entram no
   ranking (não há "posição" pra um resultado que não convergiu).
2. Ordena por categoria (`sameCategory` — mesmo `grupo` do TACO da
   referência) primeiro — mesma regra já usada em `equivalence.ts`/
   `substitution-engine.ts` pra nunca sugerir "banana → açúcar" só porque o
   critério bate numericamente.
3. Dentro da mesma categoria (ou fora dela), ordena por menor
   `|percentDifference|` — quão perto o candidato ficou do critério NA
   QUANTIDADE PRÁTICA (pós-arredondamento), não na álgebra bruta.
4. Desempate final: nome (`descricao`) em ordem alfabética — determinístico
   entre execuções, nunca dependente da ordem de chegada da API.

Nenhum termo "melhor alimento" aparece na ranking em si — a API só devolve um
`rank` numérico; a UI (ver relatório de UI) usa a ordem, não um rótulo.

## Cobertura de testes

- `tests/equivalent-quantity.test.ts`: mesma categoria vence sobre categoria
  diferente mais próxima percentualmente; candidatos não-`CALCULATED` nunca
  aparecem; desempate alfabético determinístico quando categoria e percentual
  empatam.
- `tests/equivalent-quantity-route.test.ts`: o ranking do endpoint reflete a
  mesma ordem (`rank` no item da resposta), com 20 candidatos calculados numa
  única chamada (ver relatório de performance).
