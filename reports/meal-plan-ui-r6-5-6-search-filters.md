# R6.5.6 — Busca e filtros na Biblioteca de Reuso

## Comportamento verificado

A busca (`aria-label="Buscar na biblioteca"`) é client-side: filtra os
dados já carregados pela aba ativa (`foodList`/`savedList`/`planList`/
`templateList`), usando `.toLocaleLowerCase("pt-BR")` e `includes`. Não
dispara nenhuma requisição de rede adicional — é sempre sobre a coleção já
buscável/carregada da aba corrente, exatamente como reivindicado
originalmente ("busca limitada às coleções já carregadas/buscáveis").

O placeholder do campo muda por aba: "Buscar alimento...", "Buscar
refeição salva...", "Buscar plano...", "Buscar modelo...".

## Filtro Recentes/Favoritos (aba Itens)

Não é mais uma aba — é um controle `aria-pressed` dentro da aba "Itens".
Verificado via E2E (`meal-plan-reuse-r4-library.spec.ts`, testes de
"alimento recente" e "favoritar"): alternar o filtro dispara o fetch
correspondente (`/api/admin/foods/recent` ou `/foods/favorites`) apenas na
primeira vez (cache em estado local `recent`/`favorites`), e favoritar
persiste de fato no backend (confirmado reabrindo o drawer após fechar).

## N+1 de requisições

`e2e/meal-plan-reuse-r4-performance.spec.ts` inclui um teste dedicado
("N+1: abrir a biblioteca dispara UMA chamada, nunca uma por item") que
passou sem alterações — confirma que abrir a aba Itens/Recentes não
dispara uma requisição por item da lista.

## Escopo de busca por aba — gaps já conhecidos (não desta fase)

Igual ao já documentado em `reports/meal-plan-ui-r6-5-final-qa.md`: o
Composer central (adicionar alimento a uma refeição, incluindo dentro de
OPTIONS/COMBINATION choice-groups) usa seu próprio componente de busca de
alimentos (Food Search, R6.5.5), não a Biblioteca de Reuso. Esse gap é do
Food Search, não desta fase, e não foi tocado.

## Correção nesta fase

`e2e/meal-plan-reuse-r4-performance.spec.ts` usava o `aria-label` obsoleto
`"Buscar na biblioteca de reuso"` (pré-redesign); corrigido para
`"Buscar na biblioteca"` (Bug 4 do relatório de auditoria).
