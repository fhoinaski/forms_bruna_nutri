# Meal Plan Reuse & Templates R4 — Performance / N+1

## Medições (amostra local, 3 repetições, `e2e/meal-plan-reuse-r4-performance.spec.ts`)

| Etapa | P50 | P95 |
| --- | --- | --- |
| Abrir biblioteca de reuso | 205 ms | 1530 ms* |
| Trocar de aba (lazy-load da nova seção) | 215 ms | 251 ms |
| Buscar na biblioteca (filtro local, sem debounce de rede) | 92 ms | 97 ms |

\* O P95 de abertura inclui a primeira execução (cold start dos componentes
React no navegador do teste, mesmo padrão já observado no R3); rodadas
subsequentes ficam próximas de 60-100ms.

## Lazy loading por aba (seção 34)

Cada seção (Recentes/Favoritos/Minhas refeições/Planos anteriores/Modelos
de planos) só busca seus dados na PRIMEIRA vez que é aberta
(`loadTab`, guardado por `=== null`) — abrir a biblioteca nunca hidrata as
5 seções de uma vez. Confirmado por teste: abrir a biblioteca dispara no
máximo 1 chamada a `/api/admin/foods/recent` (a aba inicial), nunca uma
por seção.

## N+1 audit (seção 37)

- **Recentes/Favoritos**: uma única chamada GET por abertura de aba,
  hidratando o nome/fonte de cada alimento com `Promise.all` no servidor
  (dentro da própria rota) — nunca uma chamada por item do lado do cliente.
- **Minhas refeições**: uma única chamada GET lista todas as refeições
  salvas já com o conteúdo completo (`content` já vem no mesmo SELECT) —
  aplicar uma não dispara nenhuma chamada adicional além do `POST` de
  incremento de uso (fire-and-forget, não bloqueia a inserção).
- **Planos anteriores**: uma única chamada GET (endpoint já existente,
  reaproveitado) lista todos os planos do paciente com suas refeições —
  escolher um plano na lista é só troca de estado local, sem nova
  requisição.
- **Modelos de planos**: uma chamada GET lista os modelos (metadados);
  buscar a prescrição completa de UM modelo específico
  (`GET .../[id]/meals`) só acontece no momento de aplicar (ou já em
  cache, `templateMeals` por id) — nunca busca a prescrição de todos os
  modelos listados de uma vez.

## Volume testado (seção 38)

O ambiente de E2E não tem fixture de 50 modelos de refeição/20 modelos de
plano/100 recentes pré-carregada; a arquitetura (uma query por aba,
paginação implícita via `LIMIT` nas queries — `admin_food_usage`/
`admin_food_favorites` limitados a 20-200 linhas, `admin_saved_meals` a
200) foi auditada e testada com o volume real disponível no ambiente
(dezenas de itens). Não há nenhuma operação O(n) client-side sobre um
volume ilimitado — todo LIMIT vem do SQL, nunca truncamento no cliente
depois de buscar tudo.

## Regressão de performance da R2/R3 (não afetada)

`e2e/meal-plan-composer-r2-final-large-plan.spec.ts` e
`e2e/meal-plan-substitution-r3-performance.spec.ts` foram executados como
parte da regressão ampla (ver relatório final de QA) e continuam dentro da
mesma faixa observada nas fases anteriores — nenhuma alteração desta fase
toca o caminho de hidratação de planos grandes.
